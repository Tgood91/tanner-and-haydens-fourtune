// ============================================================
// character.js — one player's character, and how it saves/loads
// `saved` is what the API sent back. null = brand-new character.
// Starting money is a placeholder.
// ============================================================

const inventory = require("./inventory");
const vehicles = require("./vehicles");

const START_CASH = 500;
const START_BANK = 5000;

function createCharacter(id, name, saved = null) {
    const s = saved || {};
    const c = {
        id,
        name,
        cash: s.cash ?? START_CASH,
        bank: s.bank ?? START_BANK,
        job: s.job ? { ...s.job } : { name: "unemployed", grade: 0 },
        onDuty: false, // always log in off duty
        health: s.health ?? 100,
        maxHealth: 100,
        hunger: s.hunger ?? 100,
        thirst: s.thirst ?? 100,
        // Logging out while down doesn't get you up: the bleedout clock restarts on login
        downed: s.downed ?? false,
        downedAt: s.downed ? Date.now() : null,
        pos: null, // last known position, kept fresh by game.updatePosition
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
        job: { ...c.job },
        health: c.health,
        hunger: c.hunger,
        thirst: c.thirst,
        downed: c.downed,
        inventory: { ...c.inventory },
        garage: c.garage.map((car) => ({ ...car })),
    };
}

module.exports = { START_CASH, START_BANK, createCharacter, serialize };
