// ============================================================
// tools/gen-map.js — draws docs/city-map.html from the game data
//
//   node tools/gen-map.js > docs/city-map.html
//
// Everything on the map is read out of js-snippets: districts, parks and
// every road from places.js, and every pin from the module that owns it
// (spawns, shops, fuel, medical, jobs, police, houses, impound,
// appearance, drugs). Nothing is hand-drawn, so the map cannot quietly
// disagree with what dispatch says.
// ============================================================

const B = `${__dirname}/../js-snippets/`;
const places = require(`${B}places.js`);
const cities = require(`${B}cities.js`);
const spawns = require(`${B}spawns.js`);
const shops = require(`${B}shops.js`);
const fuel = require(`${B}fuel.js`);
const medical = require(`${B}medical.js`);
const jobs = require(`${B}jobs.js`);
const police = require(`${B}police.js`);
const houses = require(`${B}houses.js`);
const impound = require(`${B}impound.js`);
const appearance = require(`${B}appearance.js`);
const drugs = require(`${B}drugs.js`);

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const n = (v) => Math.round(v * 10) / 10;

const PLATES = [
    { city: "chicago", code: "312", label: "Chicago", width: 1000 },
    { city: "geepee", code: "770", label: "GeePee", width: 1000 },
    { city: "atlanta", code: "7101", label: "Atlanta", width: 1000 },
];

// How each class of road is drawn. Casing is the darker line underneath
// that makes a highway read as a highway on paper.
const ROAD_STYLE = {
    highway:  { w: 7.5, casing: 10.5, dash: null, label: true,  minPx: 0 },
    arterial: { w: 4.8, casing: 7.2,  dash: null, label: true,  minPx: 0 },
    street:   { w: 3,   casing: 5,    dash: null, label: true,  minPx: 85 },
    backroad: { w: 2,   casing: 3.6,  dash: "7 5", label: false, minPx: 0 },
};

// ---------------- the pins, from the modules that own them ----------------
function allPins() {
    const out = [];
    const add = (kind, label, pos, note) => out.push({ kind, label, pos, note, city: cities.cityAt(pos) });

    for (const [city, list] of Object.entries(spawns.SPAWNS)) {
        for (const s of list) add("spawn", s.label, s.pos, `spawn point, ${city}`);
    }
    for (const s of Object.values(shops.SHOPS)) add("shop", s.label, s.pos, "shop");
    for (const g of fuel.GAS_STATIONS) add("gas", g.label, g.pos, "fuel");
    for (const list of Object.values(medical.HOSPITALS)) {
        for (const h of list) add("med", h.label, h.pos, "hospital");
    }
    for (const [name, job] of Object.entries(jobs.JOBS)) {
        for (const [city, pos] of Object.entries(job.stations || {})) add("job", job.label, pos, `duty point, ${city}`);
    }
    add("law", "County jail", police.JAIL.cell, "cell");
    for (const h of Object.values(houses.HOUSES)) add("home", h.label, h.pos, `${h.district}, for sale`);
    for (const l of impound.LOTS) add("lot", l.label, l.pos, "impound");
    for (const s of appearance.SHOPS) add("clothes", s.label, s.pos, "clothing");
    for (const s of drugs.SUPPLY_SPOTS) add("supply", s.label, s.pos, "supply spot");
    return out;
}

const PIN_STYLE = {
    spawn:   { fill: "var(--m-spawn)", r: 5.5 },
    shop:    { fill: "var(--m-shop)", r: 5 },
    gas:     { fill: "var(--m-gas)", r: 5 },
    med:     { fill: "var(--m-med)", r: 5.5 },
    job:     { fill: "var(--m-svc)", r: 5 },
    law:     { fill: "var(--m-law)", r: 5.5 },
    home:    { fill: "var(--m-home)", r: 4.5 },
    lot:     { fill: "var(--m-lot)", r: 5 },
    clothes: { fill: "var(--m-cloth)", r: 4.5 },
    supply:  { fill: "var(--m-supply)", r: 4.5 },
};

