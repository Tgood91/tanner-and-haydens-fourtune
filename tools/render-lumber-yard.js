#!/usr/bin/env node
// ============================================================
// tools/render-lumber-yard.js — a 3D picture of Hollow Creek Lumber Yard
//
//   node tools/render-lumber-yard.js
//
// Built from the island's own data, so it shows what the game has:
//   - the ground: island-terrain/obj (the same tiles the game streams)
//   - the buildings round the yard: island-buildings/obj (Pine Hollow etc.)
//   - the roads: street-renders/streets.json, as asphalt on the ground
//   - the yard itself: read from island-map.html (fence, log piles, plank
//     stacks, sawdust pile, mill shed, office), plus a truck and a loader
//   - pine trees in the woods round it (made up, but kept off roads,
//     buildings and the yard)
// Renders in the pre-installed Chromium with three.js (tools/vendor, MIT).
// Writes island-poster/renders/lumber-yard.png (and -top.png, from above).
// ============================================================
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const REPO = path.resolve(__dirname, "..");
const OUT = path.join(REPO, "island-poster/renders");
const toWorld = (mx, my) => [-5500 + (mx - 750) * 2, -6500 - (my - 500) * 2];
const CENTRE = toWorld(30, 580);   // the yard's middle
const HALF = 520;                  // metres round it

// ---------------- the ground and buildings: island OBJ tiles round the yard
function readObj(file, cx, cy) {
    const v = [], byMat = {};
    let mat = "default";
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
        if (line.startsWith("v ")) { const [, x, y, z] = line.split(/\s+/).map(Number); v.push([x + cx, y + cy, z]); }
        else if (line.startsWith("usemtl ")) mat = line.slice(7).trim();
        else if (line.startsWith("f ")) {
            const idx = line.trim().split(/\s+/).slice(1).map((t) => Number(t.split("/")[0]) - 1);
            (byMat[mat] ||= []).push(...idx.slice(0, 3).map((i) => v[i]));
            if (idx.length === 4) byMat[mat].push(v[idx[0]], v[idx[2]], v[idx[3]]);
        }
    }
    return byMat;
}
function readMtl(file) {
    const out = {};
    let name = null;
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
        if (line.startsWith("newmtl ")) name = line.slice(7).trim();
        else if (line.startsWith("Kd ") && name) out[name] = line.split(/\s+/).slice(1, 4).map(Number);
    }
    return out;
}
const near = ([x, y], pad = 0) => Math.abs(x - CENTRE[0]) < HALF + pad && Math.abs(y - CENTRE[1]) < HALF + pad;
const toLocal = ([x, y, z]) => [x - CENTRE[0], z, -(y - CENTRE[1])];   // three.js: y up, north = -z

function tiles(indexTiles, dir, prefix) {
    const meshes = {};
    for (const t of indexTiles) {
        if (!near(t.centre, 200)) continue;
        const file = path.join(REPO, dir, `${t.name}.obj`);
        if (!fs.existsSync(file)) continue;
        for (const [m, tri] of Object.entries(readObj(file, t.centre[0], t.centre[1]))) {
            (meshes[prefix + m] ||= []).push(...tri.map(toLocal).flat());
        }
    }
    return meshes;
}
const terrainIndex = JSON.parse(fs.readFileSync(path.join(REPO, "island-terrain/terrain-index.json"), "utf8"));
const buildingIndex = JSON.parse(fs.readFileSync(path.join(REPO, "island-buildings/buildings.json"), "utf8"));
const ground = tiles(terrainIndex.tiles, "island-terrain/obj", "t:");
const buildings = tiles(buildingIndex.tiles, "island-buildings/obj", "b:");
const colours = { ...Object.fromEntries(Object.entries(readMtl(path.join(REPO, "island-terrain/obj/island_terrain.mtl"))).map(([k, c]) => ["t:" + k, c])),
                  ...Object.fromEntries(Object.entries(readMtl(path.join(REPO, "island-buildings/obj/island_buildings.mtl"))).map(([k, c]) => ["b:" + k, c])) };

