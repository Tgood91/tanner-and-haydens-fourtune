// ============================================================
// places.js — districts, parks and named roads
//
// The world is GTA V's stock map, so none of this builds geometry.
// What it does is give the server a vocabulary for WHERE something
// happened. Before this, every alert said "Chicago". Now dispatch
// reads "Open 24 Chicago — Lakeshore Drive, The Knot, Chicago".
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
    { name: "Harvest Common", kind: "park",    city: "geepee", center: { x: 1700, y: 4870 }, radius: 120 },

    // ---- Atlanta (7101), the southern plate ----
    { name: "Red Clay",        kind: "district", city: "atlanta", center: { x: 230,   y: -700 },  radius: 260 },
    { name: "Alder Heights",    kind: "district", city: "atlanta", center: { x: -260,  y: -950 },  radius: 220 },
    { name: "Southline",       kind: "district", city: "atlanta", center: { x: 10,    y: -1550 }, radius: 300 },
    { name: "The Westside",    kind: "district", city: "atlanta", center: { x: -1100, y: -1100 }, radius: 480 },
    { name: "Peach Ridge Park", kind: "park",    city: "atlanta", center: { x: -860,  y: -890 },  radius: 130 },
    { name: "Groveland Park",      kind: "park",     city: "atlanta", center: { x: -120,  y: -1690 }, radius: 110 },
    // Halfway: a small town on the open land between Atlanta and GeePee (still Atlanta, south of the border)
    { name: "Halfway",         kind: "district", city: "atlanta", center: { x: 600,   y: 1500 },  radius: 330 },
];

// Polylines. width is how far off the centre line still counts as the road,
// and kind sets the default width — a highway swallows more ground than a
// farm track, so you're "on" it from further away.
//
// kind is also what the map draws: highways heaviest, back roads thinnest.
// It changes nothing about naming; roadAt still just returns the nearest.
const ROAD_WIDTH = { highway: 34, arterial: 26, street: 16, backroad: 11 };

