#!/usr/bin/env node
// ============================================================
// tools/gen-road-ymaps.js — builds the island's roads as CodeWalker ymap XML
//
//   node tools/gen-road-ymaps.js
//
// Reads every named road in island-map.html (the same 107 the street atlas
// renders), walks each one's centre line in the pre-installed Chromium, and
// lays road-piece props end to end along it, climbing the island's hills
// (island-terrain/road-guide.*, from tools/gen-island-terrain.py) at no more than 12%: one row for a street, two for
// an arterial, three for a highway. The pieces are grouped into 512 m grid
// cells, one ymap per cell, written as CodeWalker XML to
//   island-roads/xml/island_roads_<col>_<row>.ymap.xml
// plus island-roads/xml/roads-index.json (which road went where).
//
// CodeWalker turns the XML into binary .ymap (see island-roads/README.md);
// the binaries go in island-roads/stream/ and FiveM streams them.
//
// CHECK THESE IN CODEWALKER FIRST (search the model, read its bounding box):
// the piece model and its length/width are not verified. Change CONFIG and
// rerun; everything else follows.
// ============================================================
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const CONFIG = {
  // The prop laid end to end. Its long side must run along the model's local +Y.
  pieceModel: "stt_prop_track_straight_s",
  pieceLength: 10.0,      // metres along the road (from the model's bounding box)
  pieceWidth: 8.0,        // metres across, = spacing between rows on wide roads
  overlap: 0.15,          // metres each piece overlaps the next, so no gaps open on curves

  // Where the island sits in the GTA world. Map units: x 0..1500, y 0..1000 (y down).
  metresPerUnit: 2.0,     // 1500 units -> a 3 km wide island
  centre: { x: -5500.0, y: -6500.0 },   // world X/Y of map point (750, 500): open sea, away from Los Santos and Cayo Perico
  z: 10.0,                // road surface height, flat; 10 m clears the sea

  maxGrade: 0.12,         // steepest a road may climb (12%); steeper ground gets cut
  cell: 512,              // metres per ymap grid cell
  lodDist: 400,           // how far away a piece still draws
};
const ROWS = { highway: 3, arterial: 2, street: 1, street312: 1, backroad: 1, track: 1 };

const REPO = path.resolve(__dirname, "..");
const OUT = path.join(REPO, "island-roads", "xml");

// Hill heights from tools/gen-island-terrain.py (island-terrain/road-guide.*): roads climb them.
// Without that file every road is flat at CONFIG.z.
const GUIDE = (() => {
  const dir = path.join(REPO, "island-terrain");
  try {
    const meta = JSON.parse(fs.readFileSync(path.join(dir, "road-guide.json"), "utf8"));
    const buf = fs.readFileSync(path.join(dir, "road-guide.f32"));
    meta.z = new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4);
    return meta;
  } catch { return null; }
})();
const groundZ = (x, y) => {
  if (!GUIDE) return CONFIG.z;
  const gx = Math.min(Math.max((x - GUIDE.x0) / GUIDE.spacing, 0), GUIDE.cols - 1.001);
  const gy = Math.min(Math.max((y - GUIDE.y0) / GUIDE.spacing, 0), GUIDE.rows - 1.001);
  const i = Math.floor(gx), j = Math.floor(gy), fx = gx - i, fy = gy - j, Z = (c, r) => GUIDE.z[r * GUIDE.cols + c];
  return Math.max(CONFIG.z, (Z(i, j) * (1 - fx) + Z(i + 1, j) * fx) * (1 - fy) + (Z(i, j + 1) * (1 - fx) + Z(i + 1, j + 1) * fx) * fy);
};
const toWorld = (mx, my) => [CONFIG.centre.x + (mx - 750) * CONFIG.metresPerUnit,
                             CONFIG.centre.y - (my - 500) * CONFIG.metresPerUnit];   // map y runs south, world y north
const n6 = (v) => (Math.abs(v) < 5e-7 ? 0 : v).toFixed(6);
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

