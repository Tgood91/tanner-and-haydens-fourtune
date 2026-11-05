// ============================================================
// elevation.js — ground height for the world vocabulary
//
// places.js answers WHERE (road, district, city). This answers
// HOW HIGH, from the island's real ground: every number comes from
// what fourtune-island builds (its heightmap, its road pieces, its
// buildings), exported by tools/gen-elevation.js into
// elevation-data.json. Positions are world coordinates on the island.
//
//   heightAt(pos)        -> ground (or road / bridge deck) height in metres, null off the island
//   bandAt(pos)          -> "the sea", "shoreline", "lowland", "foothills", "hills",
//                           "mountain slopes" or "the summit country"
//   describeHeight(pos)  -> "foothills, 64 m up" / "on Channel Bridge, 40 m above the water"
//   isSea(pos)           -> open water (not a bridge)
//   hasSnow(pos)         -> above the snowline
//   roadAt(pos)          -> the road you're on and its level there, or null
//   roadProfile(road)    -> a road's level: { start, end, min, max, climb, descent, grade, bridge, length, highPoint }
//   zoneHeight(zone)     -> a district's or park's typical ground
//   buildingsNear(pos)   -> buildings within 60 m, with base and roof heights
//
// Levels to know: the sea at 0, the waterline at 1, the island's settled
// ground and most roads at 25, bare rock from 215, snow from 700, and
// Mt. Fuugee's summit at the top. Regenerate after the island changes:
//   node tools/gen-elevation.js
// ============================================================

const DATA = require("./elevation-data.json");

const SEA_LEVEL = DATA.seaLevel;
const WATERLINE = DATA.waterline;
const ROAD_LEVEL = DATA.roadLevel;
const ROCKLINE = DATA.rockline;
const SNOWLINE = DATA.snowline;
const PEAK = DATA.peak;
const HILLTOPS = DATA.hilltops;
const ROADS = DATA.roads;
const BUILDINGS = DATA.buildings;
// The reference table: the summit, every hilltop, every district and park.
const HEIGHTS = [PEAK, ...HILLTOPS.filter((h) => h.name !== PEAK.name), ...DATA.places];

// ---- the ground: the island's heightmap, 32 m apart, interpolated; at full 8 m detail
// round the summit and each hilltop, where a coarse grid would flatten the top ---------
function sample(G, x, y) {
    const c = (x - G.x0) / G.spacing, r = (y - G.y0) / G.spacing;
    if (!(c >= 0 && r >= 0 && c <= G.cols - 1 && r <= G.rows - 1)) return null;
    const c0 = Math.min(G.cols - 2, Math.floor(c)), r0 = Math.min(G.rows - 2, Math.floor(r)), fx = c - c0, fy = r - r0;
    const at = (i, j) => G.decimetres[(r0 + j) * G.cols + (c0 + i)] / 10;
    return at(0, 0) * (1 - fx) * (1 - fy) + at(1, 0) * fx * (1 - fy) + at(0, 1) * (1 - fx) * fy + at(1, 1) * fx * fy;
}
function groundAt(x, y) {
    for (const p of DATA.patches) { const z = sample(p, x, y); if (z !== null) return z; }
    return sample(DATA.grid, x, y);
}

// ---- roads: every point along every road, with its height, hashed for lookup ------
const CELL = 24, ROAD_REACH = 8;                // within 8 m of a road's centre line you're on it
const roadHash = new Map();
for (const road of ROADS) for (const p of road.line) {
    const k = `${Math.floor(p[0] / CELL)},${Math.floor(p[1] / CELL)}`;
    (roadHash.get(k) || roadHash.set(k, []).get(k)).push([p[0], p[1], p[2], road]);
}

function roadAt(pos) {
    if (!pos) return null;
    let best = null, bd = ROAD_REACH;
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++)
        for (const p of roadHash.get(`${Math.floor(pos.x / CELL) + i},${Math.floor(pos.y / CELL) + j}`) || []) {
            const d = Math.hypot(p[0] - pos.x, p[1] - pos.y);
            if (d < bd) { bd = d; best = p; }
        }
    return best && { code: best[3].code, name: best[3].name, z: best[2], bridge: best[3].bridge && (groundAt(best[0], best[1]) ?? 0) < WATERLINE };
}

