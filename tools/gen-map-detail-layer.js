// ============================================================
// tools/gen-map-detail-layer.js — puts the gameplay data on the big map
//
//   node tools/gen-map-detail-layer.js
//
// Rewrites three marked blocks inside map-detail, in place:
//   GAMEPLAY ROADS   every road in places.js that isn't one of the
//                    hand-drawn main roads, as an SVG under them
//   GAMEPLAY PINS    every spawn, shop, fuel stop, hospital, duty
//                    station, jail, house, impound lot, clothes shop
//                    and supply drop, as a pin over everything
//   GAMEPLAY LEGEND  the legend rows for the two layers above
//
// Each city's data is fitted into that city's part of the plate
// (312 north, 770 middle, 1017 south), keeping its shape. The big
// map is schematic, so this is "roughly where", not walked coords:
// fix the numbers in js-snippets, then run this again.
// ============================================================

const fs = require("fs");
const B = `${__dirname}/../js-snippets/`;
const places     = require(`${B}places.js`);
const cities     = require(`${B}cities.js`);
const spawns     = require(`${B}spawns.js`);
const shops      = require(`${B}shops.js`);
const fuel       = require(`${B}fuel.js`);
const medical    = require(`${B}medical.js`);
const jobs       = require(`${B}jobs.js`);
const police     = require(`${B}police.js`);
const houses     = require(`${B}houses.js`);
const impound    = require(`${B}impound.js`);
const appearance = require(`${B}appearance.js`);
const drugs      = require(`${B}drugs.js`);

const MAP = `${__dirname}/../map-detail`;
const W = 1400, H = 1750;   // the plate at full size; the SVGs use this as their viewBox

// Main roads already drawn by hand on the big map: they get the game
// name on hover instead of being drawn a second time.
const HAND_DRAWN = new Set([
    "Lakeshore Drive", "The 312 Skyway", "Ironline Expressway", "Palisade Boulevard", "The Causeway",
    "Knot Loop", "Backroads Highway", "County Line Road", "The Connector", "The Perimeter",
    "Westside Run", "Red Clay Expressway", "Peachline Road",
]);

// Where each city sits on the plate, in % of width / height.
const REGIONS = {
    chicago: { x0: 17, x1: 62, y0: 2.5, y1: 25.5 },
    geepee:  { x0: 20, x1: 78, y0: 27,  y1: 60 },
    atlanta: { x0: 6,  x1: 80, y0: 61,  y1: 93 },
};

const ROAD_STYLE = {
    arterial: { w: 7,   fill: "#d9d9d4", casing: "rgba(60,60,60,.45)", dash: "" },
    street:   { w: 4.5, fill: "#cfccc2", casing: "rgba(60,60,60,.35)", dash: "" },
    backroad: { w: 3,   fill: "#c9b48a", casing: "",                   dash: "7 5" },
    highway:  { w: 10,  fill: "#d9d9d4", casing: "rgba(60,60,60,.45)", dash: "" },
};

const PINS = {
    spawn:   { label: "Spawn point",          color: "#c8d3d8" },
    shop:    { label: "Shop",                 color: "#e0b83c" },
    ammu:    { label: "Gun shop",             color: "#e06040" },
    gas:     { label: "Fuel",                 color: "#59cae6" },
    med:     { label: "Hospital",             color: "#f06080" },
    job:     { label: "Duty station",         color: "#66d4a0" },
    law:     { label: "Jail",                 color: "#7aabf0" },
    home:    { label: "Housing",              color: "#c090e0" },
    lot:     { label: "Impound lot",          color: "#b8a88a" },
    clothes: { label: "Clothing store",       color: "#e88ec0" },
    supply:  { label: "Supply drop",          color: "#9acc60" },
};

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const r1 = (v) => Math.round(v * 10) / 10;

