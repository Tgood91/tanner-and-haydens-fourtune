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
//   setHealth { target, value }            value is 0..100 (0 = downed)
//   revive { target, health, pos }         bring the ped back; pos = where (hospital or same spot)
//   setAmmo { target, ammoType, rounds }   GTA ammo pool, e.g. AMMO_PISTOL — set, not add
//   giveWeapon { target, weapon, ammoType, rounds }
//   removeWeapon { target, weapon }
//   setCuffed { target, cuffed }           hands-behind-back animation, no shooting/driving
//   teleport { target, pos, heading }      jail cell / release spawn
//   setVehicleState { plate, fuel, tank, engine, body }  fuel gauge / empty tank / repaired
//   setClock { hour, minute }              every client shows the server's time
//   setWeather { weather }                 and the server's sky
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
const medical = require("./medical");
const ammo = require("./ammo");
const police = require("./police");
const spawns = require("./spawns");
const fuel = require("./fuel");
const licenses = require("./licenses");
const { createDispatch, FARE_BASE } = require("./taxi");
const { createHeists } = require("./robbery");
const phone = require("./phone");
const gangs = require("./gangs");
const places = require("./places");
const { createTurf, CLAIM_MS } = require("./turf");
const { createEnvironment } = require("./environment");
const hud = require("./hud");
const { createDrugs } = require("./drugs");
const houses = require("./houses");
const shifts = require("./shifts");
const impound = require("./impound");
const appearance = require("./appearance");
const { createPickups } = require("./pickups");
const { createTrunks } = require("./trunks");
const { createCharacter, serialize } = require("./character");

const PAY_INTERVAL_MIN = 30;
const ALLOWED_WHILE_DOWN = ["help", "status", "respawn", "911"];
const ALLOWED_WHILE_HELD = ["help", "status", "inventory", "balance", "ammo", "job", "whereami", "cities", "jailtime"];

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

