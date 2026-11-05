-- ============================================================
-- island-streets/client.lua — the island's road names, in game
--
-- GTA only knows the names of its own roads, so on the island it would
-- show "Pacific Ocean". While you're on the island this resource:
--   1. HUD: replaces GTA's street name by the minimap with the island's
--      own: "Palisade Boulevard / 5th Street" and "Foundry Flats · 312".
--   2. Street signs: a green name sign floats over every junction
--      within SIGN_RANGE metres (/streetsigns turns them off and on).
--   3. Pause map: a named blip for every district and park, plus the
--      hunting grounds and Antler Lodge.
--
-- Everything comes from data.lua (tools/gen-island-streets.py).
-- ============================================================

local D = ISLAND_STREETS
local B = D.bounds

local STREET_REACH = 45.0   -- metres: further than this from any road = no street name
local CROSS_REACH = 70.0    -- metres: a junction this close on your street names the crossing
local SIGN_RANGE = 90.0     -- metres: junction signs this close are drawn
local AREA_REACH = 700.0    -- metres: the nearest district/park this close names the area
local CELL = 250.0          -- spatial grid cell, metres

local signsOn = GetResourceKvpInt('signs_off') ~= 1

-- ------------------------------------------------------------
-- Spatial grids, so each lookup only checks what's nearby
-- ------------------------------------------------------------

local function cellKey(cx, cy) return cx * 100000 + cy end