function allPins() {
    const out = [];
    const add = (kind, label, pos, note) => out.push({ kind, label, pos, note, city: cities.cityAt(pos) });
    for (const [city, list] of Object.entries(spawns.SPAWNS)) for (const s of list) add("spawn", s.label, s.pos, `spawn, ${city}`);
    for (const s of Object.values(shops.SHOPS)) add(s.goldItems ? "ammu" : "shop", s.label, s.pos, s.goldItems ? "weapons + ammo for gold" : "general goods");
    for (const g of fuel.GAS_STATIONS) add("gas", g.label, g.pos, "/refuel");
    for (const list of Object.values(medical.HOSPITALS)) for (const h of list) add("med", h.label, h.pos, "respawn point");
    for (const job of Object.values(jobs.JOBS)) for (const [city, pos] of Object.entries(job.stations || {})) add("job", job.label, pos, `duty station, ${city}`);
    add("law", "County Lockup", police.JAIL.cell, "jail cell");
    for (const h of Object.values(houses.HOUSES)) add("home", h.label, h.pos, `housing, ${h.district}`);
    for (const l of impound.LOTS) add("lot", l.label, l.pos, "impound lot");
    for (const s of appearance.SHOPS) add("clothes", s.label, s.pos, "clothing store");
    for (const s of drugs.SUPPLY_SPOTS) add("supply", s.label, s.pos, "supply drop");
    return out;
}

// Pins that sit well away from their city's roads (the jail is out past
// Atlanta's edge) aren't fitted, or they'd shrink the whole city; they're
// drawn at a fixed spot instead, marked "off the drawn area".
const OFF_GRID = { law: { x: 71, y: 60.5 } };   // % of the plate

// Fit one city's roads and districts into its region, keeping the aspect.
function projector(city, roads, zones) {
    const xs = [], ys = [];
    for (const r of roads) for (const p of r.points) { xs.push(p.x); ys.push(p.y); }
    for (const z of zones) { xs.push(z.center.x - z.radius, z.center.x + z.radius); ys.push(z.center.y - z.radius, z.center.y + z.radius); }
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const R = REGIONS[city];
    const rx0 = R.x0 / 100 * W, rx1 = R.x1 / 100 * W, ry0 = R.y0 / 100 * H, ry1 = R.y1 / 100 * H;
    const scale = Math.min((rx1 - rx0) / ((maxX - minX) || 1), (ry1 - ry0) / ((maxY - minY) || 1));
    const ox = rx0 + ((rx1 - rx0) - (maxX - minX) * scale) / 2;   // centre what's left over
    const oy = ry0 + ((ry1 - ry0) - (maxY - minY) * scale) / 2;
    const slack = 0.15 * Math.max(maxX - minX, maxY - minY);
    const inside = (p) => p.x >= minX - slack && p.x <= maxX + slack && p.y >= minY - slack && p.y <= maxY + slack;
    return { X: (x) => r1(ox + (x - minX) * scale), Y: (y) => r1(oy + (maxY - y) * scale), inside };   // game y runs north
}

