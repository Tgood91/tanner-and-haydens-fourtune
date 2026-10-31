// ============================================================
// tools/print-stores.js — every store the game knows, by city
//
//   node tools/print-stores.js            all cities
//   node tools/print-stores.js atlanta    one city (atlanta | geepee | chicago, or 1017 | 770 | 312)
//   node tools/print-stores.js --stock    also list what each shop sells, with prices
//
// Shops and gun shops (shops.js), fuel stations (fuel.js) and clothing
// stores (appearance.js), each with where it is (places.js). The stock
// lines are the same text /shop prints in game.
// ============================================================

const B = `${__dirname}/../js-snippets/`;
const shops = require(`${B}shops.js`);
const fuel = require(`${B}fuel.js`);
const appearance = require(`${B}appearance.js`);
const places = require(`${B}places.js`);
const cities = require(`${B}cities.js`);

const args = process.argv.slice(2);
const withStock = args.includes("--stock");
const want = (args.find((a) => !a.startsWith("--")) || "all").toLowerCase();
const list = want === "all" ? ["chicago", "geepee", "atlanta"] : [places.cityNamed(want)];
if (!list[0]) {
    console.error(`No city called ${want}. Cities: atlanta, geepee, chicago (or 1017, 770, 312)`);
    process.exit(1);
}

const CODE = { chicago: "312", geepee: "770", atlanta: "1017" };
const where = (pos) => places.label(pos);   // the road, park or district it's on

const stores = [];
for (const shop of Object.values(shops.SHOPS)) {
    stores.push({ kind: shop.goldItems ? "Gun shops" : "Shops", label: shop.label, city: cities.cityAt(shop.pos), pos: shop.pos, shop });
}
for (const s of fuel.GAS_STATIONS) {
    stores.push({ kind: "Fuel", label: s.label, city: cities.cityAt(s.pos), pos: s.pos, note: `$${fuel.PRICE_PER_LITRE}/L` });
}
for (const s of appearance.SHOPS) {
    stores.push({ kind: "Clothing", label: s.label, city: cities.cityAt(s.pos), pos: s.pos });
}

let total = 0;
const out = [];
for (const city of list) {
    const here = stores.filter((s) => s.city === city);
    out.push(`${CODE[city]} ${cities.CITIES[city].label}: ${here.length} stores`);
    for (const kind of ["Shops", "Gun shops", "Fuel", "Clothing"]) {
        const ofKind = here.filter((s) => s.kind === kind);
        if (!ofKind.length) continue;
        out.push(`  ${kind}`);
        for (const s of ofKind) {
            out.push(`    ${s.label} — ${where(s.pos)}${s.note ? ` · ${s.note}` : ""}`);
            if (withStock && s.shop) {
                // listShop's first and last lines are its "--- Name ---" frame
                for (const line of shops.listShop(s.shop).split("\n").slice(1, -1)) out.push(`        ${line}`);
            }
        }
    }
    out.push("");
    total += here.length;
}
out.push(`${total} stores${withStock ? "" : "  (add --stock for what each shop sells)"}`);
console.log(out.join("\n"));
