// ============================================================
// appearance.js — clothes, and the five outfits you keep
//
// Clothing is the one system here that changes nothing mechanical and
// still matters: it is how a character is recognised. So it is kept
// cheap in money and expensive in trips — you can only change at a
// shop, or in front of a door you hold a key to.
//
// A look is six slot numbers, nothing more. The slot NUMBER is what
// the game draws, so the platform turns { top: 7 } into whatever
// component index that is on the ped. Zero means nothing worn, and
// only the three accessory slots allow it — you are not going out
// with no legs.
//
// Masks are the exception to "changes nothing": isMasked(c) is here
// for the systems that care who was seen, so a mask can mean something
// later without this file knowing about them.
//
// Every price, variant count and coordinate is a placeholder. Shop
// names are made up on purpose — nothing here borrows a real one.
// ============================================================

const economy = require("./economy");
const { distance } = require("./cities");

const SHOP_RANGE = 6.0;
const MAX_OUTFITS = 5;

// price is per change in that slot, whatever you change it to
const SLOTS = {
    top:     { label: "Top",     variants: 24, price: 180, bare: false },
    legs:    { label: "Legs",    variants: 18, price: 140, bare: false },
    shoes:   { label: "Shoes",   variants: 16, price: 160, bare: false },
    hat:     { label: "Hat",     variants: 12, price: 90,  bare: true },
    glasses: { label: "Glasses", variants: 10, price: 70,  bare: true },
    mask:    { label: "Mask",    variants: 14, price: 120, bare: true },
};

const SHOPS = [
    { label: "Northline Threads",  city: "chicago", pos: { x: -162, y: 6380, z: 31.6 } },
    { label: "Lakeshore Tailors",  city: "chicago", pos: { x: -102, y: 6142, z: 31.9 } },
    { label: "Southline Surplus",  city: "atlanta", pos: { x: 42,   y: -1532, z: 29.4 } },
    { label: "Alder Dry Goods",    city: "atlanta", pos: { x: -238, y: -962, z: 31.3 } },
];

const DEFAULT_LOOK = { top: 1, legs: 1, shoes: 1, hat: 0, glasses: 0, mask: 0 };

function shopNear(pos) {
    if (!pos) return null;
    return SHOPS.find((s) => distance(pos, s.pos) <= SHOP_RANGE) || null;
}

function listShops() {
    const lines = ["--- Clothing ---"];
    for (const s of SHOPS) lines.push(`${s.label} — ${s.city}`);
    lines.push("--- Slots ---");
    for (const [slot, meta] of Object.entries(SLOTS)) {
        lines.push(`${slot} — 1-${meta.variants}${meta.bare ? " or 0 for none" : ""}, ${economy.money(meta.price)}`);
    }
    return lines.join("\n");
}

// A saved look from the API can be anything; take only what fits.
function cleanLook(saved) {
    const look = { ...DEFAULT_LOOK };
    for (const [slot, meta] of Object.entries(SLOTS)) {
        const want = Math.round(Number(saved?.[slot]));
        if (!Number.isFinite(want)) continue;
        const floor = meta.bare ? 0 : 1;
        if (want >= floor && want <= meta.variants) look[slot] = want;
    }
    return look;
}

function cleanOutfits(saved) {
    const out = {};
    for (const [name, look] of Object.entries(saved || {})) {
        if (Object.keys(out).length >= MAX_OUTFITS) break;
        out[String(name).slice(0, 16)] = cleanLook(look);
    }
    return out;
}

function wearing(c) {
    if (!c.look) c.look = { ...DEFAULT_LOOK };
    return c.look;
}

function isMasked(c) {
    return wearing(c).mask > 0;
}