function build() {
    const pins = allPins();
    const roadsSvg = [], pinsSvg = [];
    for (const city of Object.keys(REGIONS)) {
        const roads = places.ROADS.filter((r) => cities.cityAt(r.points[0]) === city);
        const zones = places.ZONES.filter((z) => z.city === city);
        const cityPins = pins.filter((p) => p.city === city);
        const { X, Y, inside } = projector(city, roads, zones);

        // backroads first, arterials last, so the bigger roads sit on top
        const order = ["backroad", "street", "arterial", "highway"];
        for (const r of roads.filter((r) => !HAND_DRAWN.has(r.name)).sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind))) {
            const st = ROAD_STYLE[r.kind] || ROAD_STYLE.street;
            const pts = r.points.map((p) => `${X(p.x)},${Y(p.y)}`).join(" ");
            const title = `<title>${esc(r.name)} (${r.kind}, ${city === "chicago" ? "312" : city === "geepee" ? "770" : "1017"})</title>`;
            if (st.casing) roadsSvg.push(`      <polyline class="gp-casing" points="${pts}" stroke="${st.casing}" stroke-width="${st.w + 2.5}"/>`);
            roadsSvg.push(`      <polyline class="gp-road gp-${r.kind}" points="${pts}" stroke="${st.fill}" stroke-width="${st.w}"${st.dash ? ` stroke-dasharray="${st.dash}"` : ""}>${title}</polyline>`);
        }
        for (const p of cityPins) {
            const k = PINS[p.kind];
            let cx = X(p.pos.x), cy = Y(p.pos.y), note = p.note;
            if (!inside(p.pos)) {
                const spot = OFF_GRID[p.kind];
                if (!spot) { console.warn(`skipped ${p.label}: outside ${city}'s roads and no OFF_GRID spot for ${p.kind}`); continue; }
                cx = r1(spot.x / 100 * W); cy = r1(spot.y / 100 * H); note += ", off the drawn area";
            }
            pinsSvg.push(`      <circle class="gp-pin" cx="${cx}" cy="${cy}" r="8" fill="${k.color}"><title>${esc(p.label)} — ${esc(k.label)} (${esc(note)})</title></circle>`);
        }
    }

    const roadsBlock = `    <!-- GAMEPLAY ROADS: generated by tools/gen-map-detail-layer.js from js-snippets/places.js; do not edit by hand -->
    <svg class="gp-layer gp-roads" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
${roadsSvg.join("\n")}
    </svg>
    <!-- /GAMEPLAY ROADS -->`;
    const pinsBlock = `    <!-- GAMEPLAY PINS: generated by tools/gen-map-detail-layer.js; do not edit by hand -->
    <svg class="gp-layer gp-pins" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
${pinsSvg.join("\n")}
    </svg>
    <!-- /GAMEPLAY PINS -->`;
    const used = [...new Set(pins.map((p) => p.kind))];
    const legendRows = [
        `      <li><span class="sw"><svg class="gp-sw" viewBox="0 0 52 34"><line x1="4" y1="17" x2="48" y2="17" stroke="rgba(60,60,60,.45)" stroke-width="9.5"/><line x1="4" y1="17" x2="48" y2="17" stroke="#d9d9d4" stroke-width="7"/></svg></span>Avenue / boulevard (hover for name)</li>`,
        `      <li><span class="sw"><svg class="gp-sw" viewBox="0 0 52 34"><line x1="4" y1="17" x2="48" y2="17" stroke="rgba(60,60,60,.35)" stroke-width="7"/><line x1="4" y1="17" x2="48" y2="17" stroke="#cfccc2" stroke-width="4.5"/></svg></span>Street (hover for name)</li>`,
        `      <li><span class="sw"><svg class="gp-sw" viewBox="0 0 52 34"><line x1="4" y1="17" x2="48" y2="17" stroke="#c9b48a" stroke-width="3" stroke-dasharray="7 5"/></svg></span>Backroad / track</li>`,
        ...used.map((k) => `      <li><span class="sw"><svg class="gp-sw" viewBox="0 0 52 34"><circle cx="26" cy="17" r="8" fill="${PINS[k].color}" stroke="#fff" stroke-width="2.5"/></svg></span>${PINS[k].label}</li>`),
    ];
    const legendBlock = `      <!-- GAMEPLAY LEGEND: generated by tools/gen-map-detail-layer.js; do not edit by hand -->
${legendRows.join("\n")}
      <!-- /GAMEPLAY LEGEND -->`;
    return { roadsBlock, pinsBlock, legendBlock, counts: { roads: roadsSvg.filter((l) => l.includes("gp-road")).length, pins: pinsSvg.length } };
}

function swap(src, startMark, endMark, block) {
    const a = src.indexOf(startMark), b = src.indexOf(endMark);
    if (a < 0 || b < 0) throw new Error(`map-detail is missing the ${startMark} … ${endMark} markers`);
    const lineStart = src.lastIndexOf("\n", a) + 1;
    return src.slice(0, lineStart) + block + src.slice(b + endMark.length);
}

const { roadsBlock, pinsBlock, legendBlock, counts } = build();
let html = fs.readFileSync(MAP, "utf8");
html = swap(html, "<!-- GAMEPLAY ROADS", "<!-- /GAMEPLAY ROADS -->", roadsBlock);
html = swap(html, "<!-- GAMEPLAY PINS", "<!-- /GAMEPLAY PINS -->", pinsBlock);
html = swap(html, "<!-- GAMEPLAY LEGEND", "<!-- /GAMEPLAY LEGEND -->", legendBlock);
fs.writeFileSync(MAP, html);
console.log(`map-detail: ${counts.roads} gameplay roads, ${counts.pins} pins`);
