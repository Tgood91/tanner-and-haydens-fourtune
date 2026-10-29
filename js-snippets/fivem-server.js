// ============================================================
// fivem-server.js — the GTA 5 (FiveM) side of game.js
// All the rules live in game.js. This file only:
//   - tells the game who joined / left and where they are
//   - turns chat commands into game.command(...)
//   - performs the actions the game sends back (health, cars, props)
//
// Only runs inside FXServer (needs OneSync for the server-side
// entity natives) — it won't run with plain `node`.
// NOT YET TESTED IN-GAME. Saving to your API is still a TODO.
// ============================================================

const resourcePath = GetResourcePath(GetCurrentResourceName());
const { createGame } = require(`${resourcePath}/game.js`);

const game = createGame();
const spawned = new Map(); // plate -> entity handle

// ---------------- helpers ----------------
function tell(id, msg) {
    if (id === 0) return console.log(msg); // server console
    for (const line of msg.split("\n")) {
        emitNet("chat:addMessage", id, { args: ["Server", line] });
    }
}

function posOf(id) {
    const [x, y, z] = GetEntityCoords(GetPlayerPed(id));
    return { x, y, z };
}

// GTA ped health: 100 = dead, 200 = full. The game uses 0..100.
function readHealth(id) {
    return Math.max(0, GetEntityHealth(GetPlayerPed(id)) - 100);
}

function nearestVehiclePlate(id, range = 4.0) {
    const me = posOf(id);
    let best = null;
    for (const veh of GetAllVehicles()) {
        const [x, y, z] = GetEntityCoords(veh);
        const d = Math.hypot(me.x - x, me.y - y, me.z - z);
        if (d <= range && (!best || d < best.d)) best = { d, plate: GetVehicleNumberPlateText(veh).trim() };
    }
    return best ? best.plate : null;
}

function perform(result) {
    if (!result) return;
    for (const n of result.notify || []) tell(n.id, n.msg);
    for (const a of result.actions || []) {
        switch (a.type) {
            case "setHealth":
                emitNet("fourtune:setHealth", a.target, a.value + 100);
                break;
            case "revive":
                emitNet("fourtune:revive", a.target, { pedHealth: a.health + 100, pos: a.pos });
                break;
            case "setAmmo":
            case "giveWeapon":
            case "removeWeapon":
            case "setCuffed":
            case "teleport":
                emitNet(`fourtune:${a.type}`, a.target, a);
                break;
            case "spawnVehicle": {
                const veh = CreateVehicleServerSetter(GetHashKey(a.model), "automobile", a.pos.x + 3, a.pos.y, a.pos.z, 0.0);
                SetVehicleNumberPlateText(veh, a.plate);
                SetVehicleDoorsLocked(veh, 2);
                spawned.set(a.plate, veh);
                break;
            }
            case "despawnVehicle": {
                const veh = spawned.get(a.plate);
                if (veh && DoesEntityExist(veh)) DeleteEntity(veh);
                spawned.delete(a.plate);
                break;
            }
            case "setVehicleLocked": {
                const veh = spawned.get(a.plate);
                if (veh) SetVehicleDoorsLocked(veh, a.locked ? 2 : 1);
                break;
            }
            case "setVehicleState": {
                // A state bag rides along with the car to every client; the driver's
                // client applies it (fuel gauge, engine off when empty, repairs).
                const veh = spawned.get(a.plate);
                if (veh && DoesEntityExist(veh)) {
                    Entity(veh).state.set("fourtune", { fuel: a.fuel, tank: a.tank, engine: a.engine, body: a.body }, true);
                }
                break;
            }
            case "pickupCreated":
            case "pickupRemoved":
                emitNet(`fourtune:${a.type}`, -1, a); // every client draws/removes the prop
                break;
        }
    }
}

// ---------------- players ----------------
function load(id) {
    // TODO: fetch the saved character from your API (:4000) and pass it instead of null
    game.join(id, GetPlayerName(id), null);
}

on("playerJoining", () => load(Number(global.source)));

// Resource restarted while people are online
on("onResourceStart", (name) => {
    if (name !== GetCurrentResourceName()) return;
    for (const id of getPlayers()) load(Number(id));
});

on("playerDropped", () => {
    const id = Number(global.source);
    const { saved, actions, notify } = game.leave(id);
    perform({ actions, notify });
    // TODO: POST `saved` to your API (same route your money uses)
    void saved;
});

