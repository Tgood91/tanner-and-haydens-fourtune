// ============================================================
// tools/gen-map.js — draws docs/city-map.html from the game data
//
//   node tools/gen-map.js > docs/city-map.html
//
// Every road, district, park and pin is read from js-snippets.
// The map is interactive: click a pin for its card, use the
// filter bar to toggle categories, hover roads for names.
// ============================================================

const B = `${__dirname}/../js-snippets/`;
const places    = require(`${B}places.js`);
const cities    = require(`${B}cities.js`);
const spawns    = require(`${B}spawns.js`);
const shops     = require(`${B}shops.js`);
const fuel      = require(`${B}fuel.js`);
const medical   = require(`${B}medical.js`);
const jobs      = require(`${B}jobs.js`);
const police    = require(`${B}police.js`);
const houses    = require(`${B}houses.js`);
const impound   = require(`${B}impound.js`);
const appearance = require(`${B}appearance.js`);
const drugs     = require(`${B}drugs.js`);

const esc = (s) => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
const n   = (v) => Math.round(v * 10) / 10;

// ---- plates -----------------------------------------------------------
const PLATES = [
    { city: "atlanta", code: "1017", label: "Atlanta",  badge: "1017", accent: "#E8793A" },
    { city: "geepee",  code: "770",  label: "GeePee",   badge: "770",  accent: "#7EC47B" },
    { city: "chicago", code: "312",  label: "Chicago",  badge: "312",  accent: "#5BB8DC" },
];

// ---- road visual weights ---------------------------------------------
const ROAD_STYLE = {
    highway:  { w: 9,   casing: 13,  minPx: 0,  label: true,  dash: null      },
    arterial: { w: 5.5, casing: 8.5, minPx: 0,  label: true,  dash: null      },
    street:   { w: 3,   casing: 5,   minPx: 80, label: true,  dash: null      },
    backroad: { w: 1.8, casing: 3.4, minPx: 0,  label: false, dash: "5 4"     },
};

// ---- pin catalogue ---------------------------------------------------
const PIN_ICONS = {
    // Each entry: { emoji, color }
    spawn:   { sym: "⬛", label: "Spawn",    color: "#C8D3D8" },
    shop:    { sym: "🛒", label: "Shop",     color: "#E0B83C" },
    gas:     { sym: "⛽", label: "Fuel",     color: "#59CAE6" },
    med:     { sym: "🏥", label: "Hospital", color: "#F06080" },
    job:     { sym: "💼", label: "Duty",     color: "#66D4A0" },
    law:     { sym: "🚔", label: "Jail",     color: "#7AABF0" },
    home:    { sym: "🏠", label: "Housing",  color: "#C090E0" },
    lot:     { sym: "🔒", label: "Impound",  color: "#B8A88A" },
    clothes: { sym: "👕", label: "Clothes",  color: "#E88EC0" },
    supply:  { sym: "🌿", label: "Supply",   color: "#9ACC60" },
    ammu:    { sym: "🔫", label: "Gunshop",  color: "#E06040" },
};

// ---- collect pins from every module ----------------------------------
function allPins() {
    const out = [];
    const add = (kind, label, pos, note, extra = {}) =>
        out.push({ kind, label, pos, note, city: cities.cityAt(pos), ...extra });

    for (const [city, list] of Object.entries(spawns.SPAWNS))
        for (const s of list) add("spawn", s.label, s.pos, `Spawn · ${city}`);

    for (const s of Object.values(shops.SHOPS)) {
        const k = s.goldItems ? "ammu" : "shop";
        add(k, s.label, s.pos, k === "ammu" ? "Gunshop · weapons + ammo" : "Shop · general goods");
    }

    for (const g of fuel.GAS_STATIONS)  add("gas",  g.label, g.pos, "Fuel station");
    for (const list of Object.values(medical.HOSPITALS))
        for (const h of list) add("med", h.label, h.pos, "Hospital · respawn point");

    for (const [, job] of Object.entries(jobs.JOBS))
        for (const [city, pos] of Object.entries(job.stations || {}))
            add("job", job.label, pos, `Duty station · ${city}`);

    add("law", "County Lockup", police.JAIL.cell, "Jail cell");

    for (const h of Object.values(houses.HOUSES))
        add("home", h.label, h.pos, `Housing · ${h.district}`);

    for (const l of impound.LOTS)    add("lot",     l.label, l.pos, "Impound lot");
    for (const s of appearance.SHOPS) add("clothes", s.label, s.pos, "Clothing store");
    for (const s of drugs.SUPPLY_SPOTS) add("supply", s.label, s.pos, "Supply drop");

    return out;
}

