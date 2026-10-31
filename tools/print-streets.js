// ============================================================
// tools/print-streets.js — every street the game knows, by city
//
//   node tools/print-streets.js            all cities
//   node tools/print-streets.js atlanta    one city (atlanta | geepee | chicago, or 1017 | 770 | 312)
//
// In game, /streets prints the same thing.
//
// Reads js-snippets/places.js, so it always matches the game.
// ============================================================

const places = require(`${__dirname}/../js-snippets/places.js`);

const want = (process.argv[2] || "all").toLowerCase();
const list = want === "all" ? ["chicago", "geepee", "atlanta"] : [places.cityNamed(want)];
if (!list[0]) {
    console.error(`No city called ${want}. Cities: atlanta, geepee, chicago (or 1017, 770, 312)`);
    process.exit(1);
}
// Same text the in-game /streets command prints.
console.log(list.map(places.listStreets).join("\n\n"));
