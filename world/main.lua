-- ============================================================
-- world/main.lua — the world layer, in Lua
--
-- The Lua twin of js-snippets/cities.js, places.js and spawns.js.
-- It answers one question for the whole server: WHERE is this?
--
--   cities    three bands by how far north (y) you are
--   places    districts, parks and named roads, most specific first
--   spawns    where you appear, and which city jail releases you into
--
-- Nothing here builds geometry. The world is GTA V's stock map; this
-- gives it names so a dispatch line reads "Lakeshore Drive, The
-- Shoreline, Chicago" instead of just the city.
--
-- Coordinates live in data.lua, GENERATED from the JS so the two
-- cannot drift. Edit the JS and re-run tools/gen-world-data.js.
-- EVERY COORDINATE IS A PLACEHOLDER — placed by number, never stood
-- on. Walk them before you trust them.
--
-- Other resources use this through exports, never by copying the
-- tables:
--   exports.world:Describe(coords)      "Grove Street, Southline, Atlanta"
--   exports.world:Label(coords)         "Grove Street"
--   exports.world:CityAt(coords)        "atlanta"
--   exports.world:PlaceAt(coords)       { name, kind, city } or nil
--   exports.world:PickSpawn(city)       { label, pos, heading, city }
--   exports.world:ReleaseSpawn(city)    a spawn in a DIFFERENT city
-- ============================================================

-- data.lua is loaded first by fxmanifest and sets this global
local Data = FourtuneWorldData

local SWEEP_MS = 5000 -- how often each player's position is checked

-- ============================================================
-- MATHS
-- ============================================================

local function dist2(ax, ay, bx, by)
    local dx, dy = ax - bx, ay - by
    return dx * dx + dy * dy
end

-- Distance from a point to the segment a-b, in 2D. Height is ignored:
-- a road on a hillside is still that road.
local function distanceToSegment(px, py, a, b)
    local len = dist2(a.x, a.y, b.x, b.y)
    if len == 0 then return math.sqrt(dist2(px, py, a.x, a.y)) end

    local t = ((px - a.x) * (b.x - a.x) + (py - a.y) * (b.y - a.y)) / len
    if t < 0 then t = 0 elseif t > 1 then t = 1 end

    return math.sqrt(dist2(px, py, a.x + t * (b.x - a.x), a.y + t * (b.y - a.y)))
end

-- ============================================================
-- CITIES — bands by how far north you are
-- ============================================================

local function CityAt(pos)
    if pos.y >= Data.borders.chicago then return 'chicago' end
    if pos.y >= Data.borders.geepee then return 'geepee' end
    return 'atlanta'
end

local function CityLabel(city)
    local entry = Data.cities[city]
    return entry and entry.label or city
end

-- ============================================================
-- PLACES — road beats park beats district
-- ============================================================

local function RoadAt(pos)
    local best, bestDist
    for _, road in ipairs(Data.roads) do
        for i = 1, #road.points - 1 do
            local d = distanceToSegment(pos.x, pos.y, road.points[i], road.points[i + 1])
            if d <= road.width and (not best or d < bestDist) then
                best, bestDist = road, d
            end
        end
    end
    return best
end

-- The smallest circle you are inside, so a park beats the district around it
local function ZoneAt(pos)
    local best
    for _, zone in ipairs(Data.zones) do
        local d = math.sqrt(dist2(pos.x, pos.y, zone.center.x, zone.center.y))
        if d <= zone.radius and (not best or zone.radius < best.radius) then
            best = zone
        end
    end
    return best
end

local function PlaceAt(pos)
    if not pos then return nil end
    return RoadAt(pos) or ZoneAt(pos)
end

