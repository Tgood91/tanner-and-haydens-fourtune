// ============================================================
// robbery.js — holding up a store
//
// What it takes to start (/rob at a shop counter):
//   - a gun in your hands with at least one round loaded
//   - enough police on duty, so nobody farms tills on a dead server
//   - a shop that hasn't been hit recently, and you haven't just
//     robbed somewhere else
//
// Then you have to STAND THERE. The till takes ROB_DURATION to empty,
// checked off the position sweep, and walking more than ROB_RANGE from
// the counter ends it with nothing. Getting cuffed or dropped ends it
// too — that is the whole point of the police alert that goes out the
// second you start.
//
// The money lands as CASH, not bank: dirty money that police can find
// with /search and take with /seize.
//
// Payout, timings and the police minimum are placeholders.
// ============================================================

const economy = require("./economy");
const ammo = require("./ammo");
const { distance } = require("./cities");

const MIN_POLICE_ON_DUTY = 1;
const ROB_DURATION_MS = 90000;   // 90 seconds at the counter
const ROB_RANGE = 6.0;           // how far you can drift from the till
const SHOP_COOLDOWN_MIN = 30;    // before that shop can be hit again
const ROBBER_COOLDOWN_MIN = 15;  // before you can hit anywhere again
const PAYOUT_MIN = 400;
const PAYOUT_MAX = 1200;

function createHeists(rng = Math.random) {
    const active = new Map();        // robber id -> { shopId, label, pos, startedAt }
    const shopCooling = new Map();   // shop id -> time it can be robbed again
    const robberCooling = new Map(); // player id -> time they can rob again

    function minutesLeft(until, now) {
        return until && until > now ? Math.ceil((until - now) / 60000) : 0;
    }

    function activeFor(id) {
        return active.get(id) || null;
    }

    // found = { id, shop } from shops.findShopNear
    function start(c, found, now, policeOnDuty) {
        if (active.has(c.id)) return { ok: false, msg: "You're already holding this place up" };
        if (!found) return { ok: false, msg: "You're not at a shop counter" };

        if (!c.equipped || !ammo.WEAPONS[c.equipped]) {
            return { ok: false, msg: "Get a gun out first" };
        }
        const type = ammo.WEAPONS[c.equipped].ammo;
        if (!(c.ammo[type] > 0)) return { ok: false, msg: "That gun is empty — nobody's scared of an empty gun" };

        if (policeOnDuty < MIN_POLICE_ON_DUTY) {
            return { ok: false, msg: `Too quiet out there. ${MIN_POLICE_ON_DUTY} officer(s) need to be on duty.` };
        }

        const mine = minutesLeft(robberCooling.get(c.id), now);
        if (mine) return { ok: false, msg: `You're too hot right now — lay low for ${mine} min` };
        const theirs = minutesLeft(shopCooling.get(found.id), now);
        if (theirs) return { ok: false, msg: `${found.shop.label} was just hit — the till is empty for ${theirs} min` };

        active.set(c.id, { shopId: found.id, label: found.shop.label, pos: { ...found.shop.pos }, startedAt: now });
        return { ok: true, msg: `Holding up ${found.shop.label}. Stay at the counter for ${Math.round(ROB_DURATION_MS / 1000)}s.`, label: found.shop.label };
    }

    // Called from the position sweep. Returns what happened, or null.
    function progress(c, pos, now) {
        const job = active.get(c.id);
        if (!job) return null;

        if (!pos || distance(pos, job.pos) > ROB_RANGE) {
            active.delete(c.id);
            return { event: "left", msg: `You walked away from ${job.label}. Nothing in your pockets.` };
        }
        if (now - job.startedAt < ROB_DURATION_MS) return null;

        active.delete(c.id);
        shopCooling.set(job.shopId, now + SHOP_COOLDOWN_MIN * 60000);
        robberCooling.set(c.id, now + ROBBER_COOLDOWN_MIN * 60000);

        const take = PAYOUT_MIN + Math.floor(rng() * (PAYOUT_MAX - PAYOUT_MIN + 1));
        c.cash += take;
        return { event: "done", take, label: job.label, msg: `Cleaned out ${job.label}: ${economy.money(take)} in cash. Get out of there.` };
    }

    // Cuffed, dropped, or logged off — the robbery dies with nothing paid out.
    function cancel(id, reason) {
        const job = active.get(id);
        if (!job) return null;
        active.delete(id);
        return { label: job.label, msg: `The hold-up at ${job.label} is over — ${reason}.` };
    }

    return { start, progress, cancel, activeFor };
}

module.exports = {
    MIN_POLICE_ON_DUTY, ROB_DURATION_MS, ROB_RANGE,
    SHOP_COOLDOWN_MIN, ROBBER_COOLDOWN_MIN, PAYOUT_MIN, PAYOUT_MAX,
    createHeists,
};
