// ============================================================
// vehicles.js — car catalog + buying, in JavaScript
// Mirrors the Lua vehicles resource: prices and display names live
// in ONE place (in Lua that's catalog.lua — if this file and
// catalog.lua ever disagree, catalog.lua wins).
//
// Only the Sultan's $120,000 comes from your notes. Every other
// price here is a placeholder — copy the real ones from catalog.lua.
// ============================================================

const CATALOG = {
    sultan:   { name: "Karin Sultan",       price: 120000 },
    zentorno: { name: "Pegassi Zentorno",   price: 725000 }, // placeholder price
    // Emergency vehicles: job-locked, never sold
    police:   { name: "Police Cruiser",     price: null, job: "police" },
    ambulance:{ name: "Ambulance",          price: null, job: "ems" },
};

function listCars() {
    return Object.entries(CATALOG)
        .filter(([, car]) => car.price !== null)
        .map(([model, car]) => `${car.name} (${model}) — $${car.price.toLocaleString("en-US")}`)
        .join("\n");
}

// Plates are how trunks.js tells two Sultans apart.
const usedPlates = new Set();
function newPlate() {
    let plate;
    do {
        plate = "FT" + String(Math.floor(Math.random() * 1000000)).padStart(6, "0");
    } while (usedPlates.has(plate));
    usedPlates.add(plate);
    return plate;
}

// Call when loading saved garages so new plates never collide with old ones.
function reservePlates(garage) {
    for (const car of garage) usedPlates.add(car.plate);
}

// character = { bank, garage: [{ model, plate }] }
function buyVehicle(character, model) {
    const car = CATALOG[model];
    if (!car) return { ok: false, msg: `No car called ${model}` };
    if (car.price === null) return { ok: false, msg: `${car.name} isn't for sale` };
    if (character.bank < car.price) {
        return { ok: false, msg: `Not enough in the bank — need $${car.price}, have $${character.bank}` };
    }

    character.bank -= car.price;
    const plate = newPlate();
    character.garage.push({ model, plate });
    return { ok: true, msg: `Bought a ${car.name} (plate ${plate}) for $${car.price}. Bank: $${character.bank}`, plate };
}

function listGarage(character) {
    if (character.garage.length === 0) return "Your garage is empty.";
    return character.garage
        .map((car) => `${CATALOG[car.model]?.name || car.model} — plate ${car.plate}`)
        .join("\n");
}

// Only cars you own come out of the garage. (/veh previews are free and
// saved nowhere — that's a separate glitch-check tool, not this function.)
function findOwned(character, modelOrPlate) {
    const key = (modelOrPlate || "").toUpperCase();
    return character.garage.find((car) => car.plate === key || car.model.toUpperCase() === key) || null;
}

function canSpawn(character, modelOrPlate) {
    return findOwned(character, modelOrPlate) !== null;
}

module.exports = { CATALOG, listCars, buyVehicle, listGarage, findOwned, canSpawn, reservePlates };
