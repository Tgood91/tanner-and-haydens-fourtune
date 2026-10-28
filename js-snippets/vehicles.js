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

// character = { bank, garage: [] }
function buyVehicle(character, model) {
    const car = CATALOG[model];
    if (!car) return { ok: false, msg: `No car called ${model}` };
    if (car.price === null) return { ok: false, msg: `${car.name} isn't for sale` };
    if (character.bank < car.price) {
        return { ok: false, msg: `Not enough in the bank — need $${car.price}, have $${character.bank}` };
    }

    character.bank -= car.price;
    character.garage.push(model);
    return { ok: true, msg: `Bought a ${car.name} for $${car.price}. Bank: $${character.bank}` };
}

// Only cars you own come out of the garage. (/veh previews are free and
// saved nowhere — that's a separate glitch-check tool, not this function.)
function canSpawn(character, model) {
    return character.garage.includes(model);
}

module.exports = { CATALOG, listCars, buyVehicle, canSpawn };