// ---------------- projection ----------------
// Bounds come from the districts, parks and roads — the geography that was
// drawn on purpose. A pin far outside that (the county jail sits 4,000
// units from anything) would stretch the plate until the city was a smudge
// in one corner, so those are listed as off-plate instead.
function project(plate, zones, roads) {
    const xs = [], ys = [];
    const push = (x, y) => { xs.push(x); ys.push(y); };
    for (const z of zones) { push(z.center.x - z.radius, z.center.y - z.radius); push(z.center.x + z.radius, z.center.y + z.radius); }
    for (const r of roads) for (const p of r.points) push(p.x, p.y);

    const pad = 0.07;
    let minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const dx = (maxX - minX) || 1, dy = (maxY - minY) || 1;
    minX -= dx * pad; maxX += dx * pad; minY -= dy * pad; maxY += dy * pad;

    const margin = 26;
    const inner = plate.width - margin * 2;
    const scale = inner / (maxX - minX);
    const height = Math.round((maxY - minY) * scale + margin * 2);

    // north is up: game +y goes up, SVG +y goes down
    const X = (x) => n(margin + (x - minX) * scale);
    const Y = (y) => n(height - margin - (y - minY) * scale);
    const holds = (pos) => pos.x >= minX && pos.x <= maxX && pos.y >= minY && pos.y <= maxY;
    return { X, Y, scale, height, width: plate.width, margin, holds };
}

