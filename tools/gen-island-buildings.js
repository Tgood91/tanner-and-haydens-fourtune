#!/usr/bin/env node
// ============================================================
// tools/gen-island-buildings.js — every building on the island, as 3D models
//
//   python3 tools/gen-island-terrain.py     (first: the ground they stand on)
//   node tools/gen-island-buildings.js
//
// Reads every building island-map.html draws, with its real footprint (turned
// ones included), in the pre-installed Chromium:
//   - the towers, with the floor count from their title (1017 south/north, west towers, 312 high-rises)
//   - the 312 city blocks' buildings and the 312 street frontage
//   - the 1017 houses, the 1017 apartment rows and the 770 farmhouses
//   - the airport terminals and control towers, the farm barns and silos
// Each one is extruded to its height (towers: floors x 3.5 m), set on the terrain
// (island-terrain/ground.f32) with its foundation sunk into the lowest corner, and
// grouped into the terrain's 256 m tiles. Writes island-buildings/:
//   obj/island_bldg_<c>_<r>.obj (+ island_buildings.mtl)   one mesh per tile, local to its centre
//   xml/island_buildings.ytyp.xml / .ymap.xml              archetypes + placements
//   buildings.json, preview.png (isometric), preview-top.png
// Wall UVs run 1 unit per 4 m across and 1 per floor up, so a window texture repeats per floor.
// ============================================================
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const REPO = path.resolve(__dirname, "..");
const OUT = path.join(REPO, "island-buildings");
const CFG = JSON.parse(fs.readFileSync(path.join(REPO, "island-roads/xml/roads-index.json"), "utf8")).config;
const TER = JSON.parse(fs.readFileSync(path.join(REPO, "island-terrain/terrain-index.json"), "utf8"));
const GRID = JSON.parse(fs.readFileSync(path.join(REPO, "island-terrain/road-guide.json"), "utf8"));
const gbuf = fs.readFileSync(path.join(REPO, "island-terrain/ground.f32"));
const GROUND = new Float32Array(gbuf.buffer, gbuf.byteOffset, gbuf.length / 4);
const TILE = TER.tile, LOD = 1500;

const toWorld = (mx, my) => [CFG.centre.x + (mx - 750) * CFG.metresPerUnit, CFG.centre.y - (my - 500) * CFG.metresPerUnit];
const ground = (x, y) => {
  const gx = Math.min(Math.max((x - GRID.x0) / GRID.spacing, 0), GRID.cols - 1.001);
  const gy = Math.min(Math.max((y - GRID.y0) / GRID.spacing, 0), GRID.rows - 1.001);
  const i = Math.floor(gx), j = Math.floor(gy), fx = gx - i, fy = gy - j, Z = (c, r) => GROUND[r * GRID.cols + c];
  return (Z(i, j) * (1 - fx) + Z(i + 1, j) * fx) * (1 - fy) + (Z(i, j + 1) * (1 - fx) + Z(i + 1, j + 1) * fx) * fy;
};
// Seeded random from a position, so a building keeps its height between runs.
const rnd = (x, y, salt = 0) => { const s = Math.sin(x * 12.9898 + y * 78.233 + salt * 37.719) * 43758.5453; return s - Math.floor(s); };

// Materials: name -> [diffuse colour, collision material]
const MATS = {
  glass_tower: [[0.55, 0.64, 0.72], "CONCRETE"], concrete: [[0.62, 0.62, 0.6], "CONCRETE"],
  office: [[0.58, 0.6, 0.63], "CONCRETE"], brick: [[0.6, 0.38, 0.29], "BRICK"],
  siding: [[0.74, 0.7, 0.62], "WOOD_SOLID_MEDIUM"], roof_flat: [[0.32, 0.33, 0.35], "CONCRETE"],
  roof_shingle: [[0.36, 0.27, 0.24], "ROOF_TILE"], barn: [[0.55, 0.18, 0.13], "WOOD_SOLID_MEDIUM"],
  metal: [[0.72, 0.74, 0.76], "METAL_SOLID_MEDIUM"],
};

