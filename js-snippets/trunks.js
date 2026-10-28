// ============================================================
// trunks.js — vehicle trunk storage, keyed by plate
// A trunk is just another inventory with its own weight limit, so
// it reuses inventory.js. Moving an item checks BOTH sides first
// (you have it, and it fits on the other end), then moves it.
//
// Who can open it: the owner always; anyone else only if unlocked.
// Capacities are placeholders.
// ============================================================

const inventory = require("./inventory");

const TRUNK_CAPACITY = { default: 50, sultan: 60, zentorno: 15 }; // kg

function capacityFor(model) {
    return TRUNK_CAPACITY[model] ?? TRUNK_CAPACITY.default;
}

function createTrunks() {
    const trunks = new Map(); // plate -> inventory object

    function get(plate) {
        if (!trunks.has(plate)) trunks.set(plate, {});
        return trunks.get(plate);
    }

    // vehicle = { plate, model, owner, locked }
    function canOpen(c, vehicle) {
        if (!vehicle) return { ok: false, msg: "No vehicle nearby" };
        if (vehicle.owner !== c.id && vehicle.locked) return { ok: false, msg: "The trunk is locked" };
        return { ok: true, msg: "" };
    }

    function view(c, vehicle) {
        const access = canOpen(c, vehicle);
        if (!access.ok) return access;
        const trunk = get(vehicle.plate);
        const lines = [`--- Trunk ${vehicle.plate} ---`];
        for (const [item, count] of Object.entries(trunk)) lines.push(`${inventory.ITEMS[item].label} x${count}`);
        lines.push(`Weight: ${inventory.getWeight(trunk)} / ${capacityFor(vehicle.model)} kg`);
        return { ok: true, msg: lines.join("\n") };
    }

    function put(c, vehicle, item, count = 1) {
        const access = canOpen(c, vehicle);
        if (!access.ok) return access;
        if ((c.inventory[item] || 0) < count) return { ok: false, msg: `You don't have ${count}x ${item}` };

        const trunk = get(vehicle.plate);
        const fits = inventory.canAddItem(trunk, item, count, capacityFor(vehicle.model));
        if (!fits.ok) return { ok: false, msg: `Trunk is full — ${fits.msg}` };

        inventory.removeItem(c.inventory, item, count);
        inventory.addItem(trunk, item, count, capacityFor(vehicle.model));
        return { ok: true, msg: `Put ${count}x ${inventory.ITEMS[item].label} in the trunk` };
    }

    function take(c, vehicle, item, count = 1) {
        const access = canOpen(c, vehicle);
        if (!access.ok) return access;

        const trunk = get(vehicle.plate);
        if ((trunk[item] || 0) < count) return { ok: false, msg: `The trunk doesn't have ${count}x ${item}` };
        const fits = inventory.canAddItem(c.inventory, item, count);
        if (!fits.ok) return fits;

        inventory.removeItem(trunk, item, count);
        inventory.addItem(c.inventory, item, count);
        return { ok: true, msg: `Took ${count}x ${inventory.ITEMS[item].label} from the trunk` };
    }

    // For saving to / loading from the API
    function exportAll() {
        return Object.fromEntries([...trunks].map(([plate, inv]) => [plate, { ...inv }]));
    }
    function importAll(saved) {
        for (const [plate, inv] of Object.entries(saved || {})) trunks.set(plate, { ...inv });
    }

    return { view, put, take, canOpen, exportAll, importAll };
}

module.exports = { TRUNK_CAPACITY, capacityFor, createTrunks };