const ROAD_DEFS = [
    // ================= Chicago (312), the northern plate =================
    // ---- highways: the lines you cross the plate on ----
    { name: "Lakeshore Drive",         city: "chicago",  kind: "highway",   width: 30, points: [{ x: -60, y: 5990 }, { x: -75, y: 6180 }, { x: -93, y: 6400 }] },
    { name: "The 312 Skyway",          city: "chicago",  kind: "highway",   points: [{ x: -496, y: 6022 }, { x: -360, y: 6180 }, { x: -200, y: 6338 }, { x: -70, y: 6404 }] },   // bends through Cut St.'s north end
    { name: "Ironline Expressway",     city: "chicago",  kind: "highway",   width: 32, points: [{ x: -490, y: 5962 }, { x: -510, y: 6160 }, { x: -480, y: 6420 }, { x: -416, y: 6489 }] },

    // ---- arterials: how you get between districts ----
    // Palisade runs the 312's south edge, as the island map draws it: Ironline to Lakeshore, through Cut St.'s south end
    { name: "Palisade Boulevard",      city: "chicago",  kind: "arterial",  points: [{ x: -490, y: 5962 }, { x: -420, y: 5895 }, { x: -199, y: 5880 }, { x: -100, y: 5900 }, { x: -60, y: 5990 }] },
    { name: "Sheriff's Row",           city: "chicago",  kind: "arterial",  width: 22, points: [{ x: -447, y: 6010 }, { x: -330, y: 6060 }, { x: -249, y: 6174 }] },
    { name: "The Causeway",            city: "chicago",  kind: "arterial",  width: 30, points: [{ x: -247, y: 6338 }, { x: -150, y: 6395 }, { x: -70, y: 6396 }] },
    { name: "Midway Avenue",           city: "chicago",  kind: "arterial",  points: [{ x: -412, y: 6195 }, { x: -300, y: 6178 }, { x: -180, y: 6168 }, { x: -75, y: 6178 }] },
    { name: "Winterline Parkway",      city: "chicago",  kind: "arterial",  width: 22, points: [{ x: -252, y: 6272 }, { x: -190, y: 6292 }, { x: -128, y: 6266 }, { x: -116, y: 6174 }] },
    { name: "Clayworks Boulevard",     city: "chicago",  kind: "arterial",  points: [{ x: -493, y: 6307 }, { x: -330, y: 6320 }, { x: -233, y: 6346 }] },
    { name: "North Shore Avenue",      city: "chicago",  kind: "arterial",  width: 22, points: [{ x: -196, y: 6482 }, { x: -150, y: 6502 }, { x: -53, y: 6416 }] },
    { name: "Knot Loop",               city: "chicago",  kind: "arterial",  width: 20, points: [{ x: -490, y: 5963 }, { x: -372, y: 5950 }, { x: -348, y: 6062 }, { x: -468, y: 6076 }, { x: -490, y: 5963 }] },

    // ---- streets: the ones you give as an address ----
    { name: "Harbor Street",           city: "chicago",  kind: "street",    points: [{ x: -142, y: 6075 }, { x: -150, y: 6072 }, { x: -69, y: 6099 }] },
    { name: "Winter Street",           city: "chicago",  kind: "street",    points: [{ x: -293, y: 6115 }, { x: -290, y: 6240 }, { x: -272, y: 6333 }] },
    { name: "Fenwick Street",          city: "chicago",  kind: "street",    points: [{ x: -417, y: 6117 }, { x: -330, y: 6128 }, { x: -267, y: 6152 }] },
    { name: "Mill Street",             city: "chicago",  kind: "street",    points: [{ x: -383, y: 6212 }, { x: -287, y: 6260 }] },
    { name: "Bellmont Street",         city: "chicago",  kind: "street",    points: [{ x: -416, y: 6205 }, { x: -392, y: 6212 }, { x: -318, y: 6215 }] },
    { name: "Ketterling Avenue",       city: "chicago",  kind: "street",    points: [{ x: -202, y: 6377 }, { x: -185, y: 6488 }] },   // meets Hoyt Street by The Causeway
    { name: "Hoyt Street",             city: "chicago",  kind: "street",    points: [{ x: -351, y: 6377 }, { x: -269, y: 6377 }, { x: -202, y: 6377 }] },
    { name: "Granary Row",             city: "chicago",  kind: "street",    points: [{ x: -454, y: 6448 }, { x: -390, y: 6502 }, { x: -194, y: 6511 }] },
    { name: "Dock Street",             city: "chicago",  kind: "street",    points: [{ x: -150, y: 6072 }, { x: -118, y: 6082 }, { x: -115, y: 6174 }] },
    { name: "Shoreline Lane",          city: "chicago",  kind: "street",    points: [{ x: -68, y: 6094 }, { x: -24, y: 6212 }, { x: -85, y: 6298 }] },

    // ---- back roads: unlit, unsigned, useful ----
    { name: "Tannery Alley",           city: "chicago",  kind: "backroad",  points: [{ x: -444, y: 6003 }, { x: -416, y: 6017 }] },
    { name: "Coal Chute Lane",         city: "chicago",  kind: "backroad",  points: [{ x: -506, y: 6120 }, { x: -510, y: 6155 }] },
    { name: "Old Pier Road",           city: "chicago",  kind: "backroad",  points: [{ x: -46, y: 5992 }, { x: -47, y: 5995 }] },
    { name: "Dunes Track",             city: "chicago",  kind: "backroad",  points: [{ x: -70, y: 6396 }, { x: 2, y: 6480 }, { x: 22, y: 6562 }] },
    // Cut St. was laid on the island map first (312-S35, after the map's own grid streets), so
    // its number is pinned: given here in sequence it would be 312-S11 and renumber 1st Street on.
    { name: "Cut St.",                 city: "chicago",  kind: "street",    code: "312-S35", points: [{ x: -200, y: 6338 }, { x: -206, y: 6260 }, { x: -204, y: 6177 }, { x: -211, y: 6086 }, { x: -209, y: 6004 }, { x: -202, y: 5930 }, { x: -199, y: 5880 }] },

    // ================= GeePee (770), the middle =================
    // ---- highways: the lines you cross the plate on ----
    { name: "Backroads Highway",       city: "geepee",   kind: "highway",   points: [{ x: 1690, y: 4930 }, { x: 1780, y: 4300 }, { x: 1900, y: 3800 }, { x: 1960, y: 3740 }] },

    // ---- arterials: how you get between districts ----
    { name: "County Line Road",        city: "geepee",   kind: "arterial",  points: [{ x: 1500, y: 4700 }, { x: 1700, y: 4762 }, { x: 1900, y: 4802 }] },
    { name: "Grain Elevator Road",     city: "geepee",   kind: "arterial",  width: 22, points: [{ x: 1615, y: 4538 }, { x: 1700, y: 4482 }, { x: 1758, y: 4453 }] },
    { name: "Harvest Flats Road",      city: "geepee",   kind: "arterial",  points: [{ x: 1620, y: 3840 }, { x: 1760, y: 3880 }, { x: 1879, y: 3887 }] },

    // ---- streets: the ones you give as an address ----
    { name: "Harvest Lane",            city: "geepee",   kind: "street",    width: 22, points: [{ x: 1877, y: 3693 }, { x: 1944, y: 3756 }] },
    { name: "Thresher Lane",           city: "geepee",   kind: "street",    points: [{ x: 1912, y: 3674 }, { x: 1960, y: 3740 }] },

    // ---- back roads: unlit, unsigned, useful ----
    { name: "Silo Track",              city: "geepee",   kind: "backroad",  points: [{ x: 1700, y: 4200 }, { x: 1762, y: 4122 }, { x: 1839, y: 4054 }] },
    { name: "Dust Road",               city: "geepee",   kind: "backroad",  points: [{ x: 1550, y: 4352 }, { x: 1652, y: 4302 }] },
    { name: "Old Mill Track",          city: "geepee",   kind: "backroad",  points: [{ x: 1430, y: 4600 }, { x: 1560, y: 4560 }, { x: 1655, y: 4490 }] },
    { name: "Creekbed Lane",           city: "geepee",   kind: "backroad",  points: [{ x: 1840, y: 4640 }, { x: 1960, y: 4540 }, { x: 2050, y: 4420 }] },
    { name: "Hollow Road",             city: "geepee",   kind: "backroad",  points: [{ x: 1500, y: 4100 }, { x: 1620, y: 4060 }, { x: 1740, y: 4000 }] },
    { name: "Fence Line Track",        city: "geepee",   kind: "backroad",  points: [{ x: 1808, y: 4183 }, { x: 2000, y: 4120 }, { x: 2080, y: 3990 }] },

    // ================= Atlanta (7101), the southern plate =================
    // ---- highways: the lines you cross the plate on ----
    { name: "The Connector",           city: "atlanta",  kind: "highway",   width: 36, points: [{ x: 281, y: -620 }, { x: 60, y: -1100 }, { x: 20, y: -1560 }, { x: -69, y: -1755 }] },
    { name: "The Perimeter",           city: "atlanta",  kind: "highway",   points: [{ x: 348, y: -536 }, { x: 420, y: -900 }, { x: 300, y: -1400 }, { x: 0, y: -1800 }, { x: -500, y: -1700 }, { x: -800, y: -1300 }, { x: -700, y: -800 }, { x: -300, y: -520 }, { x: 348, y: -536 }] },
    { name: "Westside Run",            city: "atlanta",  kind: "highway",   width: 30, points: [{ x: -528, y: -1207 }, { x: -1000, y: -1060 }, { x: -1600, y: -1030 }] },
    { name: "Red Clay Expressway",     city: "atlanta",  kind: "highway",   width: 30, points: [{ x: 429, y: -634 }, { x: 250, y: -762 }, { x: 60, y: -862 }, { x: -179, y: -946 }] },

    // ---- arterials: how you get between districts ----
    { name: "Peachline Road",          city: "atlanta",  kind: "arterial",  points: [{ x: 154, y: -917 }, { x: -270, y: -955 }, { x: -530, y: -1205 }] },
    { name: "Groveland Street",        city: "atlanta",  kind: "arterial",  width: 22, points: [{ x: -67, y: -1756 }, { x: 45, y: -1748 }, { x: 113, y: -1650 }] },
    { name: "Alder Avenue",            city: "atlanta",  kind: "arterial",  points: [{ x: -368, y: -887 }, { x: -250, y: -932 }, { x: -122, y: -940 }] },
    { name: "Southline Boulevard",     city: "atlanta",  kind: "arterial",  points: [{ x: -200, y: -1502 }, { x: 0, y: -1522 }, { x: 186, y: -1552 }] },
    { name: "Clay Street",             city: "atlanta",  kind: "arterial",  width: 22, points: [{ x: 301, y: -630 }, { x: 252, y: -762 }, { x: 155, y: -915 }] },
    { name: "Ridgeview Drive",         city: "atlanta",  kind: "arterial",  points: [{ x: -918, y: -868 }, { x: -760, y: -882 }, { x: -620, y: -962 }] },
    { name: "Mill Creek Road",         city: "atlanta",  kind: "arterial",  width: 22, points: [{ x: -1300, y: -1152 }, { x: -1050, y: -1102 }, { x: -812, y: -1120 }] },
    { name: "Sweetwater Avenue",       city: "atlanta",  kind: "arterial",  width: 22, points: [{ x: -56, y: -1730 }, { x: -62, y: -1620 }, { x: -22, y: -1520 }] },

    // ---- streets: the ones you give as an address ----
    { name: "Pecan Street",            city: "atlanta",  kind: "street",    points: [{ x: 149, y: -684 }, { x: 150, y: -760 }, { x: 179, y: -867 }] },
    { name: "Brickyard Street",        city: "atlanta",  kind: "street",    points: [{ x: 334, y: -705 }, { x: 240, y: -690 }, { x: 150, y: -683 }] },
    { name: "Stovall Street",          city: "atlanta",  kind: "street",    points: [{ x: -332, y: -1015 }, { x: -220, y: -1060 }, { x: -130, y: -1082 }] },
    { name: "Hollis Avenue",           city: "atlanta",  kind: "street",    points: [{ x: -348, y: -878 }, { x: -340, y: -950 }, { x: -315, y: -1025 }] },
    { name: "Fairline Street",         city: "atlanta",  kind: "street",    points: [{ x: -140, y: -1402 }, { x: -40, y: -1422 }, { x: 31, y: -1439 }] },
    { name: "Cotton Row",              city: "atlanta",  kind: "street",    points: [{ x: -222, y: -1620 }, { x: -120, y: -1602 }, { x: -10, y: -1625 }] },
    { name: "Bellwood Street",         city: "atlanta",  kind: "street",    points: [{ x: -965, y: -1108 }, { x: -960, y: -980 }, { x: -905, y: -864 }] },
    { name: "Terrace Street",          city: "atlanta",  kind: "street",    points: [{ x: -1243, y: -1048 }, { x: -1120, y: -940 }, { x: -942, y: -932 }] },
    { name: "Quarry Street",           city: "atlanta",  kind: "street",    points: [{ x: 70, y: -1707 }, { x: 110, y: -1620 }, { x: 139, y: -1544 }] },
    // Highfield, by the east towers: Primrose runs south off Highfield Park Drive and meets
    // Crystal Lake Drive at its east end. Placeholders like the rest: walk them (docs/WALK-LIST.md).
    { name: "Primrose Street",         city: "atlanta",  kind: "street",    points: [{ x: 262, y: -1180 }, { x: 262, y: -1300 }] },
    { name: "Crystal Lake Drive",      city: "atlanta",  kind: "street",    points: [{ x: 120, y: -1305 }, { x: 262, y: -1300 }] },
    { name: "Dunwood Street",          city: "atlanta",  kind: "street",    points: [{ x: -620, y: -1320 }, { x: -520, y: -1380 }, { x: -420, y: -1420 }] },

    // ---- back roads: unlit, unsigned, useful ----
    { name: "Kudzu Lane",              city: "atlanta",  kind: "backroad",  points: [{ x: -678, y: -1463 }, { x: -620, y: -1540 }, { x: -572, y: -1604 }] },
    { name: "Red Clay Track",          city: "atlanta",  kind: "backroad",  points: [{ x: 299, y: -502 }, { x: 420, y: -560 }, { x: 432, y: -643 }] },
    { name: "Pumphouse Road",          city: "atlanta",  kind: "backroad",  points: [{ x: -1400, y: -1240 }, { x: -1300, y: -1300 }, { x: -1200, y: -1330 }] },
    { name: "Switchyard Lane",         city: "atlanta",  kind: "backroad",  points: [{ x: 200, y: -1240 }, { x: 260, y: -1300 }, { x: 305, y: -1381 }] },

    // ================= Halfway (1017), the small town between Atlanta and GeePee =================
    // Added at the END so every existing road keeps its number. Laid out on the atlas first
    // (docs/atlas.html); placeholders like the rest: walk them (docs/WALK-LIST.md).
    { name: "Main Street",             city: "atlanta",  kind: "arterial",  points: [{ x: 600, y: 1170 }, { x: 600, y: 1830 }] },
    { name: "Depot Street",            city: "atlanta",  kind: "street",    points: [{ x: 400, y: 1600 }, { x: 820, y: 1600 }] },
    { name: "Gristmill Street",        city: "atlanta",  kind: "street",    points: [{ x: 420, y: 1450 }, { x: 790, y: 1450 }] },
    { name: "Church Street",           city: "atlanta",  kind: "street",    points: [{ x: 470, y: 1310 }, { x: 720, y: 1310 }] },
    { name: "Gin House Row",           city: "atlanta",  kind: "street",    points: [{ x: 470, y: 1310 }, { x: 470, y: 1600 }] },
    { name: "Sorghum Lane",            city: "atlanta",  kind: "street",    points: [{ x: 730, y: 1450 }, { x: 730, y: 1700 }] },
    { name: "Old Rail Bed",            city: "atlanta",  kind: "backroad",  points: [{ x: 380, y: 1690 }, { x: 600, y: 1700 }, { x: 860, y: 1720 }] },
];