// ---- projection into SVG space ---------------------------------------
function project(plate, zones, roads) {
    const xs = [], ys = [];
    const push = (x, y) => { xs.push(x); ys.push(y); };
    for (const z of zones)      { push(z.center.x - z.radius, z.center.y - z.radius); push(z.center.x + z.radius, z.center.y + z.radius); }
    for (const r of roads) for (const p of r.points) push(p.x, p.y);

    const pad = 0.08;
    let minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const dx = (maxX - minX) || 1, dy = (maxY - minY) || 1;
    minX -= dx * pad; maxX += dx * pad; minY -= dy * pad; maxY += dy * pad;

    const margin = 28, W = 1100;
    const scale = (W - margin * 2) / (maxX - minX);
    const H = Math.round((maxY - minY) * scale + margin * 2);

    const X = (x) => n(margin + (x - minX) * scale);
    const Y = (y) => n(H - margin - (y - minY) * scale);
    const holds = (pos) => pos.x >= minX && pos.x <= maxX && pos.y >= minY && pos.y <= maxY;
    return { X, Y, scale, H, W, margin, holds };
}

// ---- geometry helpers -----------------------------------------------
function polyLength(pts, X, Y) {
    let t = 0;
    for (let i = 0; i < pts.length - 1; i++)
        t += Math.hypot(X(pts[i+1].x)-X(pts[i].x), Y(pts[i+1].y)-Y(pts[i].y));
    return t;
}
function unitLength(pts) {
    let t = 0;
    for (let i = 0; i < pts.length - 1; i++)
        t += Math.hypot(pts[i+1].x-pts[i].x, pts[i+1].y-pts[i].y);
    return Math.round(t);
}
function pointAtFraction(pts, X, Y, f) {
    const px = pts.map((p) => ({ x: X(p.x), y: Y(p.y) }));
    const total = polyLength(pts, X, Y);
    let want = total * f;
    for (let i = 0; i < px.length - 1; i++) {
        const seg = Math.hypot(px[i+1].x-px[i].x, px[i+1].y-px[i].y);
        if (want <= seg || i === px.length - 2) {
            const t = seg ? want / seg : 0;
            return { x: px[i].x + (px[i+1].x-px[i].x)*t, y: px[i].y + (px[i+1].y-px[i].y)*t };
        }
        want -= seg;
    }
    return px[0];
}
function longestRun(pts, X, Y) {
    let best = null;
    for (let i = 0; i < pts.length - 1; i++) {
        const len = Math.hypot(X(pts[i+1].x)-X(pts[i].x), Y(pts[i+1].y)-Y(pts[i].y));
        if (!best || len > best.len) best = { a: pts[i], b: pts[i+1], len };
    }
    return best;
}
function runsBackwards(a, b, X) { return X(b.x) < X(a.x); }
function roadPath(pts, X, Y) { return pts.map((p, i) => `${i?"L":"M"}${X(p.x)} ${Y(p.y)}`).join(" "); }

// ---- greedy label placer --------------------------------------------
function placer() {
    const boxes = [];
    const hits = (a) => boxes.some((b) => a.x < b.x+b.w && a.x+a.w > b.x && a.y < b.y+b.h && a.y+a.h > b.y);
    const TRIES = [
        { dx: 11, dy: 4,   anchor: "start"  },
        { dx: -11, dy: 4,  anchor: "end"    },
        { dx: 0,  dy: -10, anchor: "middle" },
        { dx: 0,  dy: 17,  anchor: "middle" },
        { dx: 12, dy: -8,  anchor: "start"  },
        { dx: -12, dy: 16, anchor: "end"    },
        { dx: 16, dy: 18,  anchor: "start"  },
        { dx: -16, dy: -13,anchor: "end"    },
        { dx: 0,  dy: -24, anchor: "middle" },
        { dx: 0,  dy: 30,  anchor: "middle" },
        { dx: 24, dy: -22, anchor: "start"  },
        { dx: -24, dy: 28, anchor: "end"    },
    ];
    return {
        claim(box) { boxes.push(box); },
        taken: hits,
        place(x, y, text, size = 12) {
            const w = text.length * size * 0.52, h = size * 1.2;
            for (const t of TRIES) {
                const left = t.anchor === "start" ? x + t.dx : t.anchor === "end" ? x + t.dx - w : x + t.dx - w / 2;
                const box = { x: left, y: y + t.dy - h, w, h };
                if (!hits(box)) { boxes.push(box); return { ...t, size }; }
            }
            return null;
        },
    };
}

// ---- scale bar -------------------------------------------------------
function scaleBar(p) {
    const want = [100,200,500,1000].find((u) => u*p.scale > 90 && u*p.scale < p.W*0.3) || 100;
    const px = n(want * p.scale);
    const x = p.W - p.margin - px - 6, y = p.H - 18;
    return `<g class="scalebar">
    <line x1="${x}" y1="${y}" x2="${n(x+px)}" y2="${y}" stroke-width="2"/>
    <line x1="${x}" y1="${y-5}" x2="${x}" y2="${y+5}" stroke-width="2"/>
    <line x1="${n(x+px)}" y1="${y-5}" x2="${n(x+px)}" y2="${y+5}" stroke-width="2"/>
    <text x="${n(x+px/2)}" y="${y-9}" text-anchor="middle">${want} units</text>
  </g>`;
}

