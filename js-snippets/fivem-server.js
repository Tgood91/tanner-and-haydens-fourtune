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
    const { saved, actions } = game.leave(id);
    perform({ actions });
    // TODO: POST `saved` to your API (same route your money uses)
    void saved;
});

// ---------------- commands ----------------
for (const name of game.commandNames) {
    RegisterCommand(name, (source, args) => {
        const id = Number(source);
        if (id === 0) return perform(tellConsole(game.command({ isConsole: true }, name, args)));

        game.syncHealth(id, readHealth(id));
        const result = game.command({ id, pos: posOf(id), vehiclePlate: nearestVehiclePlate(id), now: Date.now() }, name, args);
        tell(id, result.msg);
        perform(result);
    }, false);
}

function tellConsole(result) {
    console.log(result.msg);
    return result;
}

// ---------------- time ----------------
// One in-game "minute" of needs/pay every real 60 seconds.
setInterval(() => {
    for (const id of getPlayers()) game.syncHealth(Number(id), readHealth(Number(id)));
    perform(game.tick(1, Date.now()));
}, 60 * 1000);

// City announcements: check where everyone is every 5 seconds.
setInterval(() => {
    for (const id of getPlayers()) {
        const msg = game.updatePosition(Number(id), posOf(Number(id)));
        if (msg) tell(Number(id), msg);
    }
}, 5 * 1000);

// Autosave every 5 minutes.
setInterval(() => {
    const snapshot = game.saveAll();
    // TODO: POST snapshot.players and snapshot.trunks to your API
    void snapshot;
}, 5 * 60 * 1000);
