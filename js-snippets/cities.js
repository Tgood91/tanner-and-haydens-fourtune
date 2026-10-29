// ============================================================
// cities.js — Atlanta -> GeePee -> Chicago, driving north
// Your world is a config layer on the stock map: each city is a
// band of the map by how far north (y) you are.
//
// Spawn points live in spawns.js. BOTH borders are placeholders —
// drive the route and move the lines to where the announcements fire.
// ============================================================

const CITIES = {
    atlanta: { label: "Atlanta" },
    geepee:  { label: "GeePee" },
    chicago: { label: "Chicago" },
};

const CHICAGO_STARTS_AT_Y = 5500; // placeholder border
const GEEPEE_STARTS_AT_Y = 3000;  // placeholder border

function cityAt(pos) {
    if (pos.y >= CHICAGO_STARTS_AT_Y) return "chicago";
    if (pos.y >= GEEPEE_STARTS_AT_Y) return "geepee";
    return "atlanta";
}

// Returns the announcement when the city changes, otherwise null.
function updateCity(c, pos) {
    const city = cityAt(pos);
    if (city === c.city) return null;
    const first = c.city === null;
    c.city = city;
    return first ? null : `Welcome to ${CITIES[city].label}`;
}

function listCities() {
    return Object.values(CITIES).map((city) => city.label).join(" -> ");
}

function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

module.exports = { CITIES, cityAt, updateCity, listCities, distance };
