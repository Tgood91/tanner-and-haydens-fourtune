// ============================================================
// drugs.js — pick it, cook it, move it
//
// Three steps, each somewhere different, so the money comes from
// driving around rather than standing still:
//
//   1. /harvest at a supply spot out in the sticks  -> raw
//   2. /process at your crew's base                 -> raw into packs
//   3. /deal in a district                          -> dirty cash
//
// Processing needs a crew base on purpose. It is the thing that makes
// a crew worth founding beyond the tag, and it means the whole loop
// cannot be run alone. If you want solo labs, add fixed lab spots to
// the base check in canProcess — one line.
//
// Three things push the price around, so WHERE and WHEN you sell
// matters more than how much you carry:
//   - each district has its own demand
//   - selling on your crew's own turf pays a bonus
//   - a district you have just worked goes cold for a while
//
// Every deal risks the police being told. Daylight is riskier than
// dark, which is the other half of the night bonus robbery already
// has. Product is carried, so /search and /seize take it like
// anything else.
//
// Prices, odds and spots are placeholders.
// ============================================================

const inventory = require("./inventory");
const economy = require("./economy");
const { distance } = require("./cities");

const HARVEST_RANGE = 6.0;
const HARVEST_COOLDOWN_MIN = 10;   // per player, per spot
const PROCESS_RANGE = 10.0;        // same reach as the crew stash
const DEAL_COOLDOWN_MIN = 20;      // a district goes cold after you work it
const TURF_BONUS = 1.4;            // selling on your own turf
const DAYLIGHT_HEAT = 1.6;         // getting seen is likelier in the day

const DRUGS = {
    greenpack: { label: "Green Pack", raw: "plantleaf", perBatch: 3, base: 140, heat: 0.15 },
    whitepack: { label: "White Pack", raw: "rawpaste", perBatch: 2, base: 320, heat: 0.35 },
};

// Out in the sticks, well away from the cities — walk them and tune
const SUPPLY_SPOTS = [
    { label: "Backroads Field", raw: "plantleaf", pos: { x: 1780, y: 4420, z: 40.0 } },
    { label: "Harvest Barn",    raw: "plantleaf", pos: { x: 1905, y: 3790, z: 32.4 } },
    { label: "Dust Road Shack", raw: "rawpaste",  pos: { x: 1690, y: 4790, z: 42.0 } },
];

// How badly each district wants it. Quiet places pay less.
const DEMAND = {
    "The Knot": 1.25, "Midway": 1.0, "Northline": 0.9, "The Shoreline": 1.1,
    "Red Clay": 1.2, "Alder Heights": 1.0, "Southline": 1.15, "The Westside": 0.85,
    "Harvest Flats": 0.7, "The Backroads": 0.6, "Halfway": 0.65,
};

function isProduct(item) {
    return Object.prototype.hasOwnProperty.call(DRUGS, item);
}

function findSpot(pos) {
    if (!pos) return null;
    return SUPPLY_SPOTS.find((s) => distance(pos, s.pos) <= HARVEST_RANGE) || null;
}

function createDrugs(rng = Math.random) {
    const picked = new Map();  // `${id}:${spot}` -> time they can pick there again
    const worked = new Map();  // `${id}:${district}` -> time that district warms up again

    function minutesLeft(until, now) {
        return until && until > now ? Math.ceil((until - now) / 60000) : 0;
    }

    function harvest(c, now) {
        const spot = findSpot(c.pos);
        if (!spot) return { ok: false, msg: "Nothing growing here" };

        const key = `${c.id}:${spot.label}`;
        const wait = minutesLeft(picked.get(key), now);
        if (wait) return { ok: false, msg: `${spot.label} is picked clean — ${wait} min` };

        const count = 2 + Math.floor(rng() * 3); // 2 to 4
        const added = inventory.addItem(c.inventory, spot.raw, count);
        if (!added.ok) return added;

        picked.set(key, now + HARVEST_COOLDOWN_MIN * 60000);
        return { ok: true, msg: `Picked ${count}x ${inventory.ITEMS[spot.raw].label} at ${spot.label}` };
    }

    // base = the crew's base position, or null if they have no crew
    function canProcess(c, base) {
        if (!c.gang || !base) return { ok: false, msg: "You need a crew base to cook this" };
        if (!c.pos || distance(c.pos, base) > PROCESS_RANGE) {
            return { ok: false, msg: `You're not at the [${c.gang.tag}] base` };
        }
        return { ok: true, msg: "" };
    }

    function process(c, base, kindText) {
        const kind = String(kindText || "").toLowerCase();
        const drug = DRUGS[kind];
        if (!drug) return { ok: false, msg: `Cook what? ${Object.keys(DRUGS).join(", ")}` };

        const where = canProcess(c, base);
        if (!where.ok) return where;

        const have = c.inventory[drug.raw] || 0;
        if (have < drug.perBatch) {
            return { ok: false, msg: `Need ${drug.perBatch}x ${inventory.ITEMS[drug.raw].label}, you have ${have}` };
        }

        const batches = Math.floor(have / drug.perBatch);
        const fits = inventory.canAddItem(c.inventory, kind, batches);
        if (!fits.ok) return fits;

        inventory.removeItem(c.inventory, drug.raw, batches * drug.perBatch);
        inventory.addItem(c.inventory, kind, batches);
        return { ok: true, msg: `Cooked ${batches}x ${drug.label}` };
    }

    // district = the zone they're standing in, onTurf = their crew holds it
    function deal(c, kindText, district, onTurf, atNight, now) {
        const kind = String(kindText || "").toLowerCase();
        const drug = DRUGS[kind];
        if (!drug) return { ok: false, msg: `Sell what? ${Object.keys(DRUGS).join(", ")}` };
        if (!district) return { ok: false, msg: "Nobody's buying out here — get into a district" };
        if (!c.inventory[kind]) return { ok: false, msg: `You have no ${drug.label}` };

        const key = `${c.id}:${district}`;
        const wait = minutesLeft(worked.get(key), now);
        if (wait) return { ok: false, msg: `${district} is cold on you — ${wait} min` };

        const demand = DEMAND[district] ?? 1.0;
        const swing = 0.85 + rng() * 0.3;         // every buyer haggles a bit
        let price = drug.base * demand * swing;
        if (onTurf) price *= TURF_BONUS;
        const paid = Math.round(price);

        inventory.removeItem(c.inventory, kind, 1);
        c.cash += paid;
        worked.set(key, now + DEAL_COOLDOWN_MIN * 60000);

        const heat = drug.heat * (atNight ? 1 : DAYLIGHT_HEAT);
        const seen = rng() < heat;

        const note = onTurf ? " on your own turf" : "";
        return {
            ok: true,
            seen,
            district,
            msg: `Sold a ${drug.label} in ${district}${note} for ${economy.money(paid)}.`
                 + (seen ? " Someone was watching." : ""),
        };
    }

    return { harvest, process, deal, canProcess };
}

module.exports = {
    HARVEST_RANGE, HARVEST_COOLDOWN_MIN, PROCESS_RANGE, DEAL_COOLDOWN_MIN,
    TURF_BONUS, DAYLIGHT_HEAT, DRUGS, SUPPLY_SPOTS, DEMAND,
    isProduct, findSpot, createDrugs,
};
