// ============================================================
// fuel.js — fuel, damage and repairs for cars you own
//
// Each owned car remembers (saved in the garage):
//   fuel    litres in the tank (tank size depends on the model)
//   engine  0..1000, GTA's engine health (under ~300 smokes, 0 = dead)
//   body    0..1000, GTA's body health (dents, panels)
//
// Fuel burns by DISTANCE: the server watches how far each car moves.
// Damage comes from the game itself, and the server only ever accepts
// LOWER numbers from it — health only goes up through a repair here.
// Same trust rule as ammo: a modded client can't fix its own car.
//
// Getting going again:
//   gas station  /refuel — pay per litre, cash or bank
//   fuel can     /useitem fuelcan — +20 L, anywhere
//   repair kit   /useitem repairkit — patches YOUR engine to 650, body untouched
//   mechanic     /repair — full fix; the owner (standing nearby) pays the mechanic
//
// Rates, tank sizes, prices and station spots are placeholders.
// ============================================================

const inventory = require("./inventory");
const economy = require("./economy");
const { distance } = require("./cities");

const MAX_HEALTH = 1000;
const TANK_LITRES = { default: 65, sultan: 60, zentorno: 70, police: 80, ambulance: 90 };
const LITRES_PER_KM = { default: 1.0, zentorno: 1.5, ambulance: 1.4 }; // gameplay-fast, not real-world
const MAX_TRUSTED_MOVE = 300; // metres between checks — more than this is a teleport, not driving
const REPAIR_GRACE_MS = 10000; // after a repair, ignore damage readings until the game has applied the fix

const PRICE_PER_LITRE = 3;
const FUEL_CAN_LITRES = 20;
const PATCH_ENGINE_TO = 650;
const REPAIR_BILL = 600;       // owner -> mechanic
const REPAIR_GOLD = 10;        // mechanic, only when fixing someone else's damaged car
const DAMAGED_BELOW = 950;     // engine or body under this counts as damaged
const STATION_RANGE = 8.0;
const OWNER_RANGE = 10.0;      // owner must be this close to agree to (and pay for) a repair

const GAS_STATIONS = [
    { label: "Gasco Groveland", city: "atlanta", pos: { x: -70.2,  y: -1761.8, z: 29.5 } },
    { label: "Koreatown Gas", city: "atlanta", pos: { x: -526.0, y: -1211.0, z: 18.2 } },
    { label: "Dust Road Gas", city: "geepee",  pos: { x: 2005.0, y: 3774.0,  z: 32.4 } },
    { label: "Harvest Gas",    city: "geepee",  pos: { x: 1687.0, y: 4929.0,  z: 42.1 } },
    { label: "Chicago Gas",      city: "chicago", pos: { x: -94.0,  y: 6419.0,  z: 31.5 } },
];

function tankFor(model) {
    return TANK_LITRES[model] ?? TANK_LITRES.default;
}

function burnRate(model) {
    return LITRES_PER_KM[model] ?? LITRES_PER_KM.default;
}

// New and old-save cars get a full tank and no damage.
function ensureState(car) {
    if (car.fuel === undefined) car.fuel = tankFor(car.model);
    if (car.engine === undefined) car.engine = MAX_HEALTH;
    if (car.body === undefined) car.body = MAX_HEALTH;
    return car;
}

function round1(n) {
    return Math.round(n * 10) / 10;
}

function describe(car) {
    const engine = car.engine <= 0 ? "dead" : car.engine < 300 ? "smoking" : car.engine < DAMAGED_BELOW ? "damaged" : "good";
    return `${car.plate}: fuel ${round1(car.fuel)}/${tankFor(car.model)} L | engine ${Math.round(car.engine)} (${engine}) | body ${Math.round(car.body)}`;
}

// Called every few seconds for each car that's out.
// v = world vehicle { car, lastPos }; report = { pos, engine, body } read from the game.
// Returns "empty" on the moment the tank runs dry, otherwise null.
function update(v, report, now = Date.now()) {
    const car = v.car;
    let event = null;

    if (report.pos && v.lastPos) {
        const moved = distance(v.lastPos, report.pos);
        if (moved <= MAX_TRUSTED_MOVE && car.fuel > 0) {
            car.fuel = Math.max(0, round1(car.fuel - (moved / 1000) * burnRate(car.model)));
            if (car.fuel === 0) event = "empty";
        }
    }
    if (report.pos) v.lastPos = { ...report.pos };

    // Damage only ever goes DOWN from game reports — except right after a
    // repair, when the game may still be showing the old, damaged numbers
    const justRepaired = v.repairedAt !== undefined && now - v.repairedAt < REPAIR_GRACE_MS;
    for (const key of justRepaired ? [] : ["engine", "body"]) {
        const value = report[key];
        if (typeof value === "number" && Number.isFinite(value)) {
            car[key] = Math.max(0, Math.min(car[key], Math.round(value)));
        }
    }
    return event;
}

