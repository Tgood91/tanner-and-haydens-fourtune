// ============================================================
// jobs.js — jobs, grades, duty and paychecks
// Pay is per paycheck (every PAY_INTERVAL_MIN in game.js), into the bank.
// Workers on duty also earn GOLD per paycheck (goldPerPaycheck), or by
// the hour (goldPerHour, paid out a paycheck at a time) — the only steady
// way to get gold. Civilians earn none: gold means working.
// Workers only get paid while on duty; civilians always get the
// small civilian check.
//
// The Chicago spots are the approximate coords from your smoke test
// (walk them and tune). All pay numbers are placeholders.
// ============================================================

const JOBS = {
    unemployed: {
        label: "Civilian",
        grades: [{ label: "Civilian", pay: 50 }],
    },
    police: {
        label: "Sheriff's Office",
        goldPerPaycheck: 45,
        grades: [
            { label: "Deputy", pay: 400 },
            { label: "Sergeant", pay: 550 },
            { label: "Sheriff", pay: 700 },
        ],
        stations: { chicago: { x: -448, y: 6011, z: 31.7 } },
    },
    ems: {
        label: "EMS",
        goldPerPaycheck: 45,
        grades: [
            { label: "EMT", pay: 380 },
            { label: "Paramedic", pay: 500 },
            { label: "Chief", pay: 650 },
        ],
        stations: { chicago: { x: -245, y: 6325, z: 33 } },
    },
    mechanic: {
        label: "Beck's Mechanic",
        goldPerPaycheck: 40,
        grades: [
            { label: "Apprentice", pay: 250 },
            { label: "Mechanic", pay: 350 },
            { label: "Owner", pay: 500 },
        ],
        stations: { chicago: { x: -70, y: 6406, z: 31 } },
    },
    taxi: {
        label: "Taxi",
        goldPerPaycheck: 35,
        grades: [
            { label: "Driver", pay: 200 },
            { label: "Dispatcher", pay: 300 },
        ],
        stations: { chicago: { x: -400, y: 6030, z: 33 } },
    },
    // Hot dog carts parked on the roads (see the map's glizzys-2-go.css).
    // openHire: anyone can /apply for it — no console needed.
    glizzys: {
        label: "Glizzys-2-Go",
        openHire: true,
        goldPerHour: 11,
        grades: [
            { label: "Cart Hand", pay: 150 },
            { label: "Cart Owner", pay: 250 },
        ],
    },
};

function jobInfo(c) {
    const job = JOBS[c.job.name];
    const grade = job.grades[c.job.grade];
    const duty = c.job.name === "unemployed" ? "" : c.onDuty ? " (on duty)" : " (off duty)";
    return `${job.label} — ${grade.label}, $${grade.pay}/paycheck${duty}`;
}

// Console/admin only — game.js enforces that, not this function.
function setJob(c, name, grade = 0) {
    const job = JOBS[name];
    if (!job) return { ok: false, msg: `No job called ${name}. Jobs: ${Object.keys(JOBS).join(", ")}` };
    if (!Number.isInteger(grade) || !job.grades[grade]) {
        return { ok: false, msg: `${job.label} grades are 0 to ${job.grades.length - 1}` };
    }

    c.job = { name, grade };
    c.onDuty = false; // new job always starts off duty
    c.goldOwed = 0;   // hourly gold doesn't carry between jobs
    return { ok: true, msg: `Job set: ${jobInfo(c)}` };
}

// Players can take open-hire jobs themselves; the rest are console-set.
function applyJob(c, name) {
    const job = JOBS[name];
    const open = Object.keys(JOBS).filter((n) => JOBS[n].openHire);
    if (!job || !job.openHire) return { ok: false, msg: `That job isn't hiring. Open jobs: ${open.join(", ")}` };
    if (c.job.name === name) return { ok: false, msg: `You already work for ${job.label}` };
    return setJob(c, name, 0);
}

function toggleDuty(c) {
    if (c.job.name === "unemployed") return { ok: false, msg: "You don't have a job to clock into" };
    c.onDuty = !c.onDuty;
    return { ok: true, msg: c.onDuty ? "Clocked in." : "Clocked out." };
}

// Returns how much this character earns right now (0 = no check).
function paycheckAmount(c) {
    if (c.job.name !== "unemployed" && !c.onDuty) return 0;
    return JOBS[c.job.name].grades[c.job.grade].pay;
}

// Gold for this paycheck (0 for civilians or anyone off duty).
// Hourly gold is whole coins only; the leftover fraction carries to the
// next paycheck (11/hr at 30-min checks pays 5, 6, 5, 6...).
function paycheckGold(c, intervalMin) {
    if (!c.onDuty) return 0;
    const job = JOBS[c.job.name];
    if (!job.goldPerHour) return job.goldPerPaycheck || 0;
    c.goldOwed = (c.goldOwed || 0) + (job.goldPerHour * intervalMin) / 60;
    const whole = Math.floor(c.goldOwed);
    c.goldOwed -= whole;
    return whole;
}

module.exports = { JOBS, jobInfo, setJob, applyJob, toggleDuty, paycheckAmount, paycheckGold };
