#!/usr/bin/env node
// ============================================================
// tools/gen-elevation.js — the island's real heights, for the game
//
//   node tools/gen-elevation.js [--island "<path to fourtune-island>"]
//
// Reads a fourtune-island checkout (found by tools/island-path.js) and writes
//   js-snippets/elevation-data.json   for js-snippets/elevation.js
//   world/elevation_data.lua          for the world resource (world/main.lua)
//
// Everything comes from what the island actually builds, so the numbers are the
// ground players stand on, not an estimate:
//   - the ground: island-terrain/ground.f32 (8 m heightmap; cut and filled under every road)
//   - each road's level: the island-roads ymap pieces, matched to world/streets_geo.lua
//     centre lines (so bridges are at deck height, not the sea bed)
//   - every building's base and roof: island-buildings/buildings.json
//   - districts and parks: where the island map writes their names (island-map.html)
// Rerun after regenerating the island (its README), then commit both outputs.
// ============================================================
const fs = require("fs");
const path = require("path");
const { islandPath } = require("./island-path");

const REPO = path.resolve(__dirname, "..");
const island = islandPath(process.argv.slice(2));
if (!island.found) {
    console.error(`\n✗ No fourtune-island checkout at ${island.path}\n  Clone https://github.com/Tgood91/fourtune-island next to this repo, or pass --island "<path>".`);
    process.exit(1);
}
const IS = (f) => path.join(island.path, f);
const r1 = (v) => Math.round(v * 10) / 10;

// ---- the island's numbers --------------------------------------------------------------
const roadsIndex = JSON.parse(fs.readFileSync(IS("island-roads/xml/roads-index.json"), "utf8"));
const CFG = roadsIndex.config;
const ROAD_LEVEL = CFG.z;                       // the level the island's settled ground and roads are built at
const ROAD_SINK = 0.3;                          // the ground sits this far under a road piece (gen-island-terrain.py)
const SEA_LEVEL = 0;
const WATERLINE = 1.0;                          // the beach meets the sea at 1 m (gen-island-terrain.py)
const ROCKLINE = ROAD_LEVEL + 190;              // above this the island's ground is bare rock (gen-island-terrain.py)
const SNOWLINE = 700;                           // Mt. Fuugee's snow cap: the top ~200 m of the peak
const BANDS = [                                 // [up to, name]; the last band has no ceiling
    [WATERLINE, "the sea"], [8, "shoreline"], [45, "lowland"], [120, "foothills"],
    [ROCKLINE, "hills"], [SNOWLINE, "mountain slopes"], [Infinity, "the summit country"],
];

const ti = JSON.parse(fs.readFileSync(IS("island-terrain/terrain-index.json"), "utf8"));
const [ROWS, COLS] = ti.grid, [X0, Y0] = ti.origin, SP = ti.spacing;
const ground = new Float32Array(fs.readFileSync(IS("island-terrain/ground.f32")).buffer.slice(0));
const coast = new Float32Array(fs.readFileSync(IS("island-terrain/coast.f32")).buffer.slice(0));
if (ground.length !== ROWS * COLS) throw new Error(`ground.f32 has ${ground.length} cells, expected ${ROWS}x${COLS}`);

// Which way the rows run: settle it against the buildings, whose base heights the island
// generator took from this same ground.
const buildings = JSON.parse(fs.readFileSync(IS("island-buildings/buildings.json"), "utf8")).buildings;
const centre = (fp) => [fp.reduce((s, p) => s + p[0], 0) / fp.length, fp.reduce((s, p) => s + p[1], 0) / fp.length];
const sampler = (grid, flip) => (x, y) => {
    const c = (x - X0) / SP, r0 = (y - Y0) / SP, r = flip ? ROWS - 1 - r0 : r0;
    if (c < 0 || r < 0 || c > COLS - 1 || r > ROWS - 1) return null;
    const c0 = Math.min(COLS - 2, Math.floor(c)), rr = Math.min(ROWS - 2, Math.floor(r)), fx = c - c0, fy = r - rr;
    const at = (i, j) => grid[(rr + j) * COLS + (c0 + i)];
    return at(0, 0) * (1 - fx) * (1 - fy) + at(1, 0) * fx * (1 - fy) + at(0, 1) * (1 - fx) * fy + at(1, 1) * fx * fy;
};
const misfit = (flip) => {
    const s = sampler(ground, flip);
    const d = buildings.map((b) => { const [x, y] = centre(b.footprint); const g = s(x, y); return g === null ? 999 : Math.abs(g - b.base); });
    return d.sort((a, b) => a - b)[Math.floor(d.length / 2)];
};
const FLIP = misfit(true) < misfit(false);
const groundAt = sampler(ground, FLIP), coastAt = sampler(coast, FLIP);
console.log(`ground grid ${COLS}x${ROWS} at ${SP} m, rows ${FLIP ? "north-down" : "south-up"} (buildings fit to ${misfit(FLIP).toFixed(2)} m)`);

