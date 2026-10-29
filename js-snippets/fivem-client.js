// ============================================================
// fivem-client.js — the little bit that has to run on each player's PC
// The client never decides anything. It only draws what the server
// says: health changes, revives, weapons/ammo, cuffs, teleports, and
// dropped-item props.
// It REPORTS ammo left after shooting; the server only accepts lower numbers.
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

// ---------------- weapons & ammo ----------------
const AMMO_POOLS = ["AMMO_PISTOL", "AMMO_SMG", "AMMO_RIFLE", "AMMO_SHOTGUN", "AMMO_SNIPER"];
let ammoSynced = false; // don't report until the server has set our pools

function ammoReport() {
    const ped = PlayerPedId();
    const report = {};
    for (const pool of AMMO_POOLS) report[pool] = GetPedAmmoByType(ped, GetHashKey(pool));
    return report;
}

on("onClientResourceStart", (name) => {
    if (name === GetCurrentResourceName()) emitNet("fourtune:ready");
});

onNet("fourtune:setAllAmmo", (pools) => {
    const ped = PlayerPedId();
    for (const [pool, rounds] of Object.entries(pools)) SetPedAmmoByType(ped, GetHashKey(pool), rounds);
    ammoSynced = true;
});

onNet("fourtune:setAmmo", ({ ammoType, rounds }) => {
    SetPedAmmoByType(PlayerPedId(), GetHashKey(ammoType), rounds);
});

onNet("fourtune:giveWeapon", ({ weapon, ammoType, rounds }) => {
    const ped = PlayerPedId();
    GiveWeaponToPed(ped, GetHashKey(weapon), 0, false, true);
    SetPedAmmoByType(ped, GetHashKey(ammoType), rounds);
});

onNet("fourtune:removeWeapon", ({ weapon }) => {
    RemoveWeaponFromPed(PlayerPedId(), GetHashKey(weapon));
});

onNet("fourtune:requestAmmoReport", () => {
    if (ammoSynced) emitNet("fourtune:ammoReport", ammoReport());
});

// Regular reports so the server's count follows your shooting
setInterval(() => {
    if (ammoSynced) emitNet("fourtune:ammoReport", ammoReport());
}, 10 * 1000);

// ---------------- police ----------------
let cuffed = false;

onNet("fourtune:setCuffed", async ({ cuffed: on }) => {
    cuffed = on;
    const ped = PlayerPedId();
    if (!on) return ClearPedTasks(ped);
    RequestAnimDict("mp_arresting");
    while (!HasAnimDictLoaded("mp_arresting")) await new Promise((r) => setTimeout(r, 50));
    TaskPlayAnim(ped, "mp_arresting", "idle", 8.0, -8.0, -1, 49, 0, false, false, false);
    SetCurrentPedWeapon(ped, GetHashKey("WEAPON_UNARMED"), true);
});

// While cuffed: no shooting, aiming, punching, weapon wheel or driving.
// (The server already refuses commands; this stops the game controls.)
setTick(() => {
    if (!cuffed) return;
    for (const control of [24, 25, 37, 140, 141, 142, 257, 263, 264, 23, 75]) DisableControlAction(0, control, true);
});

onNet("fourtune:teleport", ({ pos, heading }) => {
    const ped = PlayerPedId();
    SetEntityCoords(ped, pos.x, pos.y, pos.z, false, false, false, false);
    if (heading !== undefined) SetEntityHeading(ped, heading);
});

// ---------------- spawning ----------------
// Auto-spawn is off (see the top of this file), so the server says where we appear.
onNet("fourtune:spawn", ({ pos, heading }) => {
    exports.spawnmanager.spawnPlayer(
        { x: pos.x, y: pos.y, z: pos.z, heading, model: "mp_m_freemode_01", skipFade: false },
        () => emitNet("fourtune:spawned"),
    );
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
