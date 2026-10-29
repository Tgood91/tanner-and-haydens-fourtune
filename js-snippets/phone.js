// ============================================================
// phone.js — numbers, texts, contacts
//
// Everyone starts with a phone item, and the phone item is the point:
// no phone in your bag means no texts, no /911 and no cab. So a phone
// dropped in a fight or taken by police with /seize actually costs you
// something.
//
// Your number's area code comes from the city you started in, so it
// says where you're from for the rest of the character's life:
//   1017 Atlanta   770 GeePee   312 Chicago
//
// Numbers are checked against everyone ONLINE when handed out. That is
// enough for one server; once the API is wired, the check belongs in
// the database so two offline characters can never share a number.
//
// Texts keep the last KEEP_TEXTS messages and save with the character.
// ============================================================

const AREA_CODES = {
    atlanta: "1017",
    geepee: "770",   // placeholder — pick GeePee's real one
    chicago: "312",
};

const KEEP_TEXTS = 20;
const MAX_TEXT = 200;

// "312-4821", "3124821" and "312 4821" are all the same number
function normalize(text) {
    return String(text || "").replace(/[^0-9]/g, "");
}

function hasPhone(c) {
    return (c.inventory.phone || 0) > 0;
}

// taken = the numbers already in use, as normalized strings
function makeNumber(city, taken, rng = Math.random) {
    const area = AREA_CODES[city] || AREA_CODES.atlanta;
    for (let tries = 0; tries < 50; tries++) {
        const line = String(Math.floor(rng() * 10000)).padStart(4, "0");
        const number = `${area}-${line}`;
        if (!taken.has(normalize(number))) return number;
    }
    return `${area}-${Date.now() % 10000}`; // every try collided; fall back to something unused
}

function describe(c) {
    const lines = [`Your number: ${c.phone.number}`];
    const unread = c.phone.texts.filter((t) => t.dir === "in" && !t.read).length;
    lines.push(unread ? `${unread} unread — /texts` : "No unread texts");
    lines.push(`${Object.keys(c.phone.contacts).length} contact(s) — /contacts`);
    return lines.join("\n");
}

// What this person is saved as in your phone, else their number
function nameFor(c, number) {
    const wanted = normalize(number);
    for (const [name, saved] of Object.entries(c.phone.contacts)) {
        if (normalize(saved) === wanted) return `${name} (${number})`;
    }
    return number;
}

function push(c, entry) {
    c.phone.texts.push(entry);
    if (c.phone.texts.length > KEEP_TEXTS) c.phone.texts.splice(0, c.phone.texts.length - KEEP_TEXTS);
}

function sendText(from, to, body, now) {
    if (!hasPhone(from)) return { ok: false, msg: "You don't have a phone" };
    if (!to) return { ok: false, msg: "No one by that number or id" };
    if (to === from) return { ok: false, msg: "Texting yourself won't help" };
    const text = String(body || "").trim();
    if (!text) return { ok: false, msg: "Say something: /text <number|id> <message>" };
    if (text.length > MAX_TEXT) return { ok: false, msg: `Too long — keep it under ${MAX_TEXT} characters` };
    if (!hasPhone(to)) return { ok: false, msg: "That number isn't reachable right now" };

    push(from, { dir: "out", number: to.phone.number, body: text, at: now, read: true });
    push(to, { dir: "in", number: from.phone.number, body: text, at: now, read: false });
    return {
        ok: true,
        msg: `To ${nameFor(from, to.phone.number)}: ${text}`,
        theirMsg: `Text from ${nameFor(to, from.phone.number)}: ${text}`,
    };
}

function inbox(c) {
    if (!hasPhone(c)) return "You don't have a phone";
    if (c.phone.texts.length === 0) return "No texts.";
    const lines = c.phone.texts.map((t) => {
        const who = nameFor(c, t.number);
        return t.dir === "in" ? `< ${who}: ${t.body}` : `> ${who}: ${t.body}`;
    });
    for (const t of c.phone.texts) t.read = true;
    return ["--- Texts ---", ...lines].join("\n");
}

function saveContact(c, number, name) {
    if (!hasPhone(c)) return { ok: false, msg: "You don't have a phone" };
    const label = String(name || "").trim();
    if (!label) return { ok: false, msg: "Name it: /save <number> <name>" };
    if (normalize(number).length < 4) return { ok: false, msg: "That's not a number" };
    c.phone.contacts[label] = String(number);
    return { ok: true, msg: `Saved ${number} as ${label}` };
}

function contactList(c) {
    if (!hasPhone(c)) return "You don't have a phone";
    const entries = Object.entries(c.phone.contacts);
    if (entries.length === 0) return "No contacts. /save <number> <name>";
    return ["--- Contacts ---", ...entries.map(([name, number]) => `${name} — ${number}`)].join("\n");
}

module.exports = { AREA_CODES, KEEP_TEXTS, MAX_TEXT, normalize, hasPhone, makeNumber, describe, nameFor, sendText, inbox, saveContact, contactList };
