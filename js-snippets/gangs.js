// ============================================================
// gangs.js — crews, ranks, a base and a shared stash
//
// Founding one costs real money, so tags aren't spam. Nobody is ever
// put in a crew without agreeing: an invite waits for /gangaccept and
// times out. Ranks are Member (0), Officer (1), Leader (2), and you
// can only act on someone below you.
//
// Two things give a crew a shape in the world:
//   - the RADIO item: no radio in your bag, no /g chat. Same rule as
//     the phone, so an officer who drops their radio goes quiet
//   - the BASE: set where the founder stood, and the shared stash
//     only opens within STASH_RANGE of it. Without that a stash is
//     just infinite pockets
//
// Membership rides on the character, so it survives a logout. The
// roster is keyed by character NAME, which is the only stable handle
// this code has today — swap it for the character id from the API the
// moment that exists, or two players with one name share a rank.
//
// Costs, caps and ranges are placeholders.
// ============================================================

const inventory = require("./inventory");
const economy = require("./economy");
const { distance } = require("./cities");

const CREATE_COST = 25000;     // from the founder's bank
const MAX_MEMBERS = 12;
const INVITE_EXPIRY_MIN = 5;
const STASH_CAPACITY = 120;    // kg
const STASH_RANGE = 10.0;      // how close to the base you must be
const BASE_MOVE_HOURS = 24;    // before a leader can move it again

const MEMBER = 0, OFFICER = 1, LEADER = 2;
const RANK_LABEL = ["Member", "Officer", "Leader"];

function validTag(tag) {
    return /^[A-Za-z0-9]{2,5}$/.test(tag || "");
}

function cleanName(name) {
    const text = String(name || "").trim().replace(/\s+/g, " ");
    return text.length >= 3 && text.length <= 24 ? text : null;
}

function hasRadio(c) {
    return (c.inventory.radio || 0) > 0;
}

function rankOf(c) {
    return c.gang ? c.gang.rank : null;
}

