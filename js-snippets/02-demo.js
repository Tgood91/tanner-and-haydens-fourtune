// ============================================================
// 02-demo.js — runs inventory.js and vehicles.js headless,
// walking the same steps as your in-game smoke test.
// Run it:  node js-snippets/02-demo.js
// ============================================================

const inv = require("./inventory");
const veh = require("./vehicles");

const player = { health: 100, maxHealth: 100 };

console.log("== New character (never saved) ==");
const bag = inv.loadInventory(null);
console.log(inv.listInventory(bag));

console.log("\n== Emptied inventory stays empty ==");
console.log(inv.listInventory(inv.loadInventory({})));

console.log("\n== giveitem from the console ==");
console.log(inv.addItem(bag, "chopper", 1).msg);
console.log(inv.addItem(bag, "halfhalf", 1).msg);
console.log(inv.addItem(bag, "unicorn", 1).msg);       // unknown item refused
console.log(inv.addItem(bag, "water", -5).msg);        // negative count refused

console.log("\n== /useitem ==");
console.log(inv.useItem(bag, "halfhalf", player).msg); // drinks it, consumes 1
console.log(inv.useItem(bag, "glizzy", player).msg);  // don't have one
inv.addItem(bag, "glizzy", 1);
console.log(inv.useItem(bag, "glizzy", player).msg);  // carried gear, not usable
inv.addItem(bag, "bandage", 1);
console.log(inv.useItem(bag, "bandage", player).msg);  // full health -> refused, kept
player.health = 60;
console.log(inv.useItem(bag, "bandage", player).msg);  // now it works

console.log("\n== Weight limit ==");
console.log(inv.addItem(bag, "fuelcan", 10).msg);      // way too heavy
console.log(inv.listInventory(bag));

console.log("\n== Cars ==");
console.log(veh.listCars());
const character = { bank: 150000, garage: [] };
console.log(veh.buyVehicle(character, "sultan").msg);  // exactly $120,000
console.log(veh.buyVehicle(character, "sultan").msg);  // can't afford a second
console.log(veh.buyVehicle(character, "police").msg);  // job-locked, never sold
console.log("Can spawn sultan?", veh.canSpawn(character, "sultan"));