(async () => {
  // ---- 1. every road's centre line, sampled finely from the SVG
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto("file://" + path.join(REPO, "island-map.html"));
  const stepUnits = 1 / CONFIG.metresPerUnit;                       // a sample every metre
  const roads = await page.evaluate((step) => {
    const seen = new Set(), out = [];
    for (const p of document.querySelectorAll("#island path.road")) {
      const t = p.querySelector("title"); if (!t) continue;
      const m = t.textContent.match(/^(.*?) · ([0-9]+-[A-Z]+[0-9]+)/); if (!m || seen.has(m[2])) continue;
      seen.add(m[2]);
      const kindM = t.textContent.match(/\((\w+)\)\s*$/);
      const cls = [...p.classList].filter(c => c !== "road" && c !== "gp-street");
      // A path can hold several sub-paths (EUPHORIA Lane's spur); walk each one on its own.
      const subs = p.getAttribute("d").match(/M[^M]+/g), lines = [];
      for (const d of subs) {
        const s = document.createElementNS("http://www.w3.org/2000/svg", "path"); s.setAttribute("d", d);
        p.parentNode.appendChild(s);
        const L = s.getTotalLength(), n = Math.max(1, Math.ceil(L / step)), pts = [];
        for (let i = 0; i <= n; i++) { const q = s.getPointAtLength(L * i / n); pts.push([q.x, q.y]); }
        s.remove(); lines.push(pts);
      }
      out.push({ name: m[1].split(" — ")[0], code: m[2], kind: kindM ? kindM[1] : (cls[0] || "street"), lines });
    }
    return out;
  }, stepUnits);
  await browser.close();

  // ---- 2. lay pieces along each line
  const cells = new Map();     // "col_row" -> [entity]
  const index = [];
  const pitch = CONFIG.pieceLength - CONFIG.overlap;
  for (const r of roads) {
    const rows = ROWS[r.kind] || 1;
    let count = 0;
    for (const line of r.lines) {
      const w = line.map(([x, y]) => toWorld(x, y));
      const cum = [0];                                                  // distance along the line, in metres
      for (let i = 1; i < w.length; i++) cum.push(cum[i - 1] + Math.hypot(w[i][0] - w[i - 1][0], w[i][1] - w[i - 1][1]));
      const total = cum.at(-1); if (total < 1) continue;
      const pieces = Math.max(1, Math.ceil((total - CONFIG.overlap) / pitch));
      const step = total / pieces;                                      // stretch evenly so the last piece ends on the end
      const at = (d) => {                                               // point + direction at distance d
        let i = 1; while (i < cum.length - 1 && cum[i] < d) i++;
        const t = (d - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1);
        return [w[i - 1][0] + (w[i][0] - w[i - 1][0]) * t, w[i - 1][1] + (w[i][1] - w[i - 1][1]) * t];
      };
      // Heights at every piece joint: the hills, smoothed, then held to maxGrade both ways.
      let zj = [];
      for (let k = 0; k <= pieces; k++) { const q = at(Math.min(total, k * step)); zj.push(groundZ(q[0], q[1])); }
      for (let pass = 0; pass < 3; pass++)
        zj = zj.map((_, k) => { let sum = 0, n = 0; for (let o = -3; o <= 3; o++) if (zj[k + o] !== undefined) { sum += zj[k + o]; n++; } return sum / n; });
      const rise = CONFIG.maxGrade * step;
      for (let k = 1; k <= pieces; k++) zj[k] = Math.min(zj[k], zj[k - 1] + rise);
      for (let k = pieces - 1; k >= 0; k--) zj[k] = Math.min(zj[k], zj[k + 1] + rise);
      zj = zj.map(z => Math.max(CONFIG.z, z));
      for (let k = 0; k < pieces; k++) {
        const a = at(k * step), b = at(Math.min(total, (k + 1) * step)), mid = at((k + .5) * step);
        const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
        const heading = Math.atan2(dy, dx) - Math.PI / 2;               // model's +Y along the road
        const pitch = Math.atan2(zj[k + 1] - zj[k], len);               // nose up when climbing
        const zMid = (zj[k] + zj[k + 1]) / 2;
        const nx = -dy / len, ny = dx / len;                            // left of travel
        for (let row = 0; row < rows; row++) {
          const off = (row - (rows - 1) / 2) * CONFIG.pieceWidth;
          const x = mid[0] + nx * off, y = mid[1] + ny * off;
          const key = `${Math.floor(x / CONFIG.cell)}_${Math.floor(y / CONFIG.cell)}`;
          if (!cells.has(key)) cells.set(key, []);
          cells.get(key).push({ x, y, z: zMid, heading, pitch, road: r.code });
          count++;
        }
      }
    }
    index.push({ code: r.code, name: r.name, kind: r.kind, rows, pieces: count });
  }

  // ---- 3. one ymap per cell
  fs.mkdirSync(OUT, { recursive: true });
  for (const f of fs.readdirSync(OUT)) if (f.endsWith(".ymap.xml")) fs.unlinkSync(path.join(OUT, f));
  const half = Math.hypot(CONFIG.pieceLength, CONFIG.pieceWidth) / 2;   // a piece's reach from its centre
  const files = [];
  let total = 0;
  for (const [key, ents] of [...cells].sort()) {
    const name = `island_roads_${key.replace(/-/g, "m")}`;
    const ex = (f, s) => ents.reduce((m, e) => f(m, e[s]), ents[0][s]);
    const eMin = [ex(Math.min, "x") - half, ex(Math.min, "y") - half, ex(Math.min, "z") - 2];
    const eMax = [ex(Math.max, "x") + half, ex(Math.max, "y") + half, ex(Math.max, "z") + 2];
    const sMin = eMin.map((v, i) => i < 2 ? v - CONFIG.lodDist : v - CONFIG.lodDist);
    const sMax = eMax.map((v) => v + CONFIG.lodDist);
    const vec = (tag, v) => `  <${tag} x="${n6(v[0])}" y="${n6(v[1])}" z="${n6(v[2])}" />`;
    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<!-- GENERATED by tools/gen-road-ymaps.js — do not edit; change CONFIG and rerun. ${ents.length} road pieces. -->
<CMapData>
  <name>${name}</name>
  <parent />
  <flags value="0" />
  <contentFlags value="1" />
${vec("streamingExtentsMin", sMin)}
${vec("streamingExtentsMax", sMax)}
${vec("entitiesExtentsMin", eMin)}
${vec("entitiesExtentsMax", eMax)}
  <entities>
`;
    for (const e of ents) {
      // Yaw (about Z) then pitch (about the piece's own X): q = qz(yaw) * qx(pitch).
      // ymaps store the inverse rotation, so x, y, z are written negated.
      const cy = Math.cos(e.heading / 2), sy = Math.sin(e.heading / 2), cp = Math.cos(e.pitch / 2), sp = Math.sin(e.pitch / 2);
      const qx = -(cy * sp), qy = -(sy * sp), qz = -(sy * cp), qw = cy * cp;
      xml += `    <Item type="CEntityDef">
      <archetypeName>${esc(CONFIG.pieceModel)}</archetypeName>
      <flags value="1572864" />
      <guid value="0" />
      <position x="${n6(e.x)}" y="${n6(e.y)}" z="${n6(e.z)}" />
      <rotation x="${n6(qx)}" y="${n6(qy)}" z="${n6(qz)}" w="${n6(qw)}" />
      <scaleXY value="1" />
      <scaleZ value="1" />
      <parentIndex value="-1" />
      <lodDist value="${CONFIG.lodDist}" />
      <childLodDist value="0" />
      <lodLevel>LODTYPES_DEPTH_ORPHANHD</lodLevel>
      <numChildren value="0" />
      <priorityLevel>PRI_REQUIRED</priorityLevel>
      <extensions />
      <ambientOcclusionMultiplier value="255" />
      <artificialAmbientOcclusion value="255" />
      <tintValue value="0" />
    </Item>
`;
    }
    xml += `  </entities>
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
    <name>${name}</name>
    <exportedBy>tools/gen-road-ymaps.js</exportedBy>
    <owner />
    <time />
  </block>
</CMapData>
`;
    fs.writeFileSync(path.join(OUT, `${name}.ymap.xml`), xml);
    files.push({ file: `${name}.ymap.xml`, pieces: ents.length, roads: [...new Set(ents.map(e => e.road))] });
    total += ents.length;
  }
  fs.writeFileSync(path.join(OUT, "roads-index.json"),
    JSON.stringify({ config: CONFIG, rows: ROWS, totalPieces: total, ymaps: files, roads: index }, null, 1) + "\n");
  console.log(`${roads.length} roads -> ${total} pieces in ${files.length} ymaps (island-roads/xml/)`);
})().catch(e => { console.error(e); process.exit(1); });
