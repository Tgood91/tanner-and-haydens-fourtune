// ============================================================
// tools/print-streets.js — every street the game knows, by city
//
//   node tools/print-streets.js            all cities
//   node tools/print-streets.js atlanta    one city (atlanta | geepee | chicago)
//
// Reads js-snippets/places.js, so it always matches the game.
// ============================================================

const places = require(`${__dirname}/../js-snippets/places.js`);
const cities = require(`${__dirname}/../js-snippets/cities.js`);

const CODE = { chicago: "312", geepee: "770", atlanta: "1017" };
const KINDS = ["highway", "arterial", "street", "backroad"];
const only = (process.argv[2] || "").toLowerCase();

let total = 0;
for (const city of ["chicago", "geepee", "atlanta"]) {
    if (only && only !== city) continue;
    const roads = places.ROADS.filter((r) => cities.cityAt(r.points[0]) === city);
    console.log(`\n${CODE[city]} ${cities.CITIES[city].label} — ${roads.length} roads`);
    for (const kind of KINDS) {
        const names = roads.filter((r) => r.kind === kind).map((r) => r.name);
        if (names.length) console.log(`  ${kind.padEnd(9)} (${names.length})  ${names.join(", ")}`);
    }
    total += roads.length;
}
if (only && !CODE[only]) {
    console.error(`No city called ${only}. Cities: atlanta, geepee, chicago`);
    process.exit(1);
}
console.log(`\n${total} roads`);