// opts.rng: only tests pass this, to make spawn picks predictable
function createGame(opts = {}) {
    const rng = opts.rng || Math.random;
    const characters = new Map();     // player id -> character
    const worldVehicles = new Map();  // plate -> { plate, model, owner, locked }
    const pickups = createPickups();
    const trunks = createTrunks();
    const dispatch = createDispatch();
    const heists = createHeists(rng);
    const crews = gangs.createGangs();
    const turf = createTurf();
    const env = createEnvironment(rng);
    const trade = createDrugs(rng);
    const homes = houses.createHouses();
    const crewShifts = shifts.createShifts();
    const lot = impound.createImpound();
    let minutesSincePay = 0;

    // ---------------- players ----------------
    function join(id, name, saved = null) {
        const c = createCharacter(id, name, saved);
        if (!c.phone.number) {
            const taken = new Set([...characters.values()].map((o) => phone.normalize(o.phone.number)));
            c.phone.number = phone.makeNumber(spawns.DEFAULT_CITY, taken, rng);
        }
        characters.set(id, c);
        return c;
    }

    function byName(name) {
        const wanted = String(name || "").trim().toLowerCase();
        for (const o of characters.values()) if (o.name.toLowerCase() === wanted) return o;
        return null;
    }

    // How many of this crew are standing in that district right now
    function crewPresentIn(tag, districtName) {
        let n = 0;
        for (const o of characters.values()) {
            if (!o.gang || o.gang.tag !== tag || !o.pos) continue;
            const here = places.zoneAt(o.pos, "district");
            if (here && here.name === districtName) n += 1;
        }
        return n;
    }

    function onlineInCrew(tag) {
        return [...characters.values()].filter((o) => o.gang && o.gang.tag === tag);
    }

    function crewMates(c, except) {
        if (!c.gang) return [];
        return [...characters.values()].filter((o) => o.gang && o.gang.tag === c.gang.tag && o !== except);
    }

    // "2" is a player id; "312-4821" is a number
    function findPerson(token) {
        const text = String(token || "");
        if (/^\d{1,3}$/.test(text)) return get(Number(text));
        const wanted = phone.normalize(text);
        if (wanted.length < 4) return null;
        for (const o of characters.values()) {
            if (o.phone.number && phone.normalize(o.phone.number) === wanted) return o;
        }
        return null;
    }

    // Returns what to save, plus despawns for their cars still out.
    function leave(id) {
        const c = characters.get(id);
        if (!c) return { saved: null, actions: [] };
        const actions = [];
        for (const [plate, v] of worldVehicles) {
            if (v.owner === id) {
                // logging out on the street used to be free; now it's a tow
                lot.take(plate, v, c.name, "abandoned", Date.now());
                worldVehicles.delete(plate);
                actions.push({ type: "despawnVehicle", plate });
            }
        }
        const notify = dispatch.dropPlayer(id);
        heists.cancel(id, "they logged off");
        crews.dropPlayer(id);
        crewShifts.dropPlayer(id);
        characters.delete(id);
        return { saved: serialize(c), actions, notify };
    }

    function get(id) {
        return characters.get(id) || null;
    }

    function onDutyPolice(except) {
        return [...characters.values()].filter((o) => o.job.name === "police" && o.onDuty && o !== except);
    }

    // Tell on-duty EMS someone just went down; tell the patient their options.
    function downedAlert(c) {
        const where = places.describe(c.pos);
        const notify = [];
        for (const other of characters.values()) {
            if (other.job.name === "ems" && other.onDuty && other !== c) {
                const sign = crewShifts.callsignOf(other);
                notify.push({ id: other.id, msg: `${sign ? `${sign}, ` : ""}EMS call: ${c.name} is down at ${where} — /revive ${c.id}` });
            }
        }
        notify.push({
            id: c.id,
            msg: notify.length > 0
                ? `You're down. EMS has been alerted (${notify.length} on duty). /respawn unlocks in ${medical.BLEEDOUT_MIN} min.`
                : `You're down and no EMS is on duty. /respawn unlocks in ${medical.BLEEDOUT_MIN} min.`,
        });
        return notify;
    }

    // The platform reads the ped's real health (bullets, crashes) before commands/ticks.
    // Returns alerts when that reading is the moment someone goes down.
    function syncHealth(id, value, now = Date.now()) {
        const c = characters.get(id);
        if (!c || c.downed) return reply("");
        c.health = Math.max(0, Math.min(c.maxHealth, Math.round(value)));
        if (c.health === 0 && medical.knockDown(c, now)) {
            const notify = downedAlert(c);
            const stopped = heists.cancel(id, "you went down");
            if (stopped) notify.push({ id, msg: stopped.msg });
            return reply("", { notify });
        }
        return reply("");
    }

    // The platform calls this for every player every few seconds.
    function updatePosition(id, pos, now = Date.now()) {
        const out = { notify: [], actions: [] };
        const c = characters.get(id);
        if (!c) return out;
        c.pos = { ...pos };
        dispatch.addDistance(id, pos); // no-op unless they're driving a fare

        const announcement = cities.updateCity(c, pos);
        if (announcement) out.notify.push({ id, msg: announcement });

        const entered = places.updateZone(c, pos);
        if (entered) out.notify.push({ id, msg: entered });

        const heist = heists.progress(c, pos, now, env.isNight()); // no-op unless they're robbing somewhere
        if (heist) out.notify.push({ id, msg: heist.msg });

        for (const e of turf.progress(now, crewPresentIn)) {
            if (e.type === "lost") {
                for (const o of onlineInCrew(e.tag)) out.notify.push({ id: o.id, msg: `Lost the hold on ${e.district}. Nothing taken.` });
            } else {
                for (const o of onlineInCrew(e.tag)) out.notify.push({ id: o.id, msg: `[${e.tag}] now holds ${e.district}.` });
                if (e.loser) {
                    for (const o of onlineInCrew(e.loser)) out.notify.push({ id: o.id, msg: `You lost ${e.district} to [${e.tag}].` });
                }
            }
        }
        return out;
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
            run: ({ c, args, ctx }) => {
                const item = lower(args[0]);

                // Car items: check the car BEFORE the item gets used up
                const v = worldVehicles.get(ctx.vehiclePlate);
                if (item === "fuelcan" && c.inventory.fuelcan) {
                    const ok = fuel.checkFuelCan(c, v);
                    if (!ok.ok) return reply(ok.msg);
                }
                if (item === "repairkit" && c.inventory.repairkit) {
                    const ok = fuel.checkPatch(c, v);
                    if (!ok.ok) return reply(ok.msg);
                }

                const res = inventory.useItem(c.inventory, item, c);
                if (!res.ok) return reply(res.msg);

                if (item === "fuelcan") {
                    fuel.applyFuelCan(v);
                    return reply(`Poured in the fuel can. ${fuel.describe(v.car)}`, { actions: [vehicleStateAction(v)] });
                }
                if (item === "repairkit") {
                    fuel.applyPatch(v, ctx.now);
                    return reply(`Patched the engine up enough to drive. ${fuel.describe(v.car)}`, { actions: [vehicleStateAction(v)] });
                }

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

        givegold: {
            help: "<playerId> <amount> (events and prizes — gold is never sold)",
            consoleOnly: true,
            run: ({ args }) => {
                const target = get(Number(args[0]));
                if (!target) return reply(`No player with id ${args[0]}`);
                const res = economy.addGold(target, toCount(args[1], NaN));
                return reply(res.msg, { notify: res.ok ? [{ id: target.id, msg: `You received ${res.msg}` }] : [] });
            },
        },

        // ----- jobs -----
        job: { help: "your job and pay", run: ({ c }) => reply(jobs.jobInfo(c)) },
        apply: {
            help: "<job> — take an open job (glizzys)",
            run: ({ c, args }) => reply(jobs.applyJob(c, lower(args[0])).msg),
        },
        duty: {
            help: "clock in / out — sheriff and EMS get a callsign with it",
            run: ({ c, ctx }) => {
                const res = jobs.toggleDuty(c);
                if (!res.ok || !shifts.isDepartment(c.job.name)) return reply(res.msg);

                if (c.onDuty) {
                    const on = crewShifts.start(c, ctx.now);
                    // no free callsign means no shift, so don't leave them clocked in
                    if (!on.ok) {
                        c.onDuty = false;
                        return reply(on.msg);
                    }
                    return reply(`${res.msg} ${on.msg}`);
                }
                const off = crewShifts.end(c, ctx.now);
                return reply(off.ok ? `${res.msg} ${off.msg}` : res.msg);
            },
        },
        roster: {
            help: "[police|ems] — who's on shift",
            run: ({ c, args, ctx }) => {
                const dept = lower(args[0]) || (shifts.isDepartment(c.job.name) ? c.job.name : "police");
                return reply(crewShifts.roster(dept, ctx.now, (id) => get(id)?.name));
            },
        },
        callsign: {
            help: "your callsign and how long you've been out",
            run: ({ c, ctx }) => {
                const shift = crewShifts.shiftOf(c);
                if (!shift) return reply("You're not on shift. /duty clocks you in");
                return reply(`${shift.callsign} — ${Math.round((ctx.now - shift.since) / 60000)} min on shift.`);
            },
        },
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

        // ----- weapons & ammo -----
        ammo: { help: "your loaded rounds and boxes", run: ({ c }) => reply(ammo.listAmmo(c)) },
        loadammo: {
            help: "<pistol|smg|rifle|shotgun|sniper> [boxes]",
            run: ({ c, args }) => {
                const res = ammo.loadAmmo(c, args[0], toCount(args[1]));
                return reply(res.msg, { actions: res.ok ? [setAmmoAction(c, res.type)] : [] });
            },
        },
        unloadammo: {
            help: "<type> (full boxes back into your bag)",
            run: ({ c, args }) => {
                const res = ammo.unloadAmmo(c, args[0]);
                return reply(res.msg, { actions: res.ok ? [setAmmoAction(c, res.type)] : [] });
            },
        },
        equip: {
            help: "<weapon>",
            run: ({ c, args }) => {
                const res = ammo.equip(c, lower(args[0]));
                if (!res.ok) return reply(res.msg);
                return reply(res.msg, {
                    actions: [{ type: "giveWeapon", target: c.id, weapon: res.weapon, ammoType: res.ammoType, rounds: res.rounds }],
                });
            },
        },
        holster: {
            help: "put your gun away",
            run: ({ c }) => {
                const res = ammo.holster(c);
                return reply(res.msg, { actions: res.ok ? [{ type: "removeWeapon", target: c.id, weapon: res.weapon }] : [] });
            },
        },

        // ----- police -----
        cuff: {
            help: "<playerId> (police) — cuff / uncuff",
            run: ({ c, args }) => {
                const suspect = get(Number(args[0]));
                const res = police.cuff(c, suspect);
                if (!res.ok) return reply(res.msg);
                const actions = [{ type: "setCuffed", target: suspect.id, cuffed: res.cuffed }];
                if (res.holstered) actions.push({ type: "removeWeapon", target: suspect.id, weapon: res.holstered });
                const notify = [{ id: suspect.id, msg: res.cuffed ? `${c.name} cuffed you` : `${c.name} took your cuffs off` }];
                const stopped = res.cuffed ? heists.cancel(suspect.id, `${c.name} got you`) : null;
                if (stopped) notify.push({ id: suspect.id, msg: stopped.msg });
                return reply(stopped ? `${res.msg} — caught them robbing ${stopped.label}` : res.msg, { notify, actions });
            },
        },
        search: {
            help: "<playerId> (police) — they must be cuffed or down",
            run: ({ c, args }) => {
                const suspect = get(Number(args[0]));
                const res = police.search(c, suspect);
                return reply(res.msg, { notify: res.ok ? [{ id: suspect.id, msg: `${c.name} searched you` }] : [] });
            },
        },
        seize: {
            help: "<playerId> <item> [count] (police)",
            run: ({ c, args }) => {
                const suspect = get(Number(args[0]));
                const res = police.seize(c, suspect, lower(args[1]), toCount(args[2]));
                const result = reply(res.msg, { notify: res.ok ? [{ id: suspect.id, msg: `${c.name} took ${args[2] || 1}x ${args[1]}` }] : [] });
                return res.ok ? checkEquipped(suspect, result) : result;
            },
        },
        fine: {
            help: "<playerId> <amount> (police) — from their bank",
            run: ({ c, args }) => {
                const suspect = get(Number(args[0]));
                const amount = toCount(args[1], NaN);
                const res = police.fine(c, suspect, amount);
                return reply(res.msg, { notify: res.ok ? [{ id: suspect.id, msg: `${c.name} fined you ${economy.money(amount)}. Bank: ${economy.money(suspect.bank)}` }] : [] });
            },
        },
        jail: {
            help: "<playerId> <minutes> (police) — they must be cuffed",
            run: ({ c, args }) => {
                const suspect = get(Number(args[0]));
                const res = police.jail(c, suspect, toCount(args[1], NaN));
                if (!res.ok) return reply(res.msg);
                settle(suspect, res.pos);
                return reply(res.msg, {
                    notify: [{ id: suspect.id, msg: `You've been jailed for ${suspect.jailMinutes} min. /jailtime to check.` }],
                    actions: [{ type: "setCuffed", target: suspect.id, cuffed: false }, { type: "teleport", target: suspect.id, pos: res.pos }],
                });
            },
        },
        jailtime: {
            help: "time left on your sentence",
            run: ({ c }) => reply(c.jailMinutes > 0 ? `${c.jailMinutes} min left` : "You're not in jail"),
        },
        unjail: {
            help: "<playerId>",
            consoleOnly: true,
            run: ({ args }) => {
                const target = get(Number(args[0]));
                if (!target) return reply(`No player with id ${args[0]}`);
                if (!(target.jailMinutes > 0)) return reply(`${target.name} isn't in jail`);
                const out = release(target, "An admin let you out.");
                return reply(`Released ${target.name}`, { notify: [out.notify], actions: [out.action] });
            },
        },

        // ----- medical -----
        revive: {
            help: "<playerId> (EMS, uses a medkit)",
            run: ({ c, args }) => {
                const patient = get(Number(args[0]));
                const res = medical.revive(c, patient);
                if (!res.ok) return reply(res.msg);
                return reply(res.msg, {
                    notify: [{ id: patient.id, msg: `${c.name} revived you. ${needs.status(patient)}` }],
                    actions: [{ type: "revive", target: patient.id, health: patient.health, pos: { ...patient.pos } }],
                });
            },
        },
        respawn: {
            help: "wake up at the hospital (after the bleedout timer, costs a bill)",
            run: ({ c, ctx }) => {
                const res = medical.respawn(c, ctx.now, cities.cityAt(c.pos));
                if (!res.ok) return reply(res.msg);
                settle(c, res.pos);
                return reply(res.msg, { actions: [{ type: "revive", target: c.id, health: c.health, pos: res.pos }] });
            },
        },
        911: {
            help: "[what's wrong] — call police and EMS to where you are",
            run: ({ c, args }) => {
                if (!phone.hasPhone(c)) return reply("You don't have a phone");
                if (c.downed) return reply("", { notify: downedAlert(c) });

                const what = args.join(" ").trim() || "no details given";
                const where = places.describe(c.pos);
                const notify = [];
                for (const o of characters.values()) {
                    if ((o.job.name === "police" || o.job.name === "ems") && o.onDuty && o !== c) {
                        notify.push({ id: o.id, msg: `911 — ${where}. From ${c.name} (${c.phone.number}): ${what}` });
                    }
                }
                const answer = notify.length ? `Dispatch has it — ${notify.length} unit(s) notified.` : "Nobody is on duty to take it.";
                return reply(`911 called: ${what}. ${answer}`, { notify });
            },
        },
        forcerevive: {
            help: "<playerId>",
            consoleOnly: true,
            run: ({ args }) => {
                const target = get(Number(args[0]));
                if (!target) return reply(`No player with id ${args[0]}`);
                if (!target.downed) return reply(`${target.name} isn't down`);
                medical.getUp(target, target.maxHealth);
                return reply(`Revived ${target.name}`, {
                    notify: [{ id: target.id, msg: "An admin revived you." }],
                    actions: [{ type: "revive", target: target.id, health: target.health, pos: { ...(target.pos || { x: 0, y: 0, z: 0 }) } }],
                });
            },
        },

        // ----- needs / world -----
        status: { help: "health, hunger, thirst", run: ({ c }) => reply(needs.status(c)) },
        cities: { help: "the cities, south to north", run: () => reply(cities.listCities()) },
        places: {
            help: "every district, park and road in this city",
            run: ({ ctx }) => reply(places.listFor(cities.cityAt(ctx.pos))),
        },
        whereami: {
            help: "the road, area and city you're standing in",
            run: ({ ctx }) => reply(places.describe(ctx.pos)),
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

        // ----- property -----
        houses: { help: "what's on the market", run: () => reply(homes.forSale()) },
        home: { help: "your place", run: ({ c }) => reply(homes.info(c)) },
        buyhouse: {
            help: "buy the place you're standing at",
            run: ({ c, ctx }) => reply(homes.buy(c, houses.findDoor(ctx.pos)).msg),
        },
        sellhouse: { help: "sell your place back, empty", run: ({ c }) => reply(homes.sell(c).msg) },
        lockhome: {
            help: "lock or unlock your door",
            run: ({ c, ctx }) => reply(homes.toggleLock(c, houses.findDoor(ctx.pos)).msg),
        },
        givekey: {
            help: "<playerId> — a key to your place",
            run: ({ c, args }) => {
                const target = get(Number(args[0]));
                const res = homes.giveKey(c, target);
                return reply(res.msg, { notify: res.ok ? [{ id: target.id, msg: `${c.name} gave you a key to ${res.label}` }] : [] });
            },
        },
        takekey: {
            help: "<name> — take a key back",
            run: ({ c, args }) => {
                const res = homes.takeKey(c, args.join(" "));
                const them = res.ok ? byName(res.name) : null;
                return reply(res.msg, { notify: them ? [{ id: them.id, msg: `${c.name} took their key back` }] : [] });
            },
        },
        wardrobe: {
            help: "look inside the place you're at",
            run: ({ c, ctx }) => reply(homes.look(c, houses.findDoor(ctx.pos)).msg),
        },
        storehome: {
            help: "<item> [count]",
            run: ({ c, args, ctx }) => {
                const res = homes.put(c, houses.findDoor(ctx.pos), lower(args[0]), toCount(args[1]));
                return res.ok ? checkEquipped(c, reply(res.msg)) : reply(res.msg);
            },
        },
        takehome: {
            help: "<item> [count]",
            run: ({ c, args, ctx }) => reply(homes.take(c, houses.findDoor(ctx.pos), lower(args[0]), toCount(args[1])).msg),
        },

        // ----- the impound -----
        impound: { help: "what of yours is in the lot", run: ({ c }) => reply(lot.listFor(c.name)) },
        releaseveh: {
            help: "<plate> — pay a car out, at the lot",
            run: ({ c, args }) => reply(lot.release(c, args[0], vehicles.findOwned).msg),
        },
        towveh: {
            help: "tow the nearest player car to the lot (police, on duty)",
            run: ({ c, ctx }) => {
                if (c.job.name !== "police" || !c.onDuty) return reply("Sheriff's Office, on duty only");
                const v = worldVehicles.get(ctx.vehiclePlate);
                if (!v) return reply("No player car nearby");

                const owner = get(v.owner);
                const reason = v.car && v.car.engine <= 0 ? "wrecked" : "police";
                if (!lot.take(v.plate, v, owner ? owner.name : v.ownerName, reason, ctx.now)) {
                    return reply(`${v.plate} is already in the lot`);
                }
                worldVehicles.delete(v.plate);
                return reply(`Towed ${v.plate} — ${impound.REASON_TEXT[reason]}.`, {
                    notify: owner ? [{ id: owner.id, msg: `Your ${v.plate} was ${impound.REASON_TEXT[reason]}. /impound` }] : [],
                    actions: [{ type: "despawnVehicle", plate: v.plate }],
                });
            },
        },

        // ----- clothes -----
        clothes: { help: "where the shops are and what a change costs", run: () => reply(appearance.listShops()) },
        look: { help: "what you're wearing", run: ({ c }) => reply(appearance.describe(c)) },
        dress: {
            help: "<slot> <number> — change one slot, at a shop",
            run: ({ c, args, ctx }) => {
                const res = appearance.change(c, appearance.shopNear(ctx.pos), lower(args[0]), args[1]);
                return reply(res.msg, { actions: res.ok ? [lookAction(c)] : [] });
            },
        },
        outfits: { help: "your saved outfits", run: ({ c }) => reply(appearance.listOutfits(c)) },
        saveoutfit: {
            help: "<name> — keep what you're wearing, at a shop",
            run: ({ c, args, ctx }) => reply(appearance.saveOutfit(c, appearance.shopNear(ctx.pos), args.join(" ")).msg),
        },
        outfit: {
            help: "<name> — put a saved outfit back on, at a shop or your own door",
            run: ({ c, args, ctx }) => {
                const res = appearance.wearOutfit(c, canChangeAt(c, ctx.pos), args.join(" "));
                return reply(res.msg, { actions: res.ok ? [lookAction(c)] : [] });
            },
        },
        dropoutfit: {
            help: "<name> — forget a saved outfit",
            run: ({ c, args }) => reply(appearance.dropOutfit(c, args.join(" ")).msg),
        },

        // ----- the trade -----
        harvest: {
            help: "pick what's growing where you're standing",
            run: ({ c, ctx }) => reply(trade.harvest(c, ctx.now).msg),
        },
        process: {
            help: "<greenpack|whitepack> — cook raw into packs, at your crew base",
            run: ({ c, args }) => {
                const base = c.gang ? crews.get(c.gang.tag)?.base : null;
                return reply(trade.process(c, base, args[0]).msg);
            },
        },
        deal: {
            help: "<greenpack|whitepack> — move one in the district you're in",
            run: ({ c, args, ctx }) => {
                const district = places.zoneAt(ctx.pos, "district");
                const onTurf = !!(c.gang && district && turf.holderOf(district.name) === c.gang.tag);
                const res = trade.deal(c, args[0], district && district.name, onTurf, env.isNight(), ctx.now);
                if (!res.ok) return reply(res.msg);

                // someone saw it, so the law hears where — never who
                const notify = [];
                if (res.seen) {
                    for (const o of onDutyPolice(c)) {
                        notify.push({ id: o.id, msg: `Dealing reported in ${res.district}. No description.` });
                    }
                }
                return reply(res.msg, { notify });
            },
        },

        // ----- the world outside -----
        time: { help: "the time and the sky", run: () => reply(env.describe()) },
        weather: { help: "the time and the sky", run: () => reply(env.describe()) },
        settime: {
            help: "<hour> [minute]",
            consoleOnly: true,
            run: ({ args }) => {
                const res = env.setTime(toCount(args[0], NaN), toCount(args[1], 0));
                return reply(res.msg, { actions: res.ok ? [{ type: "setClock", ...env.state() }] : [] });
            },
        },
        setweather: {
            help: "<clear|clouds|overcast|rain|thunder|clearing|foggy|extrasunny>",
            consoleOnly: true,
            run: ({ args }) => {
                const res = env.setWeather(args[0]);
                return reply(res.msg, { actions: res.ok ? [{ type: "setWeather", weather: env.state().weather }] : [] });
            },
        },
        freeze: {
            help: "<time|weather> <on|off>",
            consoleOnly: true,
            run: ({ args }) => reply(env.freeze(lower(args[0]), lower(args[1]) !== "off").msg),
        },

        // ----- turf -----
        turf: { help: "who holds what", run: ({ c }) => reply(turf.board((tag) => crews.get(tag)?.name)) },
        claim: {
            help: "take the district you're standing in — your crew has to be here",
            run: ({ c, ctx }) => {
                const district = places.zoneAt(ctx.pos, "district");
                const present = c.gang && district ? crewPresentIn(c.gang.tag, district.name) : 0;
                const res = turf.claim(c, district, present, ctx.now);
                if (!res.ok) return reply(res.msg);

                const notify = onlineInCrew(c.gang.tag).filter((o) => o !== c).map((o) => ({ id: o.id, msg: res.msg }));
                if (res.warnTag) {
                    for (const o of onlineInCrew(res.warnTag)) {
                        notify.push({ id: o.id, msg: `WARNING: [${c.gang.tag}] is taking ${res.district} from you. ${Math.round(CLAIM_MS / 1000)}s.` });
                    }
                }
                return reply(res.msg, { notify });
            },
        },
        abandon: {
            help: "(leader) give up the turf you're standing in",
            run: ({ c, ctx }) => {
                const res = turf.abandon(c, places.zoneAt(ctx.pos, "district"));
                if (!res.ok) return reply(res.msg);
                return reply(res.msg, { notify: crewMates(c, c).map((o) => ({ id: o.id, msg: res.msg })) });
            },
        },

        // ----- crews -----
        gangs: { help: "every crew", run: () => reply(crews.list()) },
        gang: { help: "your crew", run: ({ c }) => reply(crews.info(c)) },
        gangcreate: {
            help: "<tag> <name> — costs money, sets the base where you stand",
            run: ({ c, args, ctx }) => reply(crews.create(c, args[0], args.slice(1).join(" "), ctx.now).msg),
        },
        ganginvite: {
            help: "<playerId> (officer+)",
            run: ({ c, args, ctx }) => {
                const target = get(Number(args[0]));
                const res = crews.invite(c, target, ctx.now);
                const notify = res.ok
                    ? [{ id: target.id, msg: `${c.name} invited you to [${res.tag}] ${res.name} — /gangaccept (${gangs.INVITE_EXPIRY_MIN} min)` }]
                    : [];
                return reply(res.msg, { notify });
            },
        },
        gangaccept: {
            help: "take the invite you were sent",
            run: ({ c, ctx }) => {
                const res = crews.accept(c, ctx.now);
                if (!res.ok) return reply(res.msg);
                return reply(res.msg, { notify: crewMates(c, c).map((o) => ({ id: o.id, msg: `${c.name} joined [${res.tag}]` })) });
            },
        },
        gangleave: {
            help: "walk away from your crew",
            run: ({ c }) => {
                const mates = crewMates(c, c);
                const res = crews.leave(c);
                if (!res.ok) return reply(res.msg);
                return reply(res.msg, { notify: mates.map((o) => ({ id: o.id, msg: `${c.name} left [${res.tag}]` })) });
            },
        },
        gangkick: {
            help: "<name> (officer+)",
            run: ({ c, args }) => {
                const name = args.join(" ");
                const target = byName(name);
                const mates = crewMates(c, c);
                const res = crews.kick(c, name, target);
                if (!res.ok) return reply(res.msg);
                const notify = mates.filter((o) => o !== target).map((o) => ({ id: o.id, msg: res.msg }));
                if (target) notify.push({ id: target.id, msg: `You were kicked out of [${res.tag}]` });
                return reply(res.msg, { notify });
            },
        },
        gangpromote: {
            help: "<name> (leader)",
            run: ({ c, args }) => {
                const name = args.join(" ");
                const res = crews.setRank(c, name, byName(name), true);
                return reply(res.msg, { notify: res.ok && byName(name) ? [{ id: byName(name).id, msg: res.msg }] : [] });
            },
        },
        gangdemote: {
            help: "<name> (leader)",
            run: ({ c, args }) => {
                const name = args.join(" ");
                const res = crews.setRank(c, name, byName(name), false);
                return reply(res.msg, { notify: res.ok && byName(name) ? [{ id: byName(name).id, msg: res.msg }] : [] });
            },
        },
        gangdisband: {
            help: "(leader) shut the crew down",
            run: ({ c }) => {
                const mates = crewMates(c, c);
                const res = crews.disband(c);
                if (!res.ok) return reply(res.msg);
                for (const o of characters.values()) if (o.gang && o.gang.tag === res.tag) o.gang = null;
                turf.dropCrew(res.tag);
                return reply(res.msg, { notify: mates.map((o) => ({ id: o.id, msg: res.msg })) });
            },
        },
        g: {
            help: "<message> — crew radio, needs a radio",
            run: ({ c, args }) => {
                const res = crews.chat(c, args.join(" "));
                if (!res.ok) return reply(res.msg);
                const heard = crewMates(c, c).filter((o) => gangs.hasRadio(o));
                return reply(res.msg, { notify: heard.map((o) => ({ id: o.id, msg: res.msg })) });
            },
        },
        gangbase: { help: "(leader) move the base to where you stand", run: ({ c, ctx }) => reply(crews.setBase(c, ctx.now).msg) },
        stash: { help: "look in the crew stash (at the base)", run: ({ c }) => reply(crews.viewStash(c).msg) },
        stashput: {
            help: "<item> [count]",
            run: ({ c, args }) => {
                const res = crews.putStash(c, lower(args[0]), toCount(args[1]));
                return res.ok ? checkEquipped(c, reply(res.msg)) : reply(res.msg);
            },
        },
        stashtake: { help: "<item> [count]", run: ({ c, args }) => reply(crews.takeStash(c, lower(args[0]), toCount(args[1])).msg) },

        // ----- phone -----
        phone: { help: "your number and what's waiting", run: ({ c }) => reply(phone.hasPhone(c) ? phone.describe(c) : "You don't have a phone") },
        texts: { help: "read your messages", run: ({ c }) => reply(phone.inbox(c)) },
        text: {
            help: "<number|playerId> <message>",
            run: ({ c, args, ctx }) => {
                const to = findPerson(args[0]);
                const res = phone.sendText(c, to, args.slice(1).join(" "), ctx.now);
                return reply(res.msg, { notify: res.ok ? [{ id: to.id, msg: res.theirMsg }] : [] });
            },
        },
        contacts: { help: "your saved numbers", run: ({ c }) => reply(phone.contactList(c)) },
        save: {
            help: "<number> <name>",
            run: ({ c, args }) => reply(phone.saveContact(c, args[0], args.slice(1).join(" ")).msg),
        },

        // ----- robbery -----
        rob: {
            help: "hold up the shop you're standing at — gun out and loaded",
            run: ({ c, ctx }) => {
                const found = shops.findShopNear(ctx.pos);
                const cops = onDutyPolice(c);
                const res = heists.start(c, found, ctx.now, cops.length);
                if (!res.ok) return reply(res.msg);

                const seen = appearance.isMasked(c) ? "masked suspect" : `${c.name} (id ${c.id})`;
                const notify = cops.map((o) => {
                    const sign = crewShifts.callsignOf(o);
                    return { id: o.id, msg: `${sign ? `${sign}, ` : ""}ROBBERY IN PROGRESS — ${res.label}, ${places.describe(c.pos)}. Suspect: ${seen}` };
                });
                return reply(res.msg, { notify });
            },
        },

        // ----- taxi -----
        taxi: {
            help: "call a cab",
            run: ({ c, ctx }) => {
                if (!phone.hasPhone(c)) return reply("You don't have a phone to call one with");
                const res = dispatch.callCab(c, ctx.now);
                if (!res.ok) return reply(res.msg);
                const notify = [];
                for (const other of characters.values()) {
                    if (other.job.name === "taxi" && other.onDuty && other !== c) {
                        notify.push({ id: other.id, msg: `Cab wanted: ${c.name} at ${places.describe(c.pos)} — /accept ${c.id}` });
                    }
                }
                const waiting = notify.length > 0 ? `${notify.length} driver(s) on duty.` : "No drivers on duty right now.";
                return reply(`${res.msg} ${waiting}`, { notify });
            },
        },
        cancelcab: {
            help: "call off the cab you asked for",
            run: ({ c }) => {
                const res = dispatch.cancelCab(c);
                const notify = res.ok && res.driverId ? [{ id: res.driverId, msg: `${c.name} cancelled.` }] : [];
                return reply(res.msg, { notify });
            },
        },
        calls: { help: "(taxi) calls waiting", run: () => reply(dispatch.listCalls()) },
        accept: {
            help: "<playerId> (taxi) take a call",
            run: ({ c, args }) => {
                const passenger = get(Number(args[0]));
                const res = dispatch.accept(c, passenger);
                return reply(res.msg, { notify: res.ok ? [{ id: passenger.id, msg: `${c.name} is on the way.` }] : [] });
            },
        },
        startfare: {
            help: "<playerId> (taxi) start the meter",
            run: ({ c, args }) => {
                const passenger = get(Number(args[0]));
                const res = dispatch.startFare(c, passenger);
                return reply(res.msg, { notify: res.ok ? [{ id: passenger.id, msg: `Meter running. Flag drop ${economy.money(FARE_BASE)}.` }] : [] });
            },
        },
        endfare: {
            help: "(taxi) end the meter and bill the passenger",
            run: ({ c }) => {
                const passenger = get(dispatch.passengerIdOf(c.id));
                const res = dispatch.endFare(c, passenger);
                if (!res.ok) return reply(res.msg);
                return reply(res.msg, { notify: res.passengerMsg ? [{ id: res.passengerId, msg: res.passengerMsg }] : [] });
            },
        },
        fare: { help: "what the meter says", run: ({ c }) => reply(dispatch.meter(c).msg) },

        // ----- licenses -----
        licenses: { help: "your licenses", run: ({ c, ctx }) => reply(licenses.listLicenses(c, ctx.now)) },
        buylicense: {
            help: "weapon [cash|bank] — at Gunworks",
            run: ({ c, args, ctx }) => {
                const found = shops.findShopNear(ctx.pos);
                return reply(licenses.buyLicense(c, found?.shop, args[0], lower(args[1]) || "cash", ctx.now).msg);
            },
        },
        checklicense: {
            help: "<playerId> (police) — on a stop, no cuffs needed",
            run: ({ c, args, ctx }) => {
                const suspect = get(Number(args[0]));
                const res = licenses.check(c, suspect, ctx.now);
                return reply(res.msg, { notify: res.ok ? [{ id: suspect.id, msg: `${c.name} checked your licenses` }] : [] });
            },
        },
        revokelicense: {
            help: "<playerId> [weapon] (police)",
            run: ({ c, args, ctx }) => {
                const suspect = get(Number(args[0]));
                const res = licenses.revoke(c, suspect, args[1] || "weapon", ctx.now);
                const notify = res.ok ? [{ id: suspect.id, msg: `${c.name} revoked your ${res.label.toLowerCase()}. You can apply again in ${res.banHours}h.` }] : [];
                return reply(res.msg, { notify });
            },
        },
        givelicense: {
            help: "<playerId> [weapon]",
            consoleOnly: true,
            run: ({ args }) => {
                const target = get(Number(args[0]));
                if (!target) return reply(`No player with id ${args[0]}`);
                const type = licenses.findLicense(args[1]);
                if (!type) return reply(`No license called "${args[1]}"`);
                target.licenses[type] = { issuedAt: Date.now() };
                delete target.licenseBans[type];
                const label = licenses.LICENSES[type].label;
                return reply(`Gave ${target.name} a ${label.toLowerCase()}`, { notify: [{ id: target.id, msg: `An admin issued you a ${label.toLowerCase()}.` }] });
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
                if (lot.isHeld(car.plate)) return reply(`${car.plate} is impounded. /impound to see what it costs`);
                fuel.ensureState(car);
                // `car` is the garage entry itself, so fuel and damage write straight back to the save
                const v = { plate: car.plate, model: car.model, owner: c.id, locked: true, car, lastPos: null };
                worldVehicles.set(car.plate, v);
                return reply(`Pulled out ${vehicles.CATALOG[car.model]?.name || car.model}. ${fuel.describe(car)}`, {
                    actions: [
                        { type: "spawnVehicle", target: c.id, model: car.model, plate: car.plate, pos: { ...ctx.pos } },
                        vehicleStateAction(v),
                    ],
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
        carstatus: {
            help: "fuel, engine and body of the nearest car",
            run: ({ ctx }) => {
                // Just looking — anyone can read a gauge
                const v = worldVehicles.get(ctx.vehiclePlate);
                return reply(v ? fuel.describe(v.car) : "No player car nearby");
            },
        },
        refuel: {
            help: "[litres] [cash|bank] — at a gas station, fills up if no litres given",
            run: ({ c, args, ctx }) => {
                const v = worldVehicles.get(ctx.vehiclePlate);
                const litres = args[0] === undefined || args[0] === "cash" || args[0] === "bank" ? undefined : Number(args[0]);
                const payWith = lower(args.find((a) => a === "cash" || a === "bank")) || "cash";
                const res = fuel.refuel(c, v, ctx.pos, litres, payWith);
                return reply(res.msg, { actions: res.ok ? [vehicleStateAction(v)] : [] });
            },
        },
        repair: {
            help: "(mechanic) full repair of the nearest car — the owner pays",
            run: ({ c, ctx }) => {
                const v = worldVehicles.get(ctx.vehiclePlate);
                const res = fuel.mechanicRepair(c, v, v ? get(v.owner) : null, ctx.now);
                if (!res.ok) return reply(res.msg);
                return reply(res.msg, {
                    notify: res.ownerMsg ? [{ id: v.owner, msg: res.ownerMsg }] : [],
                    actions: [vehicleStateAction(v)],
                });
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

    function vehicleStateAction(v) {
        return { type: "setVehicleState", plate: v.plate, fuel: v.car.fuel, tank: fuel.tankFor(v.model), engine: v.car.engine, body: v.car.body };
    }

    // What the platform needs to redraw the ped after a change of clothes
    function lookAction(c) {
        return { type: "setAppearance", target: c.id, look: { ...appearance.wearing(c) } };
    }

    // Somewhere you're allowed to change: a shop, or a door you can open
    function canChangeAt(c, pos) {
        if (appearance.shopNear(pos)) return true;
        const door = houses.findDoor(pos);
        return !!(door && homes.mayEnter(c, door.id));
    }

    // The platform reports each car that's out every few seconds: { pos, engine, body }.
    function updateVehicle(plate, report, now = Date.now()) {
        const v = worldVehicles.get(plate);
        const out = { notify: [], actions: [] };
        if (!v) return out;
        const before = { engine: v.car.engine, body: v.car.body };
        const event = fuel.update(v, report, now);
        if (event === "empty") {
            out.notify.push({ id: v.owner, msg: `${v.plate} ran out of fuel. Fuel can (/useitem fuelcan) or a gas station (/refuel).` });
        }
        // Send the gauge when it changes meaningfully, and always on empty
        if (event || before.engine !== v.car.engine || before.body !== v.car.body) out.actions.push(vehicleStateAction(v));
        return out;
    }

    function setAmmoAction(c, type) {
        return { type: "setAmmo", target: c.id, ammoType: ammo.AMMO_TYPES[type].gta, rounds: c.ammo[type] || 0 };
    }

    // If a command left you without the gun in your hands (dropped it,
    // put it in a trunk, a shop... anything), take it out of your hands too.
    function checkEquipped(c, result) {
        if (c && c.equipped && !c.inventory[c.equipped]) {
            const res = ammo.holster(c);
            result.actions.push({ type: "removeWeapon", target: c.id, weapon: res.weapon });
        }
        return result;
    }

    // After any teleport the player can see where they landed, so put the
    // city and zone on record without announcing either.
    function settle(c, pos) {
        c.pos = { ...pos };
        c.city = cities.cityAt(pos);
        c.zone = places.zoneAt(pos)?.name ?? null;
    }

    // Walk out of jail: in a different city from the arrest (spawns.js).
    function release(c, msg) {
        const spot = spawns.releaseSpawn(c.jailedFrom, rng);
        c.jailMinutes = 0;
        c.jailedFrom = null;
        settle(c, spot.pos);
        return {
            notify: { id: c.id, msg: `${msg} You've been released in ${cities.CITIES[spot.city].label} (${spot.label}).` },
            action: { type: "teleport", target: c.id, pos: spot.pos, heading: spot.heading },
        };
    }

    // Where this player should appear when they load in.
    function loginSpawn(id) {
        const c = characters.get(id);
        if (!c) return null;
        const spot = spawns.loginSpawn(c, police.JAIL.cell, rng);
        settle(c, spot.pos);
        return spot;
    }

    // The client reports what's left in each GTA ammo pool after shooting.
    function syncAmmo(id, reports) {
        const c = characters.get(id);
        if (c) ammo.syncAmmo(c, reports);
    }

    // ctx = { id, isConsole, pos, vehiclePlate, now }
    function command(ctx, name, args = []) {
        const cmd = commands[name];
        if (!cmd) return reply(`Unknown command /${name}. Try /help`);
        if (cmd.consoleOnly && !ctx.isConsole) return reply("Console only.");

        if (ctx.isConsole) {
            if (!cmd.consoleOnly) return reply("That's a player command.");
            const result = cmd.run({ c: null, args, ctx });
            // e.g. a console command took someone's gun away
            for (const other of characters.values()) checkEquipped(other, result);
            return result;
        }

        const c = characters.get(ctx.id);
        if (!c) return reply("Your character isn't loaded yet.");
        if (ctx.pos) c.pos = { ...ctx.pos };
        if (c.downed && !ALLOWED_WHILE_DOWN.includes(name)) return reply("You're down. Wait for EMS, /911, or /respawn when it unlocks.");
        if (c.cuffed && !ALLOWED_WHILE_HELD.includes(name)) return reply("You're in cuffs.");
        if (c.jailMinutes > 0 && !ALLOWED_WHILE_HELD.includes(name)) return reply(`You're in jail — ${c.jailMinutes} min left.`);
        return checkEquipped(c, cmd.run({ c, args, ctx: { now: Date.now(), pos: { x: 0, y: 0, z: 0 }, ...ctx } }));
    }

    // ---------------- time ----------------
    // Call once per in-game minute (or pass more minutes).
    function tick(minutes = 1, now = Date.now()) {
        const out = { notify: [], actions: [] };

        for (const c of characters.values()) {
            if (c.downed) continue; // needs freeze while you're down
            const { warnings, damaged } = needs.decay(c, minutes);
            for (const msg of warnings) out.notify.push({ id: c.id, msg });
            if (damaged) out.actions.push({ type: "setHealth", target: c.id, value: c.health });
            if (c.health === 0 && medical.knockDown(c, now)) out.notify.push(...downedAlert(c));
        }

        minutesSincePay += minutes;
        while (minutesSincePay >= PAY_INTERVAL_MIN) {
            minutesSincePay -= PAY_INTERVAL_MIN;
            for (const c of characters.values()) {
                const amount = jobs.paycheckAmount(c);
                const gold = jobs.paycheckGold(c, PAY_INTERVAL_MIN);
                if (amount > 0) c.bank += amount;
                if (gold > 0) c.gold += gold;
                if (amount > 0 || gold > 0) {
                    const goldPart = gold > 0 ? ` + ${gold} gold` : "";
                    out.notify.push({ id: c.id, msg: `Paycheck: ${economy.money(amount)} to your bank${goldPart}` });
                }
            }
        }

        for (const c of characters.values()) {
            if (police.serveMinute(c, minutes)) {
                const freed = release(c, "You've served your time.");
                out.notify.push(freed.notify);
                out.actions.push(freed.action);
            }
        }

        const sky = env.advance(minutes);
        if (sky.time) out.actions.push({ type: "setClock", ...env.state() });
        if (sky.weather) out.actions.push({ type: "setWeather", weather: env.state().weather });
        if (sky.nightfall || sky.daybreak) {
            const line = sky.nightfall ? "The sun's going down." : "It's getting light.";
            for (const c of characters.values()) out.notify.push({ id: c.id, msg: line });
        }

        for (const { c, gold } of turf.payout(minutes, onlineInCrew)) {
            c.gold += gold;
            out.notify.push({ id: c.id, msg: `Turf pays +${gold} gold.` });
        }

        for (const id of crews.expireInvites(now)) {
            out.notify.push({ id, msg: "That crew invite expired." });
        }

        for (const unit of crewShifts.longShifts(now)) {
            out.notify.push({ id: unit.id, msg: `${unit.callsign}, you've been on shift ${unit.minutes} min. Take a break when you can.` });
        }

        for (const id of dispatch.expire(now)) {
            out.notify.push({ id, msg: "No driver picked up your call. Try again when someone's on duty." });
        }

        for (const id of pickups.expire(now)) out.actions.push({ type: "pickupRemoved", id });
        return out;
    }

    // Autosave: everything the API needs.
    function saveAll() {
        const players = {};
        for (const [id, c] of characters) players[id] = serialize(c);
        return {
            players, trunks: trunks.exportAll(), gangs: crews.exportAll(),
            turf: turf.exportAll(), environment: env.exportAll(), houses: homes.exportAll(),
            impound: lot.exportAll(),
        };
    }

    function loadTrunks(saved) {
        trunks.importAll(saved);
    }

    function loadGangs(saved) {
        crews.importAll(saved);
    }

    function loadTurf(saved) {
        turf.importAll(saved);
    }

    function loadEnvironment(saved) {
        env.importAll(saved);
    }

    function loadHouses(saved) {
        homes.importAll(saved);
    }

    function loadImpound(saved) {
        lot.importAll(saved);
    }

    // The client couldn't draw some of what they're wearing: put those
    // slots back and redraw, so nobody is left with invisible legs.
    function lookRejected(id, slots) {
        const c = characters.get(id);
        if (!c) return reply("");
        const res = appearance.revert(c, Array.isArray(slots) ? slots : []);
        if (!res.ok) return reply("");
        return reply("", { notify: [{ id, msg: res.msg }], actions: [lookAction(c)] });
    }

    // What a client needs the moment it connects, so it doesn't show
    // its own clock and sky for a few seconds first.
    function worldState() {
        return env.state();
    }

    // Everything the overlay shows, built from the character the server
    // owns. plate = the car they're sitting in, if any.
    function hudFor(id, plate) {
        const c = characters.get(id);
        if (!c) return null;
        return hud.build(c, {
            world: env.state(),
            crew: c.gang ? { tag: c.gang.tag, turf: turf.heldBy(c.gang.tag).length } : null,
            car: plate ? worldVehicles.get(plate) || null : null,
        });
    }

    return {
        join, leave, get, loginSpawn, syncHealth, syncAmmo, updatePosition, updateVehicle,
        vehiclePlates: () => [...worldVehicles.keys()],
        command, commandNames: Object.keys(commands),
        lookRejected, tick, saveAll, loadTrunks, loadGangs, loadTurf, loadEnvironment, loadHouses, loadImpound, worldState, hudFor,
    };
}

module.exports = { PAY_INTERVAL_MIN, createGame };