// ground height at a world point, from the game's own ground grid
const G = JSON.parse(fs.readFileSync(path.join(REPO, "island-terrain/road-guide.json"), "utf8"));
const gbuf = fs.readFileSync(path.join(REPO, "island-terrain/ground.f32"));
const gf = new Float32Array(gbuf.buffer, gbuf.byteOffset, G.rows * G.cols);
function groundZ(x, y) {
    const c = (x - G.x0) / G.spacing, r = (y - G.y0) / G.spacing, c0 = Math.floor(c), r0 = Math.floor(r), fc = c - c0, fr = r - r0;
    const at = (rr, cc) => gf[rr * G.cols + cc];
    return at(r0, c0) * (1 - fc) * (1 - fr) + at(r0, c0 + 1) * fc * (1 - fr) + at(r0 + 1, c0) * (1 - fc) * fr + at(r0 + 1, c0 + 1) * fc * fr;
}

// ---------------- the roads
const WIDTH = { highway: 24, arterial: 16, street: 9, street312: 9, backroad: 6, track: 5 };
const roads = JSON.parse(fs.readFileSync(path.join(REPO, "street-renders/streets.json"), "utf8"))
    .map((r) => ({ name: r.name, kind: r.kind, pts: r.points.map(([mx, my]) => toWorld(mx, my)) }))
    .filter((r) => r.pts.some((p) => near(p, 100)))
    .map((r) => {
        // resample every 4 m so the strip follows the ground
        const out = [];
        for (let i = 0; i < r.pts.length - 1; i++) {
            const [a, b] = [r.pts[i], r.pts[i + 1]], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 4));
            for (let k = 0; k < n; k++) out.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]);
        }
        out.push(r.pts.at(-1));
        return { ...r, width: WIDTH[r.kind] || 9, pts: out.map(([x, y]) => toLocal([x, y, groundZ(x, y) + 0.35])) };
    });

// ---------------- the yard, as the map draws it
const html = fs.readFileSync(path.join(REPO, "island-map.html"), "utf8");
const yardSvg = html.slice(html.indexOf('<g id="lumber-yard">'), html.indexOf('<g transform="translate(2716 470)">'));   // up to the lighthouse, drawn next
const num = (s, k) => Number((s.match(new RegExp(`${k}="([-\\d.]+)"`)) || [])[1]);
const rectOf = (tag) => ({ x: num(tag, "x"), y: num(tag, "y"), w: num(tag, "width"), h: num(tag, "height") });
const fence = rectOf(yardSvg.match(/<rect [^>]*stroke-dasharray[^>]*>/)[0]);
const piles = [...yardSvg.matchAll(/<title>Log pile<\/title><rect ([^>]*)>/g)].map((m) => rectOf(m[1]));
const planks = [...yardSvg.matchAll(/<rect ([^>]*)><title>Plank stack<\/title>/g)].map((m) => rectOf(m[1]));
const dust = (() => { const m = yardSvg.match(/<circle ([^>]*)><title>Sawdust pile/); return { x: num(m[1], "cx"), y: num(m[1], "cy"), r: num(m[1], "r") }; })();
const bldRect = (title) => rectOf(html.match(new RegExp(`<rect ([^>]*)><title>${title}`))[1]);
const shed = bldRect("Hollow Creek mill shed");
const office = bldRect("Hollow Creek yard office");
// map rect (units) -> local box: centre x/z, size, ground height
function box(r) {
    const [x0, y0] = toWorld(r.x, r.y), [x1, y1] = toWorld(r.x + r.w, r.y + r.h);
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const [lx, , lz] = toLocal([cx, cy, 0]);
    return { x: lx, z: lz, w: Math.abs(x1 - x0), d: Math.abs(y1 - y0), y: groundZ(cx, cy) };
}
const yard = { fence: box(fence), piles: piles.map(box), planks: planks.map(box), shed: box(shed), office: box(office),
               dust: (() => { const [wx, wy] = toWorld(dust.x, dust.y); const [x, , z] = toLocal([wx, wy, 0]); return { x, z, r: dust.r * 2, y: groundZ(wx, wy) }; })() };