-- "Lakeshore Drive, The Shoreline, Chicago" — as much as is true
local function Describe(pos)
    if not pos then return 'Nowhere in particular' end

    local parts = {}
    local road = RoadAt(pos)
    if road then parts[#parts + 1] = road.name end

    local zone = ZoneAt(pos)
    if zone then parts[#parts + 1] = zone.name end

    parts[#parts + 1] = CityLabel(CityAt(pos))
    return table.concat(parts, ', ')
end

-- Short form for dispatch lines: the best name, else the city
local function Label(pos)
    local place = PlaceAt(pos)
    if place then return place.name end
    return CityLabel(CityAt(pos or { x = 0.0, y = 0.0 }))
end

local function ListFor(city)
    local districts, parks, roads = {}, {}, {}
    for _, z in ipairs(Data.zones) do
        if z.city == city then
            local into = z.kind == 'park' and parks or districts
            into[#into + 1] = (z.kind == 'park' and 'Park: ' or 'District: ') .. z.name
        end
    end
    for _, r in ipairs(Data.roads) do
        if r.city == city then roads[#roads + 1] = 'Road: ' .. r.name end
    end

    local out = {}
    for _, list in ipairs({ districts, parks, roads }) do
        for _, line in ipairs(list) do out[#out + 1] = line end
    end
    if #out == 0 then return 'Nothing mapped here yet.' end
    return table.concat(out, '\n')
end

-- ============================================================
-- SPAWNS
-- ============================================================

local function PickSpawn(city, rng)
    local list = Data.spawns[city] or Data.spawns[Data.defaultCity]
    local which = city and Data.spawns[city] and city or Data.defaultCity
    local roll = (rng or math.random)()
    local index = math.floor(roll * #list) % #list + 1
    local spot = list[index]
    return { city = which, label = spot.label, pos = spot.pos, heading = spot.heading }
end

-- Jail puts you back on the street in a DIFFERENT city from the arrest
local function ReleaseSpawn(arrestedIn, rng)
    local city = Data.releaseCity[arrestedIn] or Data.releaseCity[Data.defaultCity]
    return PickSpawn(city, rng)
end

-- ============================================================
-- EXPORTS — the only way other resources should reach this
-- ============================================================

exports('CityAt', CityAt)
exports('CityLabel', CityLabel)
exports('PlaceAt', PlaceAt)
exports('RoadAt', RoadAt)
exports('ZoneAt', ZoneAt)
exports('Describe', Describe)
exports('Label', Label)
exports('ListFor', ListFor)
exports('PickSpawn', PickSpawn)
exports('ReleaseSpawn', ReleaseSpawn)

-- ============================================================
-- THE SWEEP — announce a new city or zone, once each
--
-- Roads stay quiet on purpose: you cross a dozen driving anywhere,
-- and a line per road would bury everything else in chat.
-- ============================================================

local known = {} -- [src] = { city = ..., zone = ... }

local function tell(src, msg)
    TriggerClientEvent('chat:addMessage', src, { args = { 'World', msg } })
end

-- Returns the announcement for this move, or nil. Exposed so the jail,
-- hospital and login paths can mark a teleport as already-known: the
-- player can see where they landed, so it should not be announced.
local function Settle(src, pos, announce)
    local seen = known[src]
    if not seen then
        seen = {}
        known[src] = seen
    end

    local city = CityAt(pos)
    local zone = ZoneAt(pos)
    local zoneName = zone and zone.name or nil

    local firstFix = seen.city == nil
    local message

    if city ~= seen.city and not firstFix and announce then
        message = 'Welcome to ' .. CityLabel(city)
    elseif zoneName ~= seen.zone and zoneName and not firstFix and announce then
        message = 'Entering ' .. zoneName
    end

    seen.city, seen.zone = city, zoneName
    return message
end

exports('Settle', function(src, pos) return Settle(src, pos, false) end)

CreateThread(function()
    while true do
        Wait(SWEEP_MS)
        for _, id in ipairs(GetPlayers()) do
            local src = tonumber(id)
            local ped = GetPlayerPed(src)
            if ped and ped ~= 0 then
                local coords = GetEntityCoords(ped)
                local msg = Settle(src, { x = coords.x, y = coords.y, z = coords.z }, true)
                if msg then tell(src, msg) end
            end
        end
    end
end)

AddEventHandler('playerDropped', function()
    known[source] = nil
end)

-- ============================================================
-- COMMANDS
-- ============================================================

local function coordsOf(src)
    local coords = GetEntityCoords(GetPlayerPed(src))
    return { x = coords.x, y = coords.y, z = coords.z }
end

RegisterCommand('whereami', function(src)
    if src == 0 then return print('Players only.') end
    tell(src, Describe(coordsOf(src)))
end, false)

RegisterCommand('places', function(src)
    if src == 0 then return print('Players only.') end
    tell(src, ListFor(CityAt(coordsOf(src))))
end, false)

RegisterCommand('cities', function(src)
    local names = {}
    for key in pairs(Data.cities) do names[#names + 1] = CityLabel(key) end
    table.sort(names)
    local line = table.concat(names, ' / ')
    if src == 0 then print(line) else tell(src, line) end
end, false)
