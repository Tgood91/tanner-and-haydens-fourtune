// ============================================================
// hunting.js — the West Woods Hunting Grounds (the island's west end)
//
// The loop:
//   1. Antler Lodge: /buylicense hunting ($750). The lodge also sells
//      .308 boxes for dollars and the Bolt Rifle for gold, which needs
//      the hunting licence instead of a weapon licence (shops.js).
//   2. The grounds keep a herd of deer and boar. Shoot one inside the
//      grounds: the server sees it die and who killed it, so a client
//      can't report a kill it didn't make.
//   3. /skin next to the carcass: venison or boar meat, plus a hide.
//      Heavy, so your bag fills after about four animals.
//   4. /sellgame at the lodge: everything you carry, for cash.
//
// The rules:
//   - Only a rifle or a shotgun makes a clean kill (HUNTING_WEAPONS). The
//     server reads the weapon GTA records as the cause of death, so running
//     one over, a knife or an SMG doesn't count.
//   - No hunting licence, the wrong weapon, past your bag limit, or outside the grounds:
//     that's POACHING. You can't skin it, and on-duty police get a tip
//     that says where, never who.
//   - A carcass is yours to skin for 5 minutes; after that any licensed
//     hunter can take it. Carcasses rot away after 15 minutes.
//   - Every animal that dies is replaced 5 minutes later, at a spot no
//     other animal is using.
//
// Prices, limits and spots are placeholders: walk them and tune.
// ============================================================

const inventory = require("./inventory");
const economy = require("./economy");
const { distance } = require("./cities");

// In world coordinates. tools/gen-island-map.py draws the same grounds
// (HUNT: map centre -290, 425, radius 245 x 112 units, 2 m a unit).
const GROUNDS = { label: "West Woods Hunting Grounds", centre: { x: -7580, y: -6350 }, rx: 490, ry: 224 };
// Antler Lodge's counter, on the south side of the lodge
const LODGE = { label: "Antler Lodge", pos: { x: -7510, y: -6301, z: 27.1 } };

const LODGE_RANGE = 4.0;     // metres from the counter
const SKIN_RANGE = 3.0;      // metres from the carcass
const HERD_SIZE = 8;
const RESPAWN_MIN = 5;
const CLAIM_MIN = 5;         // the killer's carcass, before anyone may skin it
const ROT_MIN = 15;
const BAG_LIMIT = 6;         // clean kills per rolling hour
const BOAR_CHANCE = 0.35;
const HUNTING_WEAPONS = ["huntingrifle", "pumpshotgun"];   // inventory items (ammo.js WEAPONS)

const SPECIES = {
    deer: { label: "Deer", model: "a_c_deer", yields: { venison: 2, deerhide: 1 } },
    boar: { label: "Boar", model: "a_c_boar", yields: { boarmeat: 2, boarhide: 1 } },
};
// What the lodge pays, dollars each
const PRICES = { venison: 90, deerhide: 140, boarmeat: 70, boarhide: 110 };

// Clear of every road by 25 m, at least 70 m apart, ground height + 1 m
// (picked from island-terrain/ground.f32).
const SPOTS = [
    { x: -7651.9, y: -6353.6, z: 24.8 }, { x: -7542.7, y: -6428.4, z: 23.1 },
    { x: -7617.0, y: -6208.4, z: 23.6 }, { x: -7736.3, y: -6515.9, z: 14.7 },
    { x: -7763.1, y: -6297.7, z: 22.6 }, { x: -7609.6, y: -6463.4, z: 25.6 },
    { x: -7384.9, y: -6199.6, z: 17.2 }, { x: -7903.8, y: -6383.8, z: 24.1 },
    { x: -7849.9, y: -6473.8, z: 22.9 }, { x: -7837.2, y: -6325.0, z: 20.6 },
    { x: -7355.1, y: -6320.3, z: 24.1 }, { x: -7679.0, y: -6250.6, z: 26.0 },
    { x: -7241.5, y: -6310.5, z: 19.9 }, { x: -7723.8, y: -6375.8, z: 26.3 },
    { x: -7443.3, y: -6488.1, z: 19.3 }, { x: -7734.4, y: -6179.3, z: 15.2 },
];

