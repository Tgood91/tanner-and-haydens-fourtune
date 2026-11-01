#!/usr/bin/env node
// ============================================================
// tools/render-streets.js — renders every street on the island, one image each
//
//   python3 tools/gen-island-map.py > island-map.html   (if the map changed)
//   node tools/render-streets.js
//
// Opens island-map.html in the pre-installed Chromium, finds every named road
// (each <path class="road"> with a "Name · CODE" title), and for each one:
//   - zooms the map onto that road, dims everything else, and draws the road
//     highlighted, with its name, number, kind and length on a banner
//   - saves it as street-renders/<CODE>-<slug>.png
// Then writes:
//   street-renders/index.html   a gallery of every render, searchable
//   street-renders/streets.json name, code, kind, city, length, bbox, sampled points
//   world/streets_geo.lua       the same list as a Lua table for FiveM resources
// ============================================================
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const REPO = path.resolve(__dirname, "..");
const OUT = path.join(REPO, "street-renders");
const SHOT_W = 960, SHOT_H = 540;           // 16:9 cards
const MAP_W = 1500, MAP_H = 1000;           // the island SVG's viewBox
const CITY = { "312": "312 (north)", "770": "770 (the middle)", "1017": "1017 (south)" };

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  for (const f of fs.readdirSync(OUT)) if (f.endsWith(".png")) fs.unlinkSync(path.join(OUT, f));

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: SHOT_W, height: SHOT_H }, deviceScaleFactor: 1 });
  await page.goto("file://" + path.join(REPO, "island-map.html"));

  // Full-bleed the map, hide the page chrome, and add the highlight layer.
  const roads = await page.evaluate(({ W, H }) => {
    document.body.style.cssText = "padding:0;margin:0;background:#0b1526;overflow:hidden";
    for (const el of document.body.children) if (!el.contains(document.getElementById("island"))) el.style.display = "none";
    const frame = document.getElementById("island").closest(".frame") || document.getElementById("island").parentElement;
    frame.style.cssText = "width:100vw;height:100vh;border-radius:0;box-shadow:none";
    for (const el of frame.parentElement.children) if (el !== frame) el.style.display = "none";
    const svg = document.getElementById("island");
    svg.style.cssText = "width:100vw;height:100vh;display:block";
    svg.setAttribute("preserveAspectRatio", "xMidYMid slice");
    const NS = "http://www.w3.org/2000/svg";
    const dim = document.createElementNS(NS, "rect");
    Object.entries({ id: "rs-dim", x: -5000, y: -5000, width: 15000, height: 15000, fill: "#06101e", opacity: ".55" })
      .forEach(([k, v]) => dim.setAttribute(k, v));
    const hi = document.createElementNS(NS, "g"); hi.id = "rs-hi";
    svg.append(dim, hi);

    const seen = new Set(), list = [];
    for (const p of svg.querySelectorAll("path.road")) {
      const t = p.querySelector("title"); if (!t) continue;
      const m = t.textContent.match(/^(.*?) · ([0-9]+-[A-Z]+[0-9]+)/); if (!m) continue;
      const [, full, code] = m;
      if (seen.has(code)) continue; seen.add(code);
      const kindM = t.textContent.match(/\((\w+)\)\s*$/);
      const cls = [...p.classList].filter(c => c !== "road" && c !== "gp-street");
      const L = p.getTotalLength(), b = p.getBBox(), pts = [];
      const n = Math.max(2, Math.min(64, Math.ceil(L / 6)));
      for (let i = 0; i <= n; i++) { const q = p.getPointAtLength(L * i / n); pts.push([+q.x.toFixed(1), +q.y.toFixed(1)]); }
      list.push({ id: p.id, name: full.split(" — ")[0], note: full.includes(" — ") ? full.split(" — ").slice(1).join(" — ") : "",
                  code, kind: kindM ? kindM[1] : (cls[0] || "street"), length: +L.toFixed(1),
                  bbox: [+b.x.toFixed(1), +b.y.toFixed(1), +b.width.toFixed(1), +b.height.toFixed(1)], points: pts,
                  width: parseFloat(p.getAttribute("stroke-width")) || 4 });
    }
    return list;
  }, { W: MAP_W, H: MAP_H });

  roads.sort((a, b) => a.code.localeCompare(b.code, "en", { numeric: true }));
  console.log(`${roads.length} streets found`);

  for (const r of roads) {
    await page.evaluate(({ r, W, H, SW, SH }) => {
      const svg = document.getElementById("island");
      const [x, y, w, h] = r.bbox, pad = Math.max(40, Math.max(w, h) * 0.18);
      let vw = Math.max(w + pad * 2, 150), vh = Math.max(h + pad * 2, 150 * SH / SW);
      if (vw / vh < SW / SH) vw = vh * SW / SH; else vh = vw * SH / SW;
      let vx = x + w / 2 - vw / 2, vy = y + h / 2 - vh / 2;
      svg.setAttribute("viewBox", `${vx} ${vy} ${vw} ${vh}`);
      svg.classList.toggle("z-main", W / vw >= 1.6);
      svg.classList.toggle("z-street", false);                 // our own label instead of every name
      const z = vw / SW;                                        // map units per screen px
      const src = document.getElementById(r.id), d = src.getAttribute("d");
      const hi = document.getElementById("rs-hi");
      hi.innerHTML =
        `<path d="${d}" fill="none" stroke="#000" stroke-opacity=".55" stroke-width="${r.width + 10 * z}" stroke-linecap="round" stroke-linejoin="round"/>` +
        `<path d="${d}" fill="none" stroke="#ffd34d" stroke-width="${r.width + 5 * z}" stroke-linecap="round" stroke-linejoin="round"/>` +
        `<path d="${d}" fill="none" stroke="#fffbe6" stroke-width="${Math.max(1.2 * z, r.width * .45)}" stroke-dasharray="${8 * z} ${6 * z}" stroke-linecap="round"/>` +
        `<circle cx="${r.points[0][0]}" cy="${r.points[0][1]}" r="${6 * z}" fill="#3ddc84" stroke="#fff" stroke-width="${2 * z}"/>` +
        `<circle cx="${r.points.at(-1)[0]}" cy="${r.points.at(-1)[1]}" r="${6 * z}" fill="#ff5c5c" stroke="#fff" stroke-width="${2 * z}"/>`;
      let banner = document.getElementById("rs-banner");
      if (!banner) {
        banner = document.createElement("div"); banner.id = "rs-banner";
        banner.style.cssText = "position:fixed;left:16px;top:14px;padding:10px 16px;border-radius:12px;background:rgba(8,16,30,.86);" +
          "color:#eef3fa;font:600 15px Arial,sans-serif;box-shadow:0 6px 18px rgba(0,0,0,.45);max-width:80vw";
        document.body.appendChild(banner);
        const mini = document.createElement("div"); mini.id = "rs-mini";
        mini.style.cssText = "position:fixed;right:14px;bottom:14px;width:180px;height:120px;border-radius:10px;overflow:hidden;" +
          "border:2px solid rgba(255,255,255,.7);box-shadow:0 6px 18px rgba(0,0,0,.45);background:#174f78";
        document.body.appendChild(mini);
      }
      banner.innerHTML = `<div style="font-size:22px;letter-spacing:.5px">${r.name}</div>` +
        `<div style="font-weight:400;color:#a9bdd6;margin-top:3px">${r.code} · ${r.kind} · ${Math.round(r.length)} map units` +
        (r.note ? ` · ${r.note}` : "") + `</div>`;
      // Locator: the whole island, this road in yellow.
      const mini = document.getElementById("rs-mini");
      const coast = document.getElementById("coast").getAttribute("d");
      mini.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="180" height="120"><rect width="${W}" height="${H}" fill="#174f78"/>` +
        `<path d="${coast}" fill="#8f9a5e"/><path d="${d}" fill="none" stroke="#ffd34d" stroke-width="18" stroke-linecap="round"/>` +
        `<rect x="${vx}" y="${vy}" width="${vw}" height="${vh}" fill="none" stroke="#fff" stroke-width="8"/></svg>`;
    }, { r, W: MAP_W, H: MAP_H, SW: SHOT_W, SH: SHOT_H });
    r.image = `${r.code}-${slug(r.name)}.png`;
    await page.screenshot({ path: path.join(OUT, r.image) });
  }
  await browser.close();

  for (const r of roads) { r.city = r.code.split("-")[0]; delete r.width; delete r.id; }

  // ---- streets.json
  fs.writeFileSync(path.join(OUT, "streets.json"), JSON.stringify(roads, null, 1) + "\n");

  // ---- world/streets_geo.lua — the same streets for FiveM (map units: 0..1500 x 0..1000, y down)
  const luaStr = (s) => JSON.stringify(s);
  let lua = "-- GENERATED by tools/render-streets.js — do not edit; rerun the script.\n" +
    "-- Every street on the island: name, number, kind, city, length and its centre line\n" +
    "-- in island-map units (x 0..1500 west->east, y 0..1000 north->south).\n" +
    "STREETS_GEO = {\n";
  for (const r of roads) {
    lua += `  { code = ${luaStr(r.code)}, name = ${luaStr(r.name)}, kind = ${luaStr(r.kind)}, city = ${luaStr(r.city)}, ` +
      `length = ${r.length}, bbox = { ${r.bbox.join(", ")} },\n    points = { ` +
      r.points.map(p => `{${p[0]},${p[1]}}`).join(",") + " } },\n";
  }
  lua += "}\n";
  fs.writeFileSync(path.join(REPO, "world", "streets_geo.lua"), lua);

  // ---- gallery
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const cards = roads.map(r => `<figure data-q="${esc((r.name + " " + r.code + " " + r.kind + " " + (CITY[r.city] || "")).toLowerCase())}">` +
    `<a href="${r.image}"><img loading="lazy" src="${r.image}" alt="${esc(r.name)}"></a>` +
    `<figcaption><b>${esc(r.name)}</b><span>${r.code} · ${r.kind} · ${Math.round(r.length)}</span></figcaption></figure>`).join("\n");
  const counts = Object.entries(roads.reduce((m, r) => (m[r.city] = (m[r.city] || 0) + 1, m), {}))
    .map(([c, n]) => `${CITY[c] || c}: ${n}`).join(" · ");
  fs.writeFileSync(path.join(OUT, "index.html"), `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Island Street Atlas</title>
<!-- GENERATED by tools/render-streets.js -->
<style>
:root { --bg:#0b1526; --card:#13223a; --ink:#e8eef7; --mute:#8fa5c0; --line:rgba(143,165,192,.3); }
* { box-sizing:border-box; margin:0; }
body { background:var(--bg); color:var(--ink); font-family:Arial,Helvetica,sans-serif; padding:24px 16px; }
h1 { font-size:22px; letter-spacing:2px; } p { color:var(--mute); margin:6px 0 14px; font-size:14px; }
input { width:min(100%,420px); padding:9px 12px; border-radius:8px; border:1px solid var(--line); background:var(--card); color:var(--ink); font-size:15px; }
main { display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:14px; margin-top:16px; }
figure { background:var(--card); border:1px solid var(--line); border-radius:12px; overflow:hidden; }
img { width:100%; display:block; aspect-ratio:16/9; object-fit:cover; }
figcaption { padding:8px 10px; display:flex; flex-direction:column; gap:2px; font-size:14px; }
figcaption span { color:var(--mute); font-size:12px; }
</style></head><body>
<h1>ISLAND STREET ATLAS</h1>
<p>${roads.length} streets, each rendered on its own · ${counts}. Click a card for the full image.</p>
<input id="q" placeholder="Search a street, number (1017-S4) or kind…" autocomplete="off">
<main id="grid">
${cards}
</main>
<script>
document.getElementById("q").addEventListener("input", e => {
  const q = e.target.value.trim().toLowerCase();
  for (const f of document.querySelectorAll("figure")) f.style.display = !q || f.dataset.q.includes(q) ? "" : "none";
});
</script></body></html>
`);
  console.log(`rendered ${roads.length} streets -> street-renders/, wrote street-renders/streets.json and world/streets_geo.lua`);
})().catch(e => { console.error(e); process.exit(1); });
