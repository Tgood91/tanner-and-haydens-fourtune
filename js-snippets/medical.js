// ============================================================
// medical.js — going down, getting revived, respawning at hospital
// At 0 health you're DOWNED, not gone: you stay where you fell and
// on-duty EMS get an alert with your id. From there, two ways up:
//   1. EMS walks over and /revive's you (uses one of THEIR medkits,
//      EMS gets a bonus from the city) — free for you
//   2. After BLEEDOUT_MIN you can /respawn at the nearest hospital
//      for a bill — so waiting for EMS is always the better deal
//      Each city has two, and you wake at whichever is closer to
//      where you dropped
// Either way you get up with enough food/water not to drop again.
//
// Hospital coords: Lakeshore General is your EMS spot from the smoke
// test. Every other hospital is a placeholder — walk them and tune.
// ============================================================

const inventory = require("./inventory");
const { distance } = require("./cities");

const REVIVE_RANGE = 3.0;   // metres from the patient
const BLEEDOUT_MIN = 5;     // minutes before /respawn unlocks
const REVIVE_HEALTH = 50;   // out of 100
const RESPAWN_HEALTH = 50;
const MIN_NEEDS_AFTER = 30; // hunger/thirst topped up to at least this
const EMS_REVIVE_BONUS = 150;
const EMS_REVIVE_GOLD = 25;
const HOSPITAL_BILL = 500;

const HOSPITALS = {
    atlanta: [
        { label: "Red Clay General",    pos: { x: 298.0,  y: -584.0,  z: 43.3 } },
        { label: "Peach Ridge Medical", pos: { x: -912.0, y: -870.0,  z: 36.0 } },
    ],
    geepee: [
        { label: "Harvest County Clinic", pos: { x: 1839.0, y: 3672.0, z: 34.3 } },
        { label: "Dust Road Medical",     pos: { x: 1690.0, y: 4780.0, z: 42.0 } },
    ],
    chicago: [
        { label: "Lakeshore General",   pos: { x: -245.0, y: 6325.0, z: 33.0 } }, // doubles as the EMS station
        { label: "Winterline Memorial", pos: { x: -150.0, y: 6100.0, z: 32.0 } },
    ],
};

function hospitalsIn(city) {
    return HOSPITALS[city] || HOSPITALS.atlanta;
}

// Whichever one is closest to where you went down.
function nearestHospital(city, pos) {
    const list = hospitalsIn(city);
    if (!pos) return list[0];
    return list.reduce((best, h) => (distance(pos, h.pos) < distance(pos, best.pos) ? h : best), list[0]);
}

// Returns true only on the moment someone goes down (so alerts fire once).
function knockDown(c, now) {
    if (c.downed) return false;
    c.downed = true;
    c.downedAt = now;
    c.health = 0;
    return true;
}

function getUp(c, health) {
    c.downed = false;
    c.downedAt = null;
    c.health = health;
    c.hunger = Math.max(c.hunger, MIN_NEEDS_AFTER);
    c.thirst = Math.max(c.thirst, MIN_NEEDS_AFTER);
}

function minutesUntilRespawn(c, now) {
    const waited = (now - c.downedAt) / 60000;
    return Math.max(0, Math.ceil(BLEEDOUT_MIN - waited));
}

function revive(medic, patient) {
    if (medic.job.name !== "ems") return { ok: false, msg: "Only EMS can revive" };
    if (!medic.onDuty) return { ok: false, msg: "Clock in first (/duty)" };
    if (!patient) return { ok: false, msg: "No player with that id" };
    if (patient === medic) return { ok: false, msg: "You can't revive yourself" };
    if (!patient.downed) return { ok: false, msg: `${patient.name} isn't down` };
    if (!medic.pos || !patient.pos || distance(medic.pos, patient.pos) > REVIVE_RANGE) {
        return { ok: false, msg: `Get closer to ${patient.name}` };
    }
    if (!medic.inventory.medkit) return { ok: false, msg: "You need a medkit" };

    inventory.removeItem(medic.inventory, "medkit", 1);
    getUp(patient, REVIVE_HEALTH);
    medic.bank += EMS_REVIVE_BONUS;
    medic.gold += EMS_REVIVE_GOLD;
    return { ok: true, msg: `Revived ${patient.name}. +$${EMS_REVIVE_BONUS} to your bank, +${EMS_REVIVE_GOLD} gold` };
}

// city = where they went down. Bill is whatever they can cover, up to HOSPITAL_BILL.
function respawn(c, now, city) {
    if (!c.downed) return { ok: false, msg: "You're not down" };
    const wait = minutesUntilRespawn(c, now);
    if (wait > 0) return { ok: false, msg: `Hang on for EMS — you can respawn in ${wait} min` };

    const hospital = nearestHospital(city, c.pos);
    const bill = Math.min(c.bank, HOSPITAL_BILL);
    c.bank -= bill;
    getUp(c, RESPAWN_HEALTH);
    return { ok: true, msg: `You woke up at ${hospital.label}. Hospital bill: $${bill}`, pos: { ...hospital.pos } };
}

module.exports = {
    REVIVE_RANGE, BLEEDOUT_MIN, REVIVE_HEALTH, RESPAWN_HEALTH, MIN_NEEDS_AFTER,
    EMS_REVIVE_BONUS, EMS_REVIVE_GOLD, HOSPITAL_BILL, HOSPITALS,
    hospitalsIn, nearestHospital,
    knockDown, getUp, minutesUntilRespawn, revive, respawn,
};
