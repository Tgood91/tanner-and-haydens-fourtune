// ============================================================
// fivem-client.js — the little bit that has to run on each player's PC
// The client never decides anything. It only draws what the server
// says: health changes and dropped-item props (visual only).
// NOT YET TESTED IN-GAME.
// ============================================================

const PICKUP_PROP = "prop_paper_bag_small";
const props = new Map(); // pickup id -> object handle

onNet("fourtune:setHealth", (pedHealth) => {
    SetEntityHealth(PlayerPedId(), pedHealth);
});

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
