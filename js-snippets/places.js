// ============================================================
// places.js — districts, parks and named roads
//
// The world is GTA V's stock map, so none of this builds geometry.
// What it does is give the server a vocabulary for WHERE something
// happened. Before this, every alert said "Chicago". Now dispatch
// reads "24/7 Chicago — Lakeshore Drive, The Knot, Chicago".
//
// Three kinds, most specific wins:
//   road      a polyline with a width — you're ON it
//   park      a circle you're inside
//   district  a bigger circle, the fallback before the city
//
// EVERY COORDINATE HERE IS A PLACEHOLDER. They are placed by number
// near the pins that already exist, not by standing on them, so a
// road may well run through a hillside. Walk them and move them —
// the names are the point, the numbers are a first guess.
// ============================================================

const cities = require("./cities");

// Circles. radius is in game units.
const ZONES = [
    // ---- Chicago (312), the northern plate ----
    { name: "The Knot",        kind: "district", city: "chicago", center: { x: -430, y: 6020 }, radius: 140 },
    { name: "Midway",          kind: "district", city: "chicago", center: { x: -250, y: 6190 }, radius: 170 },
    { name: "Northline",       kind: "district", city: "chicago", center: { x: -110, y: 6400 }, radius: 190 },
    { name: "The Shoreline",   kind: "district", city: "chicago", center: { x: -60,  y: 6150 }, radius: 150 },
    { name: "Winterline Park", kind: "park",     city: "chicago", center: { x: -190, y: 6230 }, radius: 55 },
    { name: "Harbor Green",    kind: "park",     city: "chicago", center: { x: -150, y: 6075 }, radius: 45 },

    // ---- GeePee (770), the middle ----
    { name: "Harvest Flats",   kind: "district", city: "geepee", center: { x: 1850, y: 3720 }, radius: 260 },
    { name: "The Backroads",   kind: "district", city: "geepee", center: { x: 1760, y: 4400 }, radius: 420 },
    { name: "Grapeseed Common", kind: "park",    city: "geepee", center: { x: 1700, y: 4870 }, radius: 120 },

    // ---- Atlanta (7101), the southern plate ----
    { name: "Red Clay",        kind: "district", city: "atlanta", center: { x: 230,   y: -700 },  radius: 260 },
    { name: "Alta Heights",    kind: "district", city: "atlanta", center: { x: -260,  y: -950 },  radius: 220 },
    { name: "Southline",       kind: "district", city: "atlanta", center: { x: 10,    y: -1550 }, radius: 300 },
    { name: "The Westside",    kind: "district", city: "atlanta", center: { x: -1100, y: -1100 }, radius: 480 },
    { name: "Peach Ridge Park", kind: "park",    city: "atlanta", center: { x: -860,  y: -890 },  radius: 130 },
    { name: "Grove Park",      kind: "park",     city: "atlanta", center: { x: -120,  y: -1690 }, radius: 110 },
];

// Polylines. width is how far off the centre line still counts as the road.
const ROADS = [
    // ---- Chicago ----
    { name: "Lakeshore Drive",   city: "chicago", width: 28, points: [{ x: -60, y: 5990 }, { x: -75, y: 6180 }, { x: -95, y: 6410 }] },
    { name: "Paleto Boulevard",  city: "chicago", width: 26, points: [{ x: -452, y: 6372 }, { x: -230, y: 6378 }, { x: -70, y: 6396 }] },
    { name: "Sheriff's Row",     city: "chicago", width: 22, points: [{ x: -452, y: 6008 }, { x: -330, y: 6060 }, { x: -248, y: 6180 }] },
    { name: "The Causeway",      city: "chicago", width: 30, points: [{ x: -245, y: 6330 }, { x: -150, y: 6395 }, { x: -70, y: 6404 }] },

    // ---- GeePee ----
    { name: "Backroads Highway", city: "geepee", width: 34, points: [{ x: 1690, y: 4930 }, { x: 1780, y: 4300 }, { x: 1900, y: 3800 }, { x: 2005, y: 3774 }] },
    { name: "Harvest Lane",      city: "geepee", width: 22, points: [{ x: 1839, y: 3672 }, { x: 1960, y: 3740 }] },

    // ---- Atlanta ----
    { name: "The Connector",     city: "atlanta", width: 36, points: [{ x: 290, y: -600 }, { x: 60, y: -1100 }, { x: 20, y: -1560 }, { x: -70, y: -1755 }] },
    { name: "Peachline Road",    city: "atlanta", width: 26, points: [{ x: 195, y: -935 }, { x: -270, y: -955 }, { x: -530, y: -1205 }] },
    { name: "Grove Street",      city: "atlanta", width: 22, points: [{ x: -70, y: -1760 }, { x: 45, y: -1748 }, { x: 180, y: -1700 }] },
    { name: "Westside Run",      city: "atlanta", width: 30, points: [{ x: -530, y: -1210 }, { x: -1000, y: -1060 }, { x: -1600, y: -1030 }] },
];

