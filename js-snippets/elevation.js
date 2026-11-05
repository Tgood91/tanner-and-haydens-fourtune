// ============================================================
// elevation.js — ground height for the world vocabulary
//
// places.js answers WHERE (road, district, city). This answers
// HOW HIGH. Same { x, y } positions, one more fact about them:
//   heightAt(pos)        -> estimated ground height, in units
//   bandAt(pos)          -> "lowland", "upland", "the summit country"...
//   describeHeight(pos)  -> "upland, 132 up"
//   roadProfile(road)    -> { min, max, climb, descent, highPoint }
//   zoneHeight(zone)     -> heightAt(zone.center)
//   hasSnow(pos)         -> above the snowline or not
//
// THE MODEL IS AN APPROXIMATION. heightAt is a smooth analytic
// surface tuned to the stock map's terrain — a big massif for
// Mt. Fuugee, a shoulder of wilderness hills west of it, the
// San Chianski rise east of GeePee, a low rise under east
// Atlanta, flat basins everywhere else. It is right in shape
// and roughly right in number, but it is NOT surveyed data.
// Before anything depends on an exact height, stand on the
// spot in CodeWalker and replace the number.
// ============================================================

const SEA_LEVEL = 0;
const SNOWLINE = 550; // above this, Mt. Fuugee carries snow

function gauss(x, y, cx, cy, height, sigma) {
    const d2 = (x - cx) ** 2 + (y - cy) ** 2;
    return height * Math.exp(-d2 / (sigma * sigma));
}

// Estimated ground height at a position, in game units (≈ metres).
function heightAt(pos) {
    const { x, y } = pos;
    let h = 18; // the world's base bench — most settled ground sits near it
    h += gauss(x, y, 500, 5605, 780, 430);   // Mt. Fuugee, the massif
    h += gauss(x, y, -700, 5600, 200, 430);  // the wilderness shoulder west of it
    h += gauss(x, y, 2100, 4900, 160, 700);  // the San Chianski rise, east of GeePee
    h += gauss(x, y, 1200, -900, 55, 650);   // the low rise under east Atlanta
    // gentle rolling country, so nowhere is perfectly flat
    h += 9 * Math.sin(x * 0.0016 + 1.7) * Math.cos(y * 0.0013 - 0.6);
    h += 5 * Math.sin(x * 0.004 - y * 0.003);
    return Math.max(1, Math.round(h));
}

// Reference heights, sampled from heightAt at each place's centre
// and rounded — the table and the model agree by construction.
// Approximate: see the header. The summit is the anchor point:
// the stock map's peak, just under 800 up.
const HEIGHTS = [
    { name: "Mt. Fuugee summit",  x: 500,   y: 5605, z: 0, note: "the peak; snow above 550" },
    { name: "The Knot",           x: -430,  y: 6020, z: 0, note: "Chicago docks bench" },
    { name: "Midway",             x: -250,  y: 6190, z: 0, note: "Chicago town level" },
    { name: "Northline",          x: -110,  y: 6400, z: 0, note: "Chicago, forest edge" },
    { name: "The Shoreline",      x: -60,   y: 6150, z: 0, note: "Chicago lakeshore" },
    { name: "Northgate",          x: 225,   y: 3569, z: 0, note: "the desert flats below the pass" },
    { name: "The Backroads",      x: 1760,  y: 4400, z: 0, note: "GeePee bluff country" },
    { name: "Harvest Flats",      x: 1850,  y: 3720, z: 0, note: "GeePee farmland, flat" },
    { name: "Crosstown",          x: -116,  y: 2034, z: 0, note: "mid-map plain" },
    { name: "Millbrooke",         x: -1182, y: 1437, z: 0, note: "west country" },
    { name: "Stellarton",         x: 907,   y: 1181, z: 0, note: "east country" },
    { name: "Londonderry",        x: -543,  y: 158,  z: 0, note: "Atlanta's northern satellite" },
    { name: "Red Clay",           x: 230,   y: -700, z: 0, note: "Atlanta basin" },
    { name: "Alder Heights",      x: -260,  y: -950, z: 0, note: "Atlanta basin" },
    { name: "The Westside",       x: -1100, y: -1100, z: 0, note: "Atlanta, coastal side" },
    { name: "Highfield Park",     x: 950,   y: -1050, z: 0, note: "on the east Atlanta rise" },
    { name: "Southline",          x: 10,    y: -1550, z: 0, note: "Atlanta's low south" },
];
// Fill the table from the model so the two never disagree.
for (const h of HEIGHTS) if (!h.z) h.z = heightAt(h);

// What kind of high ground a position is.
function bandAt(pos) {
    const z = heightAt(pos);
    if (z < 3) return "shoreline";
    if (z < 20) return "coastal flat";
    if (z < 60) return "lowland";
    if (z < 150) return "upland";
    if (z < 350) return "highland";
    if (z < SNOWLINE) return "mountain slopes";
    return "the summit country";
}

// "upland, 132 up"
function describeHeight(pos) {
    return `${bandAt(pos)}, ${heightAt(pos)} up`;
}

function hasSnow(pos) {
    return heightAt(pos) >= SNOWLINE;
}

function zoneHeight(zone) {
    return heightAt(zone.center);
}

// Walk a road (any { points: [{x, y}, ...] } — a places.js road
// works as-is) and report its vertical shape. Samples every
// ~50 units along the line.
function roadProfile(road) {
    let min = Infinity, max = -Infinity, climb = 0, descent = 0;
    let prev = null, highPoint = null;
    for (let i = 0; i < road.points.length - 1; i++) {
        const a = road.points[i], b = road.points[i + 1];
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        const steps = Math.max(1, Math.round(len / 50));
        for (let s = (i === 0 ? 0 : 1); s <= steps; s++) {
            const t = s / steps;
            const p = { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
            const z = heightAt(p);
            if (z < min) min = z;
            if (z > max) { max = z; highPoint = { ...p, z }; }
            if (prev !== null) {
                if (z > prev) climb += z - prev; else descent += prev - z;
            }
            prev = z;
        }
    }
    return { min, max, climb, descent, highPoint };
}

module.exports = { SEA_LEVEL, SNOWLINE, HEIGHTS, heightAt, bandAt, describeHeight, hasSnow, zoneHeight, roadProfile };