(async () => {
  // ---- 1. footprints from the map (svg sized 1:1 to its viewBox so getCTM is in map units)
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
  await page.goto("file://" + path.join(REPO, "island-map.html"));
  const raw = await page.evaluate(() => {
    const svg = document.getElementById("island");
    svg.setAttribute("viewBox", "0 0 1500 1000"); svg.style.cssText = "width:1500px;height:1000px;position:fixed;left:0;top:0";
    const base = svg.getScreenCTM().inverse();
    const corners = (el) => {
      const b = el.getBBox(), m = base.multiply(el.getScreenCTM());
      return [[b.x, b.y], [b.x + b.width, b.y], [b.x + b.width, b.y + b.height], [b.x, b.y + b.height]]
        .map(([x, y]) => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f]);
    };
    const circle = (el) => { const m = base.multiply(el.getScreenCTM()), cx = +el.getAttribute("cx"), cy = +el.getAttribute("cy");
      return { c: [m.a * cx + m.c * cy + m.e, m.b * cx + m.d * cy + m.f], r: +el.getAttribute("r") * Math.hypot(m.a, m.b) }; };
    const out = [];
    for (const g of svg.querySelectorAll("g.tower")) {
      const t = g.querySelector("title").textContent, fl = +(t.match(/(\d+) floors/) || [0, 30])[1];
      out.push({ type: t.startsWith("West") ? "west-tower" : t.startsWith("312") ? "highrise-312" : "tower", floors: fl, label: t, poly: corners(g.querySelectorAll("rect")[1]) });
    }
    for (const r of svg.querySelectorAll("#city-312 rect[filter]")) out.push({ type: "office-312", poly: corners(r) });
    for (const r of svg.querySelectorAll("#houses-1017 rect[filter]")) {
      const fill = r.getAttribute("fill"), w = +r.getAttribute("width");
      const type = fill === "#8d8579" ? "apartments" : ["#8f9499", "#a2a6aa", "#7d838a", "#b2b0a8"].includes(fill) ? "shop-312"
                 : (w === 8 && ["#b9a27e"].includes(fill)) ? "farmhouse" : "house";
      out.push({ type, fill, poly: corners(r) });
    }
    for (const r of svg.querySelectorAll("#airport rect")) if (r.querySelector("title")?.textContent === "Terminal") out.push({ type: "terminal", poly: corners(r) });
    for (const c of svg.querySelectorAll("#airport circle")) if (c.querySelector("title")?.textContent === "Control tower") out.push({ type: "control-tower", ...circle(c) });
    for (const g of svg.querySelectorAll("g")) {
      if (g.querySelector(":scope > title")?.textContent !== "Farm (barn and silo)") continue;
      out.push({ type: "barn", poly: corners(g.querySelector("rect")) });
      out.push({ type: "silo", ...circle(g.querySelector("circle")) });
    }
    return out;
  });
  await browser.close();

  // ---- 2. each building: world footprint, base, height, look
  const blds = [];
  for (const b of raw) {
    let poly = b.poly ? b.poly.map(([x, y]) => toWorld(x, y))
             : Array.from({ length: 12 }, (_, i) => { const a = i / 12 * 2 * Math.PI; return toWorld(b.c[0] + b.r * Math.cos(a), b.c[1] + b.r * Math.sin(a)); });
    // world y is flipped from map y: make every footprint counter-clockwise seen from above
    let area = 0; for (let i = 0; i < poly.length; i++) { const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length]; area += x1 * y2 - x2 * y1; }
    if (area < 0) poly.reverse();
    const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length, cy = poly.reduce((s, p) => s + p[1], 0) / poly.length;
    const zs = [...poly, [cx, cy]].map(([x, y]) => ground(x, y));
    const zmin = Math.min(...zs), zmax = Math.max(...zs);
    if (zmax < 0.5) continue;                                     // would stand in the sea
    const R = rnd(cx, cy);
    let floors, fh, wall, roof, gable = false;
    switch (b.type) {
      case "west-tower": case "tower": case "highrise-312": floors = b.floors; fh = 3.5; wall = "glass_tower"; roof = "roof_flat"; break;
      case "office-312": floors = 3 + Math.floor(R * 10); fh = 4; wall = R < .5 ? "office" : "concrete"; roof = "roof_flat"; break;
      case "shop-312": floors = 2 + Math.floor(R * 5); fh = 4; wall = R < .5 ? "brick" : "office"; roof = "roof_flat"; break;
      case "apartments": floors = 3 + Math.floor(R * 3); fh = 3.2; wall = "brick"; roof = "roof_flat"; break;
      case "house": floors = 1 + (R < .4 ? 1 : 0); fh = 3; wall = ["#a8674c", "#8f5e48"].includes(b.fill) ? "brick" : "siding"; roof = "roof_shingle"; gable = true; break;
      case "farmhouse": floors = 2; fh = 3; wall = "siding"; roof = "roof_shingle"; gable = true; break;
      case "terminal": floors = 3; fh = 5; wall = "glass_tower"; roof = "metal"; break;
      case "control-tower": floors = 12; fh = 4; wall = "concrete"; roof = "glass_tower"; break;
      case "barn": floors = 1; fh = 7; wall = "barn"; roof = "metal"; gable = true; break;
      case "silo": floors = 1; fh = 22; wall = "metal"; roof = "metal"; break;
    }
    blds.push({ type: b.type, label: b.label, poly, cx, cy, base: zmin - 1.0, eaves: zmax + floors * fh, floors, fh, wall, roof, gable });
  }

  // ---- 3. meshes per tile
  const tiles = new Map();
  for (const b of blds) {
    const col = Math.floor((b.cx - TER.origin[0]) / TILE), row = Math.floor((b.cy - TER.origin[1]) / TILE);
    const key = `${String(col).padStart(2, "0")}_${String(row).padStart(2, "0")}`;
    if (!tiles.has(key)) tiles.set(key, { name: `island_bldg_${key}`, cx: TER.origin[0] + (col + .5) * TILE, cy: TER.origin[1] + (row + .5) * TILE, list: [] });
    tiles.get(key).list.push(b);
  }
  fs.mkdirSync(path.join(OUT, "obj"), { recursive: true }); fs.mkdirSync(path.join(OUT, "xml"), { recursive: true });
  for (const d of ["obj", "xml"]) for (const f of fs.readdirSync(path.join(OUT, d))) fs.unlinkSync(path.join(OUT, d, f));
  fs.writeFileSync(path.join(OUT, "obj/island_buildings.mtl"), "# GENERATED by tools/gen-island-buildings.js\n" +
    Object.entries(MATS).map(([k, [c, col]]) => `newmtl bldg_${k}\nKd ${c.join(" ")}\nKa 0 0 0\nKs 0 0 0\nd 1\n# collision material: ${col}\n`).join("\n"));
  const f3 = (v) => v.toFixed(3);
  const tileInfo = [];
  for (const t of [...tiles.values()].sort((a, b) => a.name.localeCompare(b.name))) {
    const V = [], VT = [], byMat = {};
    const face = (mat, pts, uvs) => {           // pts: [[x,y,z]...] counter-clockwise from outside
      const i0 = V.length + 1;
      pts.forEach((p, i) => { V.push([p[0] - t.cx, p[1] - t.cy, p[2]]); VT.push(uvs[i]); });
      (byMat[mat] ||= []);
      for (let i = 1; i + 1 < pts.length; i++) byMat[mat].push([i0, i0 + i, i0 + i + 1]);
    };
    let zmin = Infinity, zmax = -Infinity;
    for (const b of t.list) {
      const P = b.poly, n = P.length;
      // the ridge runs along the footprint's longer side
      const e01 = Math.hypot(P[1][0] - P[0][0], P[1][1] - P[0][1]), e12 = n === 4 ? Math.hypot(P[2][0] - P[1][0], P[2][1] - P[1][1]) : 0;
      const ridgeH = b.gable && n === 4 ? Math.min(e01, e12) * 0.35 : 0;
      const longFirst = e01 >= e12;
      for (let i = 0; i < n; i++) {
        const a = P[i], c = P[(i + 1) % n], L = Math.hypot(c[0] - a[0], c[1] - a[1]);
        face(b.wall, [[a[0], a[1], b.base], [c[0], c[1], b.base], [c[0], c[1], b.eaves], [a[0], a[1], b.eaves]],
             [[0, 0], [L / 4, 0], [L / 4, (b.eaves - b.base) / b.fh], [0, (b.eaves - b.base) / b.fh]]);
      }
      if (ridgeH > 0) {
        // gable: two sloped roof faces on the long sides, triangles on the short ends
        const [p0, p1, p2, p3] = longFirst ? P : [P[1], P[2], P[3], P[0]];
        const m03 = [(p0[0] + p3[0]) / 2, (p0[1] + p3[1]) / 2], m12 = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
        const top = b.eaves + ridgeH, E = b.eaves;
        face(b.roof, [[p0[0], p0[1], E], [p1[0], p1[1], E], [m12[0], m12[1], top], [m03[0], m03[1], top]], [[0, 0], [1, 0], [1, 1], [0, 1]]);
        face(b.roof, [[p2[0], p2[1], E], [p3[0], p3[1], E], [m03[0], m03[1], top], [m12[0], m12[1], top]], [[0, 0], [1, 0], [1, 1], [0, 1]]);
        face(b.wall, [[p1[0], p1[1], E], [p2[0], p2[1], E], [m12[0], m12[1], top]], [[0, 0], [1, 0], [.5, 1]]);
        face(b.wall, [[p3[0], p3[1], E], [p0[0], p0[1], E], [m03[0], m03[1], top]], [[0, 0], [1, 0], [.5, 1]]);
        zmax = Math.max(zmax, top);
      } else {
        face(b.roof, P.map(p => [p[0], p[1], b.eaves]), P.map(p => [p[0] / 8, p[1] / 8]));
      }
      zmin = Math.min(zmin, b.base); zmax = Math.max(zmax, b.eaves);
    }
    const lines = [`# GENERATED by tools/gen-island-buildings.js — ${t.list.length} buildings, tile centre world (${t.cx}, ${t.cy}); x/y local, z absolute`,
                   "mtllib island_buildings.mtl", `o ${t.name}`,
                   ...V.map(v => `v ${f3(v[0])} ${f3(v[1])} ${f3(v[2])}`), ...VT.map(u => `vt ${u[0].toFixed(4)} ${u[1].toFixed(4)}`)];
    for (const [m, fs_] of Object.entries(byMat)) { lines.push(`usemtl bldg_${m}`); for (const fc of fs_) lines.push("f " + fc.map(i => `${i}/${i}`).join(" ")); }
    fs.writeFileSync(path.join(OUT, "obj", `${t.name}.obj`), lines.join("\n") + "\n");
    const xs = V.map(v => v[0]), ys = V.map(v => v[1]);
    tileInfo.push({ name: t.name, centre: [t.cx, t.cy], buildings: t.list.length, verts: V.length,
                    bbMin: [Math.min(...xs), Math.min(...ys), zmin], bbMax: [Math.max(...xs), Math.max(...ys), zmax] });
  }

  // ---- 4. ytyp + ymap
  const v = (tag, p, ind = "      ") => `${ind}<${tag} x="${p[0].toFixed(6)}" y="${p[1].toFixed(6)}" z="${p[2].toFixed(6)}" />`;
  const arch = tileInfo.map(t => {
    const c = t.bbMin.map((m, i) => (m + t.bbMax[i]) / 2), r = Math.hypot(...t.bbMax.map((m, i) => (m - t.bbMin[i]) / 2));
    return `    <Item type="CBaseArchetypeDef">
      <lodDist value="${LOD}" />
      <flags value="0" />
      <specialAttribute value="0" />
${v("bbMin", t.bbMin)}
${v("bbMax", t.bbMax)}
${v("bsCentre", c)}
      <bsRadius value="${r.toFixed(6)}" />
      <hdTextureDist value="${LOD / 2}" />
      <name>${t.name}</name>
      <textureDictionary>island_buildings</textureDictionary>
      <clipDictionary />
      <drawableDictionary />
      <physicsDictionary />
      <assetType>ASSET_TYPE_DRAWABLE</assetType>
      <assetName>${t.name}</assetName>
      <extensions />
    </Item>`; });
  fs.writeFileSync(path.join(OUT, "xml/island_buildings.ytyp.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<!-- GENERATED by tools/gen-island-buildings.js — ${tileInfo.length} building tiles -->
<CMapTypes>
  <extensions />
  <archetypes>
${arch.join("\n")}
  </archetypes>
  <name>island_buildings</name>
  <dependencies />
  <compositeEntityTypes />
</CMapTypes>
`);
  const ents = tileInfo.map(t => `    <Item type="CEntityDef">
      <archetypeName>${t.name}</archetypeName>
      <flags value="32" />
      <guid value="0" />
${v("position", [t.centre[0], t.centre[1], 0])}
      <rotation x="0" y="0" z="0" w="1" />
      <scaleXY value="1" />
      <scaleZ value="1" />
      <parentIndex value="-1" />
      <lodDist value="${LOD}" />
      <childLodDist value="0" />
      <lodLevel>LODTYPES_DEPTH_ORPHANHD</lodLevel>
      <numChildren value="0" />
      <priorityLevel>PRI_REQUIRED</priorityLevel>
      <extensions />
      <ambientOcclusionMultiplier value="255" />
      <artificialAmbientOcclusion value="255" />
      <tintValue value="0" />
    </Item>`);
  const eMin = [0, 1, 2].map(i => Math.min(...tileInfo.map(t => (i < 2 ? t.centre[i] : 0) + t.bbMin[i])));
  const eMax = [0, 1, 2].map(i => Math.max(...tileInfo.map(t => (i < 2 ? t.centre[i] : 0) + t.bbMax[i])));
  fs.writeFileSync(path.join(OUT, "xml/island_buildings.ymap.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<!-- GENERATED by tools/gen-island-buildings.js — ${blds.length} buildings in ${tileInfo.length} tiles -->
<CMapData>
  <name>island_buildings</name>
  <parent />
  <flags value="0" />
  <contentFlags value="1" />
${v("streamingExtentsMin", eMin.map(x => x - LOD), "  ")}
${v("streamingExtentsMax", eMax.map(x => x + LOD), "  ")}
${v("entitiesExtentsMin", eMin, "  ")}
${v("entitiesExtentsMax", eMax, "  ")}
  <entities>
${ents.join("\n")}
  </entities>
  <containerLods />
  <boxOccluders />
  <occludeModels />
  <physicsDictionaries />
  <instancedData>
    <ImapLink />
    <PropInstanceList />
    <GrassInstanceList />
  </instancedData>
  <timeCycleModifiers />
  <carGenerators />
  <block>
    <version value="0" />
    <flags value="0" />
    <name>island_buildings</name>
    <exportedBy>tools/gen-island-buildings.js</exportedBy>
    <owner />
    <time />
  </block>
</CMapData>
`);

  const counts = blds.reduce((m, b) => (m[b.type] = (m[b.type] || 0) + 1, m), {});
  fs.writeFileSync(path.join(OUT, "buildings.json"), JSON.stringify({
    total: blds.length, byType: counts, tallest: Math.round(Math.max(...blds.map(b => b.eaves - b.base))),
    materials: Object.fromEntries(Object.entries(MATS).map(([k, [, c]]) => [`bldg_${k}`, c])), tiles: tileInfo,
    buildings: blds.map(b => ({ type: b.type, label: b.label, floors: b.floors, base: +b.base.toFixed(2), top: +b.eaves.toFixed(2),
                                footprint: b.poly.map(p => p.map(q => +q.toFixed(2))) })) }, null, 1) + "\n");
  console.log(`${blds.length} buildings in ${tileInfo.length} tiles -> island-buildings/`, counts);

  // ---- 5. previews (rendered in the browser: isometric and top-down)
  await renderPreviews(blds);
})().catch(e => { console.error(e); process.exit(1); });