function inGrounds(pos) {
    if (!pos) return false;
    const dx = (pos.x - GROUNDS.centre.x) / GROUNDS.rx, dy = (pos.y - GROUNDS.centre.y) / GROUNDS.ry;
    return dx * dx + dy * dy <= 1;
}

function atLodge(pos) {
    return !!pos && distance(pos, LODGE.pos) <= LODGE_RANGE;
}

function isGame(item) {
    return Object.prototype.hasOwnProperty.call(PRICES, item);
}

function createHunting(rng = Math.random) {
    const animals = new Map();   // id -> { id, species, spot, pos, state: "alive"|"carcass", hunter, poached, killedAt }
    const respawns = [];         // times a replacement is due
    const kills = new Map();     // character id -> [times of clean kills]; kept across logouts, so relogging doesn't reset the bag limit
    let nextId = 1;
    let started = false;

    const minutes = (ms) => ms * 60000;

    function freeSpot() {
        const used = new Set([...animals.values()].map((a) => a.spot));
        const free = SPOTS.map((_, i) => i).filter((i) => !used.has(i));
        return free.length ? free[Math.floor(rng() * free.length)] : null;
    }

    function spawnOne() {
        const spot = freeSpot();
        if (spot === null) return null;
        const species = rng() < BOAR_CHANCE ? "boar" : "deer";
        const a = { id: nextId++, species, spot, pos: { ...SPOTS[spot] }, state: "alive", hunter: null, poached: false, killedAt: 0 };
        animals.set(a.id, a);
        return { type: "spawnAnimal", id: a.id, model: SPECIES[species].model, pos: { ...a.pos }, heading: Math.floor(rng() * 360) };
    }

    // The first call fills the herd; afterwards it only does what's due.
    function tick(now) {
        const actions = [];
        if (!started) {
            started = true;
            for (let i = 0; i < HERD_SIZE; i++) {
                const act = spawnOne();
                if (act) actions.push(act);
            }
            return actions;
        }
        for (const a of [...animals.values()]) {
            if (a.state === "carcass" && now - a.killedAt >= minutes(ROT_MIN)) {
                animals.delete(a.id);
                actions.push({ type: "despawnAnimal", id: a.id });
            }
        }
        while (respawns.length && respawns[0] <= now) {
            respawns.shift();
            const act = spawnOne();
            if (act) actions.push(act);
        }
        return actions;
    }

    function queueRespawn(now) {
        respawns.push(now + minutes(RESPAWN_MIN));
        respawns.sort((x, y) => x - y);
    }

    function recentKills(id, now) {
        const list = (kills.get(id) || []).filter((t) => now - t < minutes(60));
        kills.set(id, list);
        return list.length;
    }

    // The server saw animal `id` die at `pos`. hunter = the killer's character,
    // or null (fell, killed by something that isn't a player). weapon = the
    // inventory item that killed it ("huntingrifle"), "vehicle" if it was run
    // over, or null for anything else (fists, a knife, a fall).
    // Returns { ok, msg (for the hunter), poached, where }.
    function killed(id, hunter, pos, now, weapon = null) {
        const a = animals.get(id);
        if (!a || a.state !== "alive") return { ok: false, msg: "" };
        a.state = "carcass";
        a.killedAt = now;
        if (pos) a.pos = { ...pos };
        a.hunter = hunter ? hunter.id : null;
        queueRespawn(now);
        if (!hunter) return { ok: true, msg: "" };

        const label = SPECIES[a.species].label;
        let why = null;
        if (!hunter.licenses.hunting) why = "you don't have a hunting license";
        else if (!HUNTING_WEAPONS.includes(weapon)) {
            why = weapon === "vehicle" ? "running it over isn't hunting"
                : weapon && inventory.ITEMS[weapon] ? `a ${inventory.ITEMS[weapon].label} isn't a hunting weapon (use the Bolt Rifle or a Pump 12)`
                : "it wasn't shot with a hunting weapon (use the Bolt Rifle or a Pump 12)";
        } else if (!inGrounds(a.pos)) why = `it was outside the ${GROUNDS.label}`;
        else if (recentKills(hunter.id, now) >= BAG_LIMIT) why = `you're over your bag limit (${BAG_LIMIT} an hour)`;
        if (why) {
            a.poached = true;
            return { ok: true, poached: true, where: GROUNDS.label, msg: `That ${label.toLowerCase()} was poached: ${why}. You can't skin it, and someone may have heard the shot.` };
        }
        kills.get(hunter.id).push(now);
        const left = BAG_LIMIT - recentKills(hunter.id, now);
        return { ok: true, msg: `Clean kill: ${label}. Walk up to it and /skin it. (${left} left in your bag limit this hour)` };
    }

    // An animal that vanished without dying (the game culled it, or the
    // server lost the entity): put a new one out later.
    function lost(id, now) {
        const a = animals.get(id);
        if (!a) return;
        animals.delete(id);
        if (a.state === "alive") queueRespawn(now);
    }

    function skin(c, now) {
        let best = null;
        for (const a of animals.values()) {
            if (a.state !== "carcass") continue;
            const d = distance(c.pos, a.pos);
            if (d <= SKIN_RANGE && (!best || d < best.d)) best = { a, d };
        }
        if (!best) return { ok: false, msg: "There's no carcass close enough to skin" };
        const a = best.a;
        const label = SPECIES[a.species].label.toLowerCase();
        if (!c.licenses.hunting) return { ok: false, msg: "You need a hunting license to dress game — /buylicense hunting at Antler Lodge" };
        if (a.poached) return { ok: false, msg: `That ${label} was poached. It stays where it fell.` };
        if (a.hunter !== null && a.hunter !== c.id && now - a.killedAt < minutes(CLAIM_MIN)) {
            return { ok: false, msg: `That's someone else's ${label}. It's theirs for ${CLAIM_MIN} minutes after the kill.` };
        }

        // Everything must fit before anything is given
        const yields = SPECIES[a.species].yields;
        const trial = { ...c.inventory };
        for (const [item, count] of Object.entries(yields)) {
            const fits = inventory.canAddItem(trial, item, count);
            if (!fits.ok) return { ok: false, msg: `Your bag can't take the ${label}: ${fits.msg}` };
            inventory.addItem(trial, item, count);
        }
        for (const [item, count] of Object.entries(yields)) inventory.addItem(c.inventory, item, count);
        animals.delete(a.id);
        const got = Object.entries(yields).map(([item, n]) => `${n}x ${inventory.ITEMS[item].label}`).join(", ");
        return { ok: true, msg: `You dress the ${label}: ${got}. Sell it at Antler Lodge (/sellgame).`, despawn: a.id };
    }

    function sell(c, pos) {
        if (!atLodge(pos)) return { ok: false, msg: `Sell game at the ${LODGE.label} counter` };
        let total = 0;
        const lines = [];
        for (const item of Object.keys(PRICES)) {
            const n = c.inventory[item] || 0;
            if (!n) continue;
            inventory.removeItem(c.inventory, item, n);
            total += n * PRICES[item];
            lines.push(`${n}x ${inventory.ITEMS[item].label}`);
        }
        if (!total) return { ok: false, msg: "You've got no game to sell" };
        c.cash += total;
        return { ok: true, msg: `${LODGE.label} buys ${lines.join(", ")} for ${economy.money(total)} cash.` };
    }

    function status(c, pos, now) {
        const alive = [...animals.values()].filter((a) => a.state === "alive").length;
        const prices = Object.entries(PRICES).map(([item, p]) => `${inventory.ITEMS[item].label} ${economy.money(p)}`).join(" · ");
        return [
            `--- ${GROUNDS.label} ---`,
            inGrounds(pos) ? "You're in the hunting grounds." : "You're not in the hunting grounds (the island's West Woods).",
            `Hunting license: ${c.licenses.hunting ? "VALID" : "none — /buylicense hunting at Antler Lodge"}`,
            `Bag limit: ${recentKills(c.id, now)}/${BAG_LIMIT} clean kills this hour`,
            `Game in the woods right now: ${alive}`,
            `The lodge pays: ${prices}`,
        ].join("\n");
    }

    // What's out there now, for a server that restarted its entities
    function herd() {
        return [...animals.values()].map((a) => ({ ...a, pos: { ...a.pos } }));
    }

    return { tick, killed, lost, skin, sell, status, herd };
}

module.exports = {
    GROUNDS, LODGE, SPECIES, PRICES, SPOTS, HERD_SIZE, BAG_LIMIT, HUNTING_WEAPONS, RESPAWN_MIN, CLAIM_MIN, ROT_MIN,
    inGrounds, atLodge, isGame, createHunting,
};
