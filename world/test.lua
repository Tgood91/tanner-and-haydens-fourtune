-- ============================================================
-- world/test.lua — headless checks for the world layer
--
-- Runs without FiveM: it stubs the handful of natives main.lua uses,
-- then calls the exported functions directly. Same checks the JS side
-- makes in js-snippets/game.test.js, so the two stay honest.
--
--   lua world/test.lua        (from the repo root)
-- ============================================================

local passed, failed = 0, 0

local function ok(cond, what)
    if cond then
        passed = passed + 1
    else
        failed = failed + 1
        print('  NOT OK: ' .. what)
    end
end

local function same(got, want, what)
    if got == want then
        passed = passed + 1
    else
        failed = failed + 1
        print(string.format('  NOT OK: %s\n    got:  %s\n    want: %s', what, tostring(got), tostring(want)))
    end
end

-- ---------- stub the natives main.lua touches ----------
local W = {}
local chat = {}

_G.exports = setmetatable({}, { __call = function(_, name, fn) W[name] = fn end })
_G.CreateThread = function() end -- the sweep loop is driven by hand below
_G.Wait = function() end
_G.GetPlayers = function() return {} end
_G.GetPlayerPed = function() return 1 end
_G.GetEntityCoords = function() return { x = 0.0, y = 0.0, z = 0.0 } end
_G.TriggerClientEvent = function(_, src, payload) chat[#chat + 1] = { src = src, msg = payload.args[2] } end
_G.AddEventHandler = function() end
_G.RegisterCommand = function() end

dofile('world/data.lua')
dofile('world/main.lua')
local Data = FourtuneWorldData

-- ---------- cities ----------
same(W.CityAt({ x = 0, y = 6100 }), 'chicago', 'far north is Chicago')
same(W.CityAt({ x = 0, y = 4000 }), 'geepee', 'the middle band is GeePee')
same(W.CityAt({ x = 0, y = -900 }), 'atlanta', 'the south is Atlanta')
same(W.CityAt({ x = 0, y = Data.borders.chicago }), 'chicago', 'the border itself counts as the city above it')

-- ---------- every place sits in the city it claims ----------
for _, z in ipairs(Data.zones) do
    same(W.CityAt(z.center), z.city, z.name .. ' sits inside ' .. z.city)
end
for _, r in ipairs(Data.roads) do
    ok(#r.points >= 2, r.name .. ' needs at least two points')
    for i, p in ipairs(r.points) do
        same(W.CityAt(p), r.city, string.format('%s point %d runs through %s', r.name, i, r.city))
    end
end

-- ---------- most specific name wins ----------
same(W.Describe({ x = -75, y = 6180, z = 30 }), 'Lakeshore Drive, The Shoreline, Chicago', 'a road beats the district around it')
same(W.ZoneAt({ x = -190, y = 6230 }).name, 'Winterline Park', 'the smaller circle wins')
same(W.Describe({ x = -190, y = 6230, z = 30 }), 'Winterline Park, Chicago', 'a park beats its district')
same(W.Describe({ x = -300, y = 6230, z = 30 }), 'Midway, Chicago', 'off the park and off every road, still in the district')
same(W.Describe({ x = 0, y = 4000, z = 30 }), 'GeePee', 'open country falls back to the city alone')
same(W.Label({ x = -75, y = 6180, z = 30 }), 'Lakeshore Drive', 'the short label is the best name')

-- ---------- release lands you in a different city ----------
for from, to in pairs(Data.releaseCity) do
    ok(from ~= to, from .. ' must not release into itself')
    local spot = W.ReleaseSpawn(from, function() return 0 end)
    same(spot.city, to, from .. ' releases into ' .. to)
    same(W.CityAt(spot.pos), to, from .. ' release point is really inside ' .. to)
end

-- ---------- spawn picking ----------
local first = W.PickSpawn('chicago', function() return 0 end)
same(first.label, Data.spawns.chicago[1].label, 'a roll of 0 takes the first spawn')
local last = W.PickSpawn('chicago', function() return 0.999 end)
same(last.label, Data.spawns.chicago[#Data.spawns.chicago].label, 'a roll near 1 takes the last spawn')
same(W.PickSpawn('nowhere', function() return 0 end).city, Data.defaultCity, 'an unknown city falls back to the default')

-- ---------- the sweep announces once, and never for a teleport ----------
same(W.Settle(1, { x = -430, y = 6020, z = 30 }), nil, 'the first fix is quiet')
-- Settle() exported to other resources never announces: that is the teleport path
same(W.Settle(1, { x = -190, y = 6230, z = 30 }), nil, 'a teleport into a park stays quiet')

-- ---------- listing ----------
ok(W.ListFor('chicago'):find('District: The Knot', 1, true) ~= nil, 'Chicago lists its districts')
ok(W.ListFor('chicago'):find('Park: Winterline Park', 1, true) ~= nil, 'Chicago lists its parks')
ok(W.ListFor('chicago'):find('Road: Lakeshore Drive', 1, true) ~= nil, 'Chicago lists its roads')
same(W.ListFor('nowhere'), 'Nothing mapped here yet.', 'an unmapped city says so')

print(string.format('# pass %d\n# fail %d', passed, failed))
os.exit(failed == 0 and 0 or 1)