function describe(c) {
    const look = wearing(c);
    const lines = ["--- You're wearing ---"];
    for (const [slot, meta] of Object.entries(SLOTS)) {
        lines.push(`${meta.label}: ${look[slot] === 0 ? "none" : `#${look[slot]}`}`);
    }
    return lines.join("\n");
}

// Changing one slot. `found` is the shop you're standing at, or null.
function change(c, found, slot, variant) {
    if (!found) return { ok: false, msg: "You're not at a clothing shop" };
    const meta = SLOTS[slot];
    if (!meta) return { ok: false, msg: `No slot called "${slot || ""}". /clothes lists them` };

    const want = Math.round(Number(variant));
    if (!Number.isFinite(want)) return { ok: false, msg: `Pick a number: /dress ${slot} 1-${meta.variants}` };
    const floor = meta.bare ? 0 : 1;
    if (want < floor || want > meta.variants) {
        return { ok: false, msg: `${meta.label} goes ${floor}-${meta.variants}` };
    }

    const look = wearing(c);
    if (look[slot] === want) return { ok: false, msg: `You're already wearing that ${meta.label.toLowerCase()}` };

    // Taking something off is free. Putting something on is not.
    if (want !== 0) {
        const paid = economy.removeMoney(c, "cash", meta.price);
        if (!paid.ok) return { ok: false, msg: `That's ${economy.money(meta.price)} — ${paid.msg}` };
    }

    look[slot] = want;
    return {
        ok: true,
        look,
        msg: want === 0 ? `Took your ${meta.label.toLowerCase()} off.` : `${meta.label} #${want} on. ${found.label} thanks you.`,
    };
}

// ---- outfits: a saved look you can put back on ----
function outfitsOf(c) {
    if (!c.outfits) c.outfits = {};
    return c.outfits;
}

function listOutfits(c) {
    const kept = outfitsOf(c);
    const names = Object.keys(kept);
    if (names.length === 0) return `No saved outfits. /saveoutfit <name> at a shop keeps one (${MAX_OUTFITS} max).`;
    return [`--- Outfits (${names.length}/${MAX_OUTFITS}) ---`, ...names].join("\n");
}

function saveOutfit(c, found, name) {
    if (!found) return { ok: false, msg: "You're not at a clothing shop" };
    const label = String(name || "").trim().slice(0, 16);
    if (!label) return { ok: false, msg: "Name it: /saveoutfit <name>" };

    const kept = outfitsOf(c);
    const exists = Object.prototype.hasOwnProperty.call(kept, label);
    if (!exists && Object.keys(kept).length >= MAX_OUTFITS) {
        return { ok: false, msg: `You keep ${MAX_OUTFITS} outfits. Drop one with /dropoutfit <name>` };
    }

    kept[label] = { ...wearing(c) };
    return { ok: true, msg: `${exists ? "Replaced" : "Saved"} "${label}".`, name: label };
}

// `somewhere` is true at a shop or at a door you hold a key to —
// game.js decides which, this file only cares that you're not in the street.
function wearOutfit(c, somewhere, name) {
    if (!somewhere) return { ok: false, msg: "Change at a clothing shop or at your own door" };
    const kept = outfitsOf(c);
    const label = String(name || "").trim();
    const found = Object.keys(kept).find((k) => k.toLowerCase() === label.toLowerCase());
    if (!found) return { ok: false, msg: `No outfit called "${label || ""}". /outfits lists yours` };

    c.look = { ...kept[found] };
    return { ok: true, msg: `Changed into "${found}".`, look: c.look };
}

function dropOutfit(c, name) {
    const kept = outfitsOf(c);
    const label = String(name || "").trim();
    const found = Object.keys(kept).find((k) => k.toLowerCase() === label.toLowerCase());
    if (!found) return { ok: false, msg: `No outfit called "${label || ""}"` };
    delete kept[found];
    return { ok: true, msg: `Dropped "${found}".` };
}

module.exports = {
    SHOP_RANGE, MAX_OUTFITS, SLOTS, SHOPS, DEFAULT_LOOK,
    shopNear, listShops, cleanLook, cleanOutfits, wearing, isMasked, describe,
    change, listOutfits, saveOutfit, wearOutfit, dropOutfit,
};
