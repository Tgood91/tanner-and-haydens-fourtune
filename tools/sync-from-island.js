#!/usr/bin/env node
// ============================================================
// sync-from-island.js — keep this repo and fourtune-island in step
//
//   node tools/sync-from-island.js                  (island -> here)
//   node tools/sync-from-island.js --to-island      (here -> island: the street data it fits from)
//   node tools/sync-from-island.js --island "<path>" [--dry-run]
//
// island -> here: the two files this repo's resources use, which the island generates:
//   world/streets_geo.lua           every island street, for the world resource
//   world-map/html/index.html       the in-game map page, for the world-map resource
// here -> island: js-snippets/places.js and cities.js, which the island map fits its
//   312 / 770 / 1017 streets from. Regenerate and commit in fourtune-island afterwards.
//
// The island checkout is found by tools/island-path.js.
// ============================================================
const fs = require("fs");
const path = require("path");
const { islandPath } = require("./island-path");

const REPO = path.resolve(__dirname, "..");
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const toIsland = args.includes("--to-island");
const island = islandPath(args);

if (!island.found) {
    console.error(`\n✗ No fourtune-island checkout at ${island.path}\n  Clone https://github.com/Tgood91/fourtune-island next to this repo, or pass --island "<path>".`);
    process.exit(1);
}

const FILES = toIsland
    ? ["js-snippets/places.js", "js-snippets/cities.js"].map((f) => [path.join(REPO, f), path.join(island.path, f)])
    : ["world/streets_geo.lua", "world-map/html/index.html"].map((f) => [path.join(island.path, f), path.join(REPO, f)]);

let changed = 0;
for (const [from, to] of FILES) {
    if (!fs.existsSync(from)) { console.log(`  missing: ${from}`); continue; }
    const same = fs.existsSync(to) && fs.readFileSync(from).equals(fs.readFileSync(to));
    console.log(`  ${same ? "same    " : "update  "} ${path.relative(toIsland ? island.path : REPO, to)}`);
    if (!same) { changed++; if (!dryRun) { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(from, to); } }
}
console.log(dryRun ? "\nDry run — nothing copied." : changed ? `\n✓ ${changed} file(s) copied.${toIsland ? " Now regenerate and commit in fourtune-island (its README)." : " Commit them here."}` : "\n✓ Already in step.");
