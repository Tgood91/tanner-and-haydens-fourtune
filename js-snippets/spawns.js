// ============================================================
// spawns.js — where you appear: first login, coming back, and
// walking out of jail
//
// Each city has a few spawn points so a server full of people
// doesn't all pop out of the same spot.
//
// Login:   jailed -> the cell | been here before -> where you logged
//          out | brand new -> a spawn point in DEFAULT_CITY
// Release: you walk out in a DIFFERENT city from the one you were
//          arrested in (RELEASE_CITY) — far from your crew, and you
//          have to drive back. Change the table to change the route.
//
// Chicago's first spawn is the one from your smoke test; every other
// coord is a placeholder near a stock landmark — walk them and tune.
// ============================================================

const cities = require("./cities");

const DEFAULT_CITY = "atlanta";

const SPAWNS = {
    atlanta: [
        { label: "Alder Street",      pos: { x: -269.4, y: -955.3,  z: 31.2 }, heading: 205.0 },
        { label: "Lantern Square",    pos: { x: 195.2,  y: -933.8,  z: 30.7 }, heading: 144.0 },
        { label: "Delmar Pier",   pos: { x: -1606.9, y: -1029.6, z: 13.0 }, heading: 50.0 },
    ],
    geepee: [
        { label: "Harvestside",        pos: { x: 1693.0, y: 4823.0, z: 42.0 }, heading: 95.0 },
        { label: "Dust Road",     pos: { x: 1961.0, y: 3740.0, z: 32.3 }, heading: 300.0 },
    ],
    chicago: [
        { label: "Chicago Main",     pos: { x: -450.0, y: 6015.0, z: 33.0 }, heading: 315.0 },
        { label: "Palisade Boulevard", pos: { x: -125.0, y: 6380.0, z: 31.5 }, heading: 45.0 },
    ],
};

// Arrested in (key) -> released in (value). Every city must map somewhere else.
const RELEASE_CITY = {
    atlanta: "chicago",
    geepee: "atlanta",
    chicago: "geepee",
};

// Catch a bad table the moment the server starts
for (const [from, to] of Object.entries(RELEASE_CITY)) {
    if (from === to) throw new Error(`spawns.js: ${from} releases into itself`);
    if (!SPAWNS[to]) throw new Error(`spawns.js: ${from} releases into unknown city "${to}"`);
}
for (const city of Object.keys(cities.CITIES)) {
    if (!SPAWNS[city]?.length) throw new Error(`spawns.js: ${city} has no spawn points`);
    if (!RELEASE_CITY[city]) throw new Error(`spawns.js: ${city} has no release city`);
}

// rng is only passed in by tests, to make the pick predictable
function pickSpawn(city, rng = Math.random) {
    const list = SPAWNS[city] || SPAWNS[DEFAULT_CITY];
    const spot = list[Math.floor(rng() * list.length) % list.length];
    return { city: SPAWNS[city] ? city : DEFAULT_CITY, label: spot.label, pos: { ...spot.pos }, heading: spot.heading };
}

function releaseSpawn(arrestedIn, rng) {
    const city = RELEASE_CITY[arrestedIn] || RELEASE_CITY[DEFAULT_CITY];
    return pickSpawn(city, rng);
}

// jailCell is passed in so this file doesn't need police.js
function loginSpawn(c, jailCell, rng) {
    if (c.jailMinutes > 0) return { city: null, label: "Jail", pos: { ...jailCell }, heading: 0, reason: "jail" };
    if (c.pos) return { city: cities.cityAt(c.pos), label: "Where you left off", pos: { ...c.pos }, heading: 0, reason: "return" };
    return { ...pickSpawn(DEFAULT_CITY, rng), reason: "new" };
}

module.exports = { DEFAULT_CITY, SPAWNS, RELEASE_CITY, pickSpawn, releaseSpawn, loginSpawn };