function dist2(a, b) {
    return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
}

// How far pos is from the segment a-b, in 2D (height is ignored for roads)
function distanceToSegment(pos, a, b) {
    const len = dist2(a, b);
    if (len === 0) return Math.sqrt(dist2(pos, a));
    let t = ((pos.x - a.x) * (b.x - a.x) + (pos.y - a.y) * (b.y - a.y)) / len;
    t = Math.max(0, Math.min(1, t));
    return Math.sqrt(dist2(pos, { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) }));
}

function roadAt(pos) {
    let best = null;
    for (const road of ROADS) {
        for (let i = 0; i < road.points.length - 1; i++) {
            const d = distanceToSegment(pos, road.points[i], road.points[i + 1]);
            if (d <= road.width && (!best || d < best.d)) best = { d, road };
        }
    }
    return best ? best.road : null;
}

// The smallest circle you're inside, so a park beats the district around it
function zoneAt(pos, kind) {
    let best = null;
    for (const zone of ZONES) {
        if (kind && zone.kind !== kind) continue;
        const d = Math.sqrt(dist2(pos, zone.center));
        if (d <= zone.radius && (!best || zone.radius < best.radius)) best = zone;
    }
    return best;
}

// The one name that best answers "where are you?"
function placeAt(pos) {
    if (!pos) return null;
    return roadAt(pos) || zoneAt(pos) || null;
}

// "Lakeshore Drive, The Knot, Chicago" — as much as is true, most specific first
function describe(pos) {
    if (!pos) return "Nowhere in particular";
    const city = cities.CITIES[cities.cityAt(pos)].label;
    const road = roadAt(pos);
    const zone = zoneAt(pos);
    return [road && road.name, zone && zone.name, city].filter(Boolean).join(", ");
}

// Short form for dispatch lines: the best name, falling back to the city
function label(pos) {
    const place = placeAt(pos);
    return place ? place.name : cities.CITIES[cities.cityAt(pos || { x: 0, y: 0, z: 0 })].label;
}

// Entering a named district or park announces it once; roads stay quiet
function updateZone(c, pos) {
    const zone = zoneAt(pos);
    const name = zone ? zone.name : null;
    if (name === c.zone) return null;
    const first = c.zone === undefined;
    c.zone = name;
    return first || !name ? null : `Entering ${name}`;
}

function listFor(city) {
    const zones = ZONES.filter((z) => z.city === city);
    const roads = ROADS.filter((r) => r.city === city);
    if (!zones.length && !roads.length) return "Nothing mapped here yet.";
    return [
        ...zones.filter((z) => z.kind === "district").map((z) => `District: ${z.name}`),
        ...zones.filter((z) => z.kind === "park").map((z) => `Park: ${z.name}`),
        ...roads.map((r) => `Road: ${r.name}`),
    ].join("\n");
}

module.exports = { ZONES, ROADS, distanceToSegment, roadAt, zoneAt, placeAt, describe, label, updateZone, listFor };