// ---- map units <-> world (the island map's own conversion) ----------------------------
const M = CFG.metresPerUnit, CX = CFG.centre.x, CY = CFG.centre.y;
const toWorld = (mx, my) => [CX + (mx - 750) * M, CY - (my - 500) * M];

// ---- road pieces: every placed piece of road, with its height ---------------------------
const pieces = [];
for (const f of fs.readdirSync(IS("island-roads/xml")).filter((f) => f.endsWith(".ymap.xml"))) {
    const xml = fs.readFileSync(IS(path.join("island-roads/xml", f)), "utf8");
    for (const m of xml.matchAll(/<position x="([-\d.]+)" y="([-\d.]+)" z="([-\d.]+)"/g)) pieces.push([+m[1], +m[2], +m[3]]);
}
const CELL = 16, hash = new Map();
for (const p of pieces) { const k = `${Math.floor(p[0] / CELL)},${Math.floor(p[1] / CELL)}`; (hash.get(k) || hash.set(k, []).get(k)).push(p); }
// The height of the road at (x, y). Where roads cross or meet, pieces of more than one road
// lie within reach: follow the road's own level by taking the one nearest the height of the
// step before (prevZ), or the nearest piece at a road's first point.
const pieceZ = (x, y, prevZ = null, within = 9) => {
    let best = null, score = Infinity;
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++)
        for (const p of hash.get(`${Math.floor(x / CELL) + i},${Math.floor(y / CELL) + j}`) || []) {
            const d = Math.hypot(p[0] - x, p[1] - y); if (d > within) continue;
            const sc = prevZ === null ? d : Math.abs(p[2] - prevZ) * 4 + d;
            if (sc < score) { score = sc; best = p[2]; }
        }
    return best;
};

// ---- roads: the island's streets, each with its real profile ------------------------
const geo = fs.readFileSync(path.join(REPO, "world/streets_geo.lua"), "utf8");
const roads = [];
for (const m of geo.matchAll(/\{ code = "([^"]+)", name = "([^"]+)", kind = "([^"]+)", city = "([^"]+)"[^\n]*\n\s*points = \{ ([^\n]*) \} \}/g)) {
    const pts = [...m[5].matchAll(/\{([-\d.]+),([-\d.]+)\}/g)].map((q) => toWorld(+q[1], +q[2]));
    let min = Infinity, max = -Infinity, climb = 0, descent = 0, steepest = 0, bridge = false, length = 0, prev = null, high = null;
    const zs = [];
    for (const [x, y] of pts) {
        const z = pieceZ(x, y, prev ? prev[2] : null) ?? ((groundAt(x, y) ?? ROAD_LEVEL) + ROAD_SINK);
        if ((coastAt(x, y) ?? 0) < -30) bridge = true;            // past -30 m from the waterline the road is on a bridge
        zs.push(z);
        if (z < min) min = z;
        if (z > max) { max = z; high = { x: r1(x), y: r1(y), z: r1(z) }; }
        if (prev) {
            const run = Math.hypot(x - prev[0], y - prev[1]), rise = z - prev[2];
            length += run;
            if (rise > 0) climb += rise; else descent -= rise;
            if (run >= 4) steepest = Math.max(steepest, Math.abs(rise) / run);
        }
        prev = [x, y, z];
    }
    if (!pts.length) continue;
    roads.push({ code: m[1], name: m[2], kind: m[3], city: m[4], start: r1(zs[0]), end: r1(zs[zs.length - 1]),
                 min: r1(min), max: r1(max), climb: r1(climb), descent: r1(descent),
                 grade: Math.round(steepest * 1000) / 10, bridge, length: Math.round(length), highPoint: high,
                 line: pts.map(([x, y], i) => [r1(x), r1(y), r1(zs[i])]) });
}