function findStation(pos) {
    return GAS_STATIONS.find((s) => distance(pos, s.pos) <= STATION_RANGE) || null;
}

function canTouch(c, v) {
    if (!v) return { ok: false, msg: "No car of yours (or unlocked) nearby" };
    if (v.owner !== c.id && v.locked) return { ok: false, msg: "That car is locked" };
    return { ok: true, msg: "" };
}

// litres omitted = fill it up
function refuel(c, v, pos, litres, payWith = "cash") {
    const station = findStation(pos);
    if (!station) return { ok: false, msg: "You're not at a gas station" };
    const access = canTouch(c, v);
    if (!access.ok) return access;
    if (!economy.ACCOUNTS.includes(payWith)) return { ok: false, msg: "Pay with cash or bank" };

    const room = Math.floor(tankFor(v.car.model) - v.car.fuel);
    if (room <= 0) return { ok: false, msg: "The tank is already full" };
    const amount = litres === undefined ? room : litres;
    if (!Number.isInteger(amount) || amount < 1) return { ok: false, msg: "Litres must be a whole number above 0" };
    if (amount > room) return { ok: false, msg: `Only ${room} L of room in the tank` };

    const cost = amount * PRICE_PER_LITRE;
    const paid = economy.removeMoney(c, payWith, cost);
    if (!paid.ok) return paid;
    v.car.fuel = round1(v.car.fuel + amount);
    return { ok: true, msg: `Pumped ${amount} L at ${station.label} for ${economy.money(cost)}. ${describe(v.car)}` };
}

// Checks only — game.js consumes the item after this says yes.
function checkFuelCan(c, v) {
    const access = canTouch(c, v);
    if (!access.ok) return access;
    if (v.car.fuel >= tankFor(v.car.model)) return { ok: false, msg: "The tank is already full" };
    return { ok: true, msg: "" };
}

function applyFuelCan(v) {
    v.car.fuel = round1(Math.min(tankFor(v.car.model), v.car.fuel + FUEL_CAN_LITRES));
}

function checkPatch(c, v) {
    if (!v || v.owner !== c.id) return { ok: false, msg: "A repair kit only patches your own car — find a mechanic for anyone else's" };
    if (v.car.engine >= PATCH_ENGINE_TO) return { ok: false, msg: "The engine's good enough — a kit won't do more. See a mechanic for a full repair" };
    return { ok: true, msg: "" };
}

function applyPatch(v, now = Date.now()) {
    v.car.engine = PATCH_ENGINE_TO;
    v.repairedAt = now;
}

// owner = the car owner's character (must be close by). Uses the mechanic's repair kit.
function mechanicRepair(mechanic, v, owner, now = Date.now()) {
    if (mechanic.job.name !== "mechanic") return { ok: false, msg: "Only mechanics can do full repairs" };
    if (!mechanic.onDuty) return { ok: false, msg: "Clock in first (/duty)" };
    if (!v) return { ok: false, msg: "No car nearby" };
    if (v.car.engine >= DAMAGED_BELOW && v.car.body >= DAMAGED_BELOW) return { ok: false, msg: "This car doesn't need a repair" };
    if (!mechanic.inventory.repairkit) return { ok: false, msg: "You need a repair kit" };

    const ownJob = owner === mechanic;
    if (!ownJob) {
        if (!owner || !owner.pos || !mechanic.pos || distance(owner.pos, mechanic.pos) > OWNER_RANGE) {
            return { ok: false, msg: "The owner has to be here to pay for the repair" };
        }
        if (owner.bank < REPAIR_BILL) return { ok: false, msg: `${owner.name} can't cover the ${economy.money(REPAIR_BILL)} bill` };
    }

    inventory.removeItem(mechanic.inventory, "repairkit", 1);
    v.car.engine = MAX_HEALTH;
    v.car.body = MAX_HEALTH;
    v.repairedAt = now;
    if (ownJob) return { ok: true, msg: `Fixed up your own car. ${describe(v.car)}` };

    owner.bank -= REPAIR_BILL;
    mechanic.bank += REPAIR_BILL;
    mechanic.gold += REPAIR_GOLD;
    return {
        ok: true,
        msg: `Repaired ${v.car.plate}: +${economy.money(REPAIR_BILL)} from ${owner.name}, +${REPAIR_GOLD} gold`,
        ownerMsg: `${mechanic.name} repaired your car. ${economy.money(REPAIR_BILL)} from your bank.`,
    };
}

module.exports = {
    MAX_HEALTH, TANK_LITRES, LITRES_PER_KM, PRICE_PER_LITRE, FUEL_CAN_LITRES, PATCH_ENGINE_TO,
    REPAIR_BILL, REPAIR_GOLD, GAS_STATIONS,
    tankFor, ensureState, describe, update, findStation, refuel,
    checkFuelCan, applyFuelCan, checkPatch, applyPatch, mechanicRepair,
};
