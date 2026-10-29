// ============================================================
// turf.js — claiming districts, and getting paid to hold them
//
// The ten districts in places.js are the board. A crew takes one by
// STANDING IN IT, together: MIN_CLAIMERS members inside the zone for
// CLAIM_MS, checked off the position sweep. If anyone wanders off or
// logs out, the claim dies with nothing taken. Turf should cost you an
// evening, not a keypress.
//
// Taking someone else's turf warns them the moment it starts, with the
// district named. That warning is the point — a claim nobody can
// contest is just a timer.
//
// Holding pays gold to every online member on each payout tick, so a
// big crew holding nothing earns nothing, and three people holding The
// Knot earn every few minutes.
//
// This file decides nothing about WHO is present: game.js knows the
// crews and the positions and hands that in. All numbers are
// placeholders.
// ============================================================

const places = require("./places");

const MIN_CLAIMERS = 2;              // crew members who must be in the zone
const CLAIM_MS = 120000;             // how long they hold their ground
const FLIP_COOLDOWN_MS = 900000;     // 15 min before a district can change hands again
const PAYOUT_EVERY_MIN = 10;
const PAYOUT_GOLD = 15;              // per online member, per district held

function districts() {
    return places.ZONES.filter((z) => z.kind === "district");
}

function createTurf() {
    const held = new Map();     // district -> { tag, since }
    const claims = new Map();   // district -> { tag, startedAt }
    const cooling = new Map();  // district -> time it can flip again
    let sincePayout = 0;

    function minutesLeft(until, now) {
        return until && until > now ? Math.ceil((until - now) / 60000) : 0;
    }

    function holderOf(district) {
        return held.get(district)?.tag ?? null;
    }

    function heldBy(tag) {
        return [...held].filter(([, owner]) => owner.tag === tag).map(([district]) => district);
    }

    // nameOf(tag) -> the crew's name, for readable lines
    function board(nameOf) {
        const lines = ["--- Turf ---"];
        for (const d of districts()) {
            const owner = held.get(d.name);
            let who = owner ? `[${owner.tag}] ${nameOf(owner.tag) || owner.tag}` : "unclaimed";
            const taking = claims.get(d.name);
            if (taking) who += ` — [${taking.tag}] is taking it`;
            lines.push(`${d.name}: ${who}`);
        }
        return lines.join("\n");
    }

    // present = how many of this crew are standing in the district right now
    function claim(c, district, present, now) {
        if (!c.gang) return { ok: false, msg: "You're not in a crew" };
        if (!district) return { ok: false, msg: "You're not standing in a district. /turf lists them" };

        const name = district.name;
        const taking = claims.get(name);
        if (taking) {
            return { ok: false, msg: taking.tag === c.gang.tag ? "Your crew is already taking this" : "Someone else is taking this right now" };
        }

        const owner = held.get(name);
        if (owner && owner.tag === c.gang.tag) return { ok: false, msg: `Your crew already holds ${name}` };

        const wait = minutesLeft(cooling.get(name), now);
        if (wait) return { ok: false, msg: `${name} just changed hands — it settles in ${wait} min` };

        if (present < MIN_CLAIMERS) {
            return { ok: false, msg: `You need ${MIN_CLAIMERS} crew in ${name} to take it — ${present} here` };
        }

        claims.set(name, { tag: c.gang.tag, startedAt: now });
        return {
            ok: true,
            msg: `Taking ${name}. Hold it for ${Math.round(CLAIM_MS / 1000)}s — everyone has to stay.`,
            district: name,
            warnTag: owner ? owner.tag : null, // the crew about to lose it
        };
    }

    // presentFor(tag, district) -> how many of that crew are in that district
    // Returns what happened, for game.js to turn into messages.
    function progress(now, presentFor) {
        const events = [];
        for (const [name, taking] of [...claims]) {
            if (presentFor(taking.tag, name) < MIN_CLAIMERS) {
                claims.delete(name);
                events.push({ type: "lost", district: name, tag: taking.tag });
                continue;
            }
            if (now - taking.startedAt < CLAIM_MS) continue;

            const loser = held.get(name);
            claims.delete(name);
            held.set(name, { tag: taking.tag, since: now });
            cooling.set(name, now + FLIP_COOLDOWN_MS);
            events.push({ type: "taken", district: name, tag: taking.tag, loser: loser ? loser.tag : null });
        }
        return events;
    }

    function abandon(c, district) {
        if (!c.gang) return { ok: false, msg: "You're not in a crew" };
        if (c.gang.rank !== 2) return { ok: false, msg: "Only Leaders can give up turf" };
        if (!district || holderOf(district.name) !== c.gang.tag) {
            return { ok: false, msg: "You're not standing in turf your crew holds" };
        }
        held.delete(district.name);
        return { ok: true, msg: `Gave up ${district.name}.`, district: district.name };
    }

    // Runs on the minute tick. membersOf(tag) -> the online characters.
    // Returns [{ c, gold }] for game.js to pay and announce.
    function payout(minutes, membersOf) {
        sincePayout += minutes;
        if (sincePayout < PAYOUT_EVERY_MIN) return [];
        sincePayout -= PAYOUT_EVERY_MIN;

        const earned = new Map();
        for (const owner of held.values()) {
            for (const member of membersOf(owner.tag)) {
                earned.set(member, (earned.get(member) || 0) + PAYOUT_GOLD);
            }
        }
        return [...earned].map(([c, gold]) => ({ c, gold }));
    }

    // A crew that disbands drops whatever it was holding or taking.
    function dropCrew(tag) {
        for (const [name, owner] of [...held]) if (owner.tag === tag) held.delete(name);
        for (const [name, taking] of [...claims]) if (taking.tag === tag) claims.delete(name);
    }

    function exportAll() {
        return { held: Object.fromEntries(held), cooling: Object.fromEntries(cooling) };
    }
    function importAll(saved) {
        for (const [name, owner] of Object.entries(saved?.held || {})) held.set(name, { ...owner });
        for (const [name, until] of Object.entries(saved?.cooling || {})) cooling.set(name, until);
    }

    return { board, claim, progress, abandon, payout, holderOf, heldBy, dropCrew, exportAll, importAll };
}

module.exports = {
    MIN_CLAIMERS, CLAIM_MS, FLIP_COOLDOWN_MS, PAYOUT_EVERY_MIN, PAYOUT_GOLD,
    districts, createTurf,
};