// ---- the peak and the hilltops: local highs a long way from anything higher --------------
const cellZ = (c, r) => ground[(FLIP ? ROWS - 1 - r : r) * COLS + c];
const cellXY = (c, r) => [X0 + c * SP, Y0 + r * SP];
let peak = null;
for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) { const z = cellZ(c, r); if (!peak || z > peak.z) peak = { c, r, z }; }
const tops = [], RADIUS = 75;                  // 75 cells = 600 m: a hilltop is the highest ground within 600 m
for (let r = 0; r < ROWS; r += 3) for (let c = 0; c < COLS; c += 3) {
    const z = cellZ(c, r); if (z < ROAD_LEVEL + 35) continue;
    let top = true;
    for (let j = -RADIUS; j <= RADIUS && top; j += 3) for (let i = -RADIUS; i <= RADIUS; i += 3) {
        const cc = c + i, rr = r + j; if (cc < 0 || rr < 0 || cc >= COLS || rr >= ROWS || (i === 0 && j === 0)) continue;
        if (cellZ(cc, rr) > z) { top = false; break; }
    }
    if (top) tops.push({ c, r, z });
}

// ---- districts and parks: where the island map names them ---------------------------
const mapHtml = fs.readFileSync(IS("island-map.html"), "utf8");
const places = [];
for (const m of mapHtml.matchAll(/<text class="name zone-name" x="([-\d.]+)" y="([-\d.]+)"[^>]*>([^<]+)</g)) {
    // a district's height is its typical ground: the median of the land within 200 m of its name
    const [x, y] = toWorld(+m[1], +m[2]); const around = [];
    for (let dy = -200; dy <= 200; dy += SP * 2) for (let dx = -200; dx <= 200; dx += SP * 2) {
        if (dx * dx + dy * dy > 200 * 200) continue;
        const g = groundAt(x + dx, y + dy); if (g !== null && g > WATERLINE) around.push(g);
    }
    if (!around.length) continue;
    around.sort((a, b) => a - b);
    places.push({ name: m[3].trim(), x: r1(x), y: r1(y), z: r1(around[Math.floor(around.length / 2)]), high: r1(around[around.length - 1]) });
}
const nearestPlace = (x, y) => places.reduce((b, p) => (!b || Math.hypot(p.x - x, p.y - y) < Math.hypot(b.x - x, b.y - y) ? p : b), null);
const hilltops = tops.sort((a, b) => b.z - a.z).map(({ c, r, z }) => {
    const [x, y] = cellXY(c, r); const near = nearestPlace(x, y);
    const isPeak = Math.hypot(c - peak.c, r - peak.r) < 8;
    if (isPeak) { const [qx, qy] = cellXY(peak.c, peak.r); return { name: "Mt. Fuugee summit", x: r1(qx), y: r1(qy), z: r1(peak.z) }; }
    return { name: `the hilltop near ${near ? near.name : "the coast"}`, x: r1(x), y: r1(y), z: r1(z) };
});
const [px, py] = cellXY(peak.c, peak.r);

// ---- buildings ------------------------------------------------------------------------------
const bldg = buildings.map((b) => { const [x, y] = centre(b.footprint);
    return { type: b.type, label: b.label || b.type, floors: b.floors, x: r1(x), y: r1(y), base: r1(b.base), top: r1(b.top) }; });

// ---- the coarse grid, for heightAt anywhere: every 4th cell (32 m) --------------------------
const STEP = 4, gcols = Math.floor((COLS - 1) / STEP) + 1, grows = Math.floor((ROWS - 1) / STEP) + 1;
const grid = [];
for (let r = 0; r < grows; r++) for (let c = 0; c < gcols; c++) grid.push(Math.round(cellZ(c * STEP, r * STEP) * 10));   // decimetres

// ---- full 8 m detail round each summit and hilltop: a coarse grid flattens a sharp top ------
const PATCH = 15;                               // 15 x 15 cells = 112 m square, centred on the top
const patchAt = (c0, r0, cols, rows) => {
    c0 = Math.max(0, Math.min(COLS - cols, c0)); r0 = Math.max(0, Math.min(ROWS - rows, r0));
    const dm = [];
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) dm.push(Math.round(cellZ(c0 + i, r0 + j) * 10));
    const [x0, y0] = cellXY(c0, r0);
    return { x0, y0, spacing: SP, cols, rows, decimetres: dm };
};
const patches = [peak, ...tops.filter((t) => Math.hypot(t.c - peak.c, t.r - peak.r) >= 8)]
    .map(({ c, r }) => patchAt(c - (PATCH >> 1), r - (PATCH >> 1), PATCH, PATCH));
