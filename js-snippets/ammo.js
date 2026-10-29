// ============================================================
// ammo.js — ammo types, which gun takes which, loading and unloading
//
// Ammo lives in two places:
//   1. BOXES in your inventory: real items with weight, bought at
//      Gunworks, droppable, storable in trunks, saved with you
//   2. LOADED rounds: /loadammo opens boxes into your gun's ammo
//      pool. Loaded rounds don't weigh anything, but each type has
//      a cap (MAX loaded), so you can't dodge the weight limit
//
// GTA keeps one ammo pool per TYPE (pistol, SMG, rifle...), not per
// gun. So two pistols share their 9mm, just like in single player.
//
// Who to trust about shots fired: the server tracks the most you
// can have. The client reports what's left after shooting, and the
// server only ever takes the LOWER number. A modded client can lose
// ammo but never invent it.
//
// Rounds per box, caps and the gun list are placeholders: tune them.
// Box weights are in inventory.js, prices in shops.js.
// ============================================================

const inventory = require("./inventory");

const AMMO_TYPES = {
    pistol:  { label: "9mm",      box: "ammo_9mm",   perBox: 50, max: 250, gta: "AMMO_PISTOL" },
    smg:     { label: ".45 ACP",  box: "ammo_45acp", perBox: 50, max: 500, gta: "AMMO_SMG" },
    rifle:   { label: "7.62x39",  box: "ammo_762",   perBox: 30, max: 360, gta: "AMMO_RIFLE" },
    shotgun: { label: "12 gauge", box: "ammo_12ga",  perBox: 25, max: 100, gta: "AMMO_SHOTGUN" },
    sniper:  { label: ".308",     box: "ammo_308",   perBox: 20, max: 60,  gta: "AMMO_SNIPER" },
};

// inventory item -> GTA weapon + ammo type
const WEAPONS = {
    glizzy:       { gta: "WEAPON_COMBATPISTOL", ammo: "pistol" },
    uzi:          { gta: "WEAPON_MICROSMG",     ammo: "smg" },
    chopper:   { gta: "WEAPON_COMPACTRIFLE", ammo: "rifle" },
    pumpshotgun:  { gta: "WEAPON_PUMPSHOTGUN",  ammo: "shotgun" },
    huntingrifle: { gta: "WEAPON_SNIPERRIFLE",  ammo: "sniper" },
};

// Catch typos the moment the server starts, not mid-gunfight
for (const [type, t] of Object.entries(AMMO_TYPES)) {
    if (!inventory.ITEMS[t.box]) throw new Error(`ammo.js: ${type} box "${t.box}" isn't in inventory.js`);
}
for (const [item, w] of Object.entries(WEAPONS)) {
    if (!inventory.ITEMS[item]) throw new Error(`ammo.js: weapon "${item}" isn't in inventory.js`);
    if (!AMMO_TYPES[w.ammo]) throw new Error(`ammo.js: weapon "${item}" uses unknown ammo "${w.ammo}"`);
}

// Accepts "pistol", "9mm", or the box name "ammo_9mm"
function findType(text) {
    const key = (text || "").toLowerCase();
    for (const [type, t] of Object.entries(AMMO_TYPES)) {
        if (key === type || key === t.label.toLowerCase() || key === t.box) return type;
    }
    return null;
}

function loaded(c, type) {
    return c.ammo[type] || 0;
}

function ownsWeaponFor(c, type) {
    return Object.entries(WEAPONS).some(([item, w]) => w.ammo === type && c.inventory[item] > 0);
}

function listAmmo(c) {
    const lines = ["--- Ammo ---"];
    for (const [type, t] of Object.entries(AMMO_TYPES)) {
        const boxes = c.inventory[t.box] || 0;
        const rounds = loaded(c, type);
        if (boxes || rounds) lines.push(`${t.label}: ${rounds}/${t.max} loaded, ${boxes} box${boxes === 1 ? "" : "es"} (${t.perBox} each)`);
    }
    if (lines.length === 1) lines.push("No ammo.");
    return lines.join("\n");
}

