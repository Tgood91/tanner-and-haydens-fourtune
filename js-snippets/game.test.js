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

test("downed players can't run commands", () => {
    const { game, a, as } = setup();
    a.health = 0;
    assert.match(game.command(as(1), "inventory").msg, /down/);
});
