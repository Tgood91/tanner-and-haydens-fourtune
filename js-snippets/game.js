// ============================================================
// game.js — the whole game's rules in one place, no game engine
// Every system plugs in here. The platform file (fivem-server.js
// today, a GTA 6 one whenever that's moddable) only does three jobs:
//   1. tell the game who joined/left and where they are
//   2. pass commands in:   game.command(ctx, "buy", ["water", "2"])
//   3. carry results out:  show `msg`, send `notify`, perform `actions`
// That split is why all of this runs and is tested with plain Node.
//
// Every command returns { msg, notify: [{ id, msg }], actions: [...] }
// Action types the platform must perform:
//   setHealth { target, value }            value is 0..100
//   spawnVehicle { target, model, plate, pos }
//   despawnVehicle { plate }
//   setVehicleLocked { plate, locked }
//   pickupCreated { id, item, pos }         visual prop only
//   pickupRemoved { id }
// ============================================================

const inventory = require("./inventory");
const vehicles = require("./vehicles");
const economy = require("./economy");
const jobs = require("./jobs");
const needs = require("./needs");
const cities = require("./cities");
const shops = require("./shops");
const { createPickups } = require("./pickups");
const { createTrunks } = require("./trunks");
const { createCharacter, serialize } = require("./character");

const PAY_INTERVAL_MIN = 30;

function reply(msg, extra = {}) {
    return { msg, notify: [], actions: [], ...extra };
}

// Number("2") -> 2, Number("2abc") -> NaN, which the modules refuse.
function toCount(text, fallback = 1) {
    return text === undefined ? fallback : Number(text);
}

function lower(text) {
    return (text || "").toLowerCase();
}

