// ============================================================
// shifts.js — going on shift, not just flipping a switch
//
// /duty used to be a boolean. A shift adds the three things that make
// a department feel staffed: a CALLSIGN you're known by on the radio,
// a RECORD of how long you've been out, and a ROSTER anyone can read.
//
// Dispatch lines use the callsign rather than the player's name, so
// the radio sounds like a radio — "S-3 responding", not "Tanner".
//
// Callsigns come from a pool per department and go back when you clock
// off, so numbers get reused instead of climbing for ever.
// ============================================================

const DEPARTMENTS = {
    police: { label: "Sheriff's Office", prefix: "S", units: 12 },
    ems: { label: "EMS", prefix: "M", units: 12 },
};

const LONG_SHIFT_MIN = 60;   // past this you're told to take a break

function isDepartment(job) {
    return Object.prototype.hasOwnProperty.call(DEPARTMENTS, job);
}

function createShifts() {
    const active = new Map(); // character id -> { dept, callsign, since }

    function freeCallsign(dept) {
        const taken = new Set([...active.values()].filter((s) => s.dept === dept).map((s) => s.callsign));
        const { prefix, units } = DEPARTMENTS[dept];
        for (let i = 1; i <= units; i++) {
            const sign = `${prefix}-${i}`;
            if (!taken.has(sign)) return sign;
        }
        return null;
    }

    function shiftOf(c) {
        return active.get(c.id) || null;
    }

    function callsignOf(c) {
        const shift = active.get(c.id);
        return shift ? shift.callsign : null;
    }

    // How a unit should be referred to on the radio
    function radioName(c) {
        const sign = callsignOf(c);
        return sign ? `${sign} (${c.name})` : c.name;
    }

    function start(c, now) {
        if (!isDepartment(c.job.name)) return { ok: false, msg: "Your job doesn't run shifts" };
        if (active.has(c.id)) return { ok: false, msg: "You're already on shift" };

        const callsign = freeCallsign(c.job.name);
        if (!callsign) return { ok: false, msg: `Every ${DEPARTMENTS[c.job.name].label} callsign is out` };

        active.set(c.id, { dept: c.job.name, callsign, since: now });
        return { ok: true, msg: `${callsign} on shift.`, callsign };
    }

    function end(c, now) {
        const shift = active.get(c.id);
        if (!shift) return { ok: false, msg: "You're not on shift" };

        const minutes = Math.max(0, Math.round((now - shift.since) / 60000));
        active.delete(c.id);
        return { ok: true, msg: `${shift.callsign} off shift after ${minutes} min.`, minutes, callsign: shift.callsign };
    }

    // Called on the tick: nudge anyone who's been out a long time
    function longShifts(now) {
        const out = [];
        for (const [id, shift] of active) {
            const minutes = Math.round((now - shift.since) / 60000);
            if (minutes >= LONG_SHIFT_MIN && minutes % LONG_SHIFT_MIN === 0) {
                out.push({ id, callsign: shift.callsign, minutes });
            }
        }
        return out;
    }

    // nameOf(id) -> the character's name, so the roster reads properly
    function roster(dept, now, nameOf) {
        const label = DEPARTMENTS[dept] ? DEPARTMENTS[dept].label : dept;
        const lines = [...active]
            .filter(([, s]) => !dept || s.dept === dept)
            .sort((a, b) => a[1].callsign.localeCompare(b[1].callsign, undefined, { numeric: true }))
            .map(([id, s]) => `${s.callsign} — ${nameOf(id) || "?"} (${Math.round((now - s.since) / 60000)} min)`);

        if (lines.length === 0) return `No ${label} units on shift.`;
        return [`--- ${label} on shift ---`, ...lines].join("\n");
    }

    function dropPlayer(id) {
        active.delete(id);
    }

    return { start, end, shiftOf, callsignOf, radioName, longShifts, roster, dropPlayer };
}

module.exports = { DEPARTMENTS, LONG_SHIFT_MIN, isDepartment, createShifts };