function createGangs() {
    const gangs = new Map();   // TAG -> { tag, name, founder, foundedAt, base, baseSetAt, roster, stash }
    const invites = new Map(); // player id -> { tag, fromName, at }

    function get(tag) {
        return gangs.get(String(tag || "").toUpperCase()) || null;
    }

    function gangOf(c) {
        return c.gang ? get(c.gang.tag) : null;
    }

    function requireRank(c, min, what) {
        const gang = gangOf(c);
        if (!gang) return { ok: false, msg: "You're not in a crew" };
        if (c.gang.rank < min) return { ok: false, msg: `Only ${RANK_LABEL[min]}s and above can ${what}` };
        return { ok: true, msg: "", gang };
    }

    function roster(gang) {
        return Object.entries(gang.roster)
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .map(([name, rank]) => `${RANK_LABEL[rank]}: ${name}`);
    }

    function list() {
        if (gangs.size === 0) return "No crews yet. /gangcreate <tag> <name>";
        return ["--- Crews ---", ...[...gangs.values()].map((g) => `[${g.tag}] ${g.name} — ${Object.keys(g.roster).length} member(s)`)].join("\n");
    }

    function info(c) {
        const gang = gangOf(c);
        if (!gang) return "You're not in a crew. /gangs to see who's out there";
        return [
            `[${gang.tag}] ${gang.name}`,
            `You: ${RANK_LABEL[c.gang.rank]}`,
            `Base: ${gang.base ? `${Math.round(gang.base.x)}, ${Math.round(gang.base.y)}` : "not set"}`,
            `Stash: ${inventory.getWeight(gang.stash)} / ${STASH_CAPACITY} kg`,
            ...roster(gang),
        ].join("\n");
    }

    function create(c, tag, name, now) {
        if (c.gang) return { ok: false, msg: "Leave your crew first" };
        if (!validTag(tag)) return { ok: false, msg: "Tag is 2-5 letters or numbers, e.g. KAOS" };
        const label = cleanName(name);
        if (!label) return { ok: false, msg: "Name it something 3-24 characters long" };
        const TAG = tag.toUpperCase();
        if (gangs.has(TAG)) return { ok: false, msg: `[${TAG}] is taken` };
        if (!c.pos) return { ok: false, msg: "Can't work out where you are yet — try again in a second" };

        const paid = economy.removeMoney(c, "bank", CREATE_COST);
        if (!paid.ok) return { ok: false, msg: `Founding a crew costs ${economy.money(CREATE_COST)} — ${paid.msg}` };

        gangs.set(TAG, {
            tag: TAG, name: label, founder: c.name, foundedAt: now,
            base: { ...c.pos }, baseSetAt: now,
            roster: { [c.name]: LEADER }, stash: {},
        });
        c.gang = { tag: TAG, rank: LEADER };
        return { ok: true, msg: `[${TAG}] ${label} founded for ${economy.money(CREATE_COST)}. Base set where you're standing.` };
    }

    function invite(c, target, now) {
        const ok = requireRank(c, OFFICER, "invite");
        if (!ok.ok) return ok;
        if (!target) return { ok: false, msg: "No player with that id" };
        if (target === c) return { ok: false, msg: "You're already in it" };
        if (target.gang) return { ok: false, msg: `${target.name} is already in a crew` };
        if (Object.keys(ok.gang.roster).length >= MAX_MEMBERS) return { ok: false, msg: `[${ok.gang.tag}] is full (${MAX_MEMBERS})` };
        if (ok.gang.roster[target.name] !== undefined) return { ok: false, msg: `${target.name} is already on the roster` };

        invites.set(target.id, { tag: ok.gang.tag, fromName: c.name, at: now });
        return { ok: true, msg: `Invited ${target.name} to [${ok.gang.tag}]`, tag: ok.gang.tag, name: ok.gang.name };
    }

    function accept(c, now) {
        if (c.gang) return { ok: false, msg: "You're already in a crew" };
        const pending = invites.get(c.id);
        if (!pending) return { ok: false, msg: "Nobody's invited you" };
        if (now - pending.at >= INVITE_EXPIRY_MIN * 60000) {
            invites.delete(c.id);
            return { ok: false, msg: "That invite expired" };
        }
        const gang = get(pending.tag);
        if (!gang) {
            invites.delete(c.id);
            return { ok: false, msg: "That crew doesn't exist any more" };
        }
        if (Object.keys(gang.roster).length >= MAX_MEMBERS) return { ok: false, msg: `[${gang.tag}] filled up` };

        invites.delete(c.id);
        gang.roster[c.name] = MEMBER;
        c.gang = { tag: gang.tag, rank: MEMBER };
        return { ok: true, msg: `You're in [${gang.tag}] ${gang.name}.`, tag: gang.tag };
    }

    function leave(c) {
        const gang = gangOf(c);
        if (!gang) return { ok: false, msg: "You're not in a crew" };
        if (c.gang.rank === LEADER) return { ok: false, msg: "A leader can't walk away — promote someone or /gangdisband" };
        delete gang.roster[c.name];
        c.gang = null;
        return { ok: true, msg: `You left [${gang.tag}]`, tag: gang.tag };
    }

    // targetChar is null when they're offline — the roster still has them
    function kick(c, targetName, targetChar) {
        const ok = requireRank(c, OFFICER, "kick");
        if (!ok.ok) return ok;
        const name = String(targetName || "").trim();
        const rank = ok.gang.roster[name];
        if (rank === undefined) return { ok: false, msg: `${name || "That name"} isn't on the roster` };
        if (name === c.name) return { ok: false, msg: "Use /gangleave" };
        if (rank >= c.gang.rank) return { ok: false, msg: `${name} outranks you, or matches you` };

        delete ok.gang.roster[name];
        if (targetChar) targetChar.gang = null;
        return { ok: true, msg: `Kicked ${name} out of [${ok.gang.tag}]`, tag: ok.gang.tag };
    }

    // up = true to promote, false to demote. Leader only, and never to Leader.
    function setRank(c, targetName, targetChar, up) {
        const ok = requireRank(c, LEADER, "change ranks");
        if (!ok.ok) return ok;
        const name = String(targetName || "").trim();
        const rank = ok.gang.roster[name];
        if (rank === undefined) return { ok: false, msg: `${name || "That name"} isn't on the roster` };
        if (name === c.name) return { ok: false, msg: "Not on yourself" };

        const next = up ? rank + 1 : rank - 1;
        if (next > OFFICER) return { ok: false, msg: "Officer is as high as it goes" };
        if (next < MEMBER) return { ok: false, msg: `${name} is already a Member` };

        ok.gang.roster[name] = next;
        if (targetChar && targetChar.gang) targetChar.gang.rank = next;
        return { ok: true, msg: `${name} is now ${RANK_LABEL[next]}`, rank: next };
    }

    function disband(c) {
        const ok = requireRank(c, LEADER, "disband");
        if (!ok.ok) return ok;
        gangs.delete(ok.gang.tag);
        for (const [id, pending] of invites) if (pending.tag === ok.gang.tag) invites.delete(id);
        return { ok: true, msg: `[${ok.gang.tag}] ${ok.gang.name} is gone.`, tag: ok.gang.tag, roster: Object.keys(ok.gang.roster) };
    }

    function chat(c, body) {
        const gang = gangOf(c);
        if (!gang) return { ok: false, msg: "You're not in a crew" };
        if (!hasRadio(c)) return { ok: false, msg: "No radio in your bag" };
        const text = String(body || "").trim();
        if (!text) return { ok: false, msg: "Say something: /g <message>" };
        return { ok: true, msg: `[${gang.tag}] ${RANK_LABEL[c.gang.rank]} ${c.name}: ${text}`, tag: gang.tag };
    }

    function atBase(c) {
        const gang = gangOf(c);
        if (!gang) return { ok: false, msg: "You're not in a crew" };
        if (!gang.base) return { ok: false, msg: "Your crew has no base" };
        if (!c.pos || distance(c.pos, gang.base) > STASH_RANGE) return { ok: false, msg: `You're not at the [${gang.tag}] base` };
        return { ok: true, msg: "", gang };
    }

    function setBase(c, now) {
        const ok = requireRank(c, LEADER, "move the base");
        if (!ok.ok) return ok;
        if (!c.pos) return { ok: false, msg: "Can't work out where you are yet" };
        const wait = ok.gang.baseSetAt + BASE_MOVE_HOURS * 3600000 - now;
        if (wait > 0) return { ok: false, msg: `The base was just moved — ${Math.ceil(wait / 3600000)}h before it can move again` };

        ok.gang.base = { ...c.pos };
        ok.gang.baseSetAt = now;
        return { ok: true, msg: `[${ok.gang.tag}] base moved to where you're standing.` };
    }

    function viewStash(c) {
        const ok = atBase(c);
        if (!ok.ok) return ok;
        const lines = [`--- [${ok.gang.tag}] stash ---`];
        for (const [item, count] of Object.entries(ok.gang.stash)) lines.push(`${inventory.ITEMS[item].label} x${count}`);
        lines.push(`Weight: ${inventory.getWeight(ok.gang.stash)} / ${STASH_CAPACITY} kg`);
        return { ok: true, msg: lines.join("\n") };
    }

    function putStash(c, item, count = 1) {
        const ok = atBase(c);
        if (!ok.ok) return ok;
        if ((c.inventory[item] || 0) < count) return { ok: false, msg: `You don't have ${count}x ${item}` };
        const fits = inventory.canAddItem(ok.gang.stash, item, count, STASH_CAPACITY);
        if (!fits.ok) return { ok: false, msg: `The stash is full — ${fits.msg}` };

        inventory.removeItem(c.inventory, item, count);
        inventory.addItem(ok.gang.stash, item, count, STASH_CAPACITY);
        return { ok: true, msg: `Stashed ${count}x ${inventory.ITEMS[item].label}`, tag: ok.gang.tag };
    }

    function takeStash(c, item, count = 1) {
        const ok = atBase(c);
        if (!ok.ok) return ok;
        if ((ok.gang.stash[item] || 0) < count) return { ok: false, msg: `The stash doesn't have ${count}x ${item}` };
        const fits = inventory.canAddItem(c.inventory, item, count);
        if (!fits.ok) return fits;

        inventory.removeItem(ok.gang.stash, item, count);
        inventory.addItem(c.inventory, item, count);
        return { ok: true, msg: `Took ${count}x ${inventory.ITEMS[item].label} from the stash`, tag: ok.gang.tag };
    }

    function expireInvites(now) {
        const gone = [];
        for (const [id, pending] of invites) {
            if (now - pending.at >= INVITE_EXPIRY_MIN * 60000) {
                invites.delete(id);
                gone.push(id);
            }
        }
        return gone;
    }

    function dropPlayer(id) {
        invites.delete(id);
    }

    // Saved alongside the characters, the way trunks are
    function exportAll() {
        return Object.fromEntries([...gangs].map(([tag, g]) => [tag, {
            ...g, base: g.base ? { ...g.base } : null, roster: { ...g.roster }, stash: { ...g.stash },
        }]));
    }
    function importAll(saved) {
        for (const [tag, g] of Object.entries(saved || {})) {
            gangs.set(tag, { ...g, base: g.base ? { ...g.base } : null, roster: { ...g.roster }, stash: { ...g.stash } });
        }
    }

    return {
        get, gangOf, list, info, create, invite, accept, leave, kick, setRank, disband,
        chat, setBase, viewStash, putStash, takeStash, expireInvites, dropPlayer, exportAll, importAll,
    };
}

module.exports = {
    CREATE_COST, MAX_MEMBERS, INVITE_EXPIRY_MIN, STASH_CAPACITY, STASH_RANGE, BASE_MOVE_HOURS,
    MEMBER, OFFICER, LEADER, RANK_LABEL, validTag, hasRadio, rankOf, createGangs,
};
