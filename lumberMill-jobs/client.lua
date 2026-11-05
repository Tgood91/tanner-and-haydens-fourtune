-- ============================================================
-- lumberMill-jobs/client.lua — the lumber yard, in the world
--
-- The rules (who may fell, what a log pays) live in the game core:
-- js-snippets/lumbermill.js. This only helps you find the work:
--   - a marker on the saw, the office and every felling spot near you
--   - "Press E" when you're close: runs /fell, /mill or /sellplanks,
--     which the server checks like any typed command
--   - pause-map blips for the yard and the logging woods
-- ============================================================

local L = LUMBER
local spots = {}
spots[#spots + 1] = { pos = L.saw, label = 'Press ~INPUT_CONTEXT~ to mill your logs', command = 'mill', colour = { 230, 170, 60 } }
spots[#spots + 1] = { pos = L.office, label = 'Press ~INPUT_CONTEXT~ to sell planks', command = 'sellplanks', colour = { 90, 200, 120 } }
for _, t in ipairs(L.trees) do
    spots[#spots + 1] = { pos = t, label = 'Press ~INPUT_CONTEXT~ to fell this tree', command = 'fell', colour = { 200, 140, 80 } }
end

local function dist(a, b)
    return math.sqrt((a.x - b.x) ^ 2 + (a.y - b.y) ^ 2 + (a.z - b.z) ^ 2)
end

local function helpText(text)
    BeginTextCommandDisplayHelp('STRING')
    AddTextComponentSubstringPlayerName(text)
    EndTextCommandDisplayHelp(0, false, true, -1)
end

-- Which spots are close enough to draw (checked twice a second, not every frame)
local nearby = {}
CreateThread(function()
    while true do
        local p = GetEntityCoords(PlayerPedId())
        local me = { x = p.x, y = p.y, z = p.z }
        local list = {}
        for _, s in ipairs(spots) do
            local d = dist(me, s.pos)
            if d < L.drawRange then list[#list + 1] = { s = s, d = d } end
        end
        nearby = list
        Wait(500)
    end
end)

local busy = false
CreateThread(function()
    while true do
        if #nearby == 0 then
            Wait(500)
        else
            local p = GetEntityCoords(PlayerPedId())
            local me = { x = p.x, y = p.y, z = p.z }
            for _, n in ipairs(nearby) do
                local s = n.s
                local c = s.colour
                -- 1 = a cylinder on the ground
                DrawMarker(1, s.pos.x, s.pos.y, s.pos.z - 1.0, 0, 0, 0, 0, 0, 0, 2.0, 2.0, 0.6, c[1], c[2], c[3], 120, false, false, 2, false, nil, nil, false)
                if dist(me, s.pos) < L.useRange and not IsPedInAnyVehicle(PlayerPedId(), false) then
                    helpText(s.label)
                    if IsControlJustReleased(0, 38) and not busy then   -- 38 = E
                        busy = true
                        ExecuteCommand(s.command)
                        SetTimeout(1500, function() busy = false end)   -- no double presses
                    end
                end
            end
            Wait(0)
        end
    end
end)

-- Pause-map blips: the yard and the logging woods
local blips = {}
local function blip(pos, sprite, colour, name)
    local b = AddBlipForCoord(pos.x, pos.y, pos.z)
    SetBlipSprite(b, sprite)
    SetBlipColour(b, colour)
    SetBlipScale(b, 0.85)
    SetBlipAsShortRange(b, true)
    BeginTextCommandSetBlipName('STRING')
    AddTextComponentSubstringPlayerName(name)
    EndTextCommandSetBlipName(b)
    blips[#blips + 1] = b
end
CreateThread(function()
    -- 1 is the plain marker, so the names are what matter; swap in another icon from the blip list if you like
    blip(L.office, 1, 21, L.yardLabel .. ' (/apply lumbermill)')
    blip(L.loggingCentre, 1, 25, 'Copper Hills logging (/fell)')
end)

AddEventHandler('onResourceStop', function(resource)
    if resource ~= GetCurrentResourceName() then return end
    for _, b in ipairs(blips) do RemoveBlip(b) end
end)