// ---- north arrow -----------------------------------------------------
function northArrow(p) {
    const cx = p.margin + 18, cy = p.margin + 44;
    return `<g class="northarrow" transform="translate(${cx},${cy})">
    <polygon points="0,-22 5,4 0,0 -5,4" fill="white" opacity=".9"/>
    <polygon points="0,-22 -5,4 0,0 5,4" fill="white" opacity=".35"/>
    <text y="-27" text-anchor="middle" font-size="12" fill="white" opacity=".7">N</text>
  </g>`;
}

// ---- airport special zone markings -----------------------------------
function airportMarkings(zones, X, Y, p) {
    const airport = zones.find((z) => /airport/i.test(z.name));
    if (!airport) return "";
    const cx = X(airport.center.x), cy = Y(airport.center.y);
    const rx = n(airport.radius * p.scale * 0.85);
    const ry = n(airport.radius * p.scale * 0.35);
    // dashed centerline simulating runways
    return `<g opacity=".25" stroke="#FFFFFF" fill="none">
    <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" stroke-width="14" stroke="#404040"/>
    <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" stroke-width="1.5" stroke-dasharray="18 10"/>
    <line x1="${n(cx-rx)}" y1="${cy}" x2="${n(cx+rx)}" y2="${cy}" stroke-width="2" stroke-dasharray="12 8"/>
    <line x1="${cx}" y1="${n(cy-ry)}" x2="${cx}" y2="${n(cy+ry)}" stroke-width="2" stroke-dasharray="12 8"/>
  </g>`;
}