// ---------------- commands ----------------
// ---------------- ammo ----------------
// These commands act on loaded rounds, so the server needs the count
// AFTER the latest shots, not the one from up to 10 seconds ago.
const NEEDS_FRESH_AMMO = new Set(["loadammo", "unloadammo", "equip"]);
const ammoWaiters = new Map(); // player id -> resolve()

function freshAmmo(id) {
    return new Promise((resolve) => {
        const timer = setTimeout(() => { ammoWaiters.delete(id); resolve(false); }, 1500);
        ammoWaiters.set(id, () => { clearTimeout(timer); resolve(true); });
        emitNet("fourtune:requestAmmoReport", id);
    });
}

onNet("fourtune:ammoReport", (reports) => {
    const id = Number(global.source);
    game.syncAmmo(id, reports); // only ever lowers — see ammo.js
    const waiter = ammoWaiters.get(id);
    if (waiter) { ammoWaiters.delete(id); waiter(); }
});

// ---------------- spawning ----------------
// 1. client loads -> "ready"      2. server picks the spot (spawns.js) -> "spawn"
// 3. client spawns the ped -> "spawned"   4. server hands over loaded ammo
// Ammo waits for step 4 because a freshly spawned ped starts with none.
onNet("fourtune:ready", () => {
    const id = Number(global.source);
    const spot = game.loginSpawn(id);
    if (!spot) return;
    emitNet("fourtune:spawn", id, { pos: spot.pos, heading: spot.heading });

    const c = game.get(id);
    if (spot.reason === "jail") tell(id, `You still have ${c.jailMinutes} min left on your sentence.`);
    else if (spot.reason === "new") {
        const { CITIES } = require(`${resourcePath}/cities.js`);
        tell(id, `Welcome to ${CITIES[spot.city].label} — you're at ${spot.label}. Try /help`);
    }
});

// Until this arrives, the client doesn't send ammo reports (it would report 0s).
onNet("fourtune:spawned", () => {
    const id = Number(global.source);
    const c = game.get(id);
    if (!c) return;
    const { AMMO_TYPES } = require(`${resourcePath}/ammo.js`);
    const pools = {};
    for (const [type, t] of Object.entries(AMMO_TYPES)) pools[t.gta] = c.ammo[type] || 0;
    emitNet("fourtune:setAllAmmo", id, pools);
});

for (const name of game.commandNames) {
    RegisterCommand(name, async (source, args) => {
        const id = Number(source);
        if (id === 0) return perform(tellConsole(game.command({ isConsole: true }, name, args)));

        if (NEEDS_FRESH_AMMO.has(name) && !(await freshAmmo(id))) {
            return tell(id, "Couldn't check your ammo — try again in a second.");
        }
        perform(game.syncHealth(id, readHealth(id)));
        const result = game.command({ id, pos: posOf(id), vehiclePlate: nearestVehiclePlate(id), now: Date.now() }, name, args);
        tell(id, result.msg);
        perform(result);
    }, false);
}

function tellConsole(result) {
    console.log(result.msg);
    return result;
}

// The client says "I think I just died" so EMS hear right away, not at the next
// minute tick. The server doesn't take its word: it reads the real ped health.
onNet("fourtune:checkHealth", () => {
    const id = Number(global.source);
    perform(game.syncHealth(id, readHealth(id)));
});

// ---------------- time ----------------
// One in-game "minute" of needs/pay every real 60 seconds.
setInterval(() => {
    for (const id of getPlayers()) perform(game.syncHealth(Number(id), readHealth(Number(id))));
    perform(game.tick(1, Date.now()));
}, 60 * 1000);

// Every 5 seconds: city announcements for players, fuel and damage for cars.
setInterval(() => {
    for (const id of getPlayers()) {
        const msg = game.updatePosition(Number(id), posOf(Number(id)));
        if (msg) tell(Number(id), msg);
    }
    for (const plate of game.vehiclePlates()) {
        const veh = spawned.get(plate);
        if (!veh || !DoesEntityExist(veh)) continue;
        const [x, y, z] = GetEntityCoords(veh);
        perform(game.updateVehicle(plate, {
            pos: { x, y, z },
            engine: GetVehicleEngineHealth(veh),
            body: GetVehicleBodyHealth(veh),
        }));
    }
}, 5 * 1000);

// Autosave every 5 minutes.
setInterval(() => {
    const snapshot = game.saveAll();
    // TODO: POST snapshot.players and snapshot.trunks to your API
    void snapshot;
}, 5 * 60 * 1000);
