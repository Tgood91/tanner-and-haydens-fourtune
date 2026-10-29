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
    assert.equal(game.updatePosition(1, SPAWNS.atlanta[0].pos), null); // first position: no announcement
    assert.equal(game.updatePosition(1, SPAWNS.geepee[0].pos), "Welcome to GeePee");
    assert.equal(game.updatePosition(1, SPAWNS.geepee[0].pos), null);
    assert.equal(game.updatePosition(1, SPAWNS.chicago[0].pos), "Welcome to Chicago");
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
    env.game.command(CONSOLE, "giveitem", ["1", "glizzy"]);
    env.atAmmu = env.as(1, { pos: SHOPS.chi_ammu.pos });
    return env;
}

test("Ammu-Nation sells ammo boxes at the box price, and boxes weigh what they say", () => {
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
test("guns cost gold at Ammu-Nation: Glizzy is 444 gold and weighs 1.0", () => {
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
        assert.equal(game.updatePosition(2, tp.pos), null);
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

test("no license, no gun: Ammu-Nation refuses before touching your gold", () => {
    const { game, a, as } = setup();
    a.gold = 1000;
    const atAmmu = as(1, { pos: SHOPS.chi_ammu.pos });
    assert.match(game.command(atAmmu, "buy", ["glizzy"]).msg, /need a weapon license first/);
    assert.equal(a.gold, 1000);
    assert.equal(a.inventory.glizzy, undefined);
    // ammo doesn't need one
    assert.match(game.command(atAmmu, "buy", ["ammo_9mm"]).msg, /Bought/);
});

test("buying the license: dollars, only at Ammu-Nation, only once", () => {
    const { game, a, as } = setup();
    assert.match(game.command(as(1), "buylicense", ["weapon"]).msg, /at Ammu-Nation/);
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
