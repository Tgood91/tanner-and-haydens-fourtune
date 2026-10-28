// ============================================================
// fivem-server.js — the same commands, as a FiveM JavaScript resource
// FiveM's server runs JS on Node, so inventory.js / vehicles.js work as-is.
//
// fxmanifest.lua for this resource:
//   fx_version 'cerulean'
//   game 'gta5'
//   server_script 'fivem-server.js'
//
// This only runs inside FXServer (RegisterCommand, emitNet, etc. are
// FiveM globals) — it won't run with plain `node`.
// ============================================================

const resourcePath = GetResourcePath(GetCurrentResourceName());
const inv = require(`${resourcePath}/inventory.js`);
const veh = require(`${resourcePath}/vehicles.js`);

// In-memory per player. In your real server this lives on the character
// and goes through autosave/disconnect save into the API, like money does.
const inventories = {};
const characters = {};

function getInv(source) {
    if (!inventories[source]) inventories[source] = inv.loadInventory(null); // TODO: load from API
    return inventories[source];
}

function getCharacter(source) {
    if (!characters[source]) characters[source] = { bank: 0, garage: [] }; // TODO: load from API
    return characters[source];
}

function tell(source, msg) {
    if (source === 0) return console.log(msg); // server console
    emitNet("chat:addMessage", source, { args: ["Server", msg] });
}

// Health is read on the SERVER from the ped, never trusted from the client.
function getPlayerState(source) {
    const ped = GetPlayerPed(source);
    return { health: GetEntityHealth(ped), maxHealth: GetEntityMaxHealth(ped) };
}

RegisterCommand("inventory", (source) => {
    tell(source, inv.listInventory(getInv(source)));
}, false);

RegisterCommand("useitem", (source, args) => {
    const item = (args[0] || "").toLowerCase();
    tell(source, inv.useItem(getInv(source), item, getPlayerState(source)).msg);
}, false);

RegisterCommand("dropitem", (source, args) => {
    const item = (args[0] || "").toLowerCase();
    const count = parseInt(args[1] || "1", 10);
    tell(source, inv.dropItem(getInv(source), item, count).msg);
}, false);

// giveitem <playerId> <item> <count> — server console ONLY.
// source 0 = the console; any real player is refused.
RegisterCommand("giveitem", (source, args) => {
    if (source !== 0) return tell(source, "Console only.");
    const [target, item, countText] = args;
    if (!GetPlayerName(target)) return console.log(`No player with id ${target}`);
    const result = inv.addItem(getInv(target), (item || "").toLowerCase(), parseInt(countText || "1", 10));
    console.log(result.msg);
    if (result.ok) tell(Number(target), result.msg);
}, true);

RegisterCommand("cars", (source) => {
    tell(source, veh.listCars());
}, false);

RegisterCommand("buyveh", (source, args) => {
    const model = (args[0] || "").toLowerCase();
    tell(source, veh.buyVehicle(getCharacter(source), model).msg);
}, false);

on("playerDropped", () => {
    // TODO: save inventories[source] / characters[source] to the API first
    delete inventories[global.source];
    delete characters[global.source];
});
