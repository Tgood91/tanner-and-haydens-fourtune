// ============================================================
// houses.js — buying a place, locking it, and what's inside
//
// A house is three things: an address you own, a door you control,
// and storage that isn't on your back. That last one is the point —
// until now everything you owned was either in your 30 kg of pockets,
// a car boot, or the crew stash, and all three can be taken off you.
//
// Keys are the social half. The owner hands them out by player id and
// takes them back by name, so a locked door is a real decision about
// who you trust rather than a wall.
//
// Prices follow the district: a walk-up in the Knot costs what a
// trailer out on the Backroads never will.
//
// Ownership is keyed by character NAME, the same handle gangs.js uses
// and with the same caveat — swap it for the character id the moment
// the API hands them out, or two players sharing a name share a deed.
//
// NOT BUILT, and worth knowing: you do not spawn at your house. Login
// still puts you where you logged out. That is a natural next step,
// not something quietly missing.
//
// Every price, capacity and coordinate is a placeholder.
// ============================================================

const inventory = require("./inventory");
const economy = require("./economy");
const { distance } = require("./cities");

const DOOR_RANGE = 4.0;    // how close to the door you must be
const SELL_RATIO = 0.6;    // what the market gives you back
const MAX_KEYS = 6;        // besides the owner

const HOUSES = {
    knot_walkup:    { label: "Knot Walk-up",      district: "The Knot",      price: 185000, storage: 60, pos: { x: -438, y: 6038, z: 31.5 } },
    shore_condo:    { label: "Shoreline Condo",   district: "The Shoreline", price: 240000, storage: 70, pos: { x: -110, y: 6150, z: 31.9 } },
    northline_flat: { label: "Northline Flat",    district: "Northline",     price: 140000, storage: 50, pos: { x: -150, y: 6395, z: 31.6 } },
    alder_bungalow: { label: "Alder Bungalow",    district: "Alder Heights", price: 210000, storage: 75, pos: { x: -250, y: -970, z: 31.3 } },
    southline_row:  { label: "Southline Row",     district: "Southline",     price: 160000, storage: 55, pos: { x: 30,   y: -1540, z: 29.4 } },
    westside_house: { label: "Westside House",    district: "The Westside",  price: 125000, storage: 65, pos: { x: -1090, y: -1110, z: 26.2 } },
    backroads_trailer: { label: "Backroads Trailer", district: "The Backroads", price: 65000, storage: 40, pos: { x: 1770, y: 4410, z: 39.8 } },
    halfway_motel:  { label: "Depot Motel Room",  district: "Halfway",       price: 55000,  storage: 35, pos: { x: 760, y: 1620, z: 0 } },   // z unknown: walk it
};

function findDoor(pos) {
    if (!pos) return null;
    for (const [id, house] of Object.entries(HOUSES)) {
        if (distance(pos, house.pos) <= DOOR_RANGE) return { id, house };
    }
    return null;
}

