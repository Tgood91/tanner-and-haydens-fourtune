// ============================================================
// character.js — one player's character, and how it saves/loads
// `saved` is what the API sent back. null = brand-new character.
// Starting money is a placeholder.
// ============================================================

const inventory = require("./inventory");
const vehicles = require("./vehicles");

const START_CASH = 500;
const START_BANK = 5000;
const START_GOLD = 0; // gold is earned, never handed out at the start

function createCharacter(id, name, saved = null) {
    const s = saved || {};
    const c = {
        id,
        name,
        cash: s.cash ?? START_CASH,
        bank: s.bank ?? START_BANK,
        gold: s.gold ?? START_GOLD,
        job: s.job ? { ...s.job } : { name: "unemployed", grade: 0 },
        onDuty: false, // always log in off duty
        health: s.health ?? 100,
        maxHealth: 100,
        hunger: s.hunger ?? 100,
        thirst: s.thirst ?? 100,
        // Logging out while down doesn't get you up: the bleedout clock restarts on login
        downed: s.downed ?? false,
        downedAt: s.downed ? Date.now() : null,
        pos: s.pos ? { ...s.pos } : null, // last known position; null = never spawned (spawns.js)
        ammo: { ...(s.ammo || {}) }, // loaded rounds per ammo type (see ammo.js)
        equipped: null, // always log in with your gun put away
        cuffed: false,  // logging out drops cuffs, but NOT jail time
        jailMinutes: s.jailMinutes ?? 0,
        jailedFrom: s.jailedFrom ?? null, // city of the arrest — decides where you're released
        // starter rule lives in inventory.loadInventory: undefined -> starters, {} -> stays empty
        inventory: inventory.loadInventory(saved ? s.inventory ?? null : null),
        garage: (s.garage || []).map((car) => ({ ...car })),
        city: null,
    };
    vehicles.reservePlates(c.garage);
    return c;
}

// What goes to the API on autosave / disconnect.
function serialize(c) {
    return {
        name: c.name,
        cash: c.cash,
        bank: c.bank,
        gold: c.gold,
        job: { ...c.job },
        health: c.health,
        hunger: c.hunger,
        thirst: c.thirst,
        downed: c.downed,
        ammo: { ...c.ammo },
        jailMinutes: c.jailMinutes,
        jailedFrom: c.jailedFrom,
        pos: c.pos ? { ...c.pos } : null,
        inventory: { ...c.inventory },
        garage: c.garage.map((car) => ({ ...car })),
    };
}

module.exports = { START_CASH, START_BANK, START_GOLD, createCharacter, serialize };