function loadAmmo(c, typeText, boxes = 1) {
    const type = findType(typeText);
    if (!type) return { ok: false, msg: `No ammo type "${typeText}". Types: ${Object.keys(AMMO_TYPES).join(", ")}` };
    const t = AMMO_TYPES[type];
    if (!inventory.isValidCount(boxes)) return { ok: false, msg: "Boxes must be a whole number above 0" };
    if (!ownsWeaponFor(c, type)) return { ok: false, msg: `You don't have a gun that takes ${t.label}` };
    if ((c.inventory[t.box] || 0) < boxes) return { ok: false, msg: `You don't have ${boxes}x ${inventory.ITEMS[t.box].label}` };

    const after = loaded(c, type) + boxes * t.perBox;
    if (after > t.max) {
        const room = Math.floor((t.max - loaded(c, type)) / t.perBox);
        return { ok: false, msg: `That's over the ${t.max}-round cap for ${t.label} — you can load ${room} more box${room === 1 ? "" : "es"}` };
    }

    inventory.removeItem(c.inventory, t.box, boxes);
    c.ammo[type] = after;
    return { ok: true, msg: `Loaded ${boxes * t.perBox} rounds of ${t.label} (${after}/${t.max})`, type };
}

// Only FULL boxes go back; the leftover rounds stay loaded.
function unloadAmmo(c, typeText) {
    const type = findType(typeText);
    if (!type) return { ok: false, msg: `No ammo type "${typeText}"` };
    const t = AMMO_TYPES[type];
    const boxes = Math.floor(loaded(c, type) / t.perBox);
    if (boxes === 0) return { ok: false, msg: `Not enough ${t.label} loaded to fill a box (${loaded(c, type)}/${t.perBox})` };

    const fits = inventory.canAddItem(c.inventory, t.box, boxes);
    if (!fits.ok) return fits;

    inventory.addItem(c.inventory, t.box, boxes);
    c.ammo[type] = loaded(c, type) - boxes * t.perBox;
    return { ok: true, msg: `Boxed up ${boxes}x ${inventory.ITEMS[t.box].label}. ${c.ammo[type]} rounds still loaded`, type };
}

// reports = { AMMO_PISTOL: 37, ... } from the client. Only ever lowers.
function syncAmmo(c, reports) {
    for (const [type, t] of Object.entries(AMMO_TYPES)) {
        const reported = reports?.[t.gta];
        if (!Number.isInteger(reported) || reported < 0) continue;
        c.ammo[type] = Math.min(loaded(c, type), reported);
    }
}

function equip(c, item) {
    const w = WEAPONS[item];
    if (!w) return { ok: false, msg: `${inventory.ITEMS[item]?.label || item} isn't a weapon` };
    if (!c.inventory[item]) return { ok: false, msg: `You don't have a ${inventory.ITEMS[item].label}` };
    if (c.equipped === item) return { ok: false, msg: `${inventory.ITEMS[item].label} is already out` };
    c.equipped = item;
    const rounds = loaded(c, w.ammo);
    return {
        ok: true,
        msg: `Pulled out your ${inventory.ITEMS[item].label} (${rounds} ${AMMO_TYPES[w.ammo].label} loaded)`,
        weapon: w.gta, ammoType: AMMO_TYPES[w.ammo].gta, rounds,
    };
}

function holster(c) {
    if (!c.equipped) return { ok: false, msg: "Nothing in your hands" };
    const item = c.equipped;
    c.equipped = null;
    return { ok: true, msg: `Put away your ${inventory.ITEMS[item].label}`, weapon: WEAPONS[item].gta };
}

module.exports = { AMMO_TYPES, WEAPONS, findType, listAmmo, loadAmmo, unloadAmmo, syncAmmo, equip, holster };
