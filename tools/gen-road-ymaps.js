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
  z: 25.0,                // road level: the island's land sits 25 m above the sea

  maxGrade: 0.12,         // steepest a road may climb (12%); steeper ground gets cut

  // Back roads and tracks roll: two swells added on top of the ground, at most amp + amp2 metres,
  // each road with its own phase. Their steepest is about 11%; maxGrade still applies after.
  backroadHills: { kinds: ["backroad", "track"], amp: 4.0, wave: 220, amp2: 1.5, wave2: 90, flatAtJunction: 60 },  // level for 60 m either side of a junction
  // A road over the sea is a bridge: it climbs from the shore at bridgeGrade to a deck bridgeDeck
  // metres above the sea, so boats pass under. Where "the sea" starts comes from island-terrain.
  bridgeDeck: 40.0,       // 15 m above road level
  bridgeGrade: 0.05,
  bridgeMinSpan: 25,      // metres of open sea before a road counts as a bridge (a road's tip touching a dock doesn't)

  // The bridge to the mainland, written to its own resource (island-bridges/). It leaves the island
  // from the nearer end of fromRoad, runs straight to `to`, and climbs/descends at bridgeGrade to
  // bridgeDeck in between. `to` is NOT VERIFIED: stand where it should land in Los Santos, type
  // /coords, put the X, Y and Z here, and rerun.
  mainlandBridge: { name: "The Island Bridge", fromRoad: "312-H1", to: { x: -1600.0, y: -3300.0, z: 6.0 }, rows: 2 },
  cell: 512,              // metres per ymap grid cell
  lodDist: 400,           // how far away a piece still draws
};
const ROWS = { highway: 3, arterial: 2, street: 1, street312: 1, backroad: 1, track: 1 };

// Bigger roads keep their height at a junction; smaller ones meet them.
const RANK = { highway: 5, arterial: 4, street312: 3, street: 3, backroad: 2, track: 1 };

// point at distance d along a line (world metres)
function pointAt(L, d) {
  const { cum, w } = L;
  let i = 1; while (i < cum.length - 1 && cum[i] < d) i++;
  const t = (d - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1);
  return [w[i - 1][0] + (w[i][0] - w[i - 1][0]) * t, w[i - 1][1] + (w[i][1] - w[i - 1][1]) * t];
}
// road surface height at distance d along a line, as the pieces lay it
function zAt(L, d) {
  const k = Math.min(L.pieces - 1, Math.max(0, Math.floor(d / L.step)));
  const t = Math.min(1, Math.max(0, d / L.step - k));
  return L.zj[k] + (L.zj[k + 1] - L.zj[k]) * t;
}

// A line's joint heights from its smoothed ground: back-road swells (level near junctions),
// held to maxGrade, kept above the sea, then lifted onto a bridge deck wherever it crosses open sea.
function shapeHeights(L, junctions) {
  const { road: r, li, step, pieces } = L;
  let zj = L.ground.slice();
  const hills = CONFIG.backroadHills;
  if (hills.kinds.includes(r.kind)) {
    const at = junctions.flatMap((j) => [j.a, j.b]).filter((e) => e.line === L).map((e) => e.d);
    const p1 = phase(r.code + li) * 2 * Math.PI, p2 = phase(r.code + li + "b") * 2 * Math.PI;
    zj = zj.map((z, k) => {
      const d = k * step;
      const near = at.length ? Math.min(...at.map((a) => Math.abs(a - d))) : Infinity;
      const fade = Math.min(1, Math.max(0, (near - hills.flatAtJunction / 2) / (hills.flatAtJunction / 2)));   // 0 at a junction, 1 from 60 m out
      return z + fade * (hills.amp * (0.5 + 0.5 * Math.sin(2 * Math.PI * d / hills.wave + p1))
                       + hills.amp2 * (0.5 + 0.5 * Math.sin(2 * Math.PI * d / hills.wave2 + p2)));
    });
  }
  const rise = CONFIG.maxGrade * step;
  for (let k = 1; k <= pieces; k++) zj[k] = Math.min(zj[k], zj[k - 1] + rise);
  for (let k = pieces - 1; k >= 0; k--) zj[k] = Math.min(zj[k], zj[k + 1] + rise);
  zj = zj.map((z) => Math.max(CONFIG.z, z));
  // bridges: runs of joints over open sea at least bridgeMinSpan long
  const seaJoints = [];
  for (let k = 0; k <= pieces; ) {
    if (!L.sea[k]) { k++; continue; }
    let e = k; while (e + 1 <= pieces && L.sea[e + 1]) e++;
    if ((e - k + 1) * step >= CONFIG.bridgeMinSpan) for (let q = k; q <= e; q++) seaJoints.push(q);
    k = e + 1;
  }
  if (seaJoints.length) {
    zj = zj.map((z, k) => {
      const away = Math.min(...seaJoints.map((sk) => Math.abs(k - sk))) * step;    // metres to the nearest joint over the sea
      return Math.max(z, CONFIG.bridgeDeck - CONFIG.bridgeGrade * away);
    });
    L.bridge = { joints: seaJoints.length, deck: Math.min(...seaJoints.map((k) => zj[k])) };
  }
  L.zj = zj;
}