async function renderPreviews(blds) {
  const colour = Object.fromEntries(Object.entries(MATS).map(([k, [c]]) => [k, c.map(x => Math.round(x * 255))]));
  const data = { blds: blds.map(b => ({ p: b.poly, b: b.base, t: b.eaves, w: colour[b.wall], r: colour[b.roof], g: b.gable })),
                 ground: Array.from(GROUND), grid: GRID };
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1800, height: 1100 } });
  await page.setContent(`<canvas id="c" width="1800" height="1100"></canvas>`);
  for (const mode of ["iso", "top"]) {
    await page.evaluate(({ data, mode }) => {
      const { blds, ground, grid } = data, cv = document.getElementById("c"), g = cv.getContext("2d");
      const xs = blds.flatMap(b => b.p.map(p => p[0])), ys = blds.flatMap(b => b.p.map(p => p[1]));
      const x0 = grid.x0, y0 = grid.y0, x1 = x0 + (grid.cols - 1) * grid.spacing, y1 = y0 + (grid.rows - 1) * grid.spacing;
      const ang = -Math.PI / 5, ca = Math.cos(ang), sa = Math.sin(ang);
      const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
      const S = mode === "iso" ? 0.47 : 0.5;
      const proj = mode === "iso"
        ? (x, y, z) => { const rx = (x - mx) * ca - (y - my) * sa, ry = (x - mx) * sa + (y - my) * ca; return [900 + rx * S, 600 - ry * S * .55 - z * S * .9]; }
        : (x, y) => [900 + (x - mx) * S, 550 - (y - my) * S];
      const depth = mode === "iso" ? (x, y) => (x - mx) * sa + (y - my) * ca : () => 0;
      g.fillStyle = "#174f78"; g.fillRect(0, 0, 1800, 1100);
      // ground as shaded quads, back to front
      const quads = [];
      for (let r = 0; r < grid.rows - 1; r += 1) for (let c = 0; c < grid.cols - 1; c += 1) {
        const Z = (cc, rr) => ground[rr * grid.cols + cc], z = Z(c, r);
        if (Math.max(z, Z(c + 1, r), Z(c, r + 1), Z(c + 1, r + 1)) < 0) continue;
        const x = x0 + c * grid.spacing, y = y0 + r * grid.spacing, sp = grid.spacing;
        const sh = Math.max(.35, Math.min(1.25, 1 + (Z(c, r + 1) - Z(c + 1, r)) / 10));
        const base = z < 1.5 ? [218, 201, 150] : z > 150 ? [140, 132, 120] : [112, 136, 74];
        quads.push({ d: depth(x, y), pts: [proj(x, y, Z(c, r)), proj(x + sp, y, Z(c + 1, r)), proj(x + sp, y + sp, Z(c + 1, r + 1)), proj(x, y + sp, Z(c, r + 1))],
                     col: base.map(v => Math.round(v * sh)) });
      }
      const items = quads.map(q => ({ ...q, kind: "q" }));
      for (const b of blds) { const cx = b.p.reduce((s, p) => s + p[0], 0) / b.p.length, cy = b.p.reduce((s, p) => s + p[1], 0) / b.p.length;
        items.push({ kind: "b", d: depth(cx, cy) - 3, b }); }
      items.sort((a, b) => b.d - a.d);
      const poly = (pts, col) => { g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath();
        g.fillStyle = `rgb(${col.join(",")})`; g.fill(); };
      for (const it of items) {
        if (it.kind === "q") { poly(it.pts, it.col); continue; }
        const b = it.b, n = b.p.length;
        if (mode === "iso") {
          const walls = b.p.map((a, i) => { const c = b.p[(i + 1) % n]; return { a, c, d: depth((a[0] + c[0]) / 2, (a[1] + c[1]) / 2) }; }).sort((u, w) => w.d - u.d);
          for (const { a, c } of walls) {
            const nx = c[1] - a[1], ny = -(c[0] - a[0]);
            const lit = .55 + .45 * Math.max(0, (nx * .6 - ny * .8) / (Math.hypot(nx, ny) || 1));
            poly([proj(a[0], a[1], b.b), proj(c[0], c[1], b.b), proj(c[0], c[1], b.t), proj(a[0], a[1], b.t)], b.w.map(v => Math.round(v * lit)));
          }
          poly(b.p.map(p => proj(p[0], p[1], b.t)), b.r);
        } else {
          const h = Math.min(1, (b.t - b.b) / 200);
          poly(b.p.map(p => proj(p[0], p[1])), [Math.round(240 - 150 * h), Math.round(225 - 130 * h), Math.round(200 - 40 * h)]);
        }
      }
    }, { data, mode });
    await page.screenshot({ path: path.join(OUT, mode === "iso" ? "preview.png" : "preview-top.png") });
  }
  await browser.close();
}