// Height at a position: the road's surface on a road (so a bridge deck, not the sea under
// it), otherwise the ground. Rounded to the decimetre. null off the island's map.
function heightAt(pos) {
    if (!pos) return null;
    const road = roadAt(pos);
    if (road) return Math.round(road.z * 10) / 10;
    const g = groundAt(pos.x, pos.y);
    return g === null ? null : Math.round(g * 10) / 10;
}

function isSea(pos) {
    if (roadAt(pos)) return false;
    const g = pos && groundAt(pos.x, pos.y);
    return g !== null && g !== undefined && g < WATERLINE;
}

function bandAt(pos) {
    const z = heightAt(pos);
    if (z === null) return null;
    if (isSea(pos)) return "the sea";
    for (const [to, name] of DATA.bands) if (to === null || z < to) return name === "the sea" ? "shoreline" : name;
    return null;
}

// "foothills, 64 m up" · "on Channel Bridge, 40 m above the water" · "the sea"
function describeHeight(pos) {
    const z = heightAt(pos);
    if (z === null) return "off the island";
    const road = roadAt(pos);
    if (road && road.bridge) return `on ${road.name}, ${Math.round(z)} m above the water`;
    if (isSea(pos)) return "the sea";
    const snow = z >= SNOWLINE ? ", in the snow" : "";
    return `${bandAt(pos)}, ${Math.round(z)} m up${snow}`;
}

function hasSnow(pos) {
    const z = heightAt(pos);
    return z !== null && z >= SNOWLINE;
}

// A district's or park's typical ground (by name; it's measured where the island names it).
function zoneHeight(zone) {
    const p = DATA.places.find((q) => q.name === (zone.name || zone));
    if (p) return p.z;
    return zone.center ? heightAt(zone.center) : null;
}

// A road's level along its length, by its number or name (a places.js road works as-is).
function roadProfile(road) {
    const r = ROADS.find((q) => (road.code && q.code === road.code)) || ROADS.find((q) => q.name === (road.name || road));
    if (!r) return null;
    return { code: r.code, name: r.name, start: r.start, end: r.end, min: r.min, max: r.max, climb: r.climb, descent: r.descent,
             grade: r.grade, bridge: r.bridge, length: r.length, highPoint: r.highPoint };
}

function buildingsNear(pos, within = 60) {
    if (!pos) return [];
    return BUILDINGS.filter((b) => Math.hypot(b.x - pos.x, b.y - pos.y) <= within)
        .map((b) => ({ ...b, height: Math.round((b.top - b.base) * 10) / 10 }));
}

const m = (v) => `${Math.round(v)} m`;

// /height: where you stand, the road under you, and how far below the summit.
function heightReport(pos) {
    const z = heightAt(pos);
    if (z === null) return "You're off the island: no heights here.";
    const lines = [`${describeHeight(pos).replace(/^./, (c) => c.toUpperCase())}.`];
    const road = roadAt(pos);
    if (road) { const p = roadProfile({ code: road.code }); lines.push(`On ${p.name} (${p.code}): ${m(p.min)} to ${m(p.max)} along it.`); }
    lines.push(z >= PEAK.z - 1 ? "You're on the summit of Mt. Fuugee." : `${PEAK.name}: ${m(PEAK.z)}, ${m(PEAK.z - z)} above you. Snow from ${m(SNOWLINE)}.`);
    return lines.join(" ");
}

// /height <road>: one road's level, by name or number.
function roadReport(which) {
    const r = roadProfile({ code: which, name: which }) ||
              roadProfile({ code: String(which).toUpperCase() }) ||
              ROADS.map((q) => roadProfile(q)).find((q) => q.name.toLowerCase() === String(which).toLowerCase());
    if (!r) return null;
    const shape = r.max - r.min < 1 ? `level at ${m(r.min)}` : `from ${m(r.start)} to ${m(r.end)}, between ${m(r.min)} and ${m(r.max)}, climbing ${m(r.climb)} and falling ${m(r.descent)}`;
    return `${r.name} (${r.code}), ${r.length} m long: ${shape}${r.bridge ? ", over the water on a bridge" : ""}.`;
}

module.exports = {
    heightReport, roadReport,
    SEA_LEVEL, WATERLINE, ROAD_LEVEL, ROCKLINE, SNOWLINE, PEAK, HILLTOPS, HEIGHTS, ROADS, BUILDINGS,
    heightAt, groundAt, bandAt, describeHeight, isSea, hasSnow, roadAt, roadProfile, zoneHeight, buildingsNear,
};
