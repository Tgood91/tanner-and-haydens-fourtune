// ============================================================
// shops.js — buy items with cash or card
// Every check happens BEFORE anything changes: the shop sells it,
// you can afford it, AND it fits in your bag. Only then is money
// taken and the item given — so you can never pay and get nothing.
//
// Shop coords and prices are placeholders: walk them in-game and tune.
// No weapons for sale — that's a separate decision.
// ============================================================

const inventory = require("./inventory");
const economy = require("./economy");
const { distance } = require("./cities");

const SHOP_RANGE = 3.0; // metres from the counter

const STOCK_247 = { water: 5, sandwich: 8, coffee: 4, donut: 3, halfhalf: 6, bandage: 25 };
// Halfway Diner: food and coffee, nothing else
const STOCK_DINER = { coffee: 3, sandwich: 7, donut: 2, halfhalf: 5, water: 4 };
const STOCK_HARDWARE = { repairkit: 350, toolbox: 200, lockpick: 75, fuelcan: 60, radio: 150, phone: 300 };
// Ammo: dollars per box.
const STOCK_AMMUNATION = { ammo_9mm: 75, ammo_45acp: 120, ammo_762: 150, ammo_12ga: 90, ammo_308: 250 };
// Guns: GOLD each (earned by working — see economy.js), and only with a
// weapon license (licenses.js). Weights are in inventory.js.
// At ~45 gold per on-duty paycheck, a Glizzy is about 10 paychecks (5 hours) of work.
const GUNS_AMMUNATION = { glizzy: 444, pumpshotgun: 750, uzi: 900, huntingrifle: 1200, chopper: 1500 };

const SHOPS = {
    atl_247:      { label: "Open 24 Atlanta",       city: "atlanta", pos: { x: 25.7,   y: -1347.3, z: 29.5 }, items: STOCK_247 },
    atl_hardware: { label: "Atlanta Hardware",   city: "atlanta", pos: { x: 45.0,   y: -1748.0, z: 29.6 }, items: STOCK_HARDWARE },
    gp_247:       { label: "Open 24 GeePee",        city: "geepee",  pos: { x: 1698.0, y: 4924.0,  z: 42.1 }, items: STOCK_247 },
    chi_247:      { label: "Open 24 Chicago",       city: "chicago", pos: { x: -440.0, y: 6005.0,  z: 31.7 }, items: STOCK_247 },
    chi_hardware: { label: "Chicago Hardware",   city: "chicago", pos: { x: -420.0, y: 6025.0,  z: 31.5 }, items: STOCK_HARDWARE },
    atl_bigbackin: { label: "BigBackin' Bell",  city: "atlanta", pos: { x: 141.0,  y: -673.0,  z: 36.6 }, items: STOCK_247 },
    atl_genfools:  { label: "General Fools",    city: "atlanta", pos: { x: -707.0, y: -900.0,  z: 19.2 }, items: STOCK_247 },
    // Sat near the stock gun-shop counters in the base game — walk them and tune
    atl_ammu:     { label: "Shooters Armoury", city: "atlanta", pos: { x: 22.0,   y: -1110.0, z: 29.8 }, items: STOCK_AMMUNATION, goldItems: GUNS_AMMUNATION, goldNeedsLicense: "weapon", sellsLicenses: ["weapon"] },
    gp_ammu:      { label: "Gunworks GeePee",  city: "geepee",  pos: { x: 1693.4, y: 3759.5,  z: 34.7 }, items: STOCK_AMMUNATION, goldItems: GUNS_AMMUNATION, goldNeedsLicense: "weapon", sellsLicenses: ["weapon"] },
    // Halfway. HEIGHT (z) IS UNKNOWN: nobody has stood here yet, so these can't be used
    // until someone walks them and sets z (/mark, docs/WALK-LIST.md)
    hw_diner:     { label: "Halfway Diner",     city: "atlanta", pos: { x: 622.0,  y: 1530.0,  z: 0 }, items: STOCK_DINER },
    hw_feedseed:  { label: "Halfway Feed & Seed", city: "atlanta", pos: { x: 578.0, y: 1395.0, z: 0 }, items: STOCK_HARDWARE },
    chi_ammu:     { label: "Gunworks Chicago", city: "chicago", pos: { x: -330.2, y: 6083.9,  z: 31.5 }, items: STOCK_AMMUNATION, goldItems: GUNS_AMMUNATION, goldNeedsLicense: "weapon", sellsLicenses: ["weapon"] },
};

function findShopNear(pos) {
    for (const [id, shop] of Object.entries(SHOPS)) {
        if (distance(pos, shop.pos) <= SHOP_RANGE) return { id, shop };
    }
    return null;
}

function listShop(shop) {
    const lines = [`--- ${shop.label} ---`];
    for (const [item, price] of Object.entries(shop.items)) {
        lines.push(`${inventory.ITEMS[item].label} (${item}) — ${economy.money(price)}`);
    }
    for (const [item, gold] of Object.entries(shop.goldItems || {})) {
        const def = inventory.ITEMS[item];
        lines.push(`${def.label} (${item}) — ${gold} gold, ${def.weight} kg`);
    }
    return lines.join("\n");
}

function buyWithGold(c, shop, item, count) {
    if (shop.goldNeedsLicense && !c.licenses[shop.goldNeedsLicense]) {
        return { ok: false, msg: `You need a ${shop.goldNeedsLicense} license first — /buylicense ${shop.goldNeedsLicense}` };
    }
    if (!inventory.isValidCount(count)) return { ok: false, msg: "Count must be a whole number above 0" };
    const total = shop.goldItems[item] * count;
    if (c.gold < total) return { ok: false, msg: `Not enough gold — ${count}x costs ${total} gold, you have ${c.gold}` };
    const fits = inventory.canAddItem(c.inventory, item, count);
    if (!fits.ok) return fits;

    economy.removeGold(c, total);
    inventory.addItem(c.inventory, item, count);
    return { ok: true, msg: `Bought ${count}x ${inventory.ITEMS[item].label} for ${total} gold. Gold left: ${c.gold}` };
}

function buy(c, shop, item, count = 1, payWith = "cash") {
    // Gold-priced items always cost gold, whatever cash/bank choice was typed
    if (shop.goldItems?.[item] !== undefined) return buyWithGold(c, shop, item, count);

    const price = shop.items[item];
    if (price === undefined) return { ok: false, msg: `${shop.label} doesn't sell ${item}` };
    if (!inventory.isValidCount(count)) return { ok: false, msg: "Count must be a whole number above 0" };
    if (!economy.ACCOUNTS.includes(payWith)) return { ok: false, msg: "Pay with cash or bank" };

    const total = price * count;
    if (c[payWith] < total) {
        return { ok: false, msg: `Not enough ${payWith} — ${count}x costs ${economy.money(total)}, you have ${economy.money(c[payWith])}` };
    }
    const fits = inventory.canAddItem(c.inventory, item, count);
    if (!fits.ok) return fits;

    // All checks passed — now act. Neither of these can fail anymore.
    economy.removeMoney(c, payWith, total);
    inventory.addItem(c.inventory, item, count);
    return { ok: true, msg: `Bought ${count}x ${inventory.ITEMS[item].label} for ${economy.money(total)} (${payWith})` };
}

module.exports = { SHOPS, SHOP_RANGE, findShopNear, listShop, buy };
