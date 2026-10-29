// ============================================================
// impound.js — where cars go when they're taken off you
//
// Three ways a car ends up here: police take it, it's wrecked badly
// enough that it gets towed, or the owner logs out with it on the
// street. Before this, logging out just made a car vanish and reappear
// free — the one place in the whole economy where carelessness had no
// cost.
//
// Getting it back costs money and a trip to the lot, and it comes out
// repaired but with the tank as empty as you left it. Towing is not a
// free refuel.
//
// Prices and the lot coordinates are placeholders.
// ============================================================

const economy = require("./economy");
const fuel = require("./fuel");
const { distance } = require("./cities");

const LOT_RANGE = 12.0;
const FEES = { police: 2500, wrecked: 1200, abandoned: 600 };
const REASON_TEXT = {
    police: "taken by the Sheriff's Office",
    wrecked: "towed in wrecked",
    abandoned: "left on the street",
};

const LOTS = [
    { label: "Chicago Impound", city: "chicago", pos: { x: -380, y: 6150, z: 31.4 } },
    { label: "Atlanta Impound", city: "atlanta", pos: { x: 390, y: -1630, z: 29.3 } },
];

function lotNear(pos) {
    if (!pos) return null;
    return LOTS.find((l) => distance(pos, l.pos) <= LOT_RANGE) || null;
}

function createImpound() {
    const held = new Map(); // plate -> { owner, model, reason, fee, at }

    function isHeld(plate) {
        return held.has(plate);
    }

    function take(plate, car, ownerName, reason, now) {
        if (held.has(plate)) return false;
        held.set(plate, { owner: ownerName, model: car.model, reason, fee: FEES[reason] ?? FEES.abandoned, at: now });
        return true;
    }

    function listFor(name) {
        const mine = [...held].filter(([, h]) => h.owner === name);
        if (mine.length === 0) return "Nothing of yours is impounded.";
        return ["--- Impounded ---", ...mine.map(([plate, h]) =>
            `${plate} — ${REASON_TEXT[h.reason]}, ${economy.money(h.fee)} to release`)].join("\n");
    }

    // Releasing repairs the car. It does NOT refuel it.
    function release(c, plate, findOwned) {
        const lot = lotNear(c.pos);
        if (!lot) return { ok: false, msg: "You're not at an impound lot" };

        const wanted = String(plate || "").toUpperCase();
        const entry = held.get(wanted);
        if (!entry) return { ok: false, msg: `${wanted || "That plate"} isn't in the lot` };
        if (entry.owner !== c.name) return { ok: false, msg: "That's not yours" };

        const paid = economy.removeMoney(c, "bank", entry.fee);
        if (!paid.ok) return { ok: false, msg: `Releasing ${wanted} costs ${economy.money(entry.fee)} — ${paid.msg}` };

        const car = findOwned(c, wanted);
        if (car) {
            car.engine = fuel.MAX_HEALTH;
            car.body = fuel.MAX_HEALTH;
        }
        held.delete(wanted);
        return { ok: true, msg: `Released ${wanted} from ${lot.label} for ${economy.money(entry.fee)}. It's been repaired, not refuelled.` };
    }

    function exportAll() {
        return Object.fromEntries(held);
    }
    function importAll(saved) {
        for (const [plate, entry] of Object.entries(saved || {})) held.set(plate, { ...entry });
    }

    return { isHeld, take, listFor, release, exportAll, importAll };
}

module.exports = { LOT_RANGE, FEES, REASON_TEXT, LOTS, lotNear, createImpound };