// leave the game's own copies of the shed and office out: the render draws proper ones
const inYard = (x, z) => Math.abs(x - yard.fence.x) < yard.fence.w / 2 && Math.abs(z - yard.fence.z) < yard.fence.d / 2;
for (const k of Object.keys(buildings)) {
    const tri = buildings[k], keep = [];
    for (let i = 0; i < tri.length; i += 9) {
        const cx = (tri[i] + tri[i + 3] + tri[i + 6]) / 3, cz = (tri[i + 2] + tri[i + 5] + tri[i + 8]) / 3;
        if (!inYard(cx, cz)) keep.push(...tri.slice(i, i + 9));
    }
    buildings[k] = keep;
}

// ---------------- trees: woods round the yard, never on a road, a building or the yard
let seed = 1961;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const occupied = new Set();
const cell = (x, z) => `${Math.floor(x / 6)},${Math.floor(z / 6)}`;
for (const tri of Object.values(buildings)) for (let i = 0; i < tri.length; i += 3) {
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) occupied.add(cell(tri[i] + dx * 6, tri[i + 2] + dz * 6));
}
function clearOfRoads(x, z) {
    for (const r of roads) for (let i = 0; i < r.pts.length; i += 2) {
        const p = r.pts[i];
        if (Math.abs(p[0] - x) < 40 && Math.abs(p[2] - z) < 40 && Math.hypot(p[0] - x, p[2] - z) < r.width / 2 + 5) return false;
    }
    return true;
}
const trees = [];
for (let tries = 0; trees.length < 3200 && tries < 40000; tries++) {
    const x = (rnd() * 2 - 1) * HALF, z = (rnd() * 2 - 1) * HALF;
    const [wx, wy] = [x + CENTRE[0], -z + CENTRE[1]];
    const gz = groundZ(wx, wy);
    if (gz < 2) continue;                                                   // the beach and the sea
    const woods = z < -120 ? 0.9 : x < -260 ? 0.25 : 0.45;                  // thick north of the parkway (the hunting grounds)
    if (rnd() > woods) continue;
    if (Math.abs(x - yard.fence.x) < yard.fence.w / 2 + 14 && Math.abs(z - yard.fence.z) < yard.fence.d / 2 + 14) continue;
    if (occupied.has(cell(x, z)) || !clearOfRoads(x, z)) continue;
    trees.push([x, gz, z, 0.75 + rnd() * 0.6, rnd()]);
}

const scene = { ground, buildings, colours, roads, yard, trees };
const pageScript = fs.readFileSync(path.join(__dirname, "render-lumber-yard.page.js"), "utf8");

(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 });
    page.on("console", (m) => { if (m.type() === "error") console.error("page:", m.text()); });
    await page.setContent('<html><body style="margin:0;background:#9cc3e0"><canvas id="c"></canvas></body></html>');
    await page.addScriptTag({ path: path.join(__dirname, "vendor/three-0.149.0.min.js") });
    await page.addScriptTag({ content: pageScript });
    for (const [view, file] of [["aerial", "lumber-yard.png"], ["top", "lumber-yard-top.png"]]) {
        await page.evaluate(({ scene, view }) => window.renderYard(scene, view), { scene, view });
        await page.screenshot({ path: path.join(OUT, file) });
    }
    await browser.close();
    const tri = (m) => Object.values(m).reduce((s, a) => s + a.length / 9, 0);
    console.log(`rendered island-poster/renders/lumber-yard.png and lumber-yard-top.png: ${tri(ground)} ground and ${tri(buildings)} building triangles, ${roads.length} roads, ${trees.length} trees, ${yard.piles.length} log piles`);
})();
