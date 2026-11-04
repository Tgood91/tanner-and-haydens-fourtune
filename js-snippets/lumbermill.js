// ============================================================
// lumbermill.js — Hollow Creek Lumber Yard jobs (the island's West Woods)
//
// Open hire, like the dockhands: /apply lumbermill, then /duty.
// On duty you earn the paycheck and gold every 30 min (jobs.js), plus
// piece pay for the work below:
//
//   1. /fell at a felling spot in the Copper Hills woods -> 1 log.
//      Logs are 12 kg, so two fill a bag; a truck's trunk (/trunkput)
//      hauls more. A felled spot regrows in FELL_REGROW_MIN, for everyone.
//   2. /mill at the mill shed's saw: every log you carry -> 4 planks,
//      and piece pay a log, cash, on the spot. Hauled a truckload? Park
//      by the shed, /trunktake log, /mill, repeat.
//   3. /sellplanks at the yard office: $PLANK_PRICE a plank, cash.
//      Anyone can sell planks; only on-duty yard workers can make them.
//
// Grades are Logger, Sawyer, Yard Boss (set from the console). A higher
// grade earns more piece pay a log (MILL_PAY).
//
// Spots, prices and timings are placeholders: walk them and tune.
// ============================================================

const inventory = require("./inventory");
const economy = require("./economy");
const { distance } = require("./cities");

const JOB = "lumbermill";
const YARD = {
    label: "Hollow Creek Lumber Yard",
    saw: { x: -6960, y: -6650, z: 10.7 },      // the mill shed's east door
    office: { x: -6894, y: -6564, z: 10.7 },   // the yard office's counter
};
const RANGE = 5.0;               // metres from the saw, the office or a felling spot
const FELL_REGROW_MIN = 8;
const PLANKS_PER_LOG = 4;
const MILL_PAY = [25, 30, 40];   // cash a log milled, by grade (Logger, Sawyer, Yard Boss)
const PLANK_PRICE = 30;          // the office pays, each

// The Copper Hills woods, south of Pine Hollow (tools/gen-island-map.py
// LOGGING_SPOTS, ground height + 1 m from island-terrain/ground.f32)
const FELL_SPOTS = [
    { x: -7780.0, y: -7400.0, z: 30.7 }, { x: -7700.0, y: -7570.0, z: 46.0 },
    { x: -7600.0, y: -7350.0, z: 39.5 }, { x: -7500.0, y: -7600.0, z: 45.9 },
    { x: -7410.0, y: -7420.0, z: 54.4 }, { x: -7340.0, y: -7520.0, z: 39.7 },
    { x: -7690.0, y: -7450.0, z: 64.9 }, { x: -7450.0, y: -7310.0, z: 29.4 },
];

function near(pos, spot) {
    return !!pos && distance(pos, spot) <= RANGE;
}

function payFor(c) {
    return MILL_PAY[c.job.grade] ?? MILL_PAY[0];
}

function onShift(c) {
    if (c.job.name !== JOB) return { ok: false, msg: `That's work for the lumber yard — /apply ${JOB}` };
    if (!c.onDuty) return { ok: false, msg: "Clock in first — /duty" };
    return { ok: true };
}

function createLumberMill() {
    const regrows = new Map();   // spot index -> time it can be felled again

    const minutesLeft = (until, now) => (until && until > now ? Math.ceil((until - now) / 60000) : 0);

    function fell(c, now) {
        const shift = onShift(c);
        if (!shift.ok) return shift;
        const i = FELL_SPOTS.findIndex((s) => near(c.pos, s));
        if (i < 0) return { ok: false, msg: "No marked tree here. Felling spots are in the Copper Hills woods" };
        const wait = minutesLeft(regrows.get(i), now);
        if (wait) return { ok: false, msg: `This spot's been cut. It's ready again in ${wait} min — try another` };
        const fits = inventory.canAddItem(c.inventory, "log", 1);
        if (!fits.ok) return { ok: false, msg: `No room for the log: ${fits.msg}. Put logs in a truck (/trunkput log)` };
        inventory.addItem(c.inventory, "log", 1);
        regrows.set(i, now + FELL_REGROW_MIN * 60000);
        return { ok: true, msg: `Timber! 1x Log (${c.inventory.log} carried). Mill them at ${YARD.label}.` };
    }

    function mill(c, now) {
        void now;
        const shift = onShift(c);
        if (!shift.ok) return shift;
        if (!near(c.pos, YARD.saw)) return { ok: false, msg: `Mill logs at the saw in the ${YARD.label} mill shed` };
        const carried = c.inventory.log || 0;
        if (!carried) return { ok: false, msg: "You've got no logs to mill. /fell some in the Copper Hills" };
        // the planks must fit once the logs are off your back (they're lighter, but check)
        const trial = { ...c.inventory };
        inventory.removeItem(trial, "log", carried);
        const fits = inventory.canAddItem(trial, "plank", carried * PLANKS_PER_LOG);
        if (!fits.ok) return { ok: false, msg: `No room for the planks: ${fits.msg}` };

        inventory.removeItem(c.inventory, "log", carried);
        inventory.addItem(c.inventory, "plank", carried * PLANKS_PER_LOG);
        const pay = carried * payFor(c);
        c.cash += pay;
        return { ok: true, msg: `Milled ${carried}x Log into ${carried * PLANKS_PER_LOG}x Plank, +${economy.money(pay)} cash. Sell planks at the yard office (/sellplanks).` };
    }

    function sellPlanks(c) {
        if (!near(c.pos, YARD.office)) return { ok: false, msg: `Sell planks at the ${YARD.label} office` };
        const n = c.inventory.plank || 0;
        if (!n) return { ok: false, msg: "You've got no planks to sell" };
        inventory.removeItem(c.inventory, "plank", n);
        const total = n * PLANK_PRICE;
        c.cash += total;
        return { ok: true, msg: `The yard office buys ${n}x Plank for ${economy.money(total)} cash.` };
    }

    function status(c, now) {
        const ready = FELL_SPOTS.filter((_, i) => !minutesLeft(regrows.get(i), now)).length;
        const working = c.job.name === JOB;
        return [
            `--- ${YARD.label} ---`,
            working ? `You work here${c.onDuty ? " (on duty)" : " (off duty — /duty)"}` : `Not your job — /apply ${JOB} to start`,
            `Felling spots ready in the Copper Hills: ${ready}/${FELL_SPOTS.length}`,
            `Carrying: ${c.inventory.log || 0} logs, ${c.inventory.plank || 0} planks`,
            `Pay: ${economy.money(payFor(c))} a log milled${working ? "" : " (as a Logger)"}, ${economy.money(PLANK_PRICE)} a plank sold (${economy.money(payFor(c) + PLANKS_PER_LOG * PLANK_PRICE)} a log in all)`,
        ].join("\n");
    }

    return { fell, mill, sellPlanks, status };
}

module.exports = { JOB, YARD, FELL_SPOTS, RANGE, FELL_REGROW_MIN, PLANKS_PER_LOG, MILL_PAY, PLANK_PRICE, createLumberMill };
