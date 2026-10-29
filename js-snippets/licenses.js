// ============================================================
// licenses.js — weapon license: buy it, show it, lose it
//
// - Bought with DOLLARS at any Gunworks (/buylicense weapon)
// - Gunworks won't sell a gun for gold without one (shops.js)
// - On-duty police can check it on a stop (/checklicense) from a few
//   metres away, no cuffs needed. They also see if a gun is OUT —
//   a gun in your hands is visible; one in your bag needs a /search
// - Police can revoke it (/revokelicense). Revoked = can't buy a new
//   one until the ban runs out (real time, so logging off doesn't
//   shorten it)
//
// The license doesn't stop you CARRYING a gun you already have —
// that's a crime for police to deal with, not something code blocks.
// Price and ban length are placeholders.
// ============================================================

const economy = require("./economy");
const police = require("./police");
const inventory = require("./inventory");

const LICENSES = {
    weapon: { label: "Weapon license", price: 2500, banHours: 24 },
};

function findLicense(text) {
    const key = (text || "weapon").toLowerCase();
    return LICENSES[key] ? key : null;
}

function hoursLeft(c, type, now) {
    const until = c.licenseBans[type];
    return until && until > now ? Math.ceil((until - now) / 3600000) : 0;
}

function status(c, type, now) {
    if (c.licenses[type]) return `${LICENSES[type].label}: VALID`;
    const banned = hoursLeft(c, type, now);
    if (banned) return `${LICENSES[type].label}: REVOKED (${banned}h before a new one can be bought)`;
    return `${LICENSES[type].label}: none`;
}

function listLicenses(c, now) {
    return Object.keys(LICENSES).map((type) => status(c, type, now)).join("\n");
}

// shop must be one that sells this license (shops.js sellsLicenses)
function buyLicense(c, shop, typeText, payWith, now) {
    const type = findLicense(typeText);
    if (!type) return { ok: false, msg: `No license called "${typeText}". Licenses: ${Object.keys(LICENSES).join(", ")}` };
    const lic = LICENSES[type];
    if (!shop || !shop.sellsLicenses?.includes(type)) return { ok: false, msg: `Buy a ${lic.label.toLowerCase()} at Gunworks` };
    if (c.licenses[type]) return { ok: false, msg: `You already have a ${lic.label.toLowerCase()}` };
    const banned = hoursLeft(c, type, now);
    if (banned) return { ok: false, msg: `Your ${lic.label.toLowerCase()} was revoked — ${banned}h until you can apply again` };
    if (!economy.ACCOUNTS.includes(payWith)) return { ok: false, msg: "Pay with cash or bank" };

    const paid = economy.removeMoney(c, payWith, lic.price);
    if (!paid.ok) return paid;
    c.licenses[type] = { issuedAt: now };
    return { ok: true, msg: `${lic.label} issued for ${economy.money(lic.price)} (${payWith})` };
}

// The traffic-stop check: license status, plus a gun if it's visibly out.
function check(officer, suspect, now) {
    const ok = police.checkOfficer(officer, suspect, police.FINE_REACH);
    if (!ok.ok) return ok;
    const gun = suspect.equipped ? `\nHolding: ${inventory.ITEMS[suspect.equipped].label}` : "";
    return { ok: true, msg: `--- ${suspect.name} ---\n${listLicenses(suspect, now)}${gun}` };
}

function revoke(officer, suspect, typeText, now) {
    const ok = police.checkOfficer(officer, suspect, police.FINE_REACH);
    if (!ok.ok) return ok;
    const type = findLicense(typeText);
    if (!type) return { ok: false, msg: `No license called "${typeText}"` };
    const lic = LICENSES[type];
    if (!suspect.licenses[type]) return { ok: false, msg: `${suspect.name} doesn't have a ${lic.label.toLowerCase()}` };

    delete suspect.licenses[type];
    suspect.licenseBans[type] = now + lic.banHours * 3600000;
    return { ok: true, msg: `Revoked ${suspect.name}'s ${lic.label.toLowerCase()} (${lic.banHours}h ban)`, label: lic.label, banHours: lic.banHours };
}

module.exports = { LICENSES, findLicense, listLicenses, buyLicense, check, revoke };