// Junctions between lines: centre lines that cross, plus a line ending on (or just short of)
// another road's surface. One junction per pair of lines within 20 m along both.
function findJunctions(lines) {
  const G = 32, grid = new Map(), out = [];
  const cellsOf = (x0, y0, x1, y1, pad) => {
    const ks = [];
    for (let cx = Math.floor((Math.min(x0, x1) - pad) / G); cx <= Math.floor((Math.max(x0, x1) + pad) / G); cx++)
      for (let cy = Math.floor((Math.min(y0, y1) - pad) / G); cy <= Math.floor((Math.max(y0, y1) + pad) / G); cy++) ks.push(cx + "," + cy);
    return ks;
  };
  lines.forEach((L) => L.w.forEach((p, i) => {
    if (!i) return;
    const q = L.w[i - 1];
    for (const k of cellsOf(q[0], q[1], p[0], p[1], 0)) { if (!grid.has(k)) grid.set(k, []); grid.get(k).push([L, i]); }
  }));
  const add = (A, dA, B, dB) => {
    if (out.some((j) => (j.a.line === A && j.b.line === B && Math.abs(j.a.d - dA) < 20 && Math.abs(j.b.d - dB) < 20) ||
                        (j.a.line === B && j.b.line === A && Math.abs(j.a.d - dB) < 20 && Math.abs(j.b.d - dA) < 20))) return;
    out.push({ a: { line: A, d: dA }, b: { line: B, d: dB } });
  };
  // crossings
  for (const A of lines) A.w.forEach((p, i) => {
    if (!i) return;
    const q = A.w[i - 1], seen = new Set();
    for (const k of cellsOf(q[0], q[1], p[0], p[1], 0)) for (const [B, jIdx] of grid.get(k) || []) {
      if (B === A || seen.has(B.road.code + B.li + ":" + jIdx)) continue;
      seen.add(B.road.code + B.li + ":" + jIdx);
      const r = B.w[jIdx - 1], s = B.w[jIdx];
      const d1x = p[0] - q[0], d1y = p[1] - q[1], d2x = s[0] - r[0], d2y = s[1] - r[1];
      const den = d1x * d2y - d1y * d2x; if (Math.abs(den) < 1e-9) continue;
      const t = ((r[0] - q[0]) * d2y - (r[1] - q[1]) * d2x) / den, u = ((r[0] - q[0]) * d1y - (r[1] - q[1]) * d1x) / den;
      if (t < 0 || t > 1 || u < 0 || u > 1) continue;
      add(A, A.cum[i - 1] + t * (A.cum[i] - A.cum[i - 1]), B, B.cum[jIdx - 1] + u * (B.cum[jIdx] - B.cum[jIdx - 1]));
    }
  });
  // a line ending on another road's surface (T-junctions that stop short of the centre line)
  for (const A of lines) for (const [end, dA] of [[A.w[0], 0], [A.w.at(-1), A.total]]) {
    let best = null;
    for (const k of cellsOf(end[0], end[1], end[0], end[1], 30)) for (const [B, jIdx] of grid.get(k) || []) {
      if (B === A) continue;
      const r = B.w[jIdx - 1], s = B.w[jIdx], dx = s[0] - r[0], dy = s[1] - r[1], l2 = dx * dx + dy * dy || 1;
      const u = Math.min(1, Math.max(0, ((end[0] - r[0]) * dx + (end[1] - r[1]) * dy) / l2));
      const dist = Math.hypot(end[0] - r[0] - u * dx, end[1] - r[1] - u * dy);
      const reach = (B.road.rows * CONFIG.pieceWidth) / 2 + CONFIG.pieceLength;   // its edge, plus one piece
      if (dist <= reach && (!best || dist < best.dist)) best = { B, dist, dB: B.cum[jIdx - 1] + u * (B.cum[jIdx] - B.cum[jIdx - 1]) };
    }
    if (best) add(A, dA, best.B, best.dB);
  }
  return out;
}

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
    if (meta.coast) {
      const c = fs.readFileSync(path.join(dir, meta.coast));
      meta.coastD = new Float32Array(c.buffer, c.byteOffset, c.length / 4);
    }
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
// true where a point is far enough out to sea to be on a bridge (island-terrain's rule)
const overSea = (x, y) => {
  if (!GUIDE || !GUIDE.coastD) return false;
  const i = Math.round((x - GUIDE.x0) / GUIDE.spacing), j = Math.round((y - GUIDE.y0) / GUIDE.spacing);
  if (i < 0 || j < 0 || i >= GUIDE.cols || j >= GUIDE.rows) return true;               // off the grid: open sea
  return GUIDE.coastD[j * GUIDE.cols + i] < GUIDE.bridgeAt;
};
// a steady number in [0, 1) from a string, so each road's swells sit in their own place every run
const phase = (str) => { let h = 2166136261; for (const ch of str) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return (h >>> 0) / 2 ** 32; };
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

  // ---- 2. each line's joints and heights, before junctions
  const pitch = CONFIG.pieceLength - CONFIG.overlap;
  const lines = [];            // one per sub-path: { road, w, cum, total, pieces, step, zj }
  for (const r of roads) {
    r.rows = ROWS[r.kind] || 1;
    r.lines.forEach((line, li) => {
      const w = line.map(([x, y]) => toWorld(x, y));
      const cum = [0];                                                  // distance along the line, in metres
      for (let i = 1; i < w.length; i++) cum.push(cum[i - 1] + Math.hypot(w[i][0] - w[i - 1][0], w[i][1] - w[i - 1][1]));
      const total = cum.at(-1); if (total < 1) return;
      const pieces = Math.max(1, Math.ceil((total - CONFIG.overlap) / pitch));
      const step = total / pieces;                                      // stretch evenly so the last piece ends on the end
      const L = { road: r, li, w, cum, total, pieces, step };
      // Heights at every piece joint: the hills, smoothed, then held to maxGrade both ways.
      let zj = [];
      const sea = [];
      for (let k = 0; k <= pieces; k++) { const q = pointAt(L, Math.min(total, k * step)); zj.push(groundZ(q[0], q[1])); sea.push(overSea(q[0], q[1])); }
      for (let pass = 0; pass < 3; pass++)
        zj = zj.map((_, k) => { let sum = 0, n = 0; for (let o = -3; o <= 3; o++) if (zj[k + o] !== undefined) { sum += zj[k + o]; n++; } return sum / n; });
      L.ground = zj; L.sea = sea;
      lines.push(L);
    });
  }

  // ---- 2b. junctions: where two lines cross, or one ends on another
  // Every height is worked out per road, so on a hill two roads that meet could sit metres apart.
  // The bigger road keeps its height; the smaller one is pinned to it there and eases back to
  // its own hills on either side, never steeper than maxGrade. Equal roads: the later one gives way.
  const junctions = findJunctions(lines);
  for (const L of lines) shapeHeights(L, junctions);
  lines.sort((a, b) => RANK[b.road.kind] - RANK[a.road.kind] || a.road.code.localeCompare(b.road.code) || a.li - b.li);
  const done = new Set();
  for (const L of lines) {
    const want = [];                                                    // [joint, z, rank of the other road]
    for (const j of junctions) {
      const [mine, other] = j.a.line === L ? [j.a, j.b] : j.b.line === L ? [j.b, j.a] : [];
      if (!mine || !done.has(other.line)) continue;
      // pin both joints around the junction, so the piece sitting on it is level with the other road
      const k = Math.min(L.pieces - 1, Math.floor(mine.d / L.step)), z = zAt(other.line, other.d);
      want.push([k, z, RANK[other.line.road.kind]], [k + 1, z, RANK[other.line.road.kind]]);
    }
    // Keep a pin only if the road can still reach every pin kept so far at maxGrade; bigger roads first.
    // A pin that can't be kept leaves that junction unlevel, and it's reported below.
    const rise = CONFIG.maxGrade * L.step, pins = [];
    for (const [k, z] of want.sort((a, b) => b[2] - a[2])) {
      if (pins.every(([pk, pz]) => Math.abs(z - pz) <= rise * Math.abs(k - pk) + 1e-6)) pins.push([k, z]);
    }
    if (pins.length) {
      // Lowest/highest each joint may be and still reach every pin at maxGrade; then stay as near the hills as that allows.
      L.zj = L.zj.map((z, k) => {
        let lo = -Infinity, hi = Infinity;
        for (const [pk, pz] of pins) { const r = rise * Math.abs(k - pk); lo = Math.max(lo, pz - r); hi = Math.min(hi, pz + r); }
        return Math.min(Math.max(z, lo), hi);
      });
    }
    done.add(L);
  }

  // ---- 2c. lay pieces along each line
  const cells = new Map();     // "col_row" -> [entity]
  for (const L of lines) {
    const { road: r, step, pieces, zj } = L;
    const rows = r.rows;
    r.count = r.count || 0;
    for (let k = 0; k < pieces; k++) {
      const a = pointAt(L, k * step), b = pointAt(L, Math.min(L.total, (k + 1) * step)), mid = pointAt(L, (k + .5) * step);
      const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
      const heading = Math.atan2(dy, dx) - Math.PI / 2;                 // model's +Y along the road
      const pitch = Math.atan2(zj[k + 1] - zj[k], len);                 // nose up when climbing
      const zMid = (zj[k] + zj[k + 1]) / 2;
      const nx = -dy / len, ny = dx / len;                              // left of travel
      for (let row = 0; row < rows; row++) {
        const off = (row - (rows - 1) / 2) * CONFIG.pieceWidth;
        const x = mid[0] + nx * off, y = mid[1] + ny * off;
        const key = `${Math.floor(x / CONFIG.cell)}_${Math.floor(y / CONFIG.cell)}`;
        if (!cells.has(key)) cells.set(key, []);
        cells.get(key).push({ x, y, z: zMid, heading, pitch, road: r.code });
        r.count++;
      }
    }
  }
  const index = roads.map((r) => ({ code: r.code, name: r.name, kind: r.kind, rows: r.rows, pieces: r.count || 0 }));

  // check: at every junction both roads now sit at the same height
  const gaps = [];
  for (const j of junctions) {
    const gap = Math.abs(zAt(j.a.line, j.a.d) - zAt(j.b.line, j.b.d));
    if (gap > 0.25) {
      const [x, y] = pointAt(j.a.line, j.a.d);
      gaps.push({ gap: +gap.toFixed(1), roads: [j.a.line.road.code, j.b.line.road.code], at: [Math.round(x), Math.round(y)] });
    }
  }
  gaps.sort((a, b) => b.gap - a.gap);
  for (const L of lines) if (L.bridge) console.log(`bridge: ${L.road.name} (${L.road.code}), ${Math.round(L.bridge.joints * L.step)} m over the sea, deck at ${L.bridge.deck.toFixed(1)} m or more`);
  console.log(`${junctions.length} junctions, ${junctions.length - gaps.length} level`);
  for (const g of gaps) console.warn(`! ${g.roads.join(" x ")} still ${g.gap} m apart at X ${g.at[0]}, Y ${g.at[1]}: too close to another junction for a ${CONFIG.maxGrade * 100}% grade`);

  // ---- 2d. the bridge to the mainland (its own resource: island-bridges/)
  const MB = CONFIG.mainlandBridge, bridgeCells = new Map();
  let bridge = null;
  const fromLine = lines.find((L) => L.road.code === MB.fromRoad);
  if (!fromLine) console.warn(`! mainland bridge: no road ${MB.fromRoad} to start from`);
  else {
    const far = (d) => { const q = pointAt(fromLine, d); return Math.hypot(q[0] - MB.to.x, q[1] - MB.to.y); };
    const d0 = far(0) < far(fromLine.total) ? 0 : fromLine.total;     // the road's end nearer the mainland
    const [x0, y0] = pointAt(fromLine, d0), z0 = zAt(fromLine, d0);
    const dx = MB.to.x - x0, dy = MB.to.y - y0, len = Math.hypot(dx, dy);
    const pieces = Math.max(1, Math.ceil((len - CONFIG.overlap) / pitch)), step = len / pieces;
    const deckAt = (d) => Math.min(CONFIG.bridgeDeck, z0 + CONFIG.bridgeGrade * d, MB.to.z + CONFIG.bridgeGrade * (len - d));
    const heading = Math.atan2(dy, dx) - Math.PI / 2, nx = -dy / len, ny = dx / len;
    let count = 0;
    for (let k = 0; k < pieces; k++) {
      const za = deckAt(k * step), zb = deckAt((k + 1) * step), t = (k + 0.5) * step / len;
      const tilt = Math.atan2(zb - za, step);
      for (let row = 0; row < MB.rows; row++) {
        const off = (row - (MB.rows - 1) / 2) * CONFIG.pieceWidth;
        const x = x0 + dx * t + nx * off, y = y0 + dy * t + ny * off;
        const key = `${Math.floor(x / CONFIG.cell)}_${Math.floor(y / CONFIG.cell)}`;
        if (!bridgeCells.has(key)) bridgeCells.set(key, []);
        bridgeCells.get(key).push({ x, y, z: (za + zb) / 2, heading, pitch: tilt, road: MB.name });
        count++;
      }
    }
    bridge = { name: MB.name, from: { road: MB.fromRoad, x: +x0.toFixed(1), y: +y0.toFixed(1), z: +z0.toFixed(1) },
               to: MB.to, toVerified: false, length: Math.round(len), deck: CONFIG.bridgeDeck, rows: MB.rows, pieces: count };
    console.log(`mainland bridge: ${MB.name}, ${(len / 1000).toFixed(1)} km from ${fromLine.road.name} to (${MB.to.x}, ${MB.to.y}), ${count} pieces (landing point not verified)`);
  }

  // ---- 3. one ymap per cell
  const roadYmaps = writeYmaps(cells, OUT, "island_roads");
  const files = roadYmaps.files, total = roadYmaps.total;
  const BOUT = path.join(REPO, "island-bridges", "xml");
  if (bridge) {
    const b = writeYmaps(bridgeCells, BOUT, "island_bridge");
    fs.writeFileSync(path.join(BOUT, "bridges-index.json"),
      JSON.stringify({ config: { pieceModel: CONFIG.pieceModel, pieceLength: CONFIG.pieceLength, pieceWidth: CONFIG.pieceWidth, bridgeGrade: CONFIG.bridgeGrade },
                       bridges: [bridge], totalPieces: b.total, ymaps: b.files }, null, 1) + "\n");
    console.log(`  -> ${b.total} pieces in ${b.files.length} ymaps (island-bridges/xml/)`);
  }
  fs.writeFileSync(path.join(OUT, "roads-index.json"),
    JSON.stringify({ config: CONFIG, rows: ROWS, totalPieces: total, junctions: junctions.length, unlevelJunctions: gaps, ymaps: files, roads: index }, null, 1) + "\n");
  console.log(`${roads.length} roads -> ${total} pieces in ${files.length} ymaps (island-roads/xml/)`);
})().catch(e => { console.error(e); process.exit(1); });

// One ymap per grid cell of entities, as CodeWalker XML, into outDir (its old ymaps cleared first).
function writeYmaps(cells, outDir, prefix) {
  fs.mkdirSync(outDir, { recursive: true });
  for (const f of fs.readdirSync(outDir)) if (f.endsWith(".ymap.xml")) fs.unlinkSync(path.join(outDir, f));
  const half = Math.hypot(CONFIG.pieceLength, CONFIG.pieceWidth) / 2;   // a piece's reach from its centre
  const files = [];
  let total = 0;
  for (const [key, ents] of [...cells].sort()) {
    const name = `${prefix}_${key.replace(/-/g, "m")}`;
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
    fs.writeFileSync(path.join(outDir, `${name}.ymap.xml`), xml);
    files.push({ file: `${name}.ymap.xml`, pieces: ents.length, roads: [...new Set(ents.map(e => e.road))] });
    total += ents.length;
  }
  return { files, total };
}
