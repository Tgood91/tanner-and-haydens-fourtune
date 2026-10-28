// ============================================================
// needs.js — hunger and thirst (0 = empty, 100 = full)
// Both drain every in-game minute. At 0, you start losing health.
// Food and drink refill them through the item's hunger/thirst
// numbers in inventory.js — one place for item data.
//
// Health here runs 0..maxHealth (100). The FiveM adapter converts
// to GTA's ped health (100 = dead, 200 = full).
// All rates are placeholders: tune them by playing.
// ============================================================

const HUNGER_PER_MIN = 0.5;   // full -> empty in ~3h 20m
const THIRST_PER_MIN = 0.8;   // full -> empty in ~2h
const EMPTY_DAMAGE_PER_MIN = 2; // per empty need
const WARN_AT = 20;

function clamp(n, max = 100) {
    return Math.max(0, Math.min(max, Math.round(n * 10) / 10));
}

function status(c) {
    return `Health: ${c.health}/${c.maxHealth} | Hunger: ${c.hunger} | Thirst: ${c.thirst}`;
}

// Drains needs, applies empty-stomach damage, returns warnings to show.
function decay(c, minutes = 1) {
    const warnings = [];
    const before = { hunger: c.hunger, thirst: c.thirst };

    c.hunger = clamp(c.hunger - HUNGER_PER_MIN * minutes);
    c.thirst = clamp(c.thirst - THIRST_PER_MIN * minutes);

    // Warn once, when crossing the line — not every minute after
    if (before.hunger > WARN_AT && c.hunger <= WARN_AT) warnings.push("You're getting hungry.");
    if (before.thirst > WARN_AT && c.thirst <= WARN_AT) warnings.push("You're getting thirsty.");

    let damage = 0;
    if (c.hunger === 0) damage += EMPTY_DAMAGE_PER_MIN * minutes;
    if (c.thirst === 0) damage += EMPTY_DAMAGE_PER_MIN * minutes;
    if (damage > 0) {
        c.health = clamp(c.health - damage, c.maxHealth);
        warnings.push(c.health === 0 ? "You collapsed." : "You're starving — eat and drink something!");
    }

    return { warnings, damaged: damage > 0 };
}

// Called after inventory.useItem succeeded.
function applyItem(c, def) {
    if (def.hunger) c.hunger = clamp(c.hunger + def.hunger);
    if (def.thirst) c.thirst = clamp(c.thirst + def.thirst);
    if (def.heal) c.health = clamp(c.health + def.heal, c.maxHealth);
}

module.exports = { HUNGER_PER_MIN, THIRST_PER_MIN, EMPTY_DAMAGE_PER_MIN, status, decay, applyItem };
