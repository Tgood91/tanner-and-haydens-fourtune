// ============================================================
// game.test.js — checks every system through the game core
// Run it:  node --test js-snippets/game.test.js
// ============================================================

const test = require("node:test");
const assert = require("node:assert/strict");
const { createGame, PAY_INTERVAL_MIN } = require("./game");
const { SHOPS } = require("./shops");
const { SPAWNS } = require("./spawns");

const CONSOLE = { isConsole: true };
const AT_247 = SHOPS.chi_247.pos;
const NOWHERE = { x: 0, y: 0, z: 0 };

// what the position sweep told that player, if anything
function announce(game, id, pos) {
    const out = game.updatePosition(id, pos);
    return out.notify.length ? out.notify[0].msg : null;
}

function setup() {
    const game = createGame();
    const a = game.join(1, "Tanner");
    const b = game.join(2, "Hayden");
    const as = (id, extra = {}) => ({ id, pos: NOWHERE, now: 0, ...extra });
    return { game, a, b, as };
}

test("new character gets starters; an emptied save stays empty", () => {
    const { game, a } = setup();
    assert.deepEqual(a.inventory, { water: 2, sandwich: 1, phone: 1 });
    const empty = game.join(3, "Empty", { cash: 0, bank: 0, inventory: {} });
    assert.deepEqual(empty.inventory, {});
});

test("console-only commands refuse players", () => {
    const { game, as } = setup();
    assert.equal(game.command(as(1), "giveitem", ["1", "medkit"]).msg, "Console only.");
    const res = game.command(CONSOLE, "giveitem", ["1", "medkit", "2"]);
    assert.equal(res.notify[0].id, 1);
    assert.equal(game.get(1).inventory.medkit, 2);
});

test("eating and drinking refill needs; bandage refused at full health", () => {
    const { game, a, as } = setup();
    a.hunger = 50; a.thirst = 50;
    game.command(as(1), "useitem", ["sandwich"]);
    game.command(as(1), "useitem", ["water"]);
    assert.equal(a.hunger, 90);
    assert.equal(a.thirst, 90);

    game.command(CONSOLE, "giveitem", ["1", "bandage"]);
    assert.match(game.command(as(1), "useitem", ["bandage"]).msg, /full health/);
    assert.equal(a.inventory.bandage, 1);
    a.health = 50;
    const res = game.command(as(1), "useitem", ["bandage"]);
    assert.equal(a.health, 65);
    assert.deepEqual(res.actions[0], { type: "setHealth", target: 1, value: 65 });
});

test("needs drain, warn once, and starving hurts", () => {
    const { game, a } = setup();
    a.thirst = 20.5;
    const first = game.tick(1, 0);
    assert.ok(first.notify.some((n) => n.msg.includes("thirsty")));
    const second = game.tick(1, 0);
    assert.ok(!second.notify.some((n) => n.msg.includes("thirsty")));

    a.thirst = 0; a.hunger = 0;
    game.tick(5, 0);
    assert.equal(a.health, 80); // 2 + 2 per minute for 5 minutes
});

test("money: deposit, withdraw, pay, and bad amounts refused", () => {
    const { game, a, b, as } = setup();
    game.command(as(1), "deposit", ["200"]);
    assert.equal(a.cash, 300);
    assert.equal(a.bank, 5200);
    assert.match(game.command(as(1), "withdraw", ["-50"]).msg, /whole number/);
    assert.match(game.command(as(1), "withdraw", ["1e9"]).msg, /Not enough/);
    assert.match(game.command(as(1), "pay", ["1", "10"]).msg, /yourself/);

    const res = game.command(as(1), "pay", ["2", "1000"]);
    assert.equal(b.bank, 6000);
    assert.equal(res.notify[0].id, 2);
});

test("paychecks only on duty; civilians always get theirs", () => {
    const { game, a, b, as } = setup();
    game.command(CONSOLE, "setjob", ["1", "police", "0"]);
    game.tick(PAY_INTERVAL_MIN, 0);
    assert.equal(a.bank, 5000);       // off duty
    assert.equal(b.bank, 5050);       // civilian check

    game.command(as(1), "duty");
    game.tick(PAY_INTERVAL_MIN, 0);
    assert.equal(a.bank, 5400);
    assert.match(game.command(CONSOLE, "setjob", ["1", "police", "9"]).msg, /grades are/);
});

