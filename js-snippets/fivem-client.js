// ============================================================
// fivem-client.js — the little bit that has to run on each player's PC
// The client never decides anything. It only draws what the server
// says: health changes, revives, weapons/ammo, cuffs, teleports, car
// fuel/repairs, dropped-item props, and the clock and sky.
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
    applyLook(wornLook);
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

// ---------------- the overlay ----------------
// The server decides what it says; this only hands it to the NUI page.
onNet("fourtune:hud", (payload) => {
    SendNuiMessage(JSON.stringify({ type: "hud", payload }));
});

// Hide it while the pause menu is up, so it doesn't sit over the map.
let hudHidden = false;
setInterval(() => {
    const hide = IsPauseMenuActive();
    if (hide !== hudHidden) {
        hudHidden = hide;
        SendNuiMessage(JSON.stringify({ type: "visible", visible: !hide }));
    }
}, 500);

// ---------------- the clock and the sky ----------------
// GTA runs its own clock and weather per client, so without this every
// player is in a different world. The server owns both; this only draws
// what it is told, and runs the clock smoothly between updates so it
// does not jump half an hour at a time.
let worldMinutes = null;     // minutes past midnight, server's version
let worldPerSecond = 0.5;    // game minutes per real second

onNet("fourtune:setClock", ({ hour, minute, perSecond }) => {
    worldMinutes = hour * 60 + minute;
    if (perSecond) worldPerSecond = perSecond;
});

onNet("fourtune:setWeather", ({ weather }) => {
    ClearOverrideWeather();
    SetWeatherTypeOverTime(weather, 20.0);
    setTimeout(() => {
        SetWeatherTypePersist(weather);
        SetWeatherTypeNow(weather);
        SetWeatherTypeNowPersist(weather);
    }, 20000);
});

setInterval(() => {
    if (worldMinutes === null) return; // nothing from the server yet
    worldMinutes = (worldMinutes + worldPerSecond / 4) % 1440;
    const h = Math.floor(worldMinutes / 60) % 24;
    const m = Math.floor(worldMinutes % 60);
    NetworkOverrideClockTime(h, m, Math.floor((worldMinutes % 1) * 60));
}, 250);

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

// ---------------- clothes ----------------
// appearance.js keeps six slot numbers and knows nothing about GTA. This
// table is the whole translation: which ped component or prop each slot
// is, and how its numbering lines up.
//
// offset -1 means our #1 is the game's drawable 0, so the numbers a
// player types start at one. The mask is the exception: it sits on
// component 1, whose drawable 0 IS the bare face, so 0 means "none"
// there without any shifting.
//
// Hats and glasses are props, not components, and 0 clears the prop
// rather than drawing a zeroth one.
const SLOT_MAP = {
    top:     { prop: false, id: 11, offset: -1 },
    legs:    { prop: false, id: 4,  offset: -1 },
    shoes:   { prop: false, id: 6,  offset: -1 },
    mask:    { prop: false, id: 1,  offset: 0 },
    hat:     { prop: true,  id: 0,  offset: -1 },
    glasses: { prop: true,  id: 1,  offset: -1 },
};

let wornLook = null; // last look the server sent, re-applied after a respawn

// The variant counts in appearance.js are placeholders, so a number can
// point past what this ped model actually has. Drawing that gives an
// invisible or broken ped, so an out-of-range slot is left alone.
function applyLook(look) {
    if (!look) return;
    const ped = PlayerPedId();

    for (const [slot, value] of Object.entries(look)) {
        const map = SLOT_MAP[slot];
        if (!map || typeof value !== "number") continue;

        if (map.prop) {
            if (value <= 0) {
                ClearPedProp(ped, map.id);
                continue;
            }
            const drawable = value + map.offset;
            if (drawable >= GetNumberOfPedPropDrawableVariations(ped, map.id)) continue;
            SetPedPropIndex(ped, map.id, drawable, 0, true);
            continue;
        }

        const drawable = value + map.offset;
        if (drawable < 0 || drawable >= GetNumberOfPedDrawableVariations(ped, map.id)) continue;
        // texture 0 and palette 2: one colourway per drawable for now
        SetPedComponentVariation(ped, map.id, drawable, 0, 2);
    }
}

onNet("fourtune:setAppearance", ({ look }) => {
    wornLook = look;
    applyLook(wornLook);
});

onNet("fourtune:teleport", ({ pos, heading }) => {
    const ped = PlayerPedId();
    SetEntityCoords(ped, pos.x, pos.y, pos.z, false, false, false, false);
    if (heading !== undefined) SetEntityHeading(ped, heading);
});

// ---------------- fuel & repairs ----------------
// The server puts { fuel, tank, engine, body } on each player car as a state bag.
// Whoever controls the car applies repairs (health only goes UP from here:
// damage is the game's job).
AddStateBagChangeHandler("fourtune", null, async (bagName, _key, value) => {
    if (!value) return;
    let veh = 0;
    for (let i = 0; i < 20 && veh === 0; i++) { // the car may not have streamed in yet
        veh = GetEntityFromStateBagName(bagName);
        if (veh === 0) await new Promise((r) => setTimeout(r, 250));
    }
    if (veh === 0 || !NetworkHasControlOfEntity(veh)) return;
    if (value.engine > GetVehicleEngineHealth(veh)) SetVehicleEngineHealth(veh, value.engine + 0.0);
    if (value.body > GetVehicleBodyHealth(veh)) {
        SetVehicleBodyHealth(veh, value.body + 0.0);
        if (value.body >= 1000) SetVehicleDeformationFixed(veh);
    }
});

// While driving: keep the gauge honest and kill the engine on an empty tank.
setInterval(() => {
    const ped = PlayerPedId();
    const veh = GetVehiclePedIsIn(ped, false);
    if (veh === 0 || GetPedInVehicleSeat(veh, -1) !== ped) return;
    const state = Entity(veh).state.fourtune;
    if (!state) return; // not a player-owned car
    SetVehicleFuelLevel(veh, (state.fuel / state.tank) * 100.0);
    if (state.fuel <= 0 && GetIsVehicleEngineRunning(veh)) SetVehicleEngineOn(veh, false, true, true);
}, 500);

// ---------------- spawning ----------------
// Auto-spawn is off (see the top of this file), so the server says where we appear.
onNet("fourtune:spawn", ({ pos, heading }) => {
    exports.spawnmanager.spawnPlayer(
        { x: pos.x, y: pos.y, z: pos.z, heading, model: "mp_m_freemode_01", skipFade: false },
        () => {
            applyLook(wornLook); // the freemode ped spawns in its default fit
            emitNet("fourtune:spawned");
        },
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