// ---- one SVG plate ---------------------------------------------------
function plateSvg(plate, allPinsData, idx) {
    const zones  = places.ZONES.filter((z) => z.city === plate.city);
    const roads  = places.ROADS.filter((r) => r.city === plate.city);
    const onCity = allPinsData.filter((pin) => pin.city === plate.city);
    const p = project(plate, zones, roads);
    const mine     = onCity.filter((pin) =>  p.holds(pin.pos));
    const offPlate = onCity.filter((pin) => !p.holds(pin.pos));
    const { X, Y } = p;
    const pl = placer();
    const L = [];
    const gid = `p${idx}`;

    const tall = p.H > p.W * 1.25 ? " tall" : "";

    L.push(`<svg id="${gid}" class="map${tall}" viewBox="0 0 ${p.W} ${p.H}" role="img" aria-label="${esc(plate.label)} street map, area code ${plate.badge}">`);

    // ---- defs: filters and patterns ----------------------------------
    L.push(`<defs>
  <filter id="${gid}-glow" x="-40%" y="-40%" width="180%" height="180%">
    <feGaussianBlur stdDeviation="3" result="blur"/>
    <feComposite in="SourceGraphic" in2="blur" operator="over"/>
  </filter>
  <filter id="${gid}-hwglow" x="-50%" y="-50%" width="200%" height="200%">
    <feGaussianBlur in="SourceGraphic" stdDeviation="4.5" result="glow"/>
    <feMerge><feMergeNode in="glow"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>
  <pattern id="${gid}-grid" width="50" height="50" patternUnits="userSpaceOnUse" patternTransform="scale(${n(p.scale*0.5)})">
    <path d="M50 0 L0 0 0 50" fill="none" stroke="white" stroke-width="0.4" opacity=".12"/>
  </pattern>
  <radialGradient id="${gid}-vignette" cx="50%" cy="50%" r="70%">
    <stop offset="60%" stop-color="transparent"/>
    <stop offset="100%" stop-color="black" stop-opacity=".45"/>
  </radialGradient>
  <radialGradient id="${gid}-center" cx="50%" cy="50%" r="50%">
    <stop offset="0%" stop-color="${plate.accent}" stop-opacity=".06"/>
    <stop offset="100%" stop-color="transparent"/>
  </radialGradient>
</defs>`);

    // ---- background: map base + grid + center glow ------------------
    L.push(`<rect x="0" y="0" width="${p.W}" height="${p.H}" fill="var(--map-bg)"/>`);
    L.push(`<rect x="0" y="0" width="${p.W}" height="${p.H}" fill="url(#${gid}-grid)"/>`);
    L.push(`<rect x="0" y="0" width="${p.W}" height="${p.H}" fill="url(#${gid}-center)"/>`);

    // ---- districts and parks ----------------------------------------
    for (const z of [...zones].sort((a, b) => b.radius - a.radius)) {
        const r = n(z.radius * p.scale);
        const isPark   = z.kind === "park";
        const isAirport = /airport/i.test(z.name);
        const fill  = isAirport ? "var(--airport-fill)" : isPark ? "var(--park-fill)" : "var(--district-fill)";
        const stroke = isAirport ? "var(--airport-line)" : isPark ? "var(--park-line)" : "var(--district-line)";
        const fo     = isAirport ? .50 : isPark ? .38 : .18;
        const sw     = isAirport ? 1.8 : 1.4;
        const dash   = isPark || isAirport ? "" : `stroke-dasharray="10 7"`;
        L.push(`<g data-zone="${esc(z.name)}"><title>${esc(z.name)} (${z.kind})</title>`);
        L.push(`  <circle cx="${X(z.center.x)}" cy="${Y(z.center.y)}" r="${r}" fill="${fill}" fill-opacity="${fo}" stroke="${stroke}" stroke-width="${sw}" ${dash}/>`);
        L.push(`</g>`);
    }

    // ---- airport runway overlay -------------------------------------
    L.push(airportMarkings(zones, X, Y, p));

    // ---- roads pass 1: fat casings ----------------------------------
    for (const kind of ["backroad","street","arterial","highway"]) {
        const s = ROAD_STYLE[kind];
        for (const road of roads.filter((r) => r.kind === kind)) {
            const d = roadPath(road.points, X, Y);
            L.push(`<path d="${d}" class="casing c-${kind}" stroke-width="${s.casing}"/>`);
        }
    }

    // ---- roads pass 2: surface lines --------------------------------
    for (const kind of ["backroad","street","arterial","highway"]) {
        const s = ROAD_STYLE[kind];
        for (const road of roads.filter((r) => r.kind === kind)) {
            const d = roadPath(road.points, X, Y);
            const id = `${gid}-r-${road.name.replace(/[^A-Za-z0-9]/g,"")}`;
            const da = s.dash ? `stroke-dasharray="${s.dash}"` : "";
            const flt = kind === "highway" ? `filter="url(#${gid}-hwglow)"` : "";
            L.push(`<path id="${id}" d="${d}" class="road r-${kind}" stroke-width="${s.w}" ${da} ${flt}><title>${esc(road.name)}</title></path>`);
        }
    }

    // ---- road labels along the road ---------------------------------
    for (const kind of ["highway","arterial","street"]) {
        const s = ROAD_STYLE[kind];
        if (!s.label) continue;
        for (const road of roads.filter((r) => r.kind === kind)) {
            const run = longestRun(road.points, X, Y);
            const size = kind === "highway" ? 14 : kind === "arterial" ? 12 : 11;
            const need = road.name.length * size * 0.56;
            if (run.len < Math.max(s.minPx, need)) continue;
            const id = `${gid}-r-${road.name.replace(/[^A-Za-z0-9]/g,"")}-lbl`;
            const [a, b] = runsBackwards(run.a, run.b, X) ? [run.b, run.a] : [run.a, run.b];
            L.push(`<path id="${id}" d="M${X(a.x)} ${Y(a.y)} L${X(b.x)} ${Y(b.y)}" fill="none" stroke="none"/>`);
            const dx = X(b.x)-X(a.x), dy = Y(b.y)-Y(a.y);
            let at = null;
            for (const f of [0.5, 0.35, 0.65, 0.25, 0.75]) {
                const cx = X(a.x)+dx*f, cy = Y(a.y)+dy*f;
                const box = { x: cx-need/2, y: cy-size*1.4, w: need, h: size*2.1 };
                if (!pl.taken(box)) { at = f; pl.claim(box); break; }
            }
            if (at === null) continue;
            L.push(`<text class="roadname rn-${kind}" font-size="${size}"><textPath href="#${id}" startOffset="${Math.round(at*100)}%" text-anchor="middle">${esc(road.name)}</textPath></text>`);
        }
    }

    // ---- district / park names --------------------------------------
    for (const z of zones) {
        const size = z.kind === "park" ? 12 : 15;
        const x = X(z.center.x);
        const w = z.name.length * size * 0.65;
        const tries = [
            Y(z.center.y + z.radius) + 18,
            Y(z.center.y - z.radius) - 9,
            Y(z.center.y + z.radius) + 34,
            Y(z.center.y - z.radius) - 25,
            Y(z.center.y + z.radius * 0.6),
            Y(z.center.y),
        ];
        let y = tries[tries.length - 1];
        for (const c of tries) {
            const box = { x: x-w/2, y: c-size, w, h: size*1.3 };
            if (!pl.taken(box)) { y = c; break; }
        }
        pl.claim({ x: x-w/2, y: y-size, w, h: size*1.3 });
        L.push(`<text x="${x}" y="${n(y)}" text-anchor="middle" class="zonename ${z.kind === "park" ? "park" : ""}">${esc(z.name)}</text>`);
    }

    // ---- pins -------------------------------------------------------
    const pinJson = [];
    for (const pin of mine) {
        const ic = PIN_ICONS[pin.kind] || PIN_ICONS.shop;
        const x = X(pin.pos.x), y = Y(pin.pos.y);
        const where = places.describe({ ...pin.pos, z: pin.pos.z ?? 0 });
        const pidx = pinJson.length;
        pinJson.push({ kind: pin.kind, label: pin.label, note: pin.note, where, x: pin.pos.x, y: pin.pos.y, z: pin.pos.z ?? 0 });
        L.push(`<g class="pin pin-${pin.kind}" data-pin="${pidx}" data-plate="${gid}" role="button" tabindex="0" aria-label="${esc(pin.label)}">`);
        L.push(`  <circle class="pin-shadow" cx="${x}" cy="${y}" r="10"/>`);
        L.push(`  <circle class="pin-dot" cx="${x}" cy="${y}" r="7" fill="${ic.color}"/>`);
        L.push(`  <circle class="pin-ring" cx="${x}" cy="${y}" r="7"/>`);
        const spot = pl.place(x, y, pin.label, 11);
        if (spot) L.push(`  <text class="pinlabel" x="${n(x+spot.dx)}" y="${n(y+spot.dy)}" text-anchor="${spot.anchor}">${esc(pin.label)}</text>`);
        L.push(`</g>`);
    }

    // ---- vignette ---------------------------------------------------
    L.push(`<rect x="0" y="0" width="${p.W}" height="${p.H}" fill="url(#${gid}-vignette)" pointer-events="none"/>`);

    // ---- area code badge -------------------------------------------
    L.push(`<text class="badge" x="${p.W-p.margin}" y="${p.margin+58}" text-anchor="end" fill="${plate.accent}">${plate.badge}</text>`);

    // ---- compass + scale -------------------------------------------
    L.push(northArrow(p));
    L.push(scaleBar(p));

    L.push(`</svg>`);

    return { svg: L.join("\n"), roads, zones, pins: mine, offPlate, p, pinJson };
}

