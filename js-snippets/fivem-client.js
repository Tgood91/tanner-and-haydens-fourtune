// ============================================================
// fivem-client.js — the little bit that has to run on each player's PC
// The client never decides anything. It only draws what the server
// says: health changes, revives, and dropped-item props (visual only).
// NOT YET TESTED IN-GAME.
// ============================================================

const PICKUP_PROP = "prop_paper_bag_small";
const props = new Map(); // pickup id -> object handle

// GTA's spawnmanager would respawn a dead player by itself. The server decides now.
on("onClientResourceStart", (name) => {
    if (name === GetCurrentResourceName()) exports.spawnmanager.setAutoSpawn(false);
});

onNet("fourtune:setHealth", (pedHealth) => {
    SetEntityHealth(PlayerPedId(), pedHealth);
});

onNet("fourtune:revive", ({ pedHealth, pos }) => {
    const ped = PlayerPedId();
    NetworkResurrectLocalPlayer(pos.x, pos.y, pos.z, GetEntityHeading(ped), true, false);
    ClearPedTasksImmediately(PlayerPedId());
    SetEntityHealth(PlayerPedId(), pedHealth);
});

// Tell the server the moment we die, so on-duty EMS get the call right away.
// The server re-reads the real health itself — this is only a nudge.
let wasDead = false;
setInterval(() => {
    const dead = IsEntityDead(PlayerPedId());
    if (dead && !wasDead) emitNet("fourtune:checkHealth");
    wasDead = dead;
}, 1000);

onNet("fourtune:pickupCreated", async (pickup) => {
    const model = GetHashKey(PICKUP_PROP);
    RequestModel(model);
    while (!HasModelLoaded(model)) await new Promise((r) => setTimeout(r, 50));
    // isNetwork = false: each client draws its own copy; the server owns the real item
    const obj = CreateObject(model, pickup.pos.x, pickup.pos.y, pickup.pos.z - 1.0, false, false, false);
    PlaceObjectOnGroundProperly(obj);
    FreezeEntityPosition(obj, true);
    SetModelAsNoLongerNeeded(model);
    props.set(pickup.id, obj);
});

onNet("fourtune:pickupRemoved", (pickup) => {
    const obj = props.get(pickup.id);
    if (obj && DoesEntityExist(obj)) DeleteObject(obj);
    props.delete(pickup.id);
});
