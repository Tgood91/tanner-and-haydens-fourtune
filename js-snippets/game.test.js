// ============================================================
// game.test.js — checks every system through the game core
// Run it:  node --test js-snippets/game.test.js
// ============================================================

const test = require("node:test");
const assert = require("node:assert/strict");
const { createGame, PAY_INTERVAL_MIN } = require("./game");
const { SHOPS } = require("./shops");
const { CITIES } = require("./cities");

const CONSOLE = { isConsole: true };
const AT_247 = SHOPS.chi_247.pos;
const NOWHERE = { x: 0, y: 0, z: 0 };

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

    assert.match(game.command(there, "buy", ["glock19"]).msg, /doesn't sell/);
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
    assert.equal(game.updatePosition(1, CITIES.atlanta.spawn), null); // first position: no announcement
    assert.equal(game.updatePosition(1, CITIES.geepee.spawn), "Welcome to GeePee");
    assert.equal(game.updatePosition(1, CITIES.geepee.spawn), null);
    assert.equal(game.updatePosition(1, CITIES.chicago.spawn), "Welcome to Chicago");
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

test("respawn: waits for bleedout, bills the bank, sends you to the city's hospital", () => {
    const { game, a, as, spot } = medicalSetup();
    game.syncHealth(1, 0, 0);
    assert.match(game.command(as(1, { pos: spot, now: 60 * 1000 }), "respawn").msg, /respawn in 4 min/);

    const res = game.command(as(1, { pos: spot, now: 5 * 60 * 1000 }), "respawn");
    assert.match(res.msg, /Chicago EMS/);
    assert.equal(a.bank, 4500);
    assert.equal(a.downed, false);
    assert.deepEqual(res.actions[0].pos, { x: -245, y: 6325, z: 33 });

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
    env.game.command(CONSOLE, "giveitem", ["1", "glock19"]);
    env.atAmmu = env.as(1, { pos: SHOPS.chi_ammu.pos });
    return env;
}

test("Ammu-Nation sells ammo boxes (not guns) at the box price, and boxes weigh what they say", () => {
    const { game, a, atAmmu } = armedSetup();
    game.command(atAmmu, "buy", ["ammo_9mm", "2"]);
    assert.equal(a.cash, 500 - 150);
    assert.equal(a.inventory.ammo_9mm, 2);
    assert.match(game.command(atAmmu, "buy", ["glock19"]).msg, /doesn't sell/);
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

    const out = game.command(as(1), "equip", ["glock19"]);
    assert.deepEqual(out.actions[0], { type: "giveWeapon", target: 1, weapon: "WEAPON_COMBATPISTOL", ammoType: "AMMO_PISTOL", rounds: 50 });
    assert.equal(a.equipped, "glock19");
    assert.equal(game.command(as(1), "holster").actions[0].type, "removeWeapon");

    game.command(as(1), "equip", ["glock19"]);
    const dropped = game.command(as(1, { pos: { x: 5, y: 5, z: 30 } }), "dropitem", ["glock19"]);
    assert.ok(dropped.actions.some((x) => x.type === "removeWeapon" && x.weapon === "WEAPON_COMBATPISTOL"));
    assert.equal(a.equipped, null);
});

test("loaded ammo saves; you always log back in holstered", () => {
    const { game, a, as } = armedSetup();
    a.ammo.pistol = 80;
    game.command(as(1), "equip", ["glock19"]);
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