// ---------------- label placement ----------------
// Greedy: try a few offsets, take the first that doesn't land on anything
// already placed. A label that fits nowhere is dropped — the pin keeps
// its tooltip, and a map you can read beats a map that says everything.
function placer() {
    const boxes = [];
    const hits = (a) => boxes.some((b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y);
    return {
        claim(box) { boxes.push(box); },
        taken: hits,
        place(x, y, text, size = 12) {
            const w = text.length * size * 0.52, h = size * 1.2;
            const tries = [
                { dx: 9, dy: 4, anchor: "start" },
                { dx: -9, dy: 4, anchor: "end" },
                { dx: 0, dy: -9, anchor: "middle" },
                { dx: 0, dy: 15, anchor: "middle" },
                { dx: 9, dy: -8, anchor: "start" },
                { dx: -9, dy: 14, anchor: "end" },
                { dx: 14, dy: 17, anchor: "start" },
                { dx: -14, dy: -12, anchor: "end" },
                { dx: 0, dy: -22, anchor: "middle" },
                { dx: 0, dy: 28, anchor: "middle" },
                { dx: 22, dy: -20, anchor: "start" },
                { dx: -22, dy: 26, anchor: "end" },
            ];
            for (const t of tries) {
                const left = t.anchor === "start" ? x + t.dx : t.anchor === "end" ? x + t.dx - w : x + t.dx - w / 2;
                const box = { x: left, y: y + t.dy - h, w, h };
                if (!hits(box)) { boxes.push(box); return { ...t, size }; }
            }
            return null;
        },
    };
}

function polyLength(pts, X, Y) {
    let total = 0;
    for (let i = 0; i < pts.length - 1; i++) {
        total += Math.hypot(X(pts[i + 1].x) - X(pts[i].x), Y(pts[i + 1].y) - Y(pts[i].y));
    }
    return total;
}

function unitLength(pts) {
    let total = 0;
    for (let i = 0; i < pts.length - 1; i++) total += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
    return Math.round(total);
}

// A road reads better labelled along itself, so every road is a <path>
// with an id and the name rides it with <textPath>.
// Where along the drawn line a given fraction of its length falls —
// used to put a label box where the label will actually be.
function pointAtFraction(pts, X, Y, f) {
    const px = pts.map((p) => ({ x: X(p.x), y: Y(p.y) }));
    const total = polyLength(pts, X, Y);
    let want = total * f;
    for (let i = 0; i < px.length - 1; i++) {
        const seg = Math.hypot(px[i + 1].x - px[i].x, px[i + 1].y - px[i].y);
        if (want <= seg || i === px.length - 2) {
            const t = seg === 0 ? 0 : want / seg;
            return { x: px[i].x + (px[i + 1].x - px[i].x) * t, y: px[i].y + (px[i + 1].y - px[i].y) * t };
        }
        want -= seg;
    }
    return px[0];
}

// A name on a path that runs right-to-left comes out upside down, so the
// label rides a reversed copy of the line.
function runsBackwards(a, b, X) {
    return X(b.x) < X(a.x);
}

// textPath spaces its letters badly across a corner, so a name rides the
// longest straight run of its road rather than the whole polyline.
function longestRun(pts, X, Y) {
    let best = null;
    for (let i = 0; i < pts.length - 1; i++) {
        const len = Math.hypot(X(pts[i + 1].x) - X(pts[i].x), Y(pts[i + 1].y) - Y(pts[i].y));
        if (!best || len > best.len) best = { a: pts[i], b: pts[i + 1], len };
    }
    return best;
}

function roadPath(pts, X, Y) {
    return pts.map((p, i) => `${i === 0 ? "M" : "L"}${X(p.x)} ${Y(p.y)}`).join(" ");
}

function scaleBar(p) {
    const want = [100, 200, 500, 1000].find((u) => u * p.scale > 90 && u * p.scale < p.width * 0.3) || 100;
    const px = n(want * p.scale);
    const x = p.width - p.margin - px - 6, y = p.height - 16;
    return `  <g>
    <path d="M${x} ${y} H${n(x + px)}" stroke="var(--ink-soft)" stroke-width="2" fill="none"/>
    <path d="M${x} ${y - 4} V${y + 4} M${n(x + px)} ${y - 4} V${y + 4}" stroke="var(--ink-soft)" stroke-width="2" fill="none"/>
    <text x="${n(x + px / 2)}" y="${y - 8}" text-anchor="middle" font-family="var(--font-mono)" font-size="11" fill="var(--ink-soft)">${want} units</text>
  </g>`;
}

// ---------------- one plate ----------------
function plateSvg(plate, pins) {
    const zones = places.ZONES.filter((z) => z.city === plate.city);
    const roads = places.ROADS.filter((r) => r.city === plate.city);
    const onPlate = pins.filter((p) => p.city === plate.city);
    const p = project(plate, zones, roads);
    const mine = onPlate.filter((pin) => p.holds(pin.pos));
    const offPlate = onPlate.filter((pin) => !p.holds(pin.pos));
    const { X, Y } = p;
    const L = [];
    const place = placer();

    // a plate much taller than it is wide is shown at its own height
    // rather than stretched across the page
    const tall = p.height > p.width * 1.25 ? " tall" : "";
    L.push(`<svg class="map${tall}" viewBox="0 0 ${p.width} ${p.height}" role="img" aria-label="${esc(plate.label)} street map, area code ${plate.code}">`);
    L.push(`  <defs>
    <pattern id="grid${plate.code}" width="${n(100 * p.scale)}" height="${n(100 * p.scale)}" patternUnits="userSpaceOnUse">
      <path d="M${n(100 * p.scale)} 0 L0 0 0 ${n(100 * p.scale)}" fill="none" stroke="var(--rule)" stroke-width="0.8" opacity=".9"/>
    </pattern>
  </defs>`);
    L.push(`  <rect x="0" y="0" width="${p.width}" height="${p.height}" fill="var(--land-${plate.code})"/>`);
    L.push(`  <rect x="0" y="0" width="${p.width}" height="${p.height}" fill="url(#grid${plate.code})"/>`);

    // districts, biggest first so a small one sits on top
    for (const z of [...zones].sort((a, b) => b.radius - a.radius)) {
        const r = n(z.radius * p.scale);
        const isPark = z.kind === "park";
        L.push(`  <g><title>${esc(z.name)} — ${z.kind}, ${z.radius} units across the radius (${n(z.center.x)}, ${n(z.center.y)})</title>`);
        L.push(`    <circle cx="${X(z.center.x)}" cy="${Y(z.center.y)}" r="${r}" fill="${isPark ? "var(--canopy)" : "var(--district)"}" fill-opacity="${isPark ? ".42" : ".14"}" stroke="${isPark ? "var(--canopy-line)" : "var(--district-line)"}" stroke-width="1.3" ${isPark ? "" : 'stroke-dasharray="8 6"'}/>`);
        L.push(`  </g>`);
    }

    // roads: casings first, then the roads, so junctions join cleanly
    for (const pass of ["casing", "line"]) {
        for (const kind of ["backroad", "street", "arterial", "highway"]) {
            const style = ROAD_STYLE[kind];
            for (const road of roads.filter((r) => r.kind === kind)) {
                const d = roadPath(road.points, X, Y);
                if (pass === "casing") {
                    L.push(`  <path d="${d}" fill="none" stroke="var(--road-casing)" stroke-width="${style.casing}" stroke-linecap="round" stroke-linejoin="round"/>`);
                } else {
                    const id = `r${plate.code}-${road.name.replace(/[^A-Za-z0-9]/g, "")}`;
                    L.push(`  <path id="${id}" d="${d}" fill="none" stroke="var(--road-${kind})" stroke-width="${style.w}" stroke-linecap="round" stroke-linejoin="round"${style.dash ? ` stroke-dasharray="${style.dash}"` : ""}><title>${esc(road.name)} — ${kind}, ${unitLength(road.points)} units long, ${road.width} units wide</title></path>`);
                }
            }
        }
    }

    // road names, along the road itself
    let labelled = 0;
    for (const kind of ["highway", "arterial", "street"]) {
        const style = ROAD_STYLE[kind];
        if (!style.label) continue;
        for (const road of roads.filter((r) => r.kind === kind)) {
            const run = longestRun(road.points, X, Y);
            const size = kind === "highway" ? 13 : kind === "arterial" ? 12 : 11;
            const need = road.name.length * size * 0.56;
            if (run.len < Math.max(style.minPx, need)) continue;

            const id = `r${plate.code}-${road.name.replace(/[^A-Za-z0-9]/g, "")}-lbl`;
            const [a, b] = runsBackwards(run.a, run.b, X) ? [run.b, run.a] : [run.a, run.b];
            L.push(`  <path id="${id}" d="M${X(a.x)} ${Y(a.y)} L${X(b.x)} ${Y(b.y)}" fill="none" stroke="none"/>`);

            // Spread names along their roads so parallel streets don't put
            // their names in the same band, and skip a name that has
            // nowhere clear to sit — the road keeps its tooltip.
            const dx = X(b.x) - X(a.x), dy = Y(b.y) - Y(a.y);
            let at = null;
            for (const f of [0.5, 0.34, 0.66, 0.24, 0.76]) {
                const cx = X(a.x) + dx * f, cy = Y(a.y) + dy * f;
                const box = { x: cx - need / 2, y: cy - size * 1.4, w: need, h: size * 2.1 };
                if (!place.taken(box)) { at = f; place.claim(box); break; }
            }
            if (at === null) continue;
            labelled += 1;

            L.push(`  <text class="roadname ${kind}" font-size="${size}" dy="-4.5"><textPath href="#${id}" startOffset="${Math.round(at * 100)}%" text-anchor="middle">${esc(road.name)}</textPath></text>`);
        }
    }

    // district and park names, claimed before the pins so a pin label moves instead
    for (const z of zones) {
        const size = z.kind === "park" ? 12 : 14;
        const x = X(z.center.x);
        const w = z.name.length * size * 0.62; // uppercase and tracked out
        // above the circle, then below it, then just inside either edge
        const tries = [
            Y(z.center.y + z.radius) + 15,
            Y(z.center.y - z.radius) - 7,
            Y(z.center.y + z.radius) + 30,
            Y(z.center.y - z.radius) - 22,
            Y(z.center.y + z.radius * 0.55),
            Y(z.center.y),
        ];
        let y = tries[tries.length - 1];
        for (const candidate of tries) {
            const box = { x: x - w / 2, y: candidate - size, w, h: size * 1.3 };
            if (!place.taken(box)) { y = candidate; break; }
        }
        place.claim({ x: x - w / 2, y: y - size, w, h: size * 1.3 });
        L.push(`  <text x="${x}" y="${n(y)}" text-anchor="middle" class="zonename ${z.kind}" font-size="${size}">${esc(z.name)}</text>`);
    }

    // pins
    for (const pin of mine) {
        const style = PIN_STYLE[pin.kind] || PIN_STYLE.shop;
        const x = X(pin.pos.x), y = Y(pin.pos.y);
        const where = places.describe({ ...pin.pos, z: pin.pos.z ?? 0 });
        L.push(`  <g class="pin ${pin.kind}"><title>${esc(pin.label)} — ${esc(pin.note)} · ${esc(where)} (${n(pin.pos.x)}, ${n(pin.pos.y)})</title>`);
        L.push(`    <circle cx="${x}" cy="${y}" r="${style.r}" fill="${style.fill}" stroke="var(--pin-edge)" stroke-width="1.4"/>`);
        const spot = place.place(x, y, pin.label, 11.5);
        if (spot) {
            L.push(`    <text x="${n(x + spot.dx)}" y="${n(y + spot.dy)}" text-anchor="${spot.anchor}" class="pinname" font-size="${spot.size}">${esc(pin.label)}</text>`);
        }
        L.push(`  </g>`);
    }

    // the stamp, the arrow, the bar
    L.push(`  <text x="${p.width - p.margin}" y="${p.margin + 52}" text-anchor="end" font-family="var(--font-code)" font-size="60" fill="var(--a${plate.code})" opacity=".22">${plate.code}</text>`);
    L.push(`  <g transform="translate(${p.margin + 14},${p.margin + 40})">
    <path d="M0 24 L0 -12 M0 -12 L-6 -1 M0 -12 L6 -1" stroke="var(--ink-soft)" stroke-width="2" fill="none" stroke-linecap="round"/>
    <text x="0" y="-18" text-anchor="middle" font-family="var(--font-label)" font-size="13" fill="var(--ink-soft)">N</text>
  </g>`);
    L.push(scaleBar(p));
    L.push(`</svg>`);
    return { svg: L.join("\n"), roads, zones, pins: mine, offPlate, p };
}

// ---------------- the page ----------------
const pins = allPins();
const plates = PLATES.map((plate) => ({ plate, ...plateSvg(plate, pins) }));

const KIND_LABEL = { highway: "Highways", arterial: "Arterials", street: "Streets", backroad: "Back roads" };

function roadTable(entry) {
    const rows = [];
    for (const kind of ["highway", "arterial", "street", "backroad"]) {
        const list = entry.roads.filter((r) => r.kind === kind);
        if (list.length === 0) continue;
        rows.push(`<tr class="group"><th colspan="3">${KIND_LABEL[kind]} — ${list.length}</th></tr>`);
        for (const r of list.sort((a, b) => a.name.localeCompare(b.name))) {
            rows.push(`<tr><td>${esc(r.name)}</td><td class="num">${unitLength(r.points)}</td><td class="num">${r.width}</td></tr>`);
        }
    }
    return `<table class="roads">
<caption>${esc(entry.plate.label)} — ${entry.roads.length} named roads</caption>
<thead><tr><th>Road</th><th class="num">Length</th><th class="num">Width</th></tr></thead>
<tbody>${rows.join("\n")}</tbody></table>`;
}

const totals = {
    roads: places.ROADS.length,
    districts: places.ZONES.filter((z) => z.kind === "district").length,
    parks: places.ZONES.filter((z) => z.kind === "park").length,
    pins: pins.length,
};
for (const kind of Object.keys(ROAD_STYLE)) totals[kind] = places.ROADS.filter((r) => r.kind === kind).length;

const LEGEND = [
    ["spawn", "Spawn point"], ["shop", "Shop"], ["gas", "Fuel"], ["med", "Hospital"],
    ["job", "Duty point"], ["law", "Jail"], ["home", "House for sale"], ["lot", "Impound"],
    ["clothes", "Clothing"], ["supply", "Supply spot"],
];

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<!-- GENERATED by tools/gen-map.js — do not edit by hand.
     Regenerate:  node tools/gen-map.js > docs/city-map.html
     Every road, district, park and pin is read from js-snippets. -->
<title>312 &amp; 7101 Street Atlas</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo+Black&family=Barlow:wght@400;500;600&family=Barlow+Condensed:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
:root{
  --paper:#E4E7E4; --panel:#EFF1EE;
  --land-312:#D5DBD7; --land-770:#DCDBC6; --land-7101:#D8DAC2;
  --district:#8FA3A9; --district-line:#78898F;
  --canopy:#B7C39E; --canopy-line:#90A074;
  --road-casing:#9AA49E;
  --road-highway:#FFFFFF; --road-arterial:#FDFEFC; --road-street:#F2F5F1; --road-backroad:#E2E7E1;
  --ink:#1C2327; --ink-soft:#5B666A; --rule:#C3C9C5; --halo:#E8EBE7;
  --a312:#2C7FA6; --a770:#6B7A3A; --a7101:#A6442A;
  --pin-edge:#EFF1EE;
  --m-spawn:#2B363B; --m-shop:#9A6B0E; --m-gas:#1F6E8C; --m-med:#AC2748; --m-law:#2C5BA2;
  --m-svc:#2A7857; --m-home:#7A4E9A; --m-lot:#6B6256; --m-cloth:#B5468A; --m-supply:#4F7A1F;
  --font-code:'Archivo Black','Arial Black',system-ui,sans-serif;
  --font-body:'Barlow',system-ui,-apple-system,sans-serif;
  --font-label:'Barlow Condensed','Barlow',system-ui,sans-serif;
  --font-mono:'IBM Plex Mono',ui-monospace,SFMono-Regular,Menlo,monospace;
}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
  --paper:#0E1317; --panel:#161C21;
  --land-312:#1C242A; --land-770:#21231A; --land-7101:#23251A;
  --district:#3C565F; --district-line:#4C6A74;
  --canopy:#2F3B23; --canopy-line:#46572F;
  --road-casing:#070A0C;
  --road-highway:#AFBCC3; --road-arterial:#93A2AA; --road-street:#67757D; --road-backroad:#4C585F;
  --ink:#DBE2E5; --ink-soft:#93A0A6; --rule:#2A333A; --halo:#0B0F12;
  --a312:#5FB6DC; --a770:#A9BC63; --a7101:#DA7B50;
  --pin-edge:#0E1317;
  --m-spawn:#C8D3D8; --m-shop:#E0A93C; --m-gas:#59B6D6; --m-med:#E4607F; --m-law:#6E9BE0;
  --m-svc:#56BD8E; --m-home:#B98BD9; --m-lot:#AFA392; --m-cloth:#E57CB8; --m-supply:#9BC65C;
  color-scheme:dark;
}}
*{box-sizing:border-box}
body{background:var(--paper);color:var(--ink);font-family:var(--font-body);line-height:1.5;margin:0}
.wrap{max-width:1080px;margin:0 auto;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));padding-block:34px 60px}
.eyebrow{font-family:var(--font-label);text-transform:uppercase;letter-spacing:.16em;font-size:13px;color:var(--ink-soft);margin:0}
h1{font-family:var(--font-code);font-size:clamp(38px,9vw,62px);line-height:.95;margin:6px 0 0;letter-spacing:-.01em}
h1 .amp{color:var(--ink-soft);font-size:.56em;vertical-align:.12em;margin:0 .06em}
.lede{max-width:64ch;margin:14px 0 0;color:var(--ink-soft);font-size:16px}
h2{font-family:var(--font-code);font-size:24px;margin:0;letter-spacing:-.01em}
h2 .code{font-family:var(--font-mono);font-size:.7em;color:var(--ink-soft);margin-left:.5em}
.stats{display:flex;flex-wrap:wrap;gap:8px 26px;margin:22px 0 0;padding:14px 0;border-top:1px solid var(--rule);border-bottom:1px solid var(--rule)}
.stat{font-family:var(--font-label)}
.stat b{font-family:var(--font-code);font-size:21px;display:block;line-height:1.1}
.stat span{font-size:13px;color:var(--ink-soft);text-transform:uppercase;letter-spacing:.09em}
section{margin-top:42px}
figure{margin:16px 0 0}
.mapwrap{overflow-x:auto;background:var(--panel);border:1px solid var(--rule);border-radius:3px}
svg.map{display:block;min-width:760px;width:100%;height:auto}
svg.map.tall{width:auto;min-width:0;height:min(1150px,160vh);margin:0 auto}
figcaption{font-family:var(--font-label);font-size:14px;color:var(--ink-soft);margin-top:10px;max-width:74ch}
text{font-family:var(--font-label)}
.roadname{fill:var(--ink);font-weight:600;letter-spacing:.03em;paint-order:stroke;stroke:var(--halo);stroke-width:3.2px;stroke-linejoin:round}
.roadname.highway{letter-spacing:.09em;text-transform:uppercase}
.zonename{fill:var(--ink-soft);text-transform:uppercase;letter-spacing:.13em;font-weight:600;paint-order:stroke;stroke:var(--halo);stroke-width:3.4px}
.zonename.park{fill:var(--canopy-line);letter-spacing:.09em}
.pinname{fill:var(--ink);paint-order:stroke;stroke:var(--halo);stroke-width:3px;stroke-linejoin:round}
.legend{display:flex;flex-wrap:wrap;gap:10px 20px;margin-top:18px;padding:0;list-style:none}
.legend li{display:flex;align-items:center;gap:8px;font-family:var(--font-label);font-size:14px}
.legend i{width:11px;height:11px;border-radius:50%;display:inline-block;border:1.4px solid var(--pin-edge)}
.roadkeys{display:flex;flex-wrap:wrap;gap:10px 22px;margin-top:12px;padding:0;list-style:none}
.roadkeys li{display:flex;align-items:center;gap:8px;font-family:var(--font-label);font-size:14px;color:var(--ink-soft)}
.roadkeys b{display:inline-block;width:34px;border-radius:2px;background:var(--road-highway);outline:1px solid var(--road-casing)}
.tables{display:grid;gap:26px;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));margin-top:26px}
table{border-collapse:collapse;width:100%;font-size:14px}
caption{font-family:var(--font-label);text-transform:uppercase;letter-spacing:.11em;font-size:12.5px;color:var(--ink-soft);text-align:left;padding-bottom:8px}
th,td{text-align:left;padding:5px 8px;border-bottom:1px solid var(--rule)}
thead th{font-family:var(--font-label);text-transform:uppercase;letter-spacing:.09em;font-size:12px;color:var(--ink-soft)}
tr.group th{font-family:var(--font-label);text-transform:uppercase;letter-spacing:.1em;font-size:12px;color:var(--ink);background:var(--panel)}
td.num,th.num{font-family:var(--font-mono);text-align:right;font-size:13px}
.note{margin-top:34px;padding:16px 18px;background:var(--panel);border:1px solid var(--rule);border-radius:3px;font-size:15px;color:var(--ink-soft);max-width:74ch}
.note b{color:var(--ink)}
@media (max-width:640px){svg.map{min-width:680px}}
</style>
</head>
<body>
<div class="wrap">
<p class="eyebrow">Fourtune &middot; world atlas</p>
<h1>312 <span class="amp">&amp;</span> 7101</h1>
<p class="lede">Every road, district, park and pin on these three plates is read straight out of
<code>js-snippets</code> when the page is generated, so what you see is exactly what dispatch will
say. Hover anything for its coordinates and the name the game gives that spot.</p>