// ---- build everything -----------------------------------------------
const allPinsData = allPins();
const plates = PLATES.map((plate, idx) => ({ plate, ...plateSvg(plate, allPinsData, idx) }));

const totals = {
    roads: places.ROADS.length,
    highway:  places.ROADS.filter((r) => r.kind === "highway").length,
    arterial: places.ROADS.filter((r) => r.kind === "arterial").length,
    street:   places.ROADS.filter((r) => r.kind === "street").length,
    backroad: places.ROADS.filter((r) => r.kind === "backroad").length,
    districts: places.ZONES.filter((z) => z.kind === "district").length,
    parks:     places.ZONES.filter((z) => z.kind === "park").length,
    pins: allPinsData.length,
};

const LEGEND = Object.entries(PIN_ICONS).map(([k, ic]) => ({ k, ...ic }));

// ---- serialised pin data for the JS inspector -----------------------
const ALL_PIN_JSON = {};
for (const entry of plates) ALL_PIN_JSON[entry.plate.code] = entry.pinJson;

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<!-- GENERATED by tools/gen-map.js — do not edit by hand.
     Regenerate:  node tools/gen-map.js > docs/city-map.html -->
<title>312 &amp; 1017 · Fourtune Atlas</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo+Black&family=Barlow:wght@400;500;600&family=Barlow+Condensed:wght@500;600;700&family=IBM+Plex+Mono:wght@500&display=swap">
<style>
/* ---- tokens ---- */
:root{
  --bg:#0B0F13; --surface:#121820; --border:#1E2730; --border2:#26333E;
  --ink:#D8E2E8; --ink2:#8CA0AE; --ink3:#4A5D6B;
  --map-bg:#0D1419;
  --district-fill:#2A4A58; --district-line:#3D6678;
  --park-fill:#1E3A1A;     --park-line:#2D5225;
  --airport-fill:#1A1E22;  --airport-line:#3A4550;
  --road-casing:#040709;
  --road-highway:#E8C060; --road-arterial:#C8D4DA; --road-street:#6A818E; --road-backroad:#3D4F5A;
  --halo:#06090C;
  --card-bg:#141C24; --card-border:#263240;
  color-scheme:dark;
  --font-head:'Archivo Black',system-ui,sans-serif;
  --font-body:'Barlow',system-ui,sans-serif;
  --font-cond:'Barlow Condensed',system-ui,sans-serif;
  --font-mono:'IBM Plex Mono',monospace;
}
*{box-sizing:border-box;margin:0;padding:0}
html{background:var(--bg)}
body{background:var(--bg);color:var(--ink);font-family:var(--font-body);line-height:1.5;min-height:100vh}

/* ---- layout ---- */
.shell{max-width:1200px;margin:0 auto;padding:clamp(16px,4vw,48px) clamp(16px,4vw,40px) 80px}
header{padding-bottom:28px;border-bottom:1px solid var(--border)}
.eyebrow{font-family:var(--font-cond);text-transform:uppercase;letter-spacing:.2em;font-size:12px;color:var(--ink3);margin-bottom:6px}
h1{font-family:var(--font-head);font-size:clamp(40px,9vw,72px);line-height:.92;letter-spacing:-.02em;color:var(--ink)}
h1 span{color:var(--ink3);font-size:.5em;vertical-align:.18em;margin:0 .08em}
.tagline{color:var(--ink2);font-size:16px;margin-top:12px;max-width:60ch}