// Resolve the kind default once, so everything downstream — roadAt, the Lua
// generator, the map — reads the same width.
const ROADS = ROAD_DEFS.map((r) => ({
    ...r,
    kind: r.kind || "street",
    width: r.width ?? ROAD_WIDTH[r.kind || "street"],
}));

// Every road's number: area code, a letter for its kind, its place in that city's
// list of that kind — 1017-H1 is the Connector, 1017-S10 Primrose Street. Given out
// here once, so the game, the Lua layer, /streets and every map print the same code.
// Adding a road at the END of its city's kind keeps the others' numbers.
// A road given its own code (pinned) keeps it and doesn't take a place in the sequence.
const CITY_CODE = { chicago: "312", geepee: "770", atlanta: "1017" };
const KIND_LETTER = { highway: "H", arterial: "A", street: "S", backroad: "B" };
{
    const seen = {};
    for (const r of ROADS) {
        if (r.code) { r.pinned = true; continue; }
        const key = `${r.city}/${r.kind}`;
        seen[key] = (seen[key] || 0) + 1;
        r.code = `${CITY_CODE[r.city]}-${KIND_LETTER[r.kind]}${seen[key]}`;
    }
}

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

// /streets: every road in one city, grouped by kind, biggest first.
const STREET_KINDS = [["highway", "Highways"], ["arterial", "Avenues"], ["street", "Streets"], ["backroad", "Backroads"]];
function listStreets(city) {
    const roads = ROADS.filter((r) => r.city === city);
    const lines = [`${CITY_CODE[city]} ${cities.CITIES[city].label}: ${roads.length} roads`];
    for (const [kind, label] of STREET_KINDS) {
        const names = roads.filter((r) => r.kind === kind).map((r) => `${r.name} (${r.code})`);
        if (names.length) lines.push(`${label}: ${names.join(", ")}`);
    }
    return lines.join("\n");
}

// "atlanta", "1017", "ATL" ... -> "atlanta"; null if it isn't a city.
function cityNamed(text) {
    const t = String(text || "").toLowerCase();
    for (const [city, code] of Object.entries(CITY_CODE)) {
        if (t === city || t === code || t === cities.CITIES[city].label.toLowerCase()) return city;
    }
    return null;
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

module.exports = { ZONES, ROADS, ROAD_WIDTH, CITY_CODE, KIND_LETTER, listStreets, cityNamed, distanceToSegment, roadAt, zoneAt, placeAt, describe, label, updateZone, listFor };
