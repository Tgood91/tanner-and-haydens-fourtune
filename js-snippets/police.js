// ============================================================
// police.js — cuffs, searches, seizing, fines and jail
// Every tool needs an on-duty Sheriff's Office officer standing
// close to the suspect. Searching and seizing need the suspect
// cuffed or downed, so nobody gets robbed by a "cop" mid-walk.
//
// Built so corrupt cops can't farm it:
//   - seized items are destroyed as evidence, not given to the officer
//   - fines go to the city, not the officer's pocket
// Jail time is saved with the character, so logging out doesn't
// get you out of it. The city you're arrested in is saved too: you're
// released in a DIFFERENT city (spawns.js RELEASE_CITY).
// Jail coords and all limits are placeholders.
// ============================================================

const inventory = require("./inventory");
const economy = require("./economy");
const ammo = require("./ammo");
const { distance, cityAt } = require("./cities");

const REACH = 2.5;          // metres: cuff, search, seize, jail
const FINE_REACH = 5.0;     // metres: writing a ticket
const MAX_FINE = 5000;
const MAX_JAIL_MIN = 30;

const JAIL = {
    cell: { x: 1691.0, y: 2565.0, z: 45.6 }, // placeholder — Bolingbroke yard
};

function checkOfficer(officer, suspect, reach = REACH) {
    if (officer.job.name !== "police") return { ok: false, msg: "Only the Sheriff's Office can do that" };
    if (!officer.onDuty) return { ok: false, msg: "Clock in first (/duty)" };
    if (!suspect) return { ok: false, msg: "No player with that id" };
    if (suspect === officer) return { ok: false, msg: "Not on yourself" };
    if (!officer.pos || !suspect.pos || distance(officer.pos, suspect.pos) > reach) {
        return { ok: false, msg: `Get closer to ${suspect.name}` };
    }
    return { ok: true, msg: "" };
}

function canBeHandled(suspect) {
    return suspect.cuffed || suspect.downed;
}

// Toggles. Cuffing also takes the gun out of their hands.
function cuff(officer, suspect) {
    const check = checkOfficer(officer, suspect);
    if (!check.ok) return check;
    if (suspect.jailMinutes > 0) return { ok: false, msg: `${suspect.name} is already in jail` };

    suspect.cuffed = !suspect.cuffed;
    let holstered = null;
    if (suspect.cuffed && suspect.equipped) holstered = ammo.holster(suspect).weapon;
    return {
        ok: true,
        msg: suspect.cuffed ? `Cuffed ${suspect.name}` : `Uncuffed ${suspect.name}`,
        cuffed: suspect.cuffed,
        holstered,
    };
}

function search(officer, suspect) {
    const check = checkOfficer(officer, suspect);
    if (!check.ok) return check;
    if (!canBeHandled(suspect)) return { ok: false, msg: `${suspect.name} has to be cuffed or down first` };
    return {
        ok: true,
        msg: `--- Search: ${suspect.name} ---\n${inventory.listInventory(suspect.inventory)}\n${ammo.listAmmo(suspect)}\nCash: ${economy.money(suspect.cash)}`,
    };
}

function seize(officer, suspect, item, count = 1) {
    const check = checkOfficer(officer, suspect);
    if (!check.ok) return check;
    if (!canBeHandled(suspect)) return { ok: false, msg: `${suspect.name} has to be cuffed or down first` };

    const res = inventory.removeItem(suspect.inventory, item, count);
    if (!res.ok) return { ok: false, msg: `${suspect.name} doesn't have ${count}x ${item}` };
    return { ok: true, msg: `Seized ${count}x ${inventory.ITEMS[item].label} from ${suspect.name} (logged as evidence)` };
}

// Paid from the bank. If they can't cover it, nothing is taken — jail them instead.
function fine(officer, suspect, amount) {
    const check = checkOfficer(officer, suspect, FINE_REACH);
    if (!check.ok) return check;
    if (!economy.isAmount(amount)) return { ok: false, msg: "Fine must be a whole number above 0" };
    if (amount > MAX_FINE) return { ok: false, msg: `Fines max out at ${economy.money(MAX_FINE)}` };
    if (suspect.bank < amount) return { ok: false, msg: `${suspect.name} can't cover ${economy.money(amount)} — consider /jail` };

    suspect.bank -= amount;
    return { ok: true, msg: `Fined ${suspect.name} ${economy.money(amount)}` };
}

function jail(officer, suspect, minutes) {
    const check = checkOfficer(officer, suspect);
    if (!check.ok) return check;
    if (!suspect.cuffed) return { ok: false, msg: `Cuff ${suspect.name} first` };
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > MAX_JAIL_MIN) {
        return { ok: false, msg: `Jail time is 1 to ${MAX_JAIL_MIN} minutes` };
    }

    suspect.cuffed = false; // the cell holds them now
    suspect.jailMinutes = minutes;
    suspect.jailedFrom = cityAt(suspect.pos);
    return { ok: true, msg: `${suspect.name} is going to jail for ${minutes} min`, pos: { ...JAIL.cell } };
}

// One minute served. Returns true on the minute they walk out.
function serveMinute(c, minutes = 1) {
    if (!(c.jailMinutes > 0)) return false;
    c.jailMinutes = Math.max(0, c.jailMinutes - minutes);
    return c.jailMinutes === 0;
}

module.exports = { REACH, FINE_REACH, MAX_FINE, MAX_JAIL_MIN, JAIL, cuff, search, seize, fine, jail, serveMinute };
