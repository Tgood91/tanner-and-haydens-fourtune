// ============================================================
// jobs.js — jobs, grades, duty and paychecks
// Pay is per paycheck (every PAY_INTERVAL_MIN in game.js), into the bank.
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
        grades: [
            { label: "Deputy", pay: 400 },
            { label: "Sergeant", pay: 550 },
            { label: "Sheriff", pay: 700 },
        ],
        stations: { chicago: { x: -448, y: 6011, z: 31.7 } },
    },
    ems: {
        label: "EMS",
        grades: [
            { label: "EMT", pay: 380 },
            { label: "Paramedic", pay: 500 },
            { label: "Chief", pay: 650 },
        ],
        stations: { chicago: { x: -245, y: 6325, z: 33 } },
    },
    mechanic: {
        label: "Beeker's Mechanic",
        grades: [
            { label: "Apprentice", pay: 250 },
            { label: "Mechanic", pay: 350 },
            { label: "Owner", pay: 500 },
        ],
        stations: { chicago: { x: -70, y: 6406, z: 31 } },
    },
    taxi: {
        label: "Taxi",
        grades: [
            { label: "Driver", pay: 200 },
            { label: "Dispatcher", pay: 300 },
        ],
        stations: { chicago: { x: -400, y: 6030, z: 33 } },
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
    return { ok: true, msg: `Job set: ${jobInfo(c)}` };
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

module.exports = { JOBS, jobInfo, setJob, toggleDuty, paycheckAmount };
