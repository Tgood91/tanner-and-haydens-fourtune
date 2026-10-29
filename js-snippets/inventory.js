// ============================================================
// inventory.js — server-authoritative inventory, in JavaScript
// Same rules as the Lua inventory resource in your notes:
//   - 12 starter items, each with a weight, 30 kg carry limit
//   - add / remove / use / drop are all validated HERE (the server)
//   - clients only send requests; a modded client can't conjure items
//   - using consumes exactly 1, and only after validation
//   - new characters get water x2, sandwich x1, phone x1 — only if
//     they've NEVER had an inventory saved (emptied stays empty)
//
// Plain JS, no game functions — runs in Node and in a FiveM JS resource.
// Weights below are placeholders: tune them to match your Lua items.
// ============================================================

const MAX_WEIGHT = 30.0; // kg

// usable: can /useitem it. onUse: returns an error string to refuse, or nothing.
// hunger / thirst / heal: what using it restores (needs.js applies these).
const ITEMS = {
    water:     { label: "Water",      weight: 0.5, usable: true, thirst: 40 },
    sandwich:  { label: "Sandwich",   weight: 0.3, usable: true, hunger: 40 },
    coffee:    { label: "Coffee",     weight: 0.3, usable: true, thirst: 20 },
    donut:     { label: "Donut",      weight: 0.2, usable: true, hunger: 20 },
    bandage:   { label: "Bandage",    weight: 0.1, usable: true, heal: 15,
                 onUse: (player) => (player.health >= player.maxHealth ? "You're already at full health" : null) },
    medkit:    { label: "Medkit",     weight: 1.0, usable: true, heal: 60,
                 onUse: (player) => (player.health >= player.maxHealth ? "You're already at full health" : null) },
    phone:     { label: "Phone",      weight: 0.2, usable: false },
    radio:     { label: "Radio",      weight: 0.4, usable: false },
    repairkit: { label: "Repair Kit", weight: 2.5, usable: true },
    toolbox:   { label: "Toolbox",    weight: 4.0, usable: false },
    lockpick:  { label: "Lockpick",   weight: 0.1, usable: true },
    fuelcan:   { label: "Fuel Can",   weight: 5.0, usable: true },

    // From your smoke-test list
    halfhalf:    { label: "Half & Half",     weight: 0.5, usable: true, thirst: 30 },
    // Weapons: not "usable" — you /equip them. Which ammo each takes lives in ammo.js.
    // Never sold in shops; console giveitem only, for now.
    glizzy:       { label: "Glizzy",         weight: 1.0, usable: false },
    blackdraco:   { label: "Black Draco",    weight: 3.5, usable: false },
    uzi:          { label: "Micro SMG",      weight: 2.5, usable: false },
    pumpshotgun:  { label: "Pump Shotgun",   weight: 3.5, usable: false },
    huntingrifle: { label: "Hunting Rifle",  weight: 5.0, usable: false },

    // Ammo boxes: weight is for the whole box (close to real-world boxes).
    // Rounds per box live in ammo.js; prices live in shops.js.
    ammo_9mm:   { label: "9mm box (50)",          weight: 0.6,  usable: false },
    ammo_45acp: { label: ".45 ACP box (50)",      weight: 1.1,  usable: false },
    ammo_762:   { label: "7.62x39 box (30)",      weight: 0.55, usable: false },
    ammo_12ga:  { label: "12 gauge shells (25)",  weight: 1.1,  usable: false },
    ammo_308:   { label: ".308 box (20)",         weight: 0.55, usable: false },
};

const STARTER_ITEMS = { water: 2, sandwich: 1, phone: 1 };

// ------------------------------------------------------------
// Reading — never changes anything
// ------------------------------------------------------------
function getWeight(inv) {
    let total = 0;
    for (const [item, count] of Object.entries(inv)) {
        total += (ITEMS[item]?.weight || 0) * count;
    }
    return Math.round(total * 100) / 100; // avoid 29.999999 float noise
}

function listInventory(inv) {
    const lines = [];
    for (const [item, count] of Object.entries(inv)) {
        if (count > 0) lines.push(`${ITEMS[item]?.label || item} x${count}`);
    }
    lines.push(`Weight: ${getWeight(inv)} / ${MAX_WEIGHT} kg`);
    return lines.join("\n");
}

// ------------------------------------------------------------
// Acting — every function checks first, then changes, then reports.
// Each returns { ok, msg } so the caller can tell the player.
// ------------------------------------------------------------
function isValidCount(count) {
    return Number.isInteger(count) && count > 0;
}

// Check-only: would this fit? Changes nothing. maxWeight lets trunks reuse it.
function canAddItem(inv, item, count = 1, maxWeight = MAX_WEIGHT) {
    if (!ITEMS[item]) return { ok: false, msg: `Unknown item: ${item}` };
    if (!isValidCount(count)) return { ok: false, msg: "Count must be a whole number above 0" };

    const newWeight = Math.round((getWeight(inv) + ITEMS[item].weight * count) * 100) / 100;
    // exactly the limit is allowed, anything over is refused
    if (newWeight > maxWeight) {
        return { ok: false, msg: `Too heavy — that would be ${newWeight.toFixed(2)} / ${maxWeight} kg` };
    }
    return { ok: true, msg: "" };
}

function addItem(inv, item, count = 1, maxWeight = MAX_WEIGHT) {
    const check = canAddItem(inv, item, count, maxWeight);
    if (!check.ok) return check;

    inv[item] = (inv[item] || 0) + count;
    return { ok: true, msg: `Received ${count}x ${ITEMS[item].label}` };
}

function removeItem(inv, item, count = 1) {
    if (!ITEMS[item]) return { ok: false, msg: `Unknown item: ${item}` };
    if (!isValidCount(count)) return { ok: false, msg: "Count must be a whole number above 0" };
    if ((inv[item] || 0) < count) return { ok: false, msg: `You don't have ${count}x ${ITEMS[item].label}` };

    inv[item] -= count;
    if (inv[item] === 0) delete inv[item];
    return { ok: true, msg: `Removed ${count}x ${ITEMS[item].label}` };
}

function useItem(inv, item, player) {
    const def = ITEMS[item];
    if (!def) return { ok: false, msg: `Unknown item: ${item}` };
    if (!inv[item]) return { ok: false, msg: `You don't have a ${def.label}` };
    if (!def.usable) return { ok: false, msg: `${def.label} can't be used` };

    // Item-specific check BEFORE consuming (bandage at full health = refused, kept)
    const refusal = def.onUse ? def.onUse(player) : null;
    if (refusal) return { ok: false, msg: refusal };

    removeItem(inv, item, 1); // exactly 1
    return { ok: true, msg: `Used a ${def.label}` };
}

function dropItem(inv, item, count = 1) {
    // Removed server-side first; any prop on the ground is visual only
    const result = removeItem(inv, item, count);
    if (!result.ok) return result;
    return { ok: true, msg: `Dropped ${count}x ${ITEMS[item].label}` };
}

// ------------------------------------------------------------
// Starter kit: `saved` is what came back from the API.
// null/undefined = never saved -> starters. {} = emptied -> stays empty.
// ------------------------------------------------------------
function loadInventory(saved) {
    if (saved === null || saved === undefined) return { ...STARTER_ITEMS };
    return { ...saved };
}

module.exports = {
    MAX_WEIGHT, ITEMS, STARTER_ITEMS,
    getWeight, listInventory, isValidCount,
    canAddItem, addItem, removeItem, useItem, dropItem, loadInventory,
};