<div class="stats">
  <div class="stat"><b>${totals.roads}</b><span>named roads</span></div>
  <div class="stat"><b>${totals.highway}</b><span>highways</span></div>
  <div class="stat"><b>${totals.arterial}</b><span>arterials</span></div>
  <div class="stat"><b>${totals.street}</b><span>streets</span></div>
  <div class="stat"><b>${totals.backroad}</b><span>back roads</span></div>
  <div class="stat"><b>${totals.districts}</b><span>districts</span></div>
  <div class="stat"><b>${totals.parks}</b><span>parks</span></div>
  <div class="stat"><b>${totals.pins}</b><span>pins</span></div>
</div>

<ul class="roadkeys">
  <li><b style="height:7px"></b> Highway</li>
  <li><b style="height:5px;background:var(--road-arterial)"></b> Arterial</li>
  <li><b style="height:3px;background:var(--road-street)"></b> Street</li>
  <li><b style="height:2px;background:var(--road-backroad)"></b> Back road</li>
</ul>
<ul class="legend">
${LEGEND.map(([k, label]) => `  <li><i style="background:${PIN_STYLE[k].fill}"></i>${label}</li>`).join("\n")}
</ul>

${plates.map((entry) => `<section>
<h2>${esc(entry.plate.label)}<span class="code">area code ${entry.plate.code}</span></h2>
<figure>
  <div class="mapwrap">
${entry.svg}
  </div>
  <figcaption>${entry.roads.length} roads, ${entry.zones.filter((z) => z.kind === "district").length} districts,
  ${entry.zones.filter((z) => z.kind === "park").length} parks and ${entry.pins.length} pins. North is up; the grid is 100 units.
  Circles are naming zones, not walls — the smallest one you are inside wins, and a road beats all of them.${
  entry.offPlate.length ? ` Off-plate: ${entry.offPlate.map((o) => `${esc(o.label)} (${n(o.pos.x)}, ${n(o.pos.y)})`).join(", ")} — inside this area code, outside the drawn ground.` : ""}</figcaption>
</figure>
<div class="tables">${roadTable(entry)}</div>
</section>`).join("\n")}

<div class="note">
<p><b>These coordinates are still a first guess.</b> They were placed by number near the pins
that already existed, not by standing on them, so a road may run through a hillside and a park
may sit on a motorway. Walk them in game and move them — the names and the hierarchy are the
part that matters, and both the JS and the Lua world layer read the same numbers, so fixing one
fixes both.</p>
<p>Regenerate this page with <code>node tools/gen-map.js &gt; docs/city-map.html</code> after any
change to <code>places.js</code>.</p>
</div>
</div>
</body>
</html>
`;
process.stdout.write(html);