// ...and under every building, plus 16 m round it, so a building's ground is exact
// (the coarse grid smears pad edges, the airport's especially, by metres)
for (const b of buildings) {
    const xs = b.footprint.map((p) => p[0]), ys = b.footprint.map((p) => p[1]);
    const c0 = Math.floor((Math.min(...xs) - 16 - X0) / SP), c1 = Math.ceil((Math.max(...xs) + 16 - X0) / SP);
    const ry = (y) => (y - Y0) / SP;
    const r0 = Math.floor(ry(Math.min(...ys) - 16)), rN = Math.ceil(ry(Math.max(...ys) + 16));
    patches.push(patchAt(c0, r0, c1 - c0 + 1, rN - r0 + 1));
}

const data = {
    note: "GENERATED by tools/gen-elevation.js from fourtune-island; do not edit by hand.",
    seaLevel: SEA_LEVEL, waterline: WATERLINE, roadLevel: ROAD_LEVEL, rockline: ROCKLINE, snowline: SNOWLINE,
    bands: BANDS.map(([to, name]) => [to === Infinity ? null : to, name]),
    grid: { x0: X0, y0: Y0, spacing: SP * STEP, cols: gcols, rows: grows, decimetres: grid },
    patches,
    peak: { name: "Mt. Fuugee summit", x: r1(px), y: r1(py), z: r1(peak.z) },
    hilltops, places, roads, buildings: bldg,
};
fs.writeFileSync(path.join(REPO, "js-snippets/elevation-data.json"), JSON.stringify(data) + "\n");

// ---- the Lua twin ---------------------------------------------------------------------------
const q = (s) => JSON.stringify(s);
const L = [];
L.push("-- world/elevation_data.lua — GENERATED by tools/gen-elevation.js from fourtune-island; do not edit by hand.");
L.push("-- Rerun: node tools/gen-elevation.js   (same data as js-snippets/elevation-data.json)");
L.push("ELEVATION_DATA = {");
L.push(`    seaLevel = ${SEA_LEVEL}, waterline = ${WATERLINE}, roadLevel = ${ROAD_LEVEL}, rockline = ${ROCKLINE}, snowline = ${SNOWLINE},`);
L.push(`    bands = { ${data.bands.map(([to, n]) => `{ ${to === null ? "math.huge" : to}, ${q(n)} }`).join(", ")} },`);
L.push(`    peak = { name = ${q(data.peak.name)}, x = ${data.peak.x}, y = ${data.peak.y}, z = ${data.peak.z} },`);
L.push(`    grid = { x0 = ${X0}, y0 = ${Y0}, spacing = ${SP * STEP}, cols = ${gcols}, rows = ${grows}, decimetres = {`);
for (let r = 0; r < grows; r++) L.push("        " + grid.slice(r * gcols, (r + 1) * gcols).join(",") + ",");
L.push("    } },");
L.push("    patches = {");
for (const p of patches) L.push(`        { x0 = ${p.x0}, y0 = ${p.y0}, spacing = ${p.spacing}, cols = ${p.cols}, rows = ${p.rows}, decimetres = { ${p.decimetres.join(",")} } },`);
L.push("    },");
L.push(`    hilltops = { ${hilltops.map((h) => `{ name = ${q(h.name)}, x = ${h.x}, y = ${h.y}, z = ${h.z} }`).join(", ")} },`);
L.push("    places = {");
for (const p of places) L.push(`        { name = ${q(p.name)}, x = ${p.x}, y = ${p.y}, z = ${p.z} },`);
L.push("    },");
L.push("    roads = {");
for (const r of roads) L.push(`        { code = ${q(r.code)}, name = ${q(r.name)}, kind = ${q(r.kind)}, start = ${r.start}, finish = ${r.end}, min = ${r.min}, max = ${r.max}, climb = ${r.climb}, descent = ${r.descent}, grade = ${r.grade}, bridge = ${r.bridge}, length = ${r.length},\n          line = { ${r.line.flat().join(",")} } },`);   // line: x, y, z, x, y, z ...
L.push("    },");
L.push("}");
L.push("return ELEVATION_DATA");
fs.writeFileSync(path.join(REPO, "world/elevation_data.lua"), L.join("\n") + "\n");

const kb = (f) => (fs.statSync(path.join(REPO, f)).size / 1024).toFixed(0) + " KB";
console.log(`peak ${data.peak.z} m · ${hilltops.length} hilltops · ${places.length} places · ${roads.length} roads (${roads.filter((r) => r.bridge).length} with a bridge) · ${bldg.length} buildings · ${pieces.length} road pieces`);
console.log(`wrote js-snippets/elevation-data.json (${kb("js-snippets/elevation-data.json")}), world/elevation_data.lua (${kb("world/elevation_data.lua")})`);