function createGame() {
    const characters = new Map();     // player id -> character
    const worldVehicles = new Map();  // plate -> { plate, model, owner, locked }
    const pickups = createPickups();
    const trunks = createTrunks();
    let minutesSincePay = 0;

    // ---------------- players ----------------
    function join(id, name, saved = null) {
        const c = createCharacter(id, name, saved);
        characters.set(id, c);
        return c;
    }

    // Returns what to save, plus despawns for their cars still out.
    function leave(id) {
        const c = characters.get(id);
        if (!c) return { saved: null, actions: [] };
        const actions = [];
        for (const [plate, v] of worldVehicles) {
            if (v.owner === id) {
                worldVehicles.delete(plate);
                actions.push({ type: "despawnVehicle", plate });
            }
        }
        characters.delete(id);
        return { saved: serialize(c), actions };
    }

    function get(id) {
        return characters.get(id) || null;
    }

    // The platform reads the ped's real health (bullets, crashes) before commands/ticks.
    function syncHealth(id, value) {
        const c = characters.get(id);
        if (c) c.health = Math.max(0, Math.min(c.maxHealth, Math.round(value)));
    }

    function updatePosition(id, pos) {
        const c = characters.get(id);
        return c ? cities.updateCity(c, pos) : null;
    }

    // ---------------- commands ----------------
    // consoleOnly: only the server console (no in-game admin command to abuse)
    const commands = {
        help: {
            help: "list commands",
            run: () => reply(Object.entries(commands)
                .filter(([, cmd]) => !cmd.consoleOnly)
                .map(([name, cmd]) => `/${name} — ${cmd.help}`).join("\n")),
        },

        // ----- inventory -----
        inventory: { help: "show your items", run: ({ c }) => reply(inventory.listInventory(c.inventory)) },
        useitem: {
            help: "<item>",
            run: ({ c, args }) => {
                const item = lower(args[0]);
                const res = inventory.useItem(c.inventory, item, c);
                if (!res.ok) return reply(res.msg);
                const def = inventory.ITEMS[item];
                needs.applyItem(c, def);
                const actions = def.heal ? [{ type: "setHealth", target: c.id, value: c.health }] : [];
                return reply(`${res.msg}. ${needs.status(c)}`, { actions });
            },
        },
        dropitem: {
            help: "<item> [count]",
            run: ({ c, args, ctx }) => {
                const item = lower(args[0]);
                const res = pickups.drop(c, item, toCount(args[1]), ctx.pos, ctx.now);
                if (!res.ok) return reply(res.msg);
                return reply(res.msg, { actions: [{ type: "pickupCreated", id: res.pickupId, item, pos: { ...ctx.pos } }] });
            },
        },
        pickup: {
            help: "grab the closest dropped item",
            run: ({ c, ctx }) => {
                const res = pickups.grab(c, ctx.pos);
                if (!res.ok) return reply(res.msg);
                return reply(res.msg, { actions: [{ type: "pickupRemoved", id: res.pickupId }] });
            },
        },
        giveitem: {
            help: "<playerId> <item> [count]",
            consoleOnly: true,
            run: ({ args }) => {
                const target = get(Number(args[0]));
                if (!target) return reply(`No player with id ${args[0]}`);
                const res = inventory.addItem(target.inventory, lower(args[1]), toCount(args[2]));
                return reply(res.msg, { notify: res.ok ? [{ id: target.id, msg: res.msg }] : [] });
            },
        },

        // ----- money -----
        balance: { help: "cash and bank", run: ({ c }) => reply(economy.balance(c)) },
        deposit: { help: "<amount>", run: ({ c, args }) => reply(economy.deposit(c, toCount(args[0], NaN)).msg) },
        withdraw: { help: "<amount>", run: ({ c, args }) => reply(economy.withdraw(c, toCount(args[0], NaN)).msg) },
        pay: {
            help: "<playerId> <amount> (bank transfer)",
            run: ({ c, args }) => {
                const to = get(Number(args[0]));
                const amount = toCount(args[1], NaN);
                const res = economy.transfer(c, to, amount);
                const notify = res.ok ? [{ id: to.id, msg: `${c.name} sent you ${economy.money(amount)}` }] : [];
                return reply(res.msg, { notify });
            },
        },
        givemoney: {
            help: "<playerId> <cash|bank> <amount>",
            consoleOnly: true,
            run: ({ args }) => {
                const target = get(Number(args[0]));
                if (!target) return reply(`No player with id ${args[0]}`);
                const res = economy.addMoney(target, lower(args[1]), toCount(args[2], NaN));
                return reply(res.msg, { notify: res.ok ? [{ id: target.id, msg: `You received ${res.msg}` }] : [] });
            },
        },

        // ----- jobs -----
        job: { help: "your job and pay", run: ({ c }) => reply(jobs.jobInfo(c)) },
        duty: { help: "clock in / out", run: ({ c }) => reply(jobs.toggleDuty(c).msg) },
        setjob: {
            help: "<playerId> <job> [grade]",
            consoleOnly: true,
            run: ({ args }) => {
                const target = get(Number(args[0]));
                if (!target) return reply(`No player with id ${args[0]}`);
                const res = jobs.setJob(target, lower(args[1]), toCount(args[2], 0));
                return reply(res.msg, { notify: res.ok ? [{ id: target.id, msg: res.msg }] : [] });
            },
        },

        // ----- needs / world -----
        status: { help: "health, hunger, thirst", run: ({ c }) => reply(needs.status(c)) },
        cities: { help: "the cities, south to north", run: () => reply(cities.listCities()) },
        whereami: {
            help: "which city you're in",
            run: ({ ctx }) => reply(`You're in ${cities.CITIES[cities.cityAt(ctx.pos)].label}`),
        },

        // ----- shops -----
        shop: {
            help: "see what the shop you're standing at sells",
            run: ({ ctx }) => {
                const found = shops.findShopNear(ctx.pos);
                return reply(found ? shops.listShop(found.shop) : "You're not at a shop");
            },
        },
        buy: {
            help: "<item> [count] [cash|bank]",
            run: ({ c, args, ctx }) => {
                const found = shops.findShopNear(ctx.pos);
                if (!found) return reply("You're not at a shop");
                return reply(shops.buy(c, found.shop, lower(args[0]), toCount(args[1]), lower(args[2]) || "cash").msg);
            },
        },

        // ----- vehicles -----
        cars: { help: "the catalog", run: () => reply(vehicles.listCars()) },
        garage: { help: "your cars", run: ({ c }) => reply(vehicles.listGarage(c)) },
        buyveh: { help: "<model>", run: ({ c, args }) => reply(vehicles.buyVehicle(c, lower(args[0])).msg) },
        spawnveh: {
            help: "<model or plate>",
            run: ({ c, args, ctx }) => {
                const car = vehicles.findOwned(c, args[0]);
                if (!car) return reply(`You don't own a ${args[0] || "car"}`);
                if (worldVehicles.has(car.plate)) return reply(`${car.plate} is already out`);
                worldVehicles.set(car.plate, { plate: car.plate, model: car.model, owner: c.id, locked: true });
                return reply(`Pulled out ${vehicles.CATALOG[car.model]?.name || car.model} (${car.plate})`, {
                    actions: [{ type: "spawnVehicle", target: c.id, model: car.model, plate: car.plate, pos: { ...ctx.pos } }],
                });
            },
        },
        storeveh: {
            help: "put your nearest car back in the garage",
            run: ({ c, ctx }) => {
                const v = worldVehicles.get(ctx.vehiclePlate);
                if (!v || v.owner !== c.id) return reply("No car of yours nearby");
                worldVehicles.delete(v.plate);
                return reply(`Stored ${v.plate}`, { actions: [{ type: "despawnVehicle", plate: v.plate }] });
            },
        },
        lock: {
            help: "lock / unlock your nearest car",
            run: ({ c, ctx }) => {
                const v = worldVehicles.get(ctx.vehiclePlate);
                if (!v || v.owner !== c.id) return reply("No car of yours nearby");
                v.locked = !v.locked;
                return reply(v.locked ? "Locked." : "Unlocked.", {
                    actions: [{ type: "setVehicleLocked", plate: v.plate, locked: v.locked }],
                });
            },
        },

        // ----- trunks -----
        // NPC cars aren't in worldVehicles, so they read as "No vehicle nearby"
        trunk: { help: "look in the nearest trunk", run: ({ c, ctx }) => reply(trunks.view(c, worldVehicles.get(ctx.vehiclePlate)).msg) },
        trunkput: {
            help: "<item> [count]",
            run: ({ c, args, ctx }) => reply(trunks.put(c, worldVehicles.get(ctx.vehiclePlate), lower(args[0]), toCount(args[1])).msg),
        },
        trunktake: {
            help: "<item> [count]",
            run: ({ c, args, ctx }) => reply(trunks.take(c, worldVehicles.get(ctx.vehiclePlate), lower(args[0]), toCount(args[1])).msg),
        },
    };

    // ctx = { id, isConsole, pos, vehiclePlate, now }
    function command(ctx, name, args = []) {
        const cmd = commands[name];
        if (!cmd) return reply(`Unknown command /${name}. Try /help`);
        if (cmd.consoleOnly && !ctx.isConsole) return reply("Console only.");

        if (ctx.isConsole) {
            if (!cmd.consoleOnly) return reply("That's a player command.");
            return cmd.run({ c: null, args, ctx });
        }

        const c = characters.get(ctx.id);
        if (!c) return reply("Your character isn't loaded yet.");
        if (c.health === 0 && name !== "help" && name !== "status") return reply("You're down. Wait for EMS.");
        return cmd.run({ c, args, ctx: { now: Date.now(), pos: { x: 0, y: 0, z: 0 }, ...ctx } });
    }

    // ---------------- time ----------------
    // Call once per in-game minute (or pass more minutes).
    function tick(minutes = 1, now = Date.now()) {
        const out = { notify: [], actions: [] };

        for (const c of characters.values()) {
            const { warnings, damaged } = needs.decay(c, minutes);
            for (const msg of warnings) out.notify.push({ id: c.id, msg });
            if (damaged) out.actions.push({ type: "setHealth", target: c.id, value: c.health });
        }

        minutesSincePay += minutes;
        while (minutesSincePay >= PAY_INTERVAL_MIN) {
            minutesSincePay -= PAY_INTERVAL_MIN;
            for (const c of characters.values()) {
                const amount = jobs.paycheckAmount(c);
                if (amount > 0) {
                    c.bank += amount;
                    out.notify.push({ id: c.id, msg: `Paycheck: ${economy.money(amount)} to your bank` });
                }
            }
        }

        for (const id of pickups.expire(now)) out.actions.push({ type: "pickupRemoved", id });
        return out;
    }

    // Autosave: everything the API needs.
    function saveAll() {
        const players = {};
        for (const [id, c] of characters) players[id] = serialize(c);
        return { players, trunks: trunks.exportAll() };
    }

    function loadTrunks(saved) {
        trunks.importAll(saved);
    }

    return {
        join, leave, get, syncHealth, updatePosition,
        command, commandNames: Object.keys(commands),
        tick, saveAll, loadTrunks,
    };
}

module.exports = { PAY_INTERVAL_MIN, createGame };