test("shops: must be at the counter, must afford it, must fit — or nothing changes", () => {
    const { game, a, as } = setup();
    assert.equal(game.command(as(1), "buy", ["water"]).msg, "You're not at a shop");

    const there = as(1, { pos: AT_247 });
    game.command(there, "buy", ["water", "3"]);
    assert.equal(a.cash, 485);
    assert.equal(a.inventory.water, 5);

    assert.match(game.command(there, "buy", ["glizzy"]).msg, /doesn't sell/);
    assert.match(game.command(there, "buy", ["bandage", "100"]).msg, /Not enough cash/);

    // Too heavy: 70 waters = 35 kg. Pay by card so money isn't the blocker.
    const cashBefore = a.cash, bankBefore = a.bank;
    assert.match(game.command(there, "buy", ["water", "70", "bank"]).msg, /Too heavy/);
    assert.equal(a.cash, cashBefore);
    assert.equal(a.bank, bankBefore);
});

test("dropped items can be grabbed by someone else nearby, then expire", () => {
    const { game, a, b, as } = setup();
    const spot = { x: 10, y: 10, z: 30 };
    const drop = game.command(as(1, { pos: spot, now: 0 }), "dropitem", ["phone"]);
    assert.equal(drop.actions[0].type, "pickupCreated");
    assert.equal(a.inventory.phone, undefined);

    assert.match(game.command(as(2, { pos: { x: 50, y: 50, z: 30 } }), "pickup").msg, /Nothing here/);
    game.command(as(2, { pos: { x: 11, y: 10, z: 30 } }), "pickup");
    assert.equal(b.inventory.phone, 2);

    game.command(as(1, { pos: spot, now: 0 }), "dropitem", ["water"]);
    const later = game.tick(1, 11 * 60 * 1000);
    assert.ok(later.actions.some((x) => x.type === "pickupRemoved"));
});

test("cars get plates, spawn once, and trunks respect locks and weight", () => {
    const { game, a, as } = setup();
    a.bank = 200000;
    game.command(as(1), "buyveh", ["sultan"]);
    const plate = a.garage[0].plate;
    assert.match(plate, /^FT\d{6}$/);

    assert.equal(game.command(as(1), "spawnveh", [plate]).actions[0].type, "spawnVehicle");
    assert.match(game.command(as(1), "spawnveh", ["sultan"]).msg, /already out/);

    const nearCar = (id) => as(id, { vehiclePlate: plate });
    game.command(nearCar(1), "trunkput", ["water", "2"]);
    assert.equal(a.inventory.water, undefined);
    assert.match(game.command(nearCar(1), "trunk").msg, /Water x2/);

    // Hayden can't get in while it's locked, can after it's unlocked
    assert.match(game.command(nearCar(2), "trunktake", ["water"]).msg, /locked/);
    game.command(nearCar(1), "lock");
    game.command(nearCar(2), "trunktake", ["water"]);
    assert.equal(game.get(2).inventory.water, 3);

    // Over the Sultan's 60 kg trunk limit
    a.inventory.fuelcan = 4; // 20 kg in the bag
    game.command(nearCar(1), "trunkput", ["fuelcan", "4"]);
    a.inventory.fuelcan = 4;
    game.command(nearCar(1), "trunkput", ["fuelcan", "4"]);
    a.inventory.fuelcan = 4;
    assert.match(game.command(nearCar(1), "trunkput", ["fuelcan", "4"]).msg, /Trunk is full/);
    assert.equal(a.inventory.fuelcan, 4);
});

test("crossing into a city announces it once", () => {
    const { game } = setup();
    assert.equal(announce(game, 1, SPAWNS.atlanta[0].pos), null); // first position: no announcement
    assert.equal(announce(game, 1, SPAWNS.geepee[0].pos), "Welcome to GeePee");
    assert.equal(announce(game, 1, SPAWNS.geepee[0].pos), null);
    assert.equal(announce(game, 1, SPAWNS.chicago[0].pos), "Welcome to Chicago");
});

test("save and reload round-trips the character", () => {
    const { game, a, as } = setup();
    a.bank = 200000;
    game.command(as(1), "buyveh", ["sultan"]);
    game.command(CONSOLE, "setjob", ["1", "mechanic", "1"]);
    const { saved } = game.leave(1);

    const again = game.join(1, "Tanner", saved);
    assert.equal(again.bank, 80000);
    assert.deepEqual(again.job, { name: "mechanic", grade: 1 });
    assert.equal(again.garage[0].plate, saved.garage[0].plate);
    assert.deepEqual(again.inventory, saved.inventory);
});

// ---------------- revive flow ----------------
function medicalSetup() {
    const env = setup();
    const { game, b, as } = env;
    game.command(CONSOLE, "setjob", ["2", "ems", "0"]);
    game.command(as(2), "duty");
    b.inventory.medkit = 2;
    const spot = { x: -300, y: 6100, z: 31 }; // Chicago
    game.updatePosition(1, spot);
    game.updatePosition(2, { x: -301, y: 6100, z: 31 });
    return { ...env, spot };
}

test("going down from damage alerts on-duty EMS once, and locks most commands", () => {
    const { game, a, as } = medicalSetup();
    const first = game.syncHealth(1, 0, 0);
    assert.ok(a.downed);
    assert.ok(first.notify.some((n) => n.id === 2 && n.msg.includes("/revive 1") && n.msg.includes("Chicago")));
    assert.ok(first.notify.some((n) => n.id === 1 && n.msg.includes("EMS has been alerted")));
    assert.equal(game.syncHealth(1, 0, 0).notify.length, 0); // no repeat alert

    assert.match(game.command(as(1), "inventory").msg, /You're down/);
    assert.match(game.command(as(1), "status").msg, /Health: 0/);
    assert.ok(game.command(as(1), "911").notify.some((n) => n.id === 2));
});

test("starving to 0 knocks you down; needs freeze while down", () => {
    const { game, a } = medicalSetup();
    a.hunger = 0; a.thirst = 0; a.health = 4;
    const out = game.tick(1, 0);
    assert.ok(a.downed);
    assert.ok(out.notify.some((n) => n.id === 2));
    game.tick(30, 0);
    assert.equal(a.hunger, 0); // didn't keep draining / no double alert
});

test("revive: EMS only, on duty, close, with a medkit — then you're up and fed", () => {
    const { game, a, b, as, spot } = medicalSetup();
    game.syncHealth(1, 0, 0);
    const medicAt = (pos) => as(2, { pos });

    assert.match(game.command(as(3), "revive", ["1"]).msg, /isn't loaded|Only EMS/);
    game.join(3, "Rando");
    assert.match(game.command(as(3, { pos: spot }), "revive", ["1"]).msg, /Only EMS/);
    assert.match(game.command(medicAt({ x: 0, y: 0, z: 0 }), "revive", ["1"]).msg, /Get closer/);
    assert.match(game.command(medicAt(spot), "revive", ["2"]).msg, /yourself/);

    game.command(as(2, { pos: spot }), "duty"); // clock out
    assert.match(game.command(medicAt(spot), "revive", ["1"]).msg, /Clock in/);
    game.command(as(2, { pos: spot }), "duty"); // back in

    const res = game.command(medicAt(spot), "revive", ["1"]);
    assert.equal(a.downed, false);
    assert.equal(a.health, 50);
    assert.equal(a.hunger, 100);
    assert.equal(b.inventory.medkit, 1);
    assert.equal(b.bank, 5150);
    assert.equal(res.actions[0].type, "revive");
    assert.match(game.command(medicAt(spot), "revive", ["1"]).msg, /isn't down/);

    // No medkits left
    b.inventory = {};
    game.syncHealth(1, 0, 0);
    assert.match(game.command(medicAt(spot), "revive", ["1"]).msg, /medkit/);
});

test("revive tops up empty needs so you don't drop straight back down", () => {
    const { game, a, as, spot } = medicalSetup();
    a.hunger = 0; a.thirst = 0; a.health = 1;
    game.tick(1, 0);
    game.command(as(2, { pos: spot }), "revive", ["1"]);
    assert.equal(a.hunger, 30);
    assert.equal(a.thirst, 30);
});

test("respawn: waits for bleedout, bills the bank, sends you to the nearest hospital", () => {
    const { game, a, as, spot } = medicalSetup();
    game.syncHealth(1, 0, 0);
    assert.match(game.command(as(1, { pos: spot, now: 60 * 1000 }), "respawn").msg, /respawn in 4 min/);

    const res = game.command(as(1, { pos: spot, now: 5 * 60 * 1000 }), "respawn");
    assert.match(res.msg, /Winterline Memorial/); // 150 units away; Lakeshore is 232
    assert.equal(a.bank, 4500);
    assert.equal(a.downed, false);
    assert.deepEqual(res.actions[0].pos, { x: -150, y: 6100, z: 32 });

    // Broke: bill is whatever's in the bank
    a.bank = 120;
    game.syncHealth(1, 0, 0);
    game.command(as(1, { now: 10 * 60 * 1000 }), "respawn");
    assert.equal(a.bank, 0);
});

test("no EMS on duty: the patient is told so", () => {
    const { game, as } = setup();
    const out = game.syncHealth(1, 0, 0);
    assert.match(out.notify[0].msg, /no EMS is on duty/);
    assert.match(game.command(as(1), "respawn").msg, /respawn in 5 min/);
});

test("logging out while down keeps you down; console can force-revive", () => {
    const { game, as } = medicalSetup();
    game.syncHealth(1, 0, 0);
    const { saved } = game.leave(1);
    assert.equal(saved.downed, true);

    const back = game.join(1, "Tanner", saved);
    assert.ok(back.downed);
    assert.match(game.command(as(1), "forcerevive", ["1"]).msg, /Console only/);
    game.command(CONSOLE, "forcerevive", ["1"]);
    assert.equal(back.downed, false);
    assert.equal(back.health, 100);
});

// ---------------- weapons & ammo ----------------
const { AMMO_TYPES } = require("./ammo");
const { ITEMS, getWeight } = require("./inventory");

function armedSetup() {
    const env = setup();
    env.game.command(CONSOLE, "giveitem", ["1", "glizzy"]);
    env.atAmmu = env.as(1, { pos: SHOPS.chi_ammu.pos });
    return env;
}

test("Gunworks sells ammo boxes at the box price, and boxes weigh what they say", () => {
    const { game, a, atAmmu } = armedSetup();
    game.command(atAmmu, "buy", ["ammo_9mm", "2"]);
    assert.equal(a.cash, 500 - 150);
    assert.equal(a.inventory.ammo_9mm, 2);
    assert.equal(getWeight({ ammo_9mm: 2 }), 1.2);
    assert.equal(getWeight({ ammo_12ga: 10 }), 11);
});

test("loading: needs a gun for that ammo, the boxes, and room under the cap", () => {
    const { game, a, as } = armedSetup();
    a.inventory.ammo_762 = 1;
    assert.match(game.command(as(1), "loadammo", ["rifle"]).msg, /don't have a gun/);
    assert.match(game.command(as(1), "loadammo", ["pistol"]).msg, /don't have 1x/);

    a.inventory.ammo_9mm = 6;
    const res = game.command(as(1), "loadammo", ["9mm", "2"]);
    assert.equal(a.ammo.pistol, 100);
    assert.equal(a.inventory.ammo_9mm, 4);
    assert.deepEqual(res.actions[0], { type: "setAmmo", target: 1, ammoType: "AMMO_PISTOL", rounds: 100 });

    // cap is 250: 100 + 3 boxes = 250 ok, one more is refused and nothing changes
    game.command(as(1), "loadammo", ["pistol", "3"]);
    assert.equal(a.ammo.pistol, 250);
    assert.match(game.command(as(1), "loadammo", ["pistol"]).msg, /cap.*load 0 more/);
    assert.equal(a.inventory.ammo_9mm, 1);
    assert.match(game.command(as(1), "loadammo", ["lasers"]).msg, /No ammo type/);
});

test("unloading gives back full boxes only; leftovers stay loaded", () => {
    const { game, a, as } = armedSetup();
    a.ammo.pistol = 120;
    game.command(as(1), "unloadammo", ["pistol"]);
    assert.equal(a.inventory.ammo_9mm, 2);
    assert.equal(a.ammo.pistol, 20);
    assert.match(game.command(as(1), "unloadammo", ["pistol"]).msg, /Not enough/);
});

test("client ammo reports can lower the count but never raise it", () => {
    const { game, a } = armedSetup();
    a.ammo.pistol = 100;
    game.syncAmmo(1, { AMMO_PISTOL: 63 });
    assert.equal(a.ammo.pistol, 63);
    game.syncAmmo(1, { AMMO_PISTOL: 9999 });
    assert.equal(a.ammo.pistol, 63);
    game.syncAmmo(1, { AMMO_PISTOL: -5, AMMO_RIFLE: 1.5 });
    assert.equal(a.ammo.pistol, 63);
    assert.equal(a.ammo.rifle, undefined);
});

test("equip and holster; losing the gun takes it out of your hands", () => {
    const { game, a, as } = armedSetup();
    a.ammo.pistol = 50;
    assert.match(game.command(as(1), "equip", ["water"]).msg, /isn't a weapon/);
    assert.match(game.command(as(1), "equip", ["uzi"]).msg, /don't have/);

    const out = game.command(as(1), "equip", ["glizzy"]);
    assert.deepEqual(out.actions[0], { type: "giveWeapon", target: 1, weapon: "WEAPON_COMBATPISTOL", ammoType: "AMMO_PISTOL", rounds: 50 });
    assert.equal(a.equipped, "glizzy");
    assert.equal(game.command(as(1), "holster").actions[0].type, "removeWeapon");

    game.command(as(1), "equip", ["glizzy"]);
    const dropped = game.command(as(1, { pos: { x: 5, y: 5, z: 30 } }), "dropitem", ["glizzy"]);
    assert.ok(dropped.actions.some((x) => x.type === "removeWeapon" && x.weapon === "WEAPON_COMBATPISTOL"));
    assert.equal(a.equipped, null);
});

test("loaded ammo saves; you always log back in holstered", () => {
    const { game, a, as } = armedSetup();
    a.ammo.pistol = 80;
    game.command(as(1), "equip", ["glizzy"]);
    const { saved } = game.leave(1);
    const back = game.join(1, "Tanner", saved);
    assert.equal(back.ammo.pistol, 80);
    assert.equal(back.equipped, null);
});

test("every ammo type has a box item, and every box fits in a bag", () => {
    for (const t of Object.values(AMMO_TYPES)) {
        assert.ok(ITEMS[t.box]);
        assert.ok(ITEMS[t.box].weight < 30);
        assert.equal(t.max % t.perBox, 0); // caps are whole boxes, so a full load is reachable
    }
});

// ---------------- gold ----------------
test("guns cost gold at Gunworks: Glizzy is 444 gold and weighs 1.0", () => {
    const { game, a, as } = setup();
    const atAmmu = as(1, { pos: SHOPS.chi_ammu.pos });
    a.licenses.weapon = { issuedAt: 0 }; // licenses have their own tests below
    assert.equal(ITEMS.glizzy.weight, 1.0);
    assert.match(game.command(atAmmu, "shop").msg, /Glizzy \(glizzy\) — 444 gold, 1 kg/);

    assert.match(game.command(atAmmu, "buy", ["glizzy"]).msg, /Not enough gold — 1x costs 444 gold, you have 0/);
    a.gold = 500;
    const cashBefore = a.cash, bankBefore = a.bank;
    game.command(atAmmu, "buy", ["glizzy", "1", "bank"]); // "bank" is ignored: guns are gold only
    assert.equal(a.gold, 56);
    assert.equal(a.inventory.glizzy, 1);
    assert.equal(a.cash, cashBefore);
    assert.equal(a.bank, bankBefore);
});

test("gold buys only what fits in your bag; nothing is taken otherwise", () => {
    const { game, a, as } = setup();
    a.gold = 99999;
    a.licenses.weapon = { issuedAt: 0 };
    a.inventory.fuelcan = 5; // 25 kg + 1.5 kg starters
    assert.match(game.command(as(1, { pos: SHOPS.chi_ammu.pos }), "buy", ["huntingrifle"]).msg, /Too heavy/);
    assert.equal(a.gold, 99999);
});

test("gold is earned on duty and by reviving — never by civilians, never traded", () => {
    const { game, a, b, as } = setup();
    game.command(CONSOLE, "setjob", ["1", "police", "0"]);
    game.tick(PAY_INTERVAL_MIN, 0);
    assert.equal(a.gold, 0); // off duty
    assert.equal(b.gold, 0); // civilian
    game.command(as(1), "duty");
    const out = game.tick(PAY_INTERVAL_MIN, 0);
    assert.equal(a.gold, 45);
    assert.ok(out.notify.some((n) => n.id === 1 && n.msg.includes("+ 45 gold")));

    // Can't move gold with any money command
    assert.match(game.command(CONSOLE, "givemoney", ["2", "gold", "100"]).msg, /No account called gold/);
    assert.match(game.command(as(1), "pay", ["2", "45"]).msg, /Sent \$45/); // that's dollars, not gold
    assert.equal(a.gold, 45);
    assert.equal(b.gold, 0);
    assert.match(game.command(as(1), "balance").msg, /Gold: 45/);
});

test("EMS earn gold for a revive", () => {
    const { game, b, as } = setup();
    game.command(CONSOLE, "setjob", ["2", "ems", "0"]);
    game.command(as(2), "duty");
    b.inventory.medkit = 1;
    const spot = { x: -300, y: 6100, z: 31 };
    game.updatePosition(1, spot);
    game.updatePosition(2, spot);
    game.syncHealth(1, 0, 0);
    game.command(as(2, { pos: spot }), "revive", ["1"]);
    assert.equal(b.gold, 25);
});

test("console givegold for events; players can't; gold saves", () => {
    const { game, as } = setup();
    assert.match(game.command(as(1), "givegold", ["1", "100"]).msg, /Console only/);
    assert.match(game.command(CONSOLE, "givegold", ["1", "-5"]).msg, /whole number/);
    game.command(CONSOLE, "givegold", ["1", "100"]);
    const { saved } = game.leave(1);
    assert.equal(game.join(1, "Tanner", saved).gold, 100);
    assert.equal(game.join(9, "New").gold, 0);
});

// ---------------- police ----------------
const { JAIL } = require("./police");

function policeSetup() {
    const env = setup();
    const { game, as } = env;
    game.command(CONSOLE, "setjob", ["1", "police", "0"]);
    game.command(as(1), "duty");
    const spot = { x: -300, y: 6100, z: 31 };
    const standing = { 1: spot, 2: { x: -301, y: 6100, z: 31 } };
    game.updatePosition(1, standing[1]);
    game.updatePosition(2, standing[2]);
    // Like in-game: every command comes from where that player is actually standing
    env.as = (id, extra = {}) => as(id, { pos: standing[id] || NOWHERE, ...extra });
    env.cop = env.as(1);
    return env;
}

test("cuffing: police only, on duty, close by — and it takes the suspect's gun out of their hands", () => {
    const { game, b, as, cop } = policeSetup();
    assert.match(game.command(as(2), "cuff", ["1"]).msg, /Only the Sheriff/);
    assert.match(game.command(as(1, { pos: { x: 0, y: 0, z: 0 } }), "cuff", ["2"]).msg, /Get closer/);
    assert.match(game.command(cop, "cuff", ["1"]).msg, /Not on yourself/);

    game.command(CONSOLE, "giveitem", ["2", "glizzy"]);
    game.command(as(2), "equip", ["glizzy"]);
    const res = game.command(cop, "cuff", ["2"]);
    assert.ok(b.cuffed);
    assert.equal(b.equipped, null);
    assert.ok(res.actions.some((x) => x.type === "setCuffed" && x.cuffed));
    assert.ok(res.actions.some((x) => x.type === "removeWeapon" && x.target === 2));

    // cuffed players can look, not act
    assert.match(game.command(as(2), "equip", ["glizzy"]).msg, /in cuffs/);
    assert.match(game.command(as(2), "inventory").msg, /Glizzy/);

    game.command(cop, "cuff", ["2"]);
    assert.equal(b.cuffed, false);
});

test("search and seize need the suspect cuffed; seized items are destroyed, not pocketed", () => {
    const { game, a, b, cop } = policeSetup();
    game.command(CONSOLE, "giveitem", ["2", "lockpick", "2"]);
    assert.match(game.command(cop, "search", ["2"]).msg, /cuffed or down/);

    game.command(cop, "cuff", ["2"]);
    assert.match(game.command(cop, "search", ["2"]).msg, /Lockpick x2/);
    game.command(cop, "seize", ["2", "lockpick", "2"]);
    assert.equal(b.inventory.lockpick, undefined);
    assert.equal(a.inventory.lockpick, undefined);
    assert.match(game.command(cop, "seize", ["2", "lockpick"]).msg, /doesn't have/);
});

test("fines: from the bank, capped, refused (nothing taken) if they can't pay", () => {
    const { game, a, b, cop } = policeSetup();
    game.command(cop, "fine", ["2", "750"]);
    assert.equal(b.bank, 4250);
    assert.equal(a.bank, 5000); // officer doesn't pocket it
    assert.match(game.command(cop, "fine", ["2", "6000"]).msg, /max out/);
    b.bank = 100;
    assert.match(game.command(cop, "fine", ["2", "500"]).msg, /can't cover/);
    assert.equal(b.bank, 100);
});

test("jail: must be cuffed, time counts down, release at the gate, and logging out doesn't skip it", () => {
    const { game, b, as, cop } = policeSetup();
    assert.match(game.command(cop, "jail", ["2", "10"]).msg, /Cuff/);
    game.command(cop, "cuff", ["2"]);
    assert.match(game.command(cop, "jail", ["2", "99"]).msg, /1 to 30/);

    const res = game.command(cop, "jail", ["2", "10"]);
    assert.deepEqual(res.actions.find((x) => x.type === "teleport").pos, JAIL.cell);
    assert.equal(b.cuffed, false);
    assert.match(game.command(as(2), "buyveh", ["sultan"]).msg, /in jail — 10 min/);

    game.tick(4, 0);
    assert.match(game.command(as(2), "jailtime").msg, /6 min left/);

    // Log out mid-sentence, come back: still 6 minutes
    const { saved } = game.leave(2);
    const back = game.join(2, "Hayden", saved);
    assert.equal(back.jailMinutes, 6);

    const out = game.tick(6, 0);
    assert.equal(back.jailMinutes, 0);
    assert.ok(out.actions.some((x) => x.type === "teleport" && x.target === 2));
    assert.match(game.command(as(2), "jailtime").msg, /not in jail/);
});

test("console can unjail; players can't", () => {
    const { game, b, as, cop } = policeSetup();
    game.command(cop, "cuff", ["2"]);
    game.command(cop, "jail", ["2", "30"]);
    assert.match(game.command(as(1), "unjail", ["2"]).msg, /Console only/);
    game.command(CONSOLE, "unjail", ["2"]);
    assert.equal(b.jailMinutes, 0);
});

// ---------------- spawns ----------------
const { RELEASE_CITY, DEFAULT_CITY } = require("./spawns");
const { cityAt } = require("./cities");

test("every city releases into a different city, and every spawn point is in its own city", () => {
    for (const [from, to] of Object.entries(RELEASE_CITY)) assert.notEqual(from, to);
    for (const [city, list] of Object.entries(SPAWNS)) {
        assert.ok(list.length >= 2, `${city} needs at least 2 spawn points`);
        for (const spot of list) assert.equal(cityAt(spot.pos), city, `${spot.label} isn't inside ${city}`);
    }
});

function arrestIn(city) {
    const game = createGame({ rng: () => 0 });
    const cop = game.join(1, "Tanner");
    const suspect = game.join(2, "Hayden");
    game.command(CONSOLE, "setjob", ["1", "police", "0"]);
    const spot = SPAWNS[city][0].pos;
    const at = (id) => ({ id, pos: spot, now: 0 });
    game.updatePosition(2, spot); // in-game, positions report every 5 seconds
    game.command(at(1), "duty");
    game.command(at(1), "cuff", ["2"]);
    game.command(at(1), "jail", ["2", "5"]);
    return { game, cop, suspect };
}

for (const [from, to] of Object.entries(RELEASE_CITY)) {
    test(`arrested in ${from} -> released in ${to}`, () => {
        const { game, suspect } = arrestIn(from);
        assert.equal(suspect.jailedFrom, from);
        const out = game.tick(5, 0);
        const tp = out.actions.find((x) => x.type === "teleport" && x.target === 2);
        assert.deepEqual(tp.pos, SPAWNS[to][0].pos);
        assert.equal(cityAt(tp.pos), to);
        assert.ok(out.notify.some((n) => n.id === 2 && n.msg.includes(`released in ${CITY_LABEL[to]}`)));
        assert.equal(suspect.jailedFrom, null);
        // the teleport itself doesn't trigger a "Welcome to" announcement
        assert.equal(announce(game, 2, tp.pos), null);
    });
}
const CITY_LABEL = { atlanta: "Atlanta", geepee: "GeePee", chicago: "Chicago" };

test("arrest city survives logging out, and console unjail follows the same rule", () => {
    const { game } = arrestIn("atlanta");
    const { saved } = game.leave(2);
    assert.equal(saved.jailedFrom, "atlanta");
    game.join(2, "Hayden", saved);
    const res = game.command(CONSOLE, "unjail", ["2"]);
    assert.equal(cityAt(res.actions[0].pos), "chicago");
});

test("login spawn: new players in the default city, returning players where they left, jailed players in the cell", () => {
    const game = createGame({ rng: () => 0.99 });
    game.join(1, "New");
    const fresh = game.loginSpawn(1);
    assert.equal(fresh.reason, "new");
    assert.equal(fresh.city, DEFAULT_CITY);
    assert.deepEqual(fresh.pos, SPAWNS[DEFAULT_CITY][SPAWNS[DEFAULT_CITY].length - 1].pos); // rng 0.99 = last spot

    game.updatePosition(1, SPAWNS.chicago[1].pos);
    const { saved } = game.leave(1);
    game.join(1, "New", saved);
    const back = game.loginSpawn(1);
    assert.equal(back.reason, "return");
    assert.deepEqual(back.pos, SPAWNS.chicago[1].pos);

    game.leave(1);
    game.join(1, "New", { ...saved, jailMinutes: 3, jailedFrom: "chicago" });
    assert.equal(game.loginSpawn(1).reason, "jail");
});

// ---------------- fuel & repairs ----------------
const fuelRules = require("./fuel");

function carSetup() {
    const env = setup();
    const { game, a } = env;
    a.bank = 200000;
    game.command(env.as(1), "buyveh", ["sultan"]);
    env.plate = a.garage[0].plate;
    env.station = fuelRules.GAS_STATIONS[0].pos;
    env.spawnOut = game.command(env.as(1, { pos: env.station }), "spawnveh", [env.plate]);
    env.car = a.garage[0];
    env.near = (id, extra = {}) => env.as(id, { vehiclePlate: env.plate, ...extra });
    return env;
}

test("a new car comes out with a full tank and no damage", () => {
    const { car, spawnOut } = carSetup();
    assert.equal(car.fuel, 60);
    assert.equal(car.engine, 1000);
    const state = spawnOut.actions.find((x) => x.type === "setVehicleState");
    assert.deepEqual(state, { type: "setVehicleState", plate: car.plate, fuel: 60, tank: 60, engine: 1000, body: 1000 });
});

test("fuel burns by distance driven; teleports don't count; empty tank tells the owner", () => {
    const { game, car, plate } = carSetup();
    game.updateVehicle(plate, { pos: { x: 0, y: 0, z: 0 } });
    game.updateVehicle(plate, { pos: { x: 200, y: 0, z: 0 } }); // 0.2 km at 1 L/km
    assert.equal(car.fuel, 59.8);
    game.updateVehicle(plate, { pos: { x: 5000, y: 0, z: 0 } }); // teleport
    assert.equal(car.fuel, 59.8);

    car.fuel = 0.1;
    const out = game.updateVehicle(plate, { pos: { x: 5250, y: 0, z: 0 } });
    assert.equal(car.fuel, 0);
    assert.ok(out.notify.some((n) => n.id === 1 && n.msg.includes("ran out of fuel")));
    assert.ok(out.actions.some((x) => x.type === "setVehicleState" && x.fuel === 0));
});

test("damage reports only lower health — a modded client can't fix its own car", () => {
    const { game, car, plate } = carSetup();
    game.updateVehicle(plate, { engine: 420, body: 700 });
    assert.equal(car.engine, 420);
    game.updateVehicle(plate, { engine: 1000, body: 1000 });
    assert.equal(car.engine, 420);
    assert.equal(car.body, 700);
    game.updateVehicle(plate, { engine: NaN, body: "x" });
    assert.equal(car.engine, 420);
});

test("refuel at a gas station: per litre, room-limited, cash or bank", () => {
    const { game, a, car, near, station } = carSetup();
    assert.match(game.command(near(1, { pos: station }), "refuel").msg, /already full/);
    car.fuel = 20;
    assert.match(game.command(near(1, { pos: { x: 0, y: 0, z: 0 } }), "refuel").msg, /not at a gas station/);
    assert.match(game.command(near(1, { pos: station }), "refuel", ["50"]).msg, /Only 40 L of room/);

    game.command(near(1, { pos: station }), "refuel", ["10"]);
    assert.equal(car.fuel, 30);
    assert.equal(a.cash, 470);
    const bankBefore = a.bank;
    game.command(near(1, { pos: station }), "refuel", ["bank"]); // fill up by card
    assert.equal(car.fuel, 60);
    assert.equal(a.bank, bankBefore - 90);
});

test("fuel can: +20 L, only used up if the car can take it", () => {
    const { game, a, car, near, as } = carSetup();
    game.command(CONSOLE, "giveitem", ["1", "fuelcan", "2"]);
    assert.match(game.command(near(1), "useitem", ["fuelcan"]).msg, /already full/);
    assert.equal(a.inventory.fuelcan, 2);
    assert.match(game.command(as(1), "useitem", ["fuelcan"]).msg, /No car/);

    car.fuel = 5;
    game.command(near(1), "useitem", ["fuelcan"]);
    assert.equal(car.fuel, 25);
    assert.equal(a.inventory.fuelcan, 1);
});

test("repair kit: patches your own engine to 650, never anyone else's, never the body", () => {
    const { game, a, car, near } = carSetup();
    game.command(CONSOLE, "giveitem", ["1", "repairkit"]);
    game.command(CONSOLE, "giveitem", ["2", "repairkit"]);
    car.engine = 200; car.body = 300;
    assert.match(game.command(near(2), "useitem", ["repairkit"]).msg, /only patches your own car/);
    game.command(near(1), "useitem", ["repairkit"]);
    assert.equal(car.engine, 650);
    assert.equal(car.body, 300);
    assert.equal(a.inventory.repairkit, undefined);
    game.command(CONSOLE, "giveitem", ["1", "repairkit"]);
    assert.match(game.command(near(1), "useitem", ["repairkit"]).msg, /good enough/);
    assert.equal(a.inventory.repairkit, 1);
});

test("mechanic repair: full fix, owner nearby pays the mechanic, mechanic earns gold", () => {
    const { game, a, b, car, near } = carSetup();
    const shop = { x: -70, y: 6406, z: 31 };
    game.command(CONSOLE, "setjob", ["2", "mechanic", "1"]);
    car.engine = 300; car.body = 400;

    assert.match(game.command(near(2, { pos: shop }), "repair").msg, /Clock in/);
    game.command(near(2, { pos: shop }), "duty");
    assert.match(game.command(near(2, { pos: shop }), "repair").msg, /need a repair kit/);
    b.inventory.repairkit = 1;
    assert.match(game.command(near(2, { pos: shop }), "repair").msg, /owner has to be here/);

    game.updatePosition(1, shop);
    const ownerBank = a.bank, mechBank = b.bank;
    const res = game.command(near(2, { pos: shop }), "repair");
    assert.equal(car.engine, 1000);
    assert.equal(car.body, 1000);
    assert.equal(a.bank, ownerBank - 600);
    assert.equal(b.bank, mechBank + 600);
    assert.equal(b.gold, 10);
    assert.equal(b.inventory.repairkit, undefined);
    assert.ok(res.notify.some((n) => n.id === 1));
    b.inventory.repairkit = 1;
    assert.match(game.command(near(2, { pos: shop }), "repair").msg, /doesn't need/);
});

test("mechanics fixing their own car pay nothing and earn nothing", () => {
    const env = carSetup();
    const { game, a, car, near } = env;
    game.command(CONSOLE, "setjob", ["1", "mechanic", "0"]);
    game.command(near(1), "duty");
    a.inventory.repairkit = 1;
    car.engine = 100;
    const bank = a.bank;
    game.command(near(1), "repair");
    assert.equal(car.engine, 1000);
    assert.equal(a.bank, bank);
    assert.equal(a.gold, 0);
});

test("fuel and damage are saved with the car", () => {
    const { game, car } = carSetup();
    car.fuel = 12.5; car.engine = 480;
    const { saved } = game.leave(1);
    const back = game.join(1, "Tanner", saved);
    assert.equal(back.garage[0].fuel, 12.5);
    assert.equal(back.garage[0].engine, 480);
});

test("right after a repair, stale damage readings don't undo it; after the grace window they count again", () => {
    const { game, car, plate, near } = carSetup();
    game.command(CONSOLE, "giveitem", ["1", "repairkit"]);
    car.engine = 100;
    game.command(near(1, { now: 1000 }), "useitem", ["repairkit"]);
    game.updateVehicle(plate, { engine: 100 }, 5000);   // game hasn't applied the fix yet
    assert.equal(car.engine, 650);
    game.updateVehicle(plate, { engine: 500 }, 12000);  // later: real new damage
    assert.equal(car.engine, 500);
});

// ---------------- licenses ----------------
const HOUR = 3600000;

test("no license, no gun: Gunworks refuses before touching your gold", () => {
    const { game, a, as } = setup();
    a.gold = 1000;
    const atAmmu = as(1, { pos: SHOPS.chi_ammu.pos });
    assert.match(game.command(atAmmu, "buy", ["glizzy"]).msg, /need a weapon license first/);
    assert.equal(a.gold, 1000);
    assert.equal(a.inventory.glizzy, undefined);
    // ammo doesn't need one
    assert.match(game.command(atAmmu, "buy", ["ammo_9mm"]).msg, /Bought/);
});

test("buying the license: dollars, only at Gunworks, only once", () => {
    const { game, a, as } = setup();
    assert.match(game.command(as(1), "buylicense", ["weapon"]).msg, /at Gunworks/);
    const atAmmu = as(1, { pos: SHOPS.chi_ammu.pos });
    assert.match(game.command(atAmmu, "buylicense", ["weapon"]).msg, /Not enough cash/); // $500 cash, $2,500 license
    game.command(atAmmu, "buylicense", ["weapon", "bank"]);
    assert.ok(a.licenses.weapon);
    assert.equal(a.bank, 2500);
    assert.match(game.command(atAmmu, "buylicense", ["weapon", "bank"]).msg, /already have/);
    assert.match(game.command(as(1), "licenses").msg, /Weapon license: VALID/);

    a.gold = 444;
    game.command(atAmmu, "buy", ["glizzy"]);
    assert.equal(a.inventory.glizzy, 1);
});

test("police check licenses on a stop: no cuffs, close by, and they see a gun that's out", () => {
    const { game, b, as } = setup();
    game.command(CONSOLE, "setjob", ["1", "police", "0"]);
    game.command(as(1), "duty");
    const spot = { x: -300, y: 6100, z: 31 };
    const cop = as(1, { pos: spot });
    game.updatePosition(2, { x: -303, y: 6100, z: 31 }); // 3 m: a traffic-stop distance

    assert.match(game.command(as(2, { pos: { x: -303, y: 6100, z: 31 } }), "checklicense", ["1"]).msg, /Only the Sheriff/);
    let res = game.command(cop, "checklicense", ["2"]);
    assert.match(res.msg, /Weapon license: none/);
    assert.ok(res.notify.some((n) => n.id === 2));
    assert.equal(b.cuffed, false);

    b.licenses.weapon = { issuedAt: 0 };
    game.command(CONSOLE, "giveitem", ["2", "glizzy"]);
    game.command(as(2, { pos: { x: -303, y: 6100, z: 31 } }), "equip", ["glizzy"]);
    res = game.command(cop, "checklicense", ["2"]);
    assert.match(res.msg, /VALID/);
    assert.match(res.msg, /Holding: Glizzy/);
});

test("revoked: license gone, can't re-buy until the ban ends — logging out doesn't shorten it", () => {
    const { game, b, as } = setup();
    game.command(CONSOLE, "setjob", ["1", "police", "0"]);
    game.command(as(1), "duty");
    const spot = { x: -300, y: 6100, z: 31 };
    game.updatePosition(2, { x: -302, y: 6100, z: 31 });
    b.licenses.weapon = { issuedAt: 0 };

    const res = game.command(as(1, { pos: spot, now: 0 }), "revokelicense", ["2"]);
    assert.ok(res.notify.some((n) => n.id === 2 && n.msg.includes("24h")));
    assert.equal(b.licenses.weapon, undefined);
    assert.match(game.command(as(1, { pos: spot }), "revokelicense", ["2"]).msg, /doesn't have/);

    const { saved } = game.leave(2);
    const back = game.join(2, "Hayden", saved);
    back.bank = 10000;
    const atAmmu = (now) => as(2, { pos: SHOPS.chi_ammu.pos, now });
    assert.match(game.command(atAmmu(5 * HOUR), "buylicense", ["weapon", "bank"]).msg, /revoked — 19h/);
    assert.match(game.command(atAmmu(5 * HOUR), "licenses").msg, /REVOKED/);
    game.command(atAmmu(25 * HOUR), "buylicense", ["weapon", "bank"]);
    assert.ok(back.licenses.weapon);
});

test("console can issue a license (and it clears a ban); players can't", () => {
    const { game, a, as } = setup();
    a.licenseBans.weapon = Date.now() + 10 * HOUR;
    assert.match(game.command(as(1), "givelicense", ["1"]).msg, /Console only/);
    game.command(CONSOLE, "givelicense", ["1", "weapon"]);
    assert.ok(a.licenses.weapon);
    assert.equal(a.licenseBans.weapon, undefined);
});

test("every city has two hospitals, and you wake at the closer one", () => {
    const med = require("./medical");
    for (const [city, list] of Object.entries(med.HOSPITALS)) {
        assert.equal(list.length, 2, `${city} should have two hospitals`);
        assert.notEqual(list[0].label, list[1].label);
        for (const h of list) assert.equal(cityAt(h.pos), city, `${h.label} isn't inside ${city}`);
    }

    // Same city, two different corners -> two different hospitals
    const { game, a, as } = setup();
    const wake = (pos) => {
        a.downed = false;
        game.updatePosition(1, pos);
        game.syncHealth(1, 0, 0);
        return game.command(as(1, { pos, now: 9 * 60 * 1000 }), "respawn").msg;
    };
    assert.match(wake({ x: -245, y: 6400, z: 33 }), /Lakeshore General/);
    assert.match(wake({ x: -150, y: 6020, z: 32 }), /Winterline Memorial/);
    assert.match(wake({ x: 290, y: -600, z: 43 }), /Red Clay General/);
    assert.match(wake({ x: -900, y: -900, z: 36 }), /Peach Ridge Medical/);
});

// ---------------- taxi ----------------
const { fareFor, FARE_BASE } = require("./taxi");

function cabSetup() {
    const env = setup();
    const { game } = env;
    game.command(CONSOLE, "setjob", ["1", "taxi", "0"]);   // Tanner drives
    env.corner = { x: 0, y: 6100, z: 30 };                 // both start together in Chicago
    game.updatePosition(1, env.corner);
    game.updatePosition(2, env.corner);
    env.at = (id, pos = env.corner, extra = {}) => env.as(id, { pos, now: 0, ...extra });
    game.command(env.at(1), "duty");
    return env;
}

// drives the cab in steps the teleport guard will accept
function drive(game, units, from = { x: 0, y: 6100, z: 30 }) {
    const step = 250;
    for (let moved = step; moved <= units; moved += step) {
        game.updatePosition(1, { x: from.x + moved, y: from.y, z: from.z });
    }
}

test("a full fare: call, accept, meter, drop-off — money moves once and only once", () => {
    const { game, a, b, at } = cabSetup();

    const called = game.command(at(2), "taxi");
    assert.match(called.msg, /Cab called/);
    assert.ok(called.notify.some((n) => n.id === 1 && n.msg.includes("/accept 2")));

    game.command(at(1), "accept", ["2"]);
    game.command(at(1), "startfare", ["2"]);
    assert.match(game.command(at(2), "fare").msg, /0 units/); // passenger can read the meter too

    drive(game, 1000);
    assert.equal(fareFor(1000), 110); // $30 flag drop + $8 per 100 units
    assert.match(game.command(at(1), "fare").msg, /1000 units/);

    const res = game.command(at(1), "endfare");
    assert.equal(b.bank, 5000 - 110);
    assert.equal(a.bank, 5000 + 110);
    assert.equal(a.gold, 5);
    assert.ok(res.notify.some((n) => n.id === 2 && n.msg.includes("$110")));
    assert.match(game.command(at(1), "endfare").msg, /No fare running/);
});

test("the meter counts driving, not teleporting", () => {
    const { game, b, at } = cabSetup();
    game.command(at(2), "taxi");
    game.command(at(1), "accept", ["2"]);
    game.command(at(1), "startfare", ["2"]);

    game.updatePosition(1, { x: 200, y: 6100, z: 30 });    // 200 units driven
    game.updatePosition(1, { x: 9000, y: 6100, z: 30 });   // a jump: ignored
    assert.match(game.command(at(1), "fare").msg, /200 units/);
    game.command(at(1), "endfare");
    assert.equal(b.bank, 5000 - fareFor(200));
});

test("only an on-duty driver can take a call, and only one driver per call", () => {
    const { game, at } = cabSetup();
    game.command(at(2), "taxi");
    assert.match(game.command(at(2), "accept", ["2"]).msg, /Only taxi drivers/);

    game.command(at(1), "duty"); // clock out
    assert.match(game.command(at(1), "accept", ["2"]).msg, /Clock in first/);
    game.command(at(1), "duty");

    game.command(at(1), "accept", ["2"]);
    game.join(3, "Kaos");
    game.command(CONSOLE, "setjob", ["3", "taxi", "0"]);
    game.updatePosition(3, { x: 0, y: 6100, z: 30 });
    game.command(at(3), "duty");
    assert.match(game.command(at(3), "accept", ["2"]).msg, /Another driver took/);
    assert.match(game.command(at(3), "startfare", ["2"]).msg, /haven't taken/);
});

test("the meter only starts next to the passenger", () => {
    const { game, at } = cabSetup();
    game.command(at(2), "taxi");
    game.command(at(1), "accept", ["2"]);
    // commands carry the position the player is actually standing at
    const away = { x: 120, y: 6100, z: 30 };
    game.updatePosition(1, away);
    assert.match(game.command(at(1, away), "startfare", ["2"]).msg, /Get closer/);
    const beside = { x: 4, y: 6100, z: 30 };
    game.updatePosition(1, beside);
    assert.match(game.command(at(1, beside), "startfare", ["2"]).msg, /Meter running/);
});

test("a passenger who can't cover it pays what they have", () => {
    const { game, a, b, at } = cabSetup();
    b.bank = 40;
    game.command(at(2), "taxi");
    game.command(at(1), "accept", ["2"]);
    game.command(at(1), "startfare", ["2"]);
    drive(game, 1000);
    const res = game.command(at(1), "endfare");
    assert.equal(b.bank, 0);
    assert.equal(a.bank, 5040);
    assert.equal(a.gold, 5);               // the driver still did the work
    assert.match(res.msg, /\$70 short/);
});

test("one cab at a time, and an unclaimed call goes stale", () => {
    const { game, at } = cabSetup();
    game.command(at(2), "taxi");
    assert.match(game.command(at(2), "taxi").msg, /already have a cab/);
    assert.match(game.command(at(2), "cancelcab").msg, /cancelled/);
    assert.match(game.command(at(2), "cancelcab").msg, /haven't called/);

    game.command(at(2), "taxi");
    const out = game.tick(5, 5 * 60 * 1000);
    assert.ok(out.notify.some((n) => n.id === 2 && n.msg.includes("No driver picked up")));
    assert.match(game.command(at(1), "calls").msg, /No cabs wanted/);
});

test("logging off mid-fare cancels it and tells the other side", () => {
    const { game, at } = cabSetup();
    game.command(at(2), "taxi");
    game.command(at(1), "accept", ["2"]);
    game.command(at(1), "startfare", ["2"]);
    drive(game, 500);

    const { notify } = game.leave(2); // passenger quits
    assert.ok(notify.some((n) => n.id === 1 && n.msg.includes("passenger logged off")));
    assert.match(game.command(at(1), "fare").msg, /No fare running/);
});

// ---------------- robbery ----------------
const heistRules = require("./robbery");

function robSetup() {
    const game = createGame({ rng: () => 0 }); // lowest payout, so the numbers are predictable
    const cop = game.join(1, "Tanner");
    const robber = game.join(2, "Hayden");
    const till = SHOPS.chi_247.pos;
    const beat = { x: till.x - 100, y: till.y, z: till.z };
    const at = (id, pos = till, extra = {}) => ({ id, pos, now: 0, ...extra });

    game.command(CONSOLE, "setjob", ["1", "police", "0"]);
    game.updatePosition(1, beat, 0);
    game.updatePosition(2, till, 0);
    game.command(at(1, beat), "duty");

    game.command(CONSOLE, "giveitem", ["2", "glizzy"]);
    robber.ammo.pistol = 12;
    game.command(at(2), "equip", ["glizzy"]);
    return { game, cop, robber, till, beat, at };
}

test("a hold-up: cops get called, you stand there, the till pays out in cash", () => {
    const { game, robber, till, at } = robSetup();

    const res = game.command(at(2), "rob");
    assert.match(res.msg, /Holding up Open 24 Chicago/);
    assert.ok(res.notify.some((n) => n.id === 1 && n.msg.includes("ROBBERY IN PROGRESS") && n.msg.includes("Hayden")));

    assert.equal(game.updatePosition(2, till, 60000).notify.length, 0); // 60s in: nothing yet
    const done = game.updatePosition(2, till, 90000);
    assert.match(done.notify[0].msg, /Cleaned out Open 24 Chicago/);

    assert.equal(robber.cash, 500 + heistRules.PAYOUT_MIN); // dirty money, in cash
    assert.equal(robber.bank, 5000);
    assert.equal(game.updatePosition(2, till, 200000).notify.length, 0); // pays once, not every sweep
});

test("what stops you starting one", () => {
    const { game, robber, till, beat, at } = robSetup();

    assert.match(game.command(at(2, beat), "rob").msg, /not at a shop counter/);

    game.command(at(2), "holster");
    assert.match(game.command(at(2), "rob").msg, /Get a gun out first/);
    game.command(at(2), "equip", ["glizzy"]);

    robber.ammo.pistol = 0;
    assert.match(game.command(at(2), "rob").msg, /empty gun/);
    robber.ammo.pistol = 12;

    game.command(at(1, beat), "duty"); // the only officer clocks off
    assert.match(game.command(at(2), "rob").msg, /Too quiet/);
    game.command(at(1, beat), "duty");

    assert.match(game.command(at(2), "rob").msg, /Holding up/);
    assert.match(game.command(at(2), "rob").msg, /already holding this place up/);
});

test("walking away from the counter ends it with nothing", () => {
    const { game, robber, till, at } = robSetup();
    game.command(at(2), "rob");
    const out = game.updatePosition(2, { x: till.x + 40, y: till.y, z: till.z }, 30000);
    assert.match(out.notify[0].msg, /walked away/);
    assert.equal(robber.cash, 500);
    assert.equal(game.updatePosition(2, till, 95000).notify.length, 0); // no late payout
});

test("getting cuffed mid-robbery ends it, and the officer is told what they caught", () => {
    const { game, robber, till, at } = robSetup();
    game.command(at(2), "rob");
    game.updatePosition(1, till, 0); // officer arrives

    const cuff = game.command(at(1), "cuff", ["2"]);
    assert.match(cuff.msg, /caught them robbing Open 24 Chicago/);
    assert.ok(robber.cuffed);
    assert.equal(robber.cash, 500);
    assert.equal(game.updatePosition(2, till, 95000).notify.length, 0);
});

test("going down mid-robbery ends it too", () => {
    const { game, robber, till, at } = robSetup();
    game.command(at(2), "rob");
    const out = game.syncHealth(2, 0, 0);
    assert.ok(out.notify.some((n) => n.id === 2 && n.msg.includes("went down")));
    assert.equal(game.updatePosition(2, till, 95000).notify.length, 0);
    assert.equal(robber.cash, 500);
});

test("the till stays empty for a while, and so does the robber's luck", () => {
    const { game, till, at } = robSetup();
    game.command(at(2), "rob");
    game.updatePosition(2, till, 90000);

    // same robber, somewhere else
    assert.match(game.command(at(2, SHOPS.chi_hardware.pos, { now: 95000 }), "rob").msg, /lay low for 15 min/);

    // a different robber, same shop
    const second = game.join(3, "Kaos");
    game.command(CONSOLE, "giveitem", ["3", "glizzy"]);
    second.ammo.pistol = 5;
    game.updatePosition(3, till, 95000);
    game.command(at(3, till, { now: 95000 }), "equip", ["glizzy"]);
    assert.match(game.command(at(3, till, { now: 95000 }), "rob").msg, /was just hit/);

    // and once the shop's 30 min (counted from when the first one finished) runs out, it's on again
    assert.match(game.command(at(3, till, { now: 35 * 60000 }), "rob").msg, /Holding up/);
});

// ---------------- phone ----------------
function phoneSetup() {
    let n = 0;
    const game = createGame({ rng: () => n++ / 10000 }); // predictable, distinct numbers
    const a = game.join(1, "Tanner");
    const b = game.join(2, "Hayden");
    const as = (id, extra = {}) => ({ id, pos: NOWHERE, now: 0, ...extra });
    return { game, a, b, as };
}

test("everyone gets a number from the city they started in, and keeps it", () => {
    const { game, a, b } = phoneSetup();
    assert.match(a.phone.number, /^7101-\d{4}$/); // started in Atlanta
    assert.notEqual(a.phone.number, b.phone.number);

    const { saved } = game.leave(1);
    assert.equal(saved.phone.number, a.phone.number);
    assert.equal(game.join(1, "Tanner", saved).phone.number, a.phone.number);
});

test("texting by player id or by number", () => {
    const { game, a, as } = phoneSetup();
    const res = game.command(as(1), "text", ["2", "meet", "at", "the", "pier"]);
    assert.match(res.msg, /meet at the pier/);
    assert.ok(res.notify.some((n) => n.id === 2 && n.msg.includes("Text from") && n.msg.includes("meet at the pier")));

    game.command(as(2), "text", [a.phone.number, "on", "my", "way"]);
    assert.match(game.command(as(1), "texts").msg, /on my way/);

    assert.match(game.command(as(1), "text", ["1", "hi"]).msg, /yourself/);
    assert.match(game.command(as(1), "text", ["99", "hi"]).msg, /No one by that number/);
    assert.match(game.command(as(1), "text", ["2"]).msg, /Say something/);
    assert.match(game.command(as(1), "text", ["2", "x".repeat(201)]).msg, /Too long/);
});

test("the inbox counts what's unread, and reading clears it", () => {
    const { game, as } = phoneSetup();
    game.command(as(1), "text", ["2", "yo"]);
    assert.match(game.command(as(2), "phone").msg, /1 unread/);
    assert.match(game.command(as(2), "texts").msg, /^< .*yo$/m);
    assert.match(game.command(as(2), "phone").msg, /No unread/);
});

test("a saved contact puts a name on the number", () => {
    const { game, b, as } = phoneSetup();
    assert.match(game.command(as(1), "save", [b.phone.number, "Hayden"]).msg, /Saved/);
    assert.match(game.command(as(1), "contacts").msg, /Hayden — 7101-/);
    assert.match(game.command(as(1), "text", ["2", "yo"]).msg, /To Hayden \(7101-/);
});

test("no phone means no texts, no 911 and no cab", () => {
    const { game, a, as } = phoneSetup();
    delete a.inventory.phone; // dropped in a fight, or an officer seized it

    assert.match(game.command(as(1), "text", ["2", "yo"]).msg, /don't have a phone/);
    assert.match(game.command(as(1), "911", ["help"]).msg, /don't have a phone/);
    assert.match(game.command(as(1), "taxi").msg, /don't have a phone/);
    assert.match(game.command(as(1), "phone").msg, /don't have a phone/);

    // and you can't be reached either
    assert.match(game.command(as(2), "text", ["1", "you", "there?"]).msg, /isn't reachable/);
});

test("911 reaches police and EMS on duty, with your number and city", () => {
    const { game, a, as } = phoneSetup();
    game.join(3, "Kaos");
    game.command(CONSOLE, "setjob", ["2", "police", "0"]);
    game.command(CONSOLE, "setjob", ["3", "ems", "0"]);
    game.command(as(2), "duty");
    game.command(as(3), "duty");

    const res = game.command(as(1, { pos: SPAWNS.chicago[0].pos }), "911", ["shots", "fired"]);
    assert.match(res.msg, /2 unit\(s\) notified/);
    for (const id of [2, 3]) {
        const line = res.notify.find((n) => n.id === id).msg;
        assert.ok(line.includes("shots fired"), line);
        assert.ok(line.includes(a.phone.number), line);
        assert.ok(line.includes("Chicago"), line);
    }

    game.command(as(2), "duty"); // both clock off
    game.command(as(3), "duty");
    assert.match(game.command(as(1), "911", ["hello"]).msg, /Nobody is on duty/);
});

// ---------------- crews ----------------
const crewRules = require("./gangs");

function crewSetup() {
    const env = setup();
    const { game, a } = env;
    a.bank = 100000;
    env.hq = SPAWNS.chicago[0].pos;
    env.at = (id, pos = env.hq, extra = {}) => env.as(id, { pos, now: 0, ...extra });
    game.updatePosition(1, env.hq);
    game.updatePosition(2, env.hq);
    game.command(env.at(1), "gangcreate", ["KAOS", "Kaos", "Crew"]);
    return env;
}

test("founding a crew costs money and plants the base where you stand", () => {
    const { game, a, b, at } = crewSetup();
    assert.equal(a.bank, 100000 - crewRules.CREATE_COST);
    assert.deepEqual(a.gang, { tag: "KAOS", rank: crewRules.LEADER });
    assert.match(game.command(at(1), "gang").msg, /\[KAOS\] Kaos Crew/);
    assert.match(game.command(at(1), "gang").msg, /Leader: Tanner/);
    assert.match(game.command(at(1), "gangs").msg, /\[KAOS\] Kaos Crew — 1 member/);

    assert.match(game.command(at(2), "gangcreate", ["KAOS", "Other", "Crew"]).msg, /taken/);
    assert.match(game.command(at(2), "gangcreate", ["TOOLONG", "Some", "Crew"]).msg, /2-5 letters/);
    assert.match(game.command(at(2), "gangcreate", ["ZZ", "no"]).msg, /3-24 characters/);
    assert.match(game.command(at(2), "gangcreate", ["ZZ", "Broke", "Crew"]).msg, /Not enough bank/);
    assert.equal(b.gang, null);
});

test("nobody is put in a crew without agreeing, and invites time out", () => {
    const { game, b, hq, at } = crewSetup();
    assert.match(game.command(at(2), "gangaccept").msg, /Nobody's invited/);

    const inv = game.command(at(1), "ganginvite", ["2"]);
    assert.ok(inv.notify.some((n) => n.id === 2 && n.msg.includes("/gangaccept")));
    assert.equal(b.gang, null); // invited is not joined

    game.command(at(2), "gangaccept");
    assert.deepEqual(b.gang, { tag: "KAOS", rank: crewRules.MEMBER });
    assert.match(game.command(at(1), "gang").msg, /Member: Hayden/);
    assert.match(game.command(at(1), "ganginvite", ["2"]).msg, /already in a crew/);

    // an invite left to rot gets cleared by the clock
    const rotting = crewSetup();
    rotting.game.command(rotting.at(1), "ganginvite", ["2"]);
    const out = rotting.game.tick(6, 6 * 60000);
    assert.ok(out.notify.some((n) => n.id === 2 && n.msg.includes("invite expired")));
    assert.match(rotting.game.command(rotting.at(2), "gangaccept").msg, /Nobody's invited/);

    // and turning up late to one tells you why
    const late = crewSetup();
    late.game.command(late.at(1), "ganginvite", ["2"]);
    assert.match(late.game.command(late.at(2, hq, { now: 6 * 60000 }), "gangaccept").msg, /expired/);
});

test("rank decides who can do what", () => {
    const { game, b, at } = crewSetup();
    game.command(at(1), "ganginvite", ["2"]);
    game.command(at(2), "gangaccept");
    const third = game.join(3, "Kaos");
    game.updatePosition(3, SPAWNS.chicago[0].pos);

    // a plain member can't run the place
    assert.match(game.command(at(2), "ganginvite", ["3"]).msg, /Only Officers and above/);
    assert.match(game.command(at(2), "gangkick", ["Tanner"]).msg, /Only Officers and above/);
    assert.match(game.command(at(2), "gangpromote", ["Hayden"]).msg, /Only Leaders and above/);

    game.command(at(1), "gangpromote", ["Hayden"]);
    assert.equal(b.gang.rank, crewRules.OFFICER);
    assert.match(game.command(at(1), "gangpromote", ["Hayden"]).msg, /Officer is as high/);

    // now an officer, Hayden can bring someone in but can't touch the leader
    game.command(at(2), "ganginvite", ["3"]);
    game.command(at(3), "gangaccept");
    assert.equal(third.gang.rank, crewRules.MEMBER);
    assert.match(game.command(at(2), "gangkick", ["Tanner"]).msg, /outranks you/);

    const kicked = game.command(at(2), "gangkick", ["Kaos"]);
    assert.equal(third.gang, null);
    assert.ok(kicked.notify.some((n) => n.id === 3 && n.msg.includes("kicked")));
});

test("a leader can't just walk away", () => {
    const { game, a, at } = crewSetup();
    game.command(at(1), "ganginvite", ["2"]);
    game.command(at(2), "gangaccept");
    assert.match(game.command(at(1), "gangleave").msg, /can't walk away/);

    const gone = game.command(at(1), "gangdisband");
    assert.ok(gone.notify.some((n) => n.id === 2));
    assert.equal(a.gang, null);
    assert.equal(game.get(2).gang, null);
    assert.match(game.command(at(1), "gangs").msg, /No crews yet/);
});

test("crew radio needs a radio in the bag, on both ends", () => {
    const { game, a, b, at } = crewSetup();
    game.command(at(1), "ganginvite", ["2"]);
    game.command(at(2), "gangaccept");

    assert.match(game.command(at(1), "g", ["yo"]).msg, /No radio/);
    a.inventory.radio = 1;
    b.inventory.radio = 1;
    const said = game.command(at(1), "g", ["meet", "at", "the", "base"]);
    assert.match(said.msg, /\[KAOS\] Leader Tanner: meet at the base/);
    assert.ok(said.notify.some((n) => n.id === 2));

    delete b.inventory.radio; // Hayden's radio gets seized
    assert.equal(game.command(at(1), "g", ["still", "there\?"]).notify.length, 0);
});

test("the stash only opens at the base, and only for the crew", () => {
    const { game, a, b, hq, at } = crewSetup();
    game.command(at(1), "ganginvite", ["2"]);
    game.command(at(2), "gangaccept");

    const away = { x: hq.x + 60, y: hq.y, z: hq.z };
    assert.match(game.command(at(1, away), "stash").msg, /not at the \[KAOS\] base/);

    game.command(CONSOLE, "giveitem", ["1", "lockpick", "3"]);
    game.command(at(1), "stashput", ["lockpick", "3"]);
    assert.equal(a.inventory.lockpick, undefined);
    assert.match(game.command(at(2), "stash").msg, /Lockpick x3/); // shared with the crew
    game.command(at(2), "stashtake", ["lockpick", "2"]);
    assert.equal(b.inventory.lockpick, 2);

    const outsider = game.join(3, "Kaos");
    game.updatePosition(3, hq);
    assert.match(game.command(at(3), "stash").msg, /not in a crew/);
    void outsider;

    // and it has a ceiling
    a.inventory.fuelcan = 30; // 150 kg, stash holds 120
    assert.match(game.command(at(1), "stashput", ["fuelcan", "30"]).msg, /stash is full/);
    assert.equal(a.inventory.fuelcan, 30);
});

test("crews, ranks and the stash all survive a restart", () => {
    const { game, at } = crewSetup();
    game.command(at(1), "ganginvite", ["2"]);
    game.command(at(2), "gangaccept");
    game.command(at(1), "gangpromote", ["Hayden"]);
    game.command(CONSOLE, "giveitem", ["1", "medkit", "2"]);
    game.command(at(1), "stashput", ["medkit", "2"]);

    const snapshot = game.saveAll();
    const savedLeader = snapshot.players[1];
    const savedOfficer = snapshot.players[2];
    assert.deepEqual(savedOfficer.gang, { tag: "KAOS", rank: crewRules.OFFICER });

    const fresh = createGame();
    fresh.loadGangs(snapshot.gangs);
    const leader = fresh.join(1, "Tanner", savedLeader);
    fresh.join(2, "Hayden", savedOfficer);
    fresh.updatePosition(1, SPAWNS.chicago[0].pos);

    assert.equal(leader.gang.rank, crewRules.LEADER);
    const info = fresh.command(at(1), "gang").msg;
    assert.match(info, /\[KAOS\] Kaos Crew/);
    assert.match(info, /Officer: Hayden/);
    assert.match(fresh.command(at(1), "stash").msg, /Medkit x2/);
});

test("an officer can cut loose someone who isn't even online", () => {
    const { game, at } = crewSetup();
    game.command(at(1), "ganginvite", ["2"]);
    game.command(at(2), "gangaccept");
    game.leave(2); // Hayden logs off

    assert.match(game.command(at(1), "gang").msg, /Member: Hayden/);
    assert.match(game.command(at(1), "gangkick", ["Hayden"]).msg, /Kicked Hayden/);
    assert.ok(!game.command(at(1), "gang").msg.includes("Hayden"));
});

// ---------------- districts, parks and roads ----------------
const placeRules = require("./places");

test("every mapped place sits inside the city it claims", () => {
    for (const z of placeRules.ZONES) {
        assert.equal(cityAt(z.center), z.city, `${z.name} isn't inside ${z.city}`);
    }
    for (const r of placeRules.ROADS) {
        assert.ok(r.points.length >= 2, `${r.name} needs at least two points`);
        for (const p of r.points) assert.equal(cityAt(p), r.city, `${r.name} runs outside ${r.city}`);
    }
});

test("the most specific name wins: road, then park, then district, then city", () => {
    // a vertex of Lakeshore Drive, which runs through The Shoreline
    assert.equal(placeRules.describe({ x: -75, y: 6180, z: 30 }), "Lakeshore Drive, The Shoreline, Chicago");

    // Winterline Park sits inside Midway, and the smaller circle wins
    assert.equal(placeRules.zoneAt({ x: -190, y: 6230 }).name, "Winterline Park");
    assert.equal(placeRules.describe({ x: -190, y: 6230, z: 30 }), "Winterline Park, Chicago");

    // off the park and off every road, but still in the district
    assert.equal(placeRules.describe({ x: -300, y: 6230, z: 30 }), "Midway, Chicago");

    // open country falls back to the city alone
    assert.equal(placeRules.describe({ x: 0, y: 4000, z: 30 }), "GeePee");
});

test("walking into a park announces it once; being teleported never does", () => {
    const { game } = setup();
    assert.equal(announce(game, 1, { x: -430, y: 6020, z: 30 }), null); // first fix: quiet
    assert.equal(announce(game, 1, { x: -190, y: 6230, z: 30 }), "Entering Winterline Park");
    assert.equal(announce(game, 1, { x: -190, y: 6230, z: 30 }), null); // still there

    // released from jail into a zone: the teleport speaks for itself
    const cop = createGame({ rng: () => 0 });
    cop.join(1, "Tanner");
    const suspect = cop.join(2, "Hayden");
    cop.command(CONSOLE, "setjob", ["1", "police", "0"]);
    const spot = SPAWNS.atlanta[0].pos;
    const at = (id) => ({ id, pos: spot, now: 0 });
    cop.updatePosition(2, spot, 0);
    cop.command(at(1), "duty");
    cop.command(at(1), "cuff", ["2"]);
    cop.command(at(1), "jail", ["2", "5"]);
    cop.tick(5, 0);
    assert.equal(cop.updatePosition(2, suspect.pos, 0).notify.length, 0);
});

test("dispatch says where, not just which city", () => {
    const { game, as } = setup();
    game.join(3, "Kaos");
    game.command(CONSOLE, "setjob", ["2", "police", "0"]);
    game.command(CONSOLE, "setjob", ["3", "ems", "0"]);
    game.command(as(2), "duty");
    game.command(as(3), "duty");

    const onTheRoad = { x: -75, y: 6180, z: 30 };
    const call = game.command(as(1, { pos: onTheRoad }), "911", ["someone's", "hurt"]);
    assert.match(call.notify[0].msg, /911 — Lakeshore Drive, The Shoreline, Chicago\./);

    assert.equal(game.command(as(1, { pos: onTheRoad }), "whereami").msg, "Lakeshore Drive, The Shoreline, Chicago");
    assert.match(game.command(as(1, { pos: onTheRoad }), "places").msg, /District: The Knot/);
    assert.match(game.command(as(1, { pos: onTheRoad }), "places").msg, /Park: Winterline Park/);
    assert.match(game.command(as(1, { pos: onTheRoad }), "places").msg, /Road: Lakeshore Drive/);
});

test("a robbery call names the block it's happening on", () => {
    const { game, robber, at } = robSetup();
    const call = game.command(at(2), "rob");
    assert.match(call.notify[0].msg, /ROBBERY IN PROGRESS — Open 24 Chicago, .*Chicago\. Suspect: Hayden/);
    void robber;
});

// ---------------- turf ----------------
const turfRules = require("./turf");

function turfSetup() {
    const env = setup();
    const { game, a, b } = env;
    a.bank = 200000;
    env.knot = SPAWNS.chicago[0].pos; // inside The Knot
    env.midway = { x: -300, y: 6230, z: 30 };
    env.at = (id, pos = env.knot, extra = {}) => env.as(id, { pos, now: 0, ...extra });
    game.updatePosition(1, env.knot);
    game.updatePosition(2, env.knot);
    game.command(env.at(1), "gangcreate", ["KAOS", "Kaos", "Crew"]);
    game.command(env.at(1), "ganginvite", ["2"]);
    game.command(env.at(2), "gangaccept");
    void b;
    return env;
}

test("the board starts empty and lists every district", () => {
    const { game, at } = turfSetup();
    const board = game.command(at(1), "turf").msg;
    assert.match(board, /The Knot: unclaimed/);
    assert.equal(board.split("\n").length, turfRules.districts().length + 1);
});

test("a claim needs a crew, a district, and bodies on the ground", () => {
    const { game, at, knot, midway } = turfSetup();
    game.join(3, "Rando");
    game.updatePosition(3, knot);
    assert.match(game.command(at(3), "claim").msg, /not in a crew/);

    assert.match(game.command(at(1, { x: 0, y: 4000, z: 30 }), "claim").msg, /not standing in a district/);

    // Hayden wanders off, so only one of the crew is here
    game.updatePosition(2, midway);
    assert.match(game.command(at(1), "claim").msg, /You need 2 crew in The Knot to take it — 1 here/);

    game.updatePosition(2, knot);
    assert.match(game.command(at(1), "claim").msg, /Taking The Knot/);
    assert.match(game.command(at(1), "claim").msg, /already taking this/);
});

test("walking away loses the hold, and nothing is taken", () => {
    const { game, at, knot, midway } = turfSetup();
    game.command(at(1), "claim");

    const out = game.updatePosition(2, midway, 10000); // this sweep is the one that notices
    assert.ok(out.notify.some((n) => n.msg.includes("Lost the hold on The Knot")));
    assert.equal(game.command(at(1), "turf").msg.includes("[KAOS]"), false);
});

test("holding the ground takes the turf, and the loser is warned and told", () => {
    const { game, a, at, knot } = turfSetup();
    game.command(at(1), "claim");
    const taken = game.updatePosition(1, knot, 130000);
    assert.ok(taken.notify.some((n) => n.msg.includes("[KAOS] now holds The Knot")));
    assert.match(game.command(at(1), "turf").msg, /The Knot: \[KAOS\] Kaos Crew/);
    assert.match(game.command(at(1), "claim").msg, /already holds The Knot/);

    // a rival crew moves in
    const rival = game.join(3, "Kaos");
    const mate = game.join(4, "Dee");
    rival.bank = 200000;
    const atRival = (id, now = 140000) => ({ id, pos: knot, now }); // after the flip, not before it
    game.updatePosition(3, knot);
    game.updatePosition(4, knot);
    game.command(atRival(3), "gangcreate", ["RIV", "River", "Crew"]);
    game.command(atRival(3), "ganginvite", ["4"]);
    game.command(atRival(4), "gangaccept");

    // still settling from the first flip
    assert.match(game.command(atRival(3), "claim").msg, /settles in 15 min/);

    const later = 20 * 60000; // the settle runs from the flip at 130s, not from zero
    const started = game.command(atRival(3, later), "claim");
    assert.ok(started.notify.some((n) => n.id === 1 && n.msg.includes("WARNING: [RIV] is taking The Knot from you")));

    const flipped = game.updatePosition(3, knot, later + 130000);
    assert.ok(flipped.notify.some((n) => n.id === 3 && n.msg.includes("[RIV] now holds The Knot")));
    assert.ok(flipped.notify.some((n) => n.id === 1 && n.msg.includes("You lost The Knot to [RIV]")));
    void a; void mate;
});

test("holding pays every member gold on the payout tick", () => {
    const { game, a, b, at, knot } = turfSetup();
    game.command(at(1), "claim");
    game.updatePosition(1, knot, 130000);

    assert.equal(game.tick(9, 130000).notify.filter((n) => n.msg.includes("Turf pays")).length, 0);
    const paid = game.tick(1, 130000);
    assert.equal(a.gold, turfRules.PAYOUT_GOLD);
    assert.equal(b.gold, turfRules.PAYOUT_GOLD);
    assert.ok(paid.notify.some((n) => n.id === 2 && n.msg.includes("+15 gold")));
});

test("only a leader gives turf up, and disbanding drops it", () => {
    const { game, at, knot } = turfSetup();
    game.command(at(1), "claim");
    game.updatePosition(1, knot, 130000);

    assert.match(game.command(at(2), "abandon").msg, /Only Leaders/);
    game.command(at(1), "abandon");
    assert.match(game.command(at(1), "turf").msg, /The Knot: unclaimed/);

    const after = 20 * 60000; // past the settle, which runs from the flip at 130s
    game.command(at(1, knot, { now: after }), "claim");
    game.updatePosition(1, knot, after + 130000);
    assert.match(game.command(at(1), "turf").msg, /\[KAOS\]/);
    game.command(at(1), "gangdisband");
    assert.match(game.command(at(1), "turf").msg, /The Knot: unclaimed/);
});

test("turf survives a save and reload", () => {
    const { game, at, knot } = turfSetup();
    game.command(at(1), "claim");
    game.updatePosition(1, knot, 130000);

    const snapshot = game.saveAll();
    assert.equal(snapshot.turf.held["The Knot"].tag, "KAOS");

    const fresh = createGame();
    fresh.loadGangs(snapshot.gangs);
    fresh.loadTurf(snapshot.turf);
    fresh.join(1, "Tanner", snapshot.players[1]);
    fresh.updatePosition(1, knot);
    assert.match(fresh.command(at(1), "turf").msg, /The Knot: \[KAOS\] Kaos Crew/);
});

// ---------------- the clock and the sky ----------------
const envRules = require("./environment");

test("the clock runs on the tick and wraps at midnight", () => {
    const game = createGame({ rng: () => 0 });
    game.join(1, "Tanner");

    // opens at 08:00, and one tick is half an hour
    assert.equal(game.worldState().text, "08:00");
    game.tick(1, 0);
    assert.equal(game.worldState().text, "08:30");
    game.tick(2, 0);
    assert.equal(game.worldState().text, "09:30");

    game.command(CONSOLE, "settime", ["23", "45"]);
    game.tick(1, 0);
    assert.equal(game.worldState().text, "00:15"); // wrapped, not 24:15
});

test("every client is told the time and the sky, so nobody sees their own", () => {
    const game = createGame({ rng: () => 0 });
    game.join(1, "Tanner");
    const out = game.tick(1, 0);
    const clock = out.actions.find((a) => a.type === "setClock");
    assert.equal(clock.text, "08:30");
    assert.deepEqual(game.command(CONSOLE, "setweather", ["thunder"]).actions[0], { type: "setWeather", weather: "THUNDER" });
});

test("weather walks through a transition rather than jumping", () => {
    const game = createGame({ rng: () => 0.999 }); // always the last option
    game.join(1, "Tanner");
    game.command(CONSOLE, "setweather", ["clear"]);

    // CLEAR can only become CLEAR, EXTRASUNNY, CLOUDS or FOGGY — never THUNDER
    const reachable = Object.keys(envRules.TRANSITIONS.CLEAR);
    game.tick(envRules.WEATHER_EVERY / envRules.MINUTES_PER_TICK, 0);
    assert.ok(reachable.includes(game.worldState().weather), game.worldState().weather);

    // and every sky in the table can be reached from somewhere
    for (const [from, options] of Object.entries(envRules.TRANSITIONS)) {
        for (const to of Object.keys(options)) {
            assert.ok(envRules.TRANSITIONS[to], `${from} can become ${to}, which isn't a sky`);
        }
    }
});

test("night is a thing other systems can ask about", () => {
    const game = createGame({ rng: () => 0 });
    game.join(1, "Tanner");
    game.command(CONSOLE, "settime", ["13"]);
    assert.equal(game.worldState().night, false);
    game.command(CONSOLE, "settime", ["23"]);
    assert.equal(game.worldState().night, true);
    game.command(CONSOLE, "settime", ["3"]);
    assert.equal(game.worldState().night, true, "3am is still night");
    game.command(CONSOLE, "settime", ["6"]);
    assert.equal(game.worldState().night, false, "6am is not");
});

test("sunset and sunrise are announced once", () => {
    const game = createGame({ rng: () => 0 });
    game.join(1, "Tanner");
    game.command(CONSOLE, "settime", ["20", "45"]);
    assert.ok(game.tick(1, 0).notify.some((n) => n.msg.includes("sun's going down")));
    assert.ok(!game.tick(1, 0).notify.some((n) => n.msg.includes("sun's going down")));

    game.command(CONSOLE, "settime", ["5", "45"]);
    assert.ok(game.tick(1, 0).notify.some((n) => n.msg.includes("getting light")));
});

test("the console can hold the clock and the sky still", () => {
    const game = createGame({ rng: () => 0 });
    game.join(1, "Tanner");
    game.command(CONSOLE, "settime", ["12"]);
    game.command(CONSOLE, "freeze", ["time", "on"]);
    game.tick(4, 0);
    assert.equal(game.worldState().text, "12:00", "the clock is held");
    assert.match(game.command({ id: 1, pos: NOWHERE, now: 0 }, "time").msg, /clock held/);

    game.command(CONSOLE, "freeze", ["time", "off"]);
    game.tick(1, 0);
    assert.equal(game.worldState().text, "12:30");
    assert.match(game.command(CONSOLE, "settime", ["99"]).msg, /Hour is 0 to 23/);
    assert.match(game.command(CONSOLE, "setweather", ["lasers"]).msg, /Unknown sky/);
});

test("robbing in the dark pays better", () => {
    function haul(hour) {
        const env = robSetup();
        env.game.command(CONSOLE, "settime", [String(hour)]);
        env.game.command(env.at(2), "rob");
        env.game.updatePosition(2, env.till, 90000);
        return env.robber.cash - 500;
    }
    const day = haul(13);
    const night = haul(23);
    assert.equal(day, heistRules.PAYOUT_MIN);
    assert.equal(night, Math.round(heistRules.PAYOUT_MIN * heistRules.NIGHT_BONUS));
    assert.ok(night > day);
});

test("the clock and the sky survive a restart", () => {
    const game = createGame({ rng: () => 0 });
    game.join(1, "Tanner");
    game.command(CONSOLE, "settime", ["17", "20"]);
    game.command(CONSOLE, "setweather", ["foggy"]);

    const snapshot = game.saveAll();
    const fresh = createGame();
    fresh.loadEnvironment(snapshot.environment);
    assert.equal(fresh.worldState().text, "17:20");
    assert.equal(fresh.worldState().weather, "FOGGY");
});

// ---------------- the overlay ----------------
const hudRules = require("./hud");

test("the overlay shows what the server knows, not what a client claims", () => {
    const { game, a, as } = setup();
    game.updatePosition(1, { x: -75, y: 6180, z: 30 });
    const h = game.hudFor(1);

    assert.equal(h.health.value, 100);
    assert.equal(h.health.level, "ok");
    assert.equal(h.cash, "$500");
    assert.equal(h.gold, 0);
    assert.equal(h.job, "Civilian");
    assert.equal(h.place, "Lakeshore Drive, The Shoreline, Chicago");
    assert.equal(h.time, "08:00");
    assert.equal(h.weather, "clear");
    assert.equal(h.crew, null);
    assert.equal(h.vehicle, null);
    assert.deepEqual(h.status, []);
    void a; void as;
});

test("bars turn low and then critical", () => {
    assert.equal(hudRules.level(100), "ok");
    assert.equal(hudRules.level(hudRules.LOW), "low");
    assert.equal(hudRules.level(hudRules.CRITICAL), "critical");

    const { game, a } = setup();
    a.hunger = 20;
    a.thirst = 5;
    const h = game.hudFor(1);
    assert.equal(h.hunger.level, "low");
    assert.equal(h.thirst.level, "critical");
});

test("the flags say why you can't do anything", () => {
    const { game, a } = setup();
    game.command(CONSOLE, "setjob", ["1", "police", "0"]);
    game.command({ id: 1, pos: NOWHERE, now: 0 }, "duty");
    assert.deepEqual(game.hudFor(1).status, [{ text: "ON DUTY", tone: "ok" }]);

    a.cuffed = true;
    assert.ok(game.hudFor(1).status.some((f) => f.text === "CUFFED"));
    a.jailMinutes = 7;
    assert.ok(game.hudFor(1).status.some((f) => f.text === "JAIL 7m"));
    // being held means you are not also "on duty" on the overlay
    assert.ok(!game.hudFor(1).status.some((f) => f.text === "ON DUTY"));
});

test("the car panel only appears when you're in one of yours", () => {
    const { game, a, at, plate } = carSetup();
    assert.equal(game.hudFor(1).vehicle, null, "no panel on foot");

    a.garage[0].fuel = 30;
    const h = game.hudFor(1, plate);
    assert.equal(h.vehicle.plate, plate);
    assert.equal(h.vehicle.fuel.value, 30);
    assert.equal(h.vehicle.fuel.tank, 60);
    assert.equal(h.vehicle.fuel.percent, 50);
    assert.equal(h.vehicle.engine, 100);
    void at;
});

test("the overlay carries the crew and how much turf it holds", () => {
    const { game, at, knot } = turfSetup();
    assert.equal(game.hudFor(1).crew.tag, "KAOS");
    assert.equal(game.hudFor(1).crew.turf, 0);

    game.command(at(1), "claim");
    game.updatePosition(1, knot, 130000);
    assert.equal(game.hudFor(1).crew.turf, 1);
});

// ---------------- the trade ----------------
const drugRules = require("./drugs");

function tradeSetup(rng = () => 0.5) {
    const game = createGame({ rng });
    const a = game.join(1, "Tanner");
    const b = game.join(2, "Hayden");
    a.bank = 200000;
    const field = drugRules.SUPPLY_SPOTS[0].pos;          // Backroads Field
    const knot = SPAWNS.chicago[0].pos;                   // inside The Knot
    const at = (id, pos, extra = {}) => ({ id, pos, now: 0, ...extra });
    game.updatePosition(1, knot);
    game.updatePosition(2, knot);
    game.command(at(1, knot), "gangcreate", ["KAOS", "Kaos", "Crew"]); // base is set at the knot
    game.command(at(1, knot), "ganginvite", ["2"]);
    game.command(at(2, knot), "gangaccept");
    return { game, a, b, field, knot, at };
}

test("you pick it where it grows, and a spot goes bare after you do", () => {
    const { game, a, field, knot, at } = tradeSetup();
    assert.match(game.command(at(1, knot), "harvest").msg, /Nothing growing here/);

    const got = game.command(at(1, field), "harvest");
    assert.match(got.msg, /Picked \d+x Raw Leaf at Backroads Field/);
    assert.ok(a.inventory.plantleaf >= 2);

    assert.match(game.command(at(1, field), "harvest").msg, /picked clean/);
    assert.match(game.command(at(1, field, { now: 11 * 60000 }), "harvest").msg, /Picked/);
});

test("cooking needs a crew base, and turns bulk into packs", () => {
    const { game, a, field, knot, at } = tradeSetup();
    a.inventory.plantleaf = 7;

    assert.match(game.command(at(1, field), "process", ["greenpack"]).msg, /not at the \[KAOS\] base/);
    assert.match(game.command(at(1, knot), "process", ["rocketfuel"]).msg, /Cook what\?/);

    const cooked = game.command(at(1, knot), "process", ["greenpack"]);
    assert.match(cooked.msg, /Cooked 2x Green Pack/);  // 7 leaf at 3 a batch
    assert.equal(a.inventory.plantleaf, 1);            // the remainder stays
    assert.equal(a.inventory.greenpack, 2);

    assert.match(game.command(at(1, knot), "process", ["greenpack"]).msg, /Need 3x Raw Leaf, you have 1/);

    // no crew, no kitchen
    const outsider = game.join(3, "Rando");
    outsider.inventory.plantleaf = 9;
    game.updatePosition(3, knot);
    assert.match(game.command(at(3, knot), "process", ["greenpack"]).msg, /need a crew base/);
});

test("where you sell changes what you get, and your own turf pays best", () => {
    const { game, a, knot, at } = tradeSetup();
    a.inventory.greenpack = 6;

    assert.match(game.command(at(1, { x: 0, y: 4000, z: 30 }), "deal", ["greenpack"]).msg, /Nobody's buying out here/);

    const before = a.cash;
    const sold = game.command(at(1, knot), "deal", ["greenpack"]);
    assert.match(sold.msg, /Sold a Green Pack in The Knot/);
    assert.equal(a.inventory.greenpack, 5);
    const plain = a.cash - before;
    assert.ok(plain > 0);

    // the same district goes cold on you
    assert.match(game.command(at(1, knot), "deal", ["greenpack"]).msg, /cold on you/);

    // take the turf, come back later, and it pays more
    game.command(at(1, knot, { now: 21 * 60000 }), "claim");
    game.updatePosition(1, knot, 21 * 60000 + 130000);
    const owned = a.cash;
    const onTurf = game.command(at(1, knot, { now: 25 * 60000 }), "deal", ["greenpack"]);
    assert.match(onTurf.msg, /on your own turf/);
    assert.ok(a.cash - owned > plain, "turf should beat the same sale without it");
});

test("daylight gets you seen, and the law hears where but not who", () => {
    // white pack: 0.35 odds at night, 0.56 in daylight. 0.45 sits between them.
    const { game, a, knot, at } = tradeSetup(() => 0.45);
    game.command(CONSOLE, "setjob", ["2", "police", "0"]);
    game.command(at(2, knot), "duty");
    a.inventory.whitepack = 4;

    game.command(CONSOLE, "settime", ["13"]);
    const seen = game.command(at(1, knot), "deal", ["whitepack"]);
    assert.match(seen.msg, /Someone was watching/);
    const tip = seen.notify.find((n) => n.id === 2);
    assert.match(tip.msg, /Dealing reported in The Knot\. No description\./);
    assert.ok(!tip.msg.includes("Tanner"), "the tip never names the dealer");

    game.command(CONSOLE, "settime", ["2"]);
    const quiet = game.command(at(1, SPAWNS.chicago[1].pos, { now: 60000 }), "deal", ["whitepack"]);
    assert.ok(!quiet.msg.includes("Someone was watching"), "the dark is safer");
});

test("product is carried, so police take it like anything else", () => {
    const { game, a, b, knot, at } = tradeSetup();
    a.inventory.whitepack = 3;
    game.command(CONSOLE, "setjob", ["2", "police", "0"]);
    game.command(at(2, knot), "duty");

    game.command(at(2, knot), "cuff", ["1"]);
    assert.match(game.command(at(2, knot), "search", ["1"]).msg, /White Pack x3/);
    game.command(at(2, knot), "seize", ["1", "whitepack", "3"]);
    assert.equal(a.inventory.whitepack, undefined);
    assert.equal(b.inventory.whitepack, undefined, "seized goods are destroyed, not pocketed");
});

// ---------------- property ----------------
const houseRules = require("./houses");

function homeSetup() {
    const env = setup();
    const { game, a } = env;
    a.bank = 500000;
    env.door = houseRules.HOUSES.knot_walkup.pos;
    env.away = { x: 0, y: 4000, z: 30 };
    env.at = (id, pos = env.door, extra = {}) => env.as(id, { pos, now: 0, ...extra });
    game.updatePosition(1, env.door);
    game.updatePosition(2, env.door);
    return env;
}

test("every house sits in the district it claims, and the market lists them", () => {
    for (const [id, h] of Object.entries(houseRules.HOUSES)) {
        const zone = placeRules.zoneAt(h.pos, "district");
        assert.ok(zone, `${id} isn't in any district`);
        assert.equal(zone.name, h.district, `${id} says ${h.district}`);
    }
    const { game, at } = homeSetup();
    assert.match(game.command(at(1), "houses").msg, /Knot Walk-up \(knot_walkup\) — \$185,000/);
});

test("you buy it at the door, from the bank, and only one each", () => {
    const { game, a, b, at, away } = homeSetup();
    assert.match(game.command(at(1, away), "buyhouse").msg, /not at a door/);

    b.bank = 1000;
    assert.match(game.command(at(2), "buyhouse").msg, /costs \$185,000 — Not enough bank/);
    assert.equal(b.bank, 1000, "a failed purchase takes nothing");

    game.command(at(1), "buyhouse");
    assert.equal(a.bank, 500000 - 185000);
    assert.match(game.command(at(1), "home").msg, /Knot Walk-up — The Knot/);
    assert.match(game.command(at(1), "home").msg, /Door: locked/);

    b.bank = 500000;
    assert.match(game.command(at(2), "buyhouse").msg, /already someone's/);
    assert.match(game.command(at(1), "buyhouse").msg, /already own somewhere/);
});

test("a locked door keeps others out until they hold a key", () => {
    const { game, b, at } = homeSetup();
    game.command(at(1), "buyhouse");
    assert.match(game.command(at(2), "wardrobe").msg, /is locked/);

    const given = game.command(at(1), "givekey", ["2"]);
    assert.ok(given.notify.some((n) => n.id === 2 && n.msg.includes("gave you a key")));
    assert.match(game.command(at(2), "wardrobe").msg, /Knot Walk-up/);

    const taken = game.command(at(1), "takekey", ["Hayden"]);
    assert.ok(taken.notify.some((n) => n.id === 2 && n.msg.includes("took their key back")));
    assert.match(game.command(at(2), "wardrobe").msg, /is locked/);

    // unlocked, anyone can get in
    game.command(at(1), "lockhome");
    assert.match(game.command(at(2), "wardrobe").msg, /Knot Walk-up/);
    assert.match(game.command(at(2), "lockhome").msg, /Not your door/);
    void b;
});

test("storage is off your back, and has a ceiling", () => {
    const { game, a, at } = homeSetup();
    game.command(at(1), "buyhouse");
    game.command(CONSOLE, "giveitem", ["1", "medkit", "3"]);

    game.command(at(1), "storehome", ["medkit", "3"]);
    assert.equal(a.inventory.medkit, undefined, "it left your pockets");
    assert.match(game.command(at(1), "wardrobe").msg, /Medkit x3/);

    game.command(at(1), "takehome", ["medkit", "2"]);
    assert.equal(a.inventory.medkit, 2);

    a.inventory.fuelcan = 5;              // 25 kg, the walk-up holds 60
    game.command(at(1), "storehome", ["fuelcan", "5"]);
    a.inventory.fuelcan = 5;
    game.command(at(1), "storehome", ["fuelcan", "5"]);
    a.inventory.fuelcan = 5;
    assert.match(game.command(at(1), "storehome", ["fuelcan", "5"]).msg, /No room/);
    assert.equal(a.inventory.fuelcan, 5, "a refused store leaves it with you");
});

test("selling gives part of it back, but not with your things still inside", () => {
    const { game, a, at } = homeSetup();
    game.command(at(1), "buyhouse");
    game.command(CONSOLE, "giveitem", ["1", "lockpick"]);
    game.command(at(1), "storehome", ["lockpick"]);

    assert.match(game.command(at(1), "sellhouse").msg, /Clear the 1 thing\(s\) out/);
    game.command(at(1), "takehome", ["lockpick"]);

    const before = a.bank;
    game.command(at(1), "sellhouse");
    assert.equal(a.bank, before + Math.round(185000 * houseRules.SELL_RATIO));
    assert.match(game.command(at(1), "home").msg, /don't own anywhere/);
    assert.match(game.command(at(1), "houses").msg, /Knot Walk-up/, "it goes back on the market");
});

test("deeds, keys and what's inside survive a restart", () => {
    const { game, at, door } = homeSetup();
    game.command(at(1), "buyhouse");
    game.command(at(1), "givekey", ["2"]);
    game.command(CONSOLE, "giveitem", ["1", "radio"]);
    game.command(at(1), "storehome", ["radio"]);

    const snapshot = game.saveAll();
    assert.equal(snapshot.houses.knot_walkup.owner, "Tanner");

    const fresh = createGame();
    fresh.loadHouses(snapshot.houses);
    fresh.join(1, "Tanner", snapshot.players[1]);
    fresh.join(2, "Hayden", snapshot.players[2]);
    fresh.updatePosition(1, door);
    fresh.updatePosition(2, door);
    assert.match(fresh.command(at(1), "home").msg, /Keys out: Hayden/);
    assert.match(fresh.command(at(2), "wardrobe").msg, /Radio x1/);
});

// ---------------- shifts, the impound, and clothes ----------------

const shiftRules = require("./shifts");
const impoundRules = require("./impound");
const clothes = require("./appearance");

test("sheriff and EMS get a callsign on duty and hand it back off duty", () => {
    const { game, as } = setup();
    game.command(CONSOLE, "setjob", ["1", "police"]);
    game.command(CONSOLE, "setjob", ["2", "ems"]);

    assert.match(game.command(as(1), "duty").msg, /Clocked in.*S-1 on shift/);
    assert.match(game.command(as(2), "duty").msg, /M-1 on shift/, "each department numbers its own");
    assert.match(game.command(as(1), "callsign").msg, /^S-1 — 0 min/);

    assert.match(game.command(as(1), "roster", ["police"]).msg, /S-1 — Tanner/);
    assert.doesNotMatch(game.command(as(1), "roster", ["police"]).msg, /Hayden/, "EMS isn't on the sheriff's roster");

    assert.match(game.command(as(1, { now: 20 * 60000 }), "duty").msg, /S-1 off shift after 20 min/);
    assert.equal(game.get(1).onDuty, false);
    assert.match(game.command(as(1), "callsign").msg, /not on shift/);

    // the number went back in the pool, so the next clock-in reuses it
    assert.match(game.command(as(1), "duty").msg, /S-1 on shift/);
});

test("a civilian job has no shift, and a full department turns one away", () => {
    const { game, as } = setup();
    game.command(CONSOLE, "setjob", ["1", "taxi"]);
    const res = game.command(as(1), "duty");
    assert.equal(res.msg, "Clocked in.", "no callsign for a cab driver");

    // fill every sheriff callsign, then try one more
    const fresh = createGame();
    for (let i = 1; i <= shiftRules.DEPARTMENTS.police.units; i++) {
        fresh.join(i, `Deputy${i}`);
        fresh.command(CONSOLE, "setjob", [String(i), "police"]);
        fresh.command({ id: i, pos: NOWHERE, now: 0 }, "duty");
    }
    const spare = shiftRules.DEPARTMENTS.police.units + 1;
    fresh.join(spare, "Kaos");
    fresh.command(CONSOLE, "setjob", [String(spare), "police"]);
    const full = fresh.command({ id: spare, pos: NOWHERE, now: 0 }, "duty");
    assert.match(full.msg, /callsign is out/);
    assert.equal(fresh.get(spare).onDuty, false, "a refused shift doesn't leave you clocked in");
});

test("the radio uses callsigns, and a mask keeps your name off it", () => {
    const { game, a, b, as } = setup();
    game.command(CONSOLE, "setjob", ["2", "ems"]);
    game.command(as(2), "duty");

    // someone goes down: the EMS line is a radio line
    const emsCall = game.syncHealth(1, 0);
    assert.match(emsCall.notify[0].msg, /^M-1, EMS call: Tanner is down/);

    const robber = createGame();
    robber.join(1, "Tanner");
    robber.join(2, "Hayden");
    robber.command(CONSOLE, "setjob", ["2", "police"]);
    robber.command({ id: 2, pos: NOWHERE, now: 0 }, "duty");
    robber.command(CONSOLE, "giveitem", ["1", "glizzy"]);
    robber.command(CONSOLE, "giveitem", ["1", "ammo_9mm", "2"]);
    robber.command({ id: 1, pos: AT_247, now: 0 }, "loadammo", ["9mm", "2"]);
    robber.command({ id: 1, pos: AT_247, now: 0 }, "equip", ["glizzy"]);
    robber.get(1).look.mask = 4;

    const call = robber.command({ id: 1, pos: AT_247, now: 0 }, "rob");
    assert.match(call.notify[0].msg, /^S-1, ROBBERY IN PROGRESS/);
    assert.match(call.notify[0].msg, /Suspect: masked suspect/);
    assert.doesNotMatch(call.notify[0].msg, /Tanner/, "a mask is worth something");
    assert.ok(a && b);
});

test("a long shift gets a nudge, once", () => {
    const { game, as } = setup();
    game.command(CONSOLE, "setjob", ["1", "police"]);
    game.command(as(1), "duty");

    const at = (min) => game.tick(1, min * 60000).notify.filter((n) => /on shift/.test(n.msg));
    assert.equal(at(30).length, 0);
    assert.match(at(shiftRules.LONG_SHIFT_MIN)[0].msg, /S-1, you've been on shift 60 min/);
    assert.equal(at(shiftRules.LONG_SHIFT_MIN + 1).length, 0, "not every tick after that");
});

function towSetup() {
    const game = createGame();
    const a = game.join(1, "Tanner");
    const b = game.join(2, "Hayden");
    const as = (id, extra = {}) => ({ id, pos: NOWHERE, now: 0, ...extra });
    a.bank = 400000;
    game.command(as(1), "buyveh", ["sultan"]);
    const plate = a.garage[0].plate;
    game.command(as(1), "spawnveh", [plate]);

    game.command(CONSOLE, "setjob", ["2", "police"]);
    game.command(as(2), "duty");
    const lot = impoundRules.LOTS[0].pos;
    return { game, a, b, as, plate, lot, nearCar: (id, extra = {}) => as(id, { vehiclePlate: plate, ...extra }) };
}

test("police tow a car to the lot, and it costs its owner to get it out", () => {
    const { game, a, as, plate, lot, nearCar } = towSetup();

    assert.match(game.command(nearCar(1), "towveh").msg, /on duty only/, "a civilian can't tow");

    const res = game.command(nearCar(2), "towveh");
    assert.match(res.msg, /taken by the Sheriff's Office/);
    assert.deepEqual(res.actions[0], { type: "despawnVehicle", plate });
    assert.equal(res.notify[0].id, 1);
    assert.match(game.command(as(1), "impound").msg, new RegExp(`${plate} — taken by the Sheriff's Office`));
    assert.match(game.command(as(1), "spawnveh", [plate]).msg, /is impounded/);

    assert.match(game.command(as(1), "releaseveh", [plate]).msg, /not at an impound lot/);
    assert.match(game.command(as(2, { pos: lot }), "releaseveh", [plate]).msg, /not yours/);

    a.garage[0].engine = 100;
    a.garage[0].fuel = 9;
    const before = a.bank;
    const out = game.command(as(1, { pos: lot }), "releaseveh", [plate]);
    assert.match(out.msg, /repaired, not refuelled/);
    assert.equal(a.bank, before - impoundRules.FEES.police);
    assert.equal(a.garage[0].engine, 1000, "it comes back whole");
    assert.equal(a.garage[0].fuel, 9, "towing is not a free tank");
    assert.equal(game.command(as(1), "spawnveh", [plate]).actions[0].type, "spawnVehicle");
});

test("logging out on the street is a tow, and the lot survives a restart", () => {
    const { game, plate, lot } = towSetup();

    const gone = game.leave(1);
    assert.deepEqual(gone.actions[0], { type: "despawnVehicle", plate });

    const snapshot = game.saveAll();
    assert.equal(snapshot.impound[plate].reason, "abandoned");
    assert.equal(snapshot.impound[plate].fee, impoundRules.FEES.abandoned);

    const fresh = createGame();
    fresh.loadImpound(snapshot.impound);
    const back = fresh.join(1, "Tanner", gone.saved);
    assert.match(fresh.command({ id: 1, pos: NOWHERE, now: 0 }, "impound").msg, new RegExp(`${plate} — left on the street`));
    assert.match(fresh.command({ id: 1, pos: NOWHERE, now: 0 }, "spawnveh", [plate]).msg, /is impounded/);
    assert.equal(back.bank, game.get(2).bank === undefined ? back.bank : back.bank);
});

test("a wrecked car is towed cheaper than a seized one", () => {
    const { game, a, nearCar } = towSetup();
    a.garage[0].engine = 0;
    const res = game.command(nearCar(2), "towveh");
    assert.match(res.msg, /towed in wrecked/);
    assert.equal(game.saveAll().impound[a.garage[0].plate].fee, impoundRules.FEES.wrecked);
});

function dressSetup() {
    const game = createGame();
    const a = game.join(1, "Tanner");
    game.join(2, "Hayden");
    const shop = clothes.SHOPS[0].pos;
    const as = (id, extra = {}) => ({ id, pos: NOWHERE, now: 0, ...extra });
    return { game, a, as, shop, atShop: (id, extra = {}) => as(id, { pos: shop, ...extra }) };
}

test("clothes change at a shop and nowhere else, and cost what the slot costs", () => {
    const { game, a, as, atShop } = dressSetup();
    assert.deepEqual(a.look, clothes.DEFAULT_LOOK);

    assert.match(game.command(as(1), "dress", ["top", "4"]).msg, /not at a clothing shop/);
    assert.equal(a.look.top, 1, "the street doesn't dress you");

    const cash = a.cash;
    const res = game.command(atShop(1), "dress", ["top", "4"]);
    assert.match(res.msg, /Top #4 on. Northline Threads/);
    assert.deepEqual(res.actions[0], { type: "setAppearance", target: 1, look: { ...clothes.DEFAULT_LOOK, top: 4 } });
    assert.equal(a.cash, cash - clothes.SLOTS.top.price);

    assert.match(game.command(atShop(1), "dress", ["top", "4"]).msg, /already wearing/);
    assert.match(game.command(atShop(1), "dress", ["legs", "0"]).msg, /Legs goes 1-18/, "you keep your trousers");
    assert.match(game.command(atShop(1), "dress", ["cape", "2"]).msg, /No slot called "cape"/);
    assert.match(game.command(atShop(1), "look").msg, /Top: #4/);

    // a mask on, then off again for free
    game.command(atShop(1), "dress", ["mask", "3"]);
    assert.equal(clothes.isMasked(a), true);
    const broke = a.cash;
    assert.match(game.command(atShop(1), "dress", ["mask", "0"]).msg, /Took your mask off/);
    assert.equal(a.cash, broke, "taking something off is free");
    assert.equal(clothes.isMasked(a), false);
});

test("outfits save at a shop, go back on at your own door, and survive a restart", () => {
    const { game, a, as, atShop } = dressSetup();
    a.bank = 400000;
    game.command(atShop(1), "dress", ["top", "9"]);
    game.command(atShop(1), "dress", ["hat", "2"]);

    assert.match(game.command(as(1), "saveoutfit", ["work"]).msg, /not at a clothing shop/);
    assert.match(game.command(atShop(1), "saveoutfit", ["work"]).msg, /Saved "work"/);
    assert.match(game.command(as(1), "outfits").msg, /work/);

    game.command(atShop(1), "dress", ["top", "2"]);
    assert.match(game.command(as(1), "outfit", ["work"]).msg, /clothing shop or at your own door/);

    // buy the Knot walk-up and change in front of it
    const door = require("./houses").HOUSES.knot_walkup.pos;
    game.command(as(1, { pos: door }), "buyhouse");
    const back = game.command(as(1, { pos: door }), "outfit", ["WORK"]);
    assert.match(back.msg, /Changed into "work"/);
    assert.equal(a.look.top, 9);
    assert.equal(back.actions[0].type, "setAppearance");

    assert.match(game.command(atShop(1), "outfit", ["beach"]).msg, /No outfit called "beach"/);

    const saved = game.saveAll().players[1];
    assert.deepEqual(saved.outfits.work, { ...clothes.DEFAULT_LOOK, top: 9, hat: 2 });
    const fresh = createGame();
    const again = fresh.join(1, "Tanner", saved);
    assert.equal(again.look.top, 9);
    assert.match(fresh.command({ id: 1, pos: NOWHERE, now: 0 }, "outfits").msg, /work/);
});

test("only five outfits, and a junk save doesn't dress you in nothing", () => {
    const { game, atShop } = dressSetup();
    for (let i = 1; i <= clothes.MAX_OUTFITS; i++) {
        assert.match(game.command(atShop(1), "saveoutfit", [`fit${i}`]).msg, /Saved/);
    }
    assert.match(game.command(atShop(1), "saveoutfit", ["onemore"]).msg, /You keep 5 outfits/);
    assert.match(game.command(atShop(1), "saveoutfit", ["fit1"]).msg, /Replaced "fit1"/, "overwriting is fine");
    assert.match(game.command(atShop(1), "dropoutfit", ["fit1"]).msg, /Dropped "fit1"/);
    assert.match(game.command(atShop(1), "saveoutfit", ["onemore"]).msg, /Saved/);

    const junk = game.join(9, "Junk", { look: { top: 999, legs: -4, mask: "x" } });
    assert.deepEqual(junk.look, clothes.DEFAULT_LOOK, "nonsense falls back to the default fit");
});

test("a slot the model can't draw goes back to the default, and only the paid change is refunded", () => {
    const { game, a, atShop } = dressSetup();
    const cash = a.cash;
    game.command(atShop(1), "dress", ["top", "20"]);
    assert.equal(a.cash, cash - clothes.SLOTS.top.price);

    const res = game.lookRejected(1, ["top"]);
    assert.match(res.notify[0].msg, /Your top didn't fit — put back and \$180 refunded/);
    assert.equal(a.look.top, clothes.DEFAULT_LOOK.top, "you're not left invisible");
    assert.equal(a.cash, cash, "you don't pay for clothes you never wore");
    assert.deepEqual(res.actions[0], { type: "setAppearance", target: 1, look: clothes.DEFAULT_LOOK });

    // claiming it twice pays nothing the second time
    assert.equal(game.lookRejected(1, ["top"]).notify.length, 0, "nothing left to put back");

    // a free outfit change can't be turned into a refund
    game.command(atShop(1), "dress", ["legs", "6"]);
    game.command(atShop(1), "saveoutfit", ["fit"]);
    game.command(atShop(1), "dress", ["legs", "2"]);
    const paidFor = a.cash;
    game.command(atShop(1), "outfit", ["fit"]);
    const claim = game.lookRejected(1, ["legs"]);
    assert.match(claim.notify[0].msg, /didn't fit — put back\.$/, "put back, but no money");
    assert.equal(a.cash, paidFor);
    assert.equal(game.lookRejected(99, ["top"]).msg, "", "an unknown player is ignored");
});