function createHouses() {
    // id -> { owner, locked, keys: [names], storage: {} }
    const deeds = new Map();

    function deedOf(id) {
        return deeds.get(id) || null;
    }

    function ownedBy(name) {
        for (const [id, deed] of deeds) if (deed.owner === name) return { id, deed };
        return null;
    }

    function mayEnter(c, id) {
        const deed = deeds.get(id);
        if (!deed) return false;
        if (deed.owner === c.name) return true;
        return !deed.locked || deed.keys.includes(c.name);
    }

    function forSale() {
        const lines = ["--- For sale ---"];
        for (const [id, house] of Object.entries(HOUSES)) {
            if (deeds.has(id)) continue;
            lines.push(`${house.label} (${id}) — ${economy.money(house.price)}, ${house.storage} kg, ${house.district}`);
        }
        return lines.length === 1 ? "Nothing on the market." : lines.join("\n");
    }

    function info(c) {
        const mine = ownedBy(c.name);
        if (!mine) return "You don't own anywhere. /houses to see what's going";
        const house = HOUSES[mine.id];
        return [
            `${house.label} — ${house.district}`,
            `Door: ${mine.deed.locked ? "locked" : "unlocked"}`,
            `Keys out: ${mine.deed.keys.length ? mine.deed.keys.join(", ") : "none"}`,
            `Storage: ${inventory.getWeight(mine.deed.storage)} / ${house.storage} kg`,
        ].join("\n");
    }

    function buy(c, found) {
        if (!found) return { ok: false, msg: "You're not at a door" };
        if (ownedBy(c.name)) return { ok: false, msg: "You already own somewhere — sell it first" };
        if (deeds.has(found.id)) return { ok: false, msg: `${found.house.label} is already someone's` };

        const paid = economy.removeMoney(c, "bank", found.house.price);
        if (!paid.ok) return { ok: false, msg: `${found.house.label} costs ${economy.money(found.house.price)} — ${paid.msg}` };

        deeds.set(found.id, { owner: c.name, locked: true, keys: [], storage: {} });
        return { ok: true, msg: `Bought ${found.house.label} for ${economy.money(found.house.price)}. The door is locked.` };
    }

    // Whatever is inside goes with it — say so before, not after
    function sell(c) {
        const mine = ownedBy(c.name);
        if (!mine) return { ok: false, msg: "You don't own anywhere" };
        const house = HOUSES[mine.id];

        const inside = Object.keys(mine.deed.storage).length;
        if (inside > 0) return { ok: false, msg: `Clear the ${inside} thing(s) out of ${house.label} first` };

        const back = Math.round(house.price * SELL_RATIO);
        c.bank += back;
        deeds.delete(mine.id);
        return { ok: true, msg: `Sold ${house.label} for ${economy.money(back)}.` };
    }

    function toggleLock(c, found) {
        if (!found) return { ok: false, msg: "You're not at a door" };
        const deed = deeds.get(found.id);
        if (!deed || deed.owner !== c.name) return { ok: false, msg: "Not your door" };
        deed.locked = !deed.locked;
        return { ok: true, msg: `${found.house.label} is ${deed.locked ? "locked" : "unlocked"}.` };
    }

    function giveKey(c, target) {
        const mine = ownedBy(c.name);
        if (!mine) return { ok: false, msg: "You don't own anywhere" };
        if (!target) return { ok: false, msg: "No player with that id" };
        if (target === c) return { ok: false, msg: "It's your house" };
        if (mine.deed.keys.includes(target.name)) return { ok: false, msg: `${target.name} already has a key` };
        if (mine.deed.keys.length >= MAX_KEYS) return { ok: false, msg: `That's all the keys you have (${MAX_KEYS})` };

        mine.deed.keys.push(target.name);
        return { ok: true, msg: `Gave ${target.name} a key to ${HOUSES[mine.id].label}`, label: HOUSES[mine.id].label };
    }

    function takeKey(c, name) {
        const mine = ownedBy(c.name);
        if (!mine) return { ok: false, msg: "You don't own anywhere" };
        const who = String(name || "").trim();
        const at = mine.deed.keys.findIndex((k) => k.toLowerCase() === who.toLowerCase());
        if (at === -1) return { ok: false, msg: `${who || "That name"} doesn't have a key` };

        const [taken] = mine.deed.keys.splice(at, 1);
        return { ok: true, msg: `Took ${taken}'s key back`, name: taken };
    }

    // ---- storage: the owner, or anyone holding a key ----
    function reach(c, found) {
        if (!found) return { ok: false, msg: "You're not at a door" };
        if (!deeds.has(found.id)) return { ok: false, msg: "Nobody owns this yet" };
        if (!mayEnter(c, found.id)) return { ok: false, msg: `${found.house.label} is locked` };
        return { ok: true, msg: "", deed: deeds.get(found.id), house: found.house };
    }

    function look(c, found) {
        const open = reach(c, found);
        if (!open.ok) return open;
        const lines = [`--- ${open.house.label} ---`];
        for (const [item, count] of Object.entries(open.deed.storage)) {
            lines.push(`${inventory.ITEMS[item].label} x${count}`);
        }
        lines.push(`Weight: ${inventory.getWeight(open.deed.storage)} / ${open.house.storage} kg`);
        return { ok: true, msg: lines.join("\n") };
    }

    function put(c, found, item, count = 1) {
        const open = reach(c, found);
        if (!open.ok) return open;
        if ((c.inventory[item] || 0) < count) return { ok: false, msg: `You don't have ${count}x ${item}` };

        const fits = inventory.canAddItem(open.deed.storage, item, count, open.house.storage);
        if (!fits.ok) return { ok: false, msg: `No room — ${fits.msg}` };

        inventory.removeItem(c.inventory, item, count);
        inventory.addItem(open.deed.storage, item, count, open.house.storage);
        return { ok: true, msg: `Put ${count}x ${inventory.ITEMS[item].label} away` };
    }

    function take(c, found, item, count = 1) {
        const open = reach(c, found);
        if (!open.ok) return open;
        if ((open.deed.storage[item] || 0) < count) return { ok: false, msg: `There's no ${count}x ${item} in there` };

        const fits = inventory.canAddItem(c.inventory, item, count);
        if (!fits.ok) return fits;

        inventory.removeItem(open.deed.storage, item, count);
        inventory.addItem(c.inventory, item, count);
        return { ok: true, msg: `Took ${count}x ${inventory.ITEMS[item].label}` };
    }

    function exportAll() {
        return Object.fromEntries([...deeds].map(([id, d]) => [id, { ...d, keys: [...d.keys], storage: { ...d.storage } }]));
    }
    function importAll(saved) {
        for (const [id, d] of Object.entries(saved || {})) {
            if (HOUSES[id]) deeds.set(id, { ...d, keys: [...(d.keys || [])], storage: { ...(d.storage || {}) } });
        }
    }

    return { forSale, info, buy, sell, toggleLock, giveKey, takeKey, look, put, take, ownedBy, deedOf, mayEnter, exportAll, importAll };
}

module.exports = { DOOR_RANGE, SELL_RATIO, MAX_KEYS, HOUSES, findDoor, createHouses };