local segGrid = {}
for si, s in ipairs(D.streets) do
    local p = s.pts
    for i = 1, #p - 3, 2 do
        local ax, ay, bx, by = p[i], p[i + 1], p[i + 2], p[i + 3]
        for cx = math.floor((math.min(ax, bx) - STREET_REACH) / CELL), math.floor((math.max(ax, bx) + STREET_REACH) / CELL) do
            for cy = math.floor((math.min(ay, by) - STREET_REACH) / CELL), math.floor((math.max(ay, by) + STREET_REACH) / CELL) do
                local k = cellKey(cx, cy)
                local bucket = segGrid[k]
                if not bucket then bucket = {}; segGrid[k] = bucket end
                bucket[#bucket + 1] = { si, ax, ay, bx, by }
            end
        end
    end
end

local junctionGrid = {}
for _, j in ipairs(D.junctions) do
    local k = cellKey(math.floor(j.x / CELL), math.floor(j.y / CELL))
    local bucket = junctionGrid[k]
    if not bucket then bucket = {}; junctionGrid[k] = bucket end
    bucket[#bucket + 1] = j
    -- the sign's text, worked out once
    local names = {}
    for n, si in ipairs(j.streets) do
        if n > 3 then break end
        names[#names + 1] = D.streets[si].name
    end
    j.text = table.concat(names, '  /  ')
end

local function distToSeg(px, py, ax, ay, bx, by)
    local dx, dy = bx - ax, by - ay
    local l2 = dx * dx + dy * dy
    local t = 0.0
    if l2 > 0 then t = math.max(0, math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) end
    local cx, cy = ax + t * dx, ay + t * dy
    return math.sqrt((px - cx) ^ 2 + (py - cy) ^ 2)
end

local function nearestStreet(x, y)
    local bucket = segGrid[cellKey(math.floor(x / CELL), math.floor(y / CELL))]
    if not bucket then return nil end
    local best, bestD = nil, STREET_REACH
    for _, seg in ipairs(bucket) do
        local d = distToSeg(x, y, seg[2], seg[3], seg[4], seg[5])
        if d < bestD then best, bestD = seg[1], d end
    end
    return best
end

local function junctionsNear(x, y, range)
    local out = {}
    local cx0, cy0 = math.floor((x - range) / CELL), math.floor((y - range) / CELL)
    local cx1, cy1 = math.floor((x + range) / CELL), math.floor((y + range) / CELL)
    for cx = cx0, cx1 do
        for cy = cy0, cy1 do
            for _, j in ipairs(junctionGrid[cellKey(cx, cy)] or {}) do
                local d = math.sqrt((x - j.x) ^ 2 + (y - j.y) ^ 2)
                if d < range then out[#out + 1] = { j = j, d = d } end
            end
        end
    end
    return out
end

local function has(list, v)
    for _, x in ipairs(list) do if x == v then return true end end
    return false
end

-- ------------------------------------------------------------
-- Where am I (every 300 ms)
-- ------------------------------------------------------------

local onIsland = false
local hud = { street = nil, cross = nil, area = nil }
local nearSigns = {}

CreateThread(function()
    while true do
        local pos = GetEntityCoords(PlayerPedId())
        onIsland = pos.x > B.minX and pos.x < B.maxX and pos.y > B.minY and pos.y < B.maxY
        if onIsland then
            local si = nearestStreet(pos.x, pos.y)
            hud.street = si and D.streets[si].name or nil

            -- the crossing: the nearest junction on this street, named by its other road
            local near = junctionsNear(pos.x, pos.y, math.max(SIGN_RANGE, CROSS_REACH))
            hud.cross = nil
            local bestD = CROSS_REACH
            for _, n in ipairs(near) do
                if si and n.d < bestD and has(n.j.streets, si) then
                    for _, other in ipairs(n.j.streets) do
                        if other ~= si then hud.cross = D.streets[other].name; bestD = n.d; break end
                    end
                end
            end
            nearSigns = near

            -- the area: nearest named district/park, then the area code
            local area, areaD = nil, AREA_REACH
            for _, z in ipairs(D.zones) do
                local d = math.sqrt((pos.x - z.x) ^ 2 + (pos.y - z.y) ^ 2)
                if d < areaD then area, areaD = z.name, d end
            end
            local city = si and D.streets[si].city or nil
            if area and city then hud.area = area .. '  ·  ' .. city
            else hud.area = area or city end
        else
            nearSigns = {}
        end
        Wait(300)
    end
end)

-- ------------------------------------------------------------
-- Drawing (every frame, only on the island)
-- ------------------------------------------------------------

local function screenText(text, x, y, scale, font, r, g, b)
    SetTextFont(font)
    SetTextScale(0.0, scale)
    SetTextColour(r, g, b, 255)
    SetTextDropShadow()
    SetTextOutline()
    BeginTextCommandDisplayText('STRING')
    AddTextComponentSubstringPlayerName(text)
    EndTextCommandDisplayText(x, y)
end

local function signAt(j, dist)
    local scale = math.max(0.22, math.min(0.5, 14.0 / dist))
    SetDrawOrigin(j.x, j.y, j.z + 4.0, 0)
    local w = (#j.text * 0.0105 + 0.02) * scale
    DrawRect(0.0, 0.012 * scale / 0.35, w, 0.034 * scale / 0.35, 0, 104, 56, 215)
    SetTextFont(4)
    SetTextScale(0.0, scale)
    SetTextColour(255, 255, 255, 255)
    SetTextCentre(true)
    BeginTextCommandDisplayText('STRING')
    AddTextComponentSubstringPlayerName(j.text)
    EndTextCommandDisplayText(0.0, 0.0)
    ClearDrawOrigin()
end

CreateThread(function()
    while true do
        if onIsland then
            HideHudComponentThisFrame(7)   -- GTA's area name
            HideHudComponentThisFrame(9)   -- GTA's street name
            if not IsPauseMenuActive() then
                if hud.street then
                    screenText(hud.cross and (hud.street .. '  /  ' .. hud.cross) or hud.street, 0.172, 0.905, 0.5, 4, 255, 255, 255)
                end
                if hud.area then screenText(hud.area, 0.172, 0.94, 0.42, 4, 200, 220, 255) end
                if signsOn then
                    for _, n in ipairs(nearSigns) do signAt(n.j, math.max(n.d, 1.0)) end
                end
            end
            Wait(0)
        else
            Wait(500)
        end
    end
end)

RegisterCommand('streetsigns', function()
    signsOn = not signsOn
    SetResourceKvpInt('signs_off', signsOn and 0 or 1)
    BeginTextCommandThefeedPost('STRING')
    AddTextComponentSubstringPlayerName(signsOn and 'Island street signs on' or 'Island street signs off')
    EndTextCommandThefeedPostTicker(false, false)
end, false)

-- ------------------------------------------------------------
-- Pause-map blips: every district and park, the hunting grounds, the lodge
-- ------------------------------------------------------------

local blips = {}
local function nameBlip(blip, name)
    BeginTextCommandSetBlipName('STRING')
    AddTextComponentSubstringPlayerName(name)
    EndTextCommandSetBlipName(blip)
end

CreateThread(function()
    for _, z in ipairs(D.zones) do
        local blip = AddBlipForCoord(z.x, z.y, 0.0)
        SetBlipSprite(blip, z.kind == 'park' and 128 or 1)   -- 128 is the park-style marker
        SetBlipScale(blip, 0.6)
        SetBlipColour(blip, z.kind == 'park' and 2 or 0)
        SetBlipDisplay(blip, 3)            -- the pause map only, not the minimap
        SetBlipAsShortRange(blip, true)
        nameBlip(blip, z.name)
        blips[#blips + 1] = blip
    end
    for _, p in ipairs(D.pois) do
        if p.radius > 0 then
            local area = AddBlipForRadius(p.x, p.y, p.z, p.radius)
            SetBlipColour(area, 47)        -- orange
            SetBlipAlpha(area, 90)
            blips[#blips + 1] = area
        end
        local blip = AddBlipForCoord(p.x, p.y, p.z)
        SetBlipSprite(blip, 141)           -- GTA's hunting icon
        SetBlipColour(blip, p.kind == 'lodge' and 47 or 25)
        SetBlipScale(blip, p.kind == 'lodge' and 0.9 or 0.75)
        SetBlipAsShortRange(blip, p.kind ~= 'lodge')
        nameBlip(blip, p.name)
        blips[#blips + 1] = blip
    end
end)

AddEventHandler('onResourceStop', function(resource)
    if resource ~= GetCurrentResourceName() then return end
    for _, blip in ipairs(blips) do RemoveBlip(blip) end
end)
