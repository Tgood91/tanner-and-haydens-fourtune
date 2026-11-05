-- ============================================================
-- world/elevation.lua — ground height on the island, in Lua
--
-- The Lua twin of js-snippets/elevation.js, reading the same exported
-- data (world/elevation_data.lua, from tools/gen-elevation.js): the
-- island's real heightmap, every road's level, every building's base
-- and roof. Answers are identical to the JS side.
--
--   exports.world:HeightAt(coords)        metres, or nil off the island
--   exports.world:BandAt(coords)          "lowland", "foothills", ... "the summit country"
--   exports.world:DescribeHeight(coords)  "foothills, 64 m up"
--   exports.world:IsSea(coords)           open water (not a bridge)
--   exports.world:HasSnow(coords)         above the snowline
--   exports.world:RoadLevelAt(coords)     { code, name, z, bridge } or nil
--   exports.world:RoadProfile(codeOrName) a road's level along its length
--
-- /height tells you where you stand: band, height, the road under you.
-- ============================================================

local E = ELEVATION_DATA

local function sample(G, x, y)
    local c, r = (x - G.x0) / G.spacing, (y - G.y0) / G.spacing
    if not (c >= 0 and r >= 0 and c <= G.cols - 1 and r <= G.rows - 1) then return nil end
    local c0 = math.min(G.cols - 2, math.floor(c))
    local r0 = math.min(G.rows - 2, math.floor(r))
    local fx, fy = c - c0, r - r0
    local function at(i, j) return G.decimetres[(r0 + j) * G.cols + (c0 + i) + 1] / 10 end
    return at(0, 0) * (1 - fx) * (1 - fy) + at(1, 0) * fx * (1 - fy) + at(0, 1) * (1 - fx) * fy + at(1, 1) * fx * fy
end

local function GroundAt(x, y)
    for _, p in ipairs(E.patches) do
        local z = sample(p, x, y)
        if z then return z end
    end
    return sample(E.grid, x, y)
end

-- every point along every road, hashed for lookup (same 24 m cells and 8 m reach as the JS side)
local CELL, REACH = 24, 8
local roadHash = {}
for _, road in ipairs(E.roads) do
    local l = road.line
    for i = 1, #l, 3 do
        local k = math.floor(l[i] / CELL) .. ',' .. math.floor(l[i + 1] / CELL)
        roadHash[k] = roadHash[k] or {}
        table.insert(roadHash[k], { l[i], l[i + 1], l[i + 2], road })
    end
end

local function RoadLevelAt(pos)
    if not pos then return nil end
    local best, bd = nil, REACH
    local cx, cy = math.floor(pos.x / CELL), math.floor(pos.y / CELL)
    for i = -1, 1 do for j = -1, 1 do
        for _, p in ipairs(roadHash[(cx + i) .. ',' .. (cy + j)] or {}) do
            local d = math.sqrt((p[1] - pos.x) ^ 2 + (p[2] - pos.y) ^ 2)
            if d < bd then bd, best = d, p end
        end
    end end
    if not best then return nil end
    local under = GroundAt(best[1], best[2]) or 0
    return { code = best[4].code, name = best[4].name, z = best[3], bridge = best[4].bridge and under < E.waterline }
end

local function round1(v) return math.floor(v * 10 + 0.5) / 10 end

local function HeightAt(pos)
    if not pos then return nil end
    local road = RoadLevelAt(pos)
    if road then return round1(road.z) end
    local g = GroundAt(pos.x, pos.y)
    return g and round1(g) or nil
end

local function IsSea(pos)
    if RoadLevelAt(pos) then return false end
    local g = pos and GroundAt(pos.x, pos.y)
    return g ~= nil and g < E.waterline
end

local function BandAt(pos)
    local z = HeightAt(pos)
    if not z then return nil end
    if IsSea(pos) then return 'the sea' end
    for _, b in ipairs(E.bands) do
        if z < b[1] then return b[2] == 'the sea' and 'shoreline' or b[2] end
    end
    return nil
end

local function HasSnow(pos)
    local z = HeightAt(pos)
    return z ~= nil and z >= E.snowline
end

local function DescribeHeight(pos)
    local z = HeightAt(pos)
    if not z then return 'off the island' end
    local road = RoadLevelAt(pos)
    if road and road.bridge then return string.format('on %s, %d m above the water', road.name, math.floor(z + 0.5)) end
    if IsSea(pos) then return 'the sea' end
    return string.format('%s, %d m up%s', BandAt(pos), math.floor(z + 0.5), z >= E.snowline and ', in the snow' or '')
end

local function RoadProfile(which)
    for _, r in ipairs(E.roads) do
        if r.code == which or r.name == which then
            return { code = r.code, name = r.name, start = r.start, finish = r.finish, min = r.min, max = r.max,
                     climb = r.climb, descent = r.descent, grade = r.grade, bridge = r.bridge, length = r.length }
        end
    end
    return nil
end

local function m(v) return string.format('%d m', math.floor(v + 0.5)) end

-- /height: where you stand, the road under you, and how far below the summit (same text as JS).
local function HeightReport(pos)
    local z = HeightAt(pos)
    if not z then return "You're off the island: no heights here." end
    local d = DescribeHeight(pos)
    local out = { d:sub(1, 1):upper() .. d:sub(2) .. '.' }
    local road = RoadLevelAt(pos)
    if road then
        local p = RoadProfile(road.code)
        table.insert(out, string.format('On %s (%s): %s to %s along it.', p.name, p.code, m(p.min), m(p.max)))
    end
    if z >= E.peak.z - 1 then
        table.insert(out, "You're on the summit of Mt. Fuugee.")
    else
        table.insert(out, string.format('%s: %s, %s above you. Snow from %s.', E.peak.name, m(E.peak.z), m(E.peak.z - z), m(E.snowline)))
    end
    return table.concat(out, ' ')
end

local function RoadReport(which)
    local r = RoadProfile(which) or RoadProfile(string.upper(which))
    if not r then
        for _, q in ipairs(E.roads) do if string.lower(q.name) == string.lower(which) then r = RoadProfile(q.code) end end
    end
    if not r then return nil end
    local shape
    if r.max - r.min < 1 then shape = 'level at ' .. m(r.min)
    else shape = string.format('from %s to %s, between %s and %s, climbing %s and falling %s', m(r.start), m(r.finish), m(r.min), m(r.max), m(r.climb), m(r.descent)) end
    return string.format('%s (%s), %d m long: %s%s.', r.name, r.code, r.length, shape, r.bridge and ', over the water on a bridge' or '')
end

exports('HeightAt', HeightAt)
exports('GroundAt', function(pos) return pos and GroundAt(pos.x, pos.y) end)
exports('BandAt', BandAt)
exports('DescribeHeight', DescribeHeight)
exports('IsSea', IsSea)
exports('HasSnow', HasSnow)
exports('RoadLevelAt', RoadLevelAt)
exports('RoadProfile', RoadProfile)

-- for main.lua's /whereami and /height (same resource, so a plain global)
FourtuneElevation = { HeightReport = HeightReport, RoadReport = RoadReport, HeightAt = HeightAt, BandAt = BandAt, DescribeHeight = DescribeHeight,
                      RoadLevelAt = RoadLevelAt, RoadProfile = RoadProfile, HasSnow = HasSnow, IsSea = IsSea, Data = E }