/* ---- stat bar ---- */
.stats{display:flex;flex-wrap:wrap;gap:0;margin-top:24px;border:1px solid var(--border);border-radius:4px;overflow:hidden}
.stat{padding:14px 22px;border-right:1px solid var(--border);flex:1 1 auto;min-width:100px}
.stat:last-child{border-right:none}
.stat-n{font-family:var(--font-head);font-size:26px;line-height:1;color:var(--ink);display:block}
.stat-l{font-family:var(--font-cond);font-size:12px;text-transform:uppercase;letter-spacing:.12em;color:var(--ink3);display:block;margin-top:2px}

/* ---- filter bar ---- */
.filters{display:flex;flex-wrap:wrap;gap:8px;margin-top:24px;align-items:center}
.filters label{font-family:var(--font-cond);font-size:12px;text-transform:uppercase;letter-spacing:.14em;color:var(--ink3);margin-right:4px}
.filter-btn{display:inline-flex;align-items:center;gap:6px;padding:5px 12px 5px 9px;background:var(--surface);border:1px solid var(--border);border-radius:20px;cursor:pointer;font-family:var(--font-cond);font-size:13px;color:var(--ink2);transition:all .15s;user-select:none;line-height:1.2}
.filter-btn:hover{border-color:var(--border2);color:var(--ink)}
.filter-btn.active{background:var(--border2);border-color:var(--border2);color:var(--ink)}
.filter-btn .dot{width:10px;height:10px;border-radius:50%;flex-shrink:0}

/* ---- road key ---- */
.roadkey{display:flex;flex-wrap:wrap;gap:12px 24px;margin-top:16px;align-items:center}
.rk{display:inline-flex;align-items:center;gap:8px;font-family:var(--font-cond);font-size:13px;color:var(--ink2)}
.rk-line{height:4px;width:36px;border-radius:2px;flex-shrink:0}
.rk-line.hw{height:7px;background:var(--road-highway)}
.rk-line.ar{height:4px;background:var(--road-arterial)}
.rk-line.st{height:2.5px;background:var(--road-street)}
.rk-line.br{height:2px;background:var(--road-backroad);background-image:repeating-linear-gradient(90deg,var(--road-backroad) 0,var(--road-backroad) 5px,transparent 5px,transparent 9px);background-color:transparent}

/* ---- plate sections ---- */
section.plate{margin-top:40px}
.plate-header{display:flex;align-items:baseline;gap:14px;margin-bottom:14px}
.plate-code{font-family:var(--font-head);font-size:32px;color:var(--ink)}
.plate-label{font-family:var(--font-cond);font-size:14px;text-transform:uppercase;letter-spacing:.16em;color:var(--ink3)}
.map-wrap{background:var(--map-bg);border:1px solid var(--border);border-radius:6px;overflow:hidden;position:relative}
svg.map{display:block;width:100%;height:auto}
svg.map.tall{width:auto;height:min(1100px,155vh);display:block;margin:0 auto}

