// ============================================================
// tools/island-path.js — where the fourtune-island checkout is
//
// The island (map, terrain, roads, bridges, buildings, street list) lives in its own repo:
//   https://github.com/Tgood91/fourtune-island
// Tools here that need it look, in order, at:
//   --island "<path>"          on the command line
//   FOURTUNE_ISLAND=<path>     in the environment
//   ../fourtune-island         next to this repo (clone it there and nothing needs passing)
// ============================================================
const fs = require("fs");
const path = require("path");
const os = require("os");

const REPO = path.resolve(__dirname, "..");

function islandPath(argv = process.argv.slice(2)) {
    const i = argv.indexOf("--island");
    const given = (i >= 0 && argv[i + 1]) || process.env.FOURTUNE_ISLAND;
    const p = path.resolve((given || path.join(REPO, "..", "fourtune-island")).replace(/^~(?=$|[\\/])/, os.homedir()));
    return { path: p, found: fs.existsSync(path.join(p, "island-terrain")), given: !!given };
}

module.exports = { islandPath };