/* ---- SVG internals ---- */
.casing{fill:none;stroke:var(--road-casing);stroke-linecap:round;stroke-linejoin:round}
.road{fill:none;stroke-linecap:round;stroke-linejoin:round;cursor:pointer;transition:stroke-width .1s}
.r-highway{stroke:var(--road-highway)}
.r-arterial{stroke:var(--road-arterial)}
.r-street{stroke:var(--road-street)}
.r-backroad{stroke:var(--road-backroad)}
.road:hover{stroke-width:10!important;opacity:.9}
.roadname{font-family:var(--font-cond);fill:var(--ink2);font-weight:600;letter-spacing:.04em;paint-order:stroke;stroke:var(--halo);stroke-width:3.5px;stroke-linejoin:round}
.rn-highway{fill:var(--road-highway);font-size:14px;letter-spacing:.12em;text-transform:uppercase}
.rn-arterial{fill:var(--ink2);font-size:12px}
.rn-street{fill:var(--ink3);font-size:10.5px}
.zonename{font-family:var(--font-cond);fill:var(--ink2);text-transform:uppercase;letter-spacing:.15em;font-weight:700;paint-order:stroke;stroke:var(--halo);stroke-width:4px;font-size:15px}
.zonename.park{fill:#4A8040;font-size:12px;letter-spacing:.1em}
.badge{font-family:var(--font-head);font-size:64px;opacity:.15;pointer-events:none}
.scalebar{stroke:var(--ink3);fill:none}
.scalebar text{font-family:var(--font-mono);font-size:11px;fill:var(--ink3)}
.northarrow{pointer-events:none}

/* ---- pins ---- */
.pin{cursor:pointer}
.pin-shadow{fill:black;opacity:.5;filter:blur(3px)}
.pin-dot{transition:r .15s}
.pin-ring{fill:none;stroke:var(--bg);stroke-width:1.8}
.pinlabel{font-family:var(--font-cond);font-size:11px;fill:var(--ink2);paint-order:stroke;stroke:var(--halo);stroke-width:2.8px;stroke-linejoin:round;pointer-events:none}
.pin:hover .pin-dot{r:10}
.pin:focus-visible{outline:none}
.pin:focus-visible .pin-dot{r:10;stroke:white;stroke-width:2}

/* pin visibility by filter */
.pin{transition:opacity .2s}
.pin.hidden{opacity:0;pointer-events:none}

/* ---- info card ---- */
#card{position:fixed;z-index:100;bottom:24px;right:24px;width:clamp(260px,28vw,340px);background:var(--card-bg);border:1px solid var(--card-border);border-radius:8px;padding:18px 20px;box-shadow:0 8px 32px #000A;transition:opacity .15s,transform .15s;opacity:0;transform:translateY(8px);pointer-events:none}
#card.visible{opacity:1;transform:none;pointer-events:auto}
#card-kind{font-family:var(--font-cond);font-size:11px;text-transform:uppercase;letter-spacing:.18em;color:var(--ink3);margin-bottom:4px}
#card-name{font-family:var(--font-head);font-size:20px;color:var(--ink);line-height:1.2;margin-bottom:6px}
#card-note{font-family:var(--font-body);font-size:14px;color:var(--ink2);margin-bottom:10px}
#card-where{font-family:var(--font-cond);font-size:12px;color:var(--ink3)}
#card-coord{font-family:var(--font-mono);font-size:12px;color:var(--ink3);margin-top:4px}
#card-close{position:absolute;top:10px;right:12px;background:none;border:none;color:var(--ink3);cursor:pointer;font-size:18px;line-height:1;padding:4px}
#card-close:hover{color:var(--ink)}

/* ---- tables ---- */
.tables{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:22px;margin-top:22px}
table{border-collapse:collapse;width:100%;font-size:13.5px}
caption{font-family:var(--font-cond);text-transform:uppercase;letter-spacing:.12em;font-size:12px;color:var(--ink3);text-align:left;padding-bottom:8px}
th,td{text-align:left;padding:6px 10px;border-bottom:1px solid var(--border)}
thead th{font-family:var(--font-cond);text-transform:uppercase;letter-spacing:.1em;font-size:11.5px;color:var(--ink3)}
tr.rgroup th{font-family:var(--font-cond);text-transform:uppercase;letter-spacing:.12em;font-size:11.5px;color:var(--ink2);background:var(--surface)}
td.num,th.num{font-family:var(--font-mono);text-align:right;font-size:12.5px}
td{color:var(--ink2)}

/* ---- note ---- */
.note{margin-top:32px;padding:18px 22px;background:var(--surface);border:1px solid var(--border);border-radius:6px;color:var(--ink2);font-size:14.5px;max-width:72ch;line-height:1.65}
.note b{color:var(--ink)}
code{font-family:var(--font-mono);font-size:.9em;background:var(--border2);padding:1px 6px;border-radius:3px}

@media(max-width:600px){
  .stats{flex-direction:column}
  .stat{border-right:none;border-bottom:1px solid var(--border)}
  #card{bottom:0;right:0;left:0;width:auto;border-radius:8px 8px 0 0}
}
</style>
</head>
<body>
<div class="shell">

<header>
  <p class="eyebrow">Fourtune RP · World Atlas</p>
  <h1>312 <span>&amp;</span> 1017</h1>
  <p class="tagline">Every road, district, park and pin is read straight from <code>js-snippets</code> when this page is generated — what you see is exactly what dispatch says.</p>
  <div class="stats">
    <div class="stat"><span class="stat-n">${totals.roads}</span><span class="stat-l">Roads</span></div>
    <div class="stat"><span class="stat-n">${totals.highway}</span><span class="stat-l">Highways</span></div>
    <div class="stat"><span class="stat-n">${totals.arterial}</span><span class="stat-l">Arterials</span></div>
    <div class="stat"><span class="stat-n">${totals.street}</span><span class="stat-l">Streets</span></div>
    <div class="stat"><span class="stat-n">${totals.backroad}</span><span class="stat-l">Back roads</span></div>
    <div class="stat"><span class="stat-n">${totals.districts}</span><span class="stat-l">Districts</span></div>
    <div class="stat"><span class="stat-n">${totals.parks}</span><span class="stat-l">Parks</span></div>
    <div class="stat"><span class="stat-n">${totals.pins}</span><span class="stat-l">Pins</span></div>
  </div>
  <div class="filters" id="filters" role="group" aria-label="Filter map pins">
    <label>Show:</label>
    ${LEGEND.map(({k, label, color}) => `<button class="filter-btn active" data-kind="${k}" type="button">
      <span class="dot" style="background:${color}"></span>${label}
    </button>`).join("\n    ")}
  </div>
  <div class="roadkey">
    <span class="rk"><span class="rk-line hw"></span>Highway</span>
    <span class="rk"><span class="rk-line ar"></span>Arterial</span>
    <span class="rk"><span class="rk-line st"></span>Street</span>
    <span class="rk"><span class="rk-line br"></span>Back road</span>
  </div>
</header>

${plates.map((entry) => {
    const ac = entry.plate.accent;
    const offNote = entry.offPlate.length
        ? `<p style="margin-top:8px;font-size:13px">Off-plate: ${entry.offPlate.map((o) => `${esc(o.label)} (${n(o.pos.x)}, ${n(o.pos.y)})`).join(", ")}</p>`
        : "";
    const rdTable = (() => {
        const rows = [];
        for (const kind of ["highway","arterial","street","backroad"]) {
            const list = entry.roads.filter((r) => r.kind === kind);
            if (!list.length) continue;
            rows.push(`<tr class="rgroup"><th colspan="3">${kind[0].toUpperCase()+kind.slice(1)} — ${list.length}</th></tr>`);
            for (const r of list.sort((a,b) => a.name.localeCompare(b.name)))
                rows.push(`<tr><td>${esc(r.name)}</td><td class="num">${unitLength(r.points)}</td><td class="num">${r.width}</td></tr>`);
        }
        return `<table><caption>${esc(entry.plate.label)} — ${entry.roads.length} roads</caption>
<thead><tr><th>Name</th><th class="num">Length</th><th class="num">Width</th></tr></thead>
<tbody>${rows.join("\n")}</tbody></table>`;
    })();
    return `<section class="plate" id="plate-${entry.plate.code}">
<div class="plate-header">
  <span class="plate-code" style="color:${ac}">${entry.plate.code}</span>
  <span class="plate-label">${esc(entry.plate.label)}</span>
</div>
<div class="map-wrap">
${entry.svg}
</div>
<div class="tables">${rdTable}</div>
${offNote}
</section>`;
}).join("\n\n")}

<div class="note">
  <p><b>Coordinates are a first pass.</b> Walk each pin and road in game, then update the numbers in <code>js-snippets</code>. Run <code>node tools/gen-map.js &gt; docs/city-map.html</code> to refresh this page — the Lua world layer regenerates with <code>node tools/gen-world-data.js &gt; world/data.lua</code>.</p>
</div>

</div><!-- .shell -->

<!-- ---- inspector card ---- -->
<div id="card" role="dialog" aria-modal="false" aria-label="Location info">
  <button id="card-close" aria-label="Close">×</button>
  <div id="card-kind"></div>
  <div id="card-name"></div>
  <div id="card-note"></div>
  <div id="card-where"></div>
  <div id="card-coord"></div>
</div>

<script>
(function(){
  const PINS = ${JSON.stringify(ALL_PIN_JSON)};
  const card = document.getElementById('card');
  const $ = (id) => document.getElementById(id);

  function showCard(pin, color) {
    $('card-kind').textContent = pin.kind.toUpperCase();
    $('card-kind').style.color = color;
    $('card-name').textContent = pin.label;
    $('card-note').textContent = pin.note;
    $('card-where').textContent = pin.where || '';
    $('card-coord').textContent = \`(\${pin.x.toFixed(1)}, \${pin.y.toFixed(1)}, \${pin.z.toFixed(1)})\`;
    card.classList.add('visible');
  }

  $('card-close').addEventListener('click', () => card.classList.remove('visible'));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') card.classList.remove('visible'); });

  // delegate: works for all SVG pins regardless of when they render
  document.addEventListener('click', (e) => {
    const el = e.target.closest('.pin');
    if (!el) { if (!e.target.closest('#card')) card.classList.remove('visible'); return; }
    const pidx  = Number(el.dataset.pin);
    const plate = el.dataset.plate; // gid like "p0"
    const pcode = plate.replace('p','');
    // map idx → plate code via plate order
    const plateOrder = ${JSON.stringify(PLATES.map((p) => p.code))};
    const code = plateOrder[Number(pcode)];
    const pin  = PINS[code]?.[pidx];
    if (!pin) return;
    const color = ${JSON.stringify(Object.fromEntries(Object.entries(PIN_ICONS).map(([k,v])=>[k,v.color])))}[pin.kind] || '#fff';
    showCard(pin, color);
  });

  document.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && document.activeElement?.classList.contains('pin')) {
      document.activeElement.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }
  });

  // filter buttons
  const activeKinds = new Set(${JSON.stringify(Object.keys(PIN_ICONS))});
  document.getElementById('filters').addEventListener('click', (e) => {
    const btn = e.target.closest('.filter-btn');
    if (!btn) return;
    const kind = btn.dataset.kind;
    if (activeKinds.has(kind)) { activeKinds.delete(kind); btn.classList.remove('active'); }
    else { activeKinds.add(kind); btn.classList.add('active'); }
    document.querySelectorAll('.pin').forEach((el) => {
      const k = el.classList[1]?.replace('pin-','');
      el.classList.toggle('hidden', !activeKinds.has(k));
    });
  });
})();
</script>
</body>
</html>
`;

process.stdout.write(html);
