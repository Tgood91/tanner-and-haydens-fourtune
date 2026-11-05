#!/usr/bin/env node
// ============================================================
// tools/gen-atlas.js — one map of every plot we've coded, from every session
//
//   node tools/gen-atlas.js > docs/atlas.html          (or: npm run gen:atlas)
//   node tools/gen-atlas.js --fragment > atlas.html    (no <html>/<body> wrapper)
//   node tools/gen-atlas.js --sources                  (just print where each file came from)
//
// Every session pushes to its own branch, so the newest plots aren't always on
// this one. For each source file this looks at the current branch AND every
// origin/* branch, and takes the version with the newest commit. (Run
// `git fetch origin` first to see the latest.) When the newest is the same as
// what's checked out, the working tree is used, so local edits show up.
//
// Two views, because the game has two maps of the same three cities:
//   Game world  GTA coordinates from js-snippets: districts, parks, roads, stores,
//               gun shops, fuel, clothing, hospitals, spawns, houses, impound lots,
//               job stations, supply spots, the jail, and the city borders
//   The island  the custom landmass: its coastline (tools/gen-island-map.py),
//               every street (street-renders/streets.json) and every building
//               (island-buildings/buildings.json), over the island concept art
//               itself (island-map.html: ships, docks, farms, woods, towers)
//
// The game world also gets a Scenery layer: generated town streets, buildings,
// fields, woods, roads between the cities and ships offshore. It is illustration
// only, drawn where nothing has been coded yet, and can be switched off.
//
// Plain Node, no installs. Without git it just reads the working tree.
// ============================================================

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const args = process.argv.slice(2);
const FRAGMENT = args.includes("--fragment");

// ------------------------------------------------------------ git: newest version of each file
function git(argv) {
    try {
        return execFileSync("git", argv, { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 28, stdio: ["ignore", "pipe", "ignore"] });
    } catch {
        return null;
    }
}

const REFS = (() => {
    const out = git(["for-each-ref", "--format=%(refname:short)", "refs/remotes/origin"]);
    if (out === null) return [];
    const others = out.split("\n").map((s) => s.trim()).filter((r) => r && r !== "origin" && r !== "origin/HEAD");
    return ["HEAD", ...others];          // HEAD first, so it wins ties
})();
const BRANCH = (git(["rev-parse", "--abbrev-ref", "HEAD"]) || "working tree").trim();

const sources = [];                      // what the map shows on its Sources list

function read(file) {
    const disk = path.join(ROOT, file);
    let best = null;
    for (const ref of REFS) {
        const t = Number((git(["log", "-1", "--format=%ct", ref, "--", file]) || "").trim());
        if (t && (!best || t > best.t)) best = { ref, t };
    }
    const onDisk = fs.existsSync(disk) ? fs.readFileSync(disk, "utf8") : null;
    if (!best) {
        if (onDisk === null) return null;
        sources.push({ file, from: "working tree", commit: "", date: "" });
        return onDisk;
    }
    const blob = git(["show", `${best.ref}:${file}`]);
    const head = git(["show", `HEAD:${file}`]);
    const info = (git(["log", "-1", "--format=%h|%cs|%s", best.ref, "--", file]) || "||").trim().split("|");
    const useDisk = onDisk !== null && (best.ref === "HEAD" || blob === head);
    sources.push({
        file,
        from: useDisk ? BRANCH : best.ref.replace(/^origin\//, ""),
        commit: info[0],
        date: info[1],
        subject: info.slice(2).join("|"),
        elsewhere: !useDisk,
    });
    return useDisk ? onDisk : blob;
}

// ------------------------------------------------------------ the game world (js-snippets)
// Every js-snippets module, newest version of each, written to a temp folder so
// they can require each other like they do in the game.
const MODULES = ["places", "cities", "shops", "fuel", "appearance", "drugs", "houses", "impound", "jobs", "medical", "police", "spawns"];

function loadModules() {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-"));
    try {
        const names = new Set(fs.readdirSync(path.join(ROOT, "js-snippets")).filter((f) => f.endsWith(".js") && !f.endsWith(".test.js")));
        for (const f of names) {
            const quiet = !MODULES.includes(f.replace(/\.js$/, ""));
            const before = sources.length;
            const text = read(`js-snippets/${f}`);
            if (quiet) sources.length = before;            // only list the files the map draws from
            if (text !== null) fs.writeFileSync(path.join(tmp, f), text);
        }
        const mods = {};
        for (const m of MODULES) {
            try { mods[m] = require(path.join(tmp, `${m}.js`)); } catch (e) { console.error(`atlas: skipped ${m}.js (${e.message})`); }
        }
        return mods;
    } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
    }
}

const isPos = (o) => o && typeof o === "object" && typeof o.x === "number" && typeof o.y === "number";
const r1 = (v) => Math.round(v * 10) / 10;

// Walk any export and pull every {x,y} out of it, with the nearest label above it
function points(obj, cat, module, city) {
    const out = [];
    (function walk(o, label, key, cityHint, depth) {
        if (!o || typeof o !== "object" || depth > 5) return;
        if (isPos(o)) {
            out.push({ cat, module, name: label || key, city: cityHint || null, x: r1(o.x), y: r1(o.y), z: typeof o.z === "number" ? r1(o.z) : null });
            return;
        }
        const here = o.label || o.name || label;
        const c = o.city || cityHint;
        if (isPos(o.pos)) return walk(o.pos, here, key, c, depth + 1);
        if (isPos(o.cell)) return walk(o.cell, here || "Jail cell", key, c, depth + 1);
        for (const [k, v] of Object.entries(o)) {
            const kCity = ["atlanta", "geepee", "chicago"].includes(k) ? k : c;
            walk(v, here === label ? label : here, k, kCity, depth + 1);
        }
    })(obj, null, cat, city, 0);
    return out;
}

function world(m) {
    if (!m.places) return null;
    const P = m.places;
    const zones = P.ZONES.map((z) => ({ name: z.name, kind: z.kind, city: z.city, x: r1(z.center.x), y: r1(z.center.y), r: z.radius }));
    const roads = P.ROADS.map((r) => ({ name: r.name, code: r.code, kind: r.kind, city: r.city, width: r.width || null, pts: r.points.map((p) => [r1(p.x), r1(p.y)]) }));

    const pois = [];
    const add = (list) => pois.push(...list);
    if (m.shops) {
        for (const p of points(m.shops.SHOPS, "store", "shops.js")) {
            if (/ammu/i.test(p.name)) p.cat = "gun";
            pois.push(p);
        }
    }
    if (m.fuel) add(points(m.fuel.GAS_STATIONS, "fuel", "fuel.js"));
    if (m.appearance) add(points(m.appearance.SHOPS, "clothing", "appearance.js"));
    if (m.medical) add(points(m.medical.HOSPITALS, "hospital", "medical.js"));
    if (m.spawns) add(points(m.spawns.SPAWNS, "spawn", "spawns.js"));
    if (m.houses) add(points(m.houses.HOUSES, "house", "houses.js"));
    if (m.impound) add(points(m.impound.LOTS, "impound", "impound.js"));
    if (m.drugs) add(points(m.drugs.SUPPLY_SPOTS, "supply", "drugs.js"));
    if (m.police) add(points(m.police.JAIL, "jail", "police.js").map((p) => ({ ...p, name: "Jail cell" })));
    if (m.jobs) {
        for (const [id, job] of Object.entries(m.jobs.JOBS)) {
            for (const p of points(job, "job", "jobs.js")) {
                p.name = `${job.label || id}${p.name && p.name !== job.label ? ` — ${p.name}` : ""}`;
                pois.push(p);
            }
        }
    }
    // Name each point's city the way the game does, when its file didn't say
    if (m.cities) for (const p of pois) if (!p.city) p.city = m.cities.cityAt({ x: p.x, y: p.y, z: 0 });

    const borders = m.cities ? [
        { name: "Chicago starts", y: m.cities.CHICAGO_STARTS_AT_Y },
        { name: "GeePee starts", y: m.cities.GEEPEE_STARTS_AT_Y },
    ] : [];
    // Towns drawn on the map but not in the game yet (docs/planned-towns.json)
    let planned = [];
    const pt = read("docs/planned-towns.json");
    if (pt) try { planned = JSON.parse(pt).towns || []; } catch (e) { console.error(`atlas: skipped planned-towns.json (${e.message})`); }
    return { zones, roads, pois, borders, planned };
}

// ------------------------------------------------------------ the island
function catmull(pts) {
    const n = pts.length, out = [];
    for (let i = 0; i < n; i++) {
        const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
        for (let s = 0; s < 8; s++) {
            const t = s / 8, t2 = t * t, t3 = t2 * t;
            const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
            out.push([r1(f(p0[0], p1[0], p2[0], p3[0])), r1(f(p0[1], p1[1], p2[1], p3[1]))]);
        }
    }
    return out;
}

function island() {
    const py = read("tools/gen-island-map.py");
    const streetsRaw = read("street-renders/streets.json");
    const bldgRaw = read("island-buildings/buildings.json");
    const roadsIdx = read("island-roads/xml/roads-index.json");
    const artHtml = read("island-map.html");
    if (!py && !streetsRaw && !bldgRaw && !artHtml) return null;

    // The island concept map itself (ships, docks, farms, woods, towers, traffic), drawn
    // on the same 1500 x 1000 units, embedded whole as the island's ground layer
    let artwork = null;
    if (artHtml) {
        const a = artHtml.indexOf('<svg id="island"'), b = artHtml.indexOf("</svg>", a);
        if (a >= 0 && b > a) {
            let svg = artHtml.slice(a, b + 6).replace(/^<svg id="island"/, '<svg width="1500" height="1000"');
            // its page hides labels and markers with CSS; carry just that across
            svg = svg.replace(/(<svg[^>]*>)/, "$1<style>.name,.marker,.pulse{display:none}</style>");
            artwork = "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64");
        }
    }

    let outline = null, mountain = null;
    if (py) {
        const m = py.match(/^ISLAND\s*=\s*\[([\s\S]*?)\]/m);
        if (m) outline = catmull([...m[1].matchAll(/\((-?[\d.]+)\s*,\s*(-?[\d.]+)\)/g)].map((x) => [+x[1], +x[2]]));
        const mm = py.match(/^MOUNTAIN\s*=\s*\((-?[\d.]+)\s*,\s*(-?[\d.]+)\)/m);
        if (mm) mountain = [+mm[1], +mm[2]];
    }

    const streets = streetsRaw ? JSON.parse(streetsRaw).map((s) => ({
        name: s.name, code: s.code, kind: s.kind, note: s.note || "", length: s.length,
        city: (s.code || "").split("-")[0], pts: s.points.map(([x, y]) => [r1(x), r1(y)]),
    })) : [];

    // Buildings are stored in world metres; bring them onto the map's 1500 x 1000 units
    let buildings = [], cfg = { centre: { x: -5500, y: -6500 }, metresPerUnit: 2 };
    if (roadsIdx) try { cfg = JSON.parse(roadsIdx).config || cfg; } catch {}
    const toMap = ([x, y]) => [r1(750 + (x - cfg.centre.x) / cfg.metresPerUnit), r1(500 - (y - cfg.centre.y) / cfg.metresPerUnit)];
    if (bldgRaw) {
        const b = JSON.parse(bldgRaw);
        buildings = b.buildings.map((x) => ({ type: x.type, name: x.label, floors: x.floors || null, height: x.top != null && x.base != null ? Math.round(x.top - x.base) : null, pts: x.footprint.map(toMap), world: x.footprint[0] }));
    }
    return { outline, mountain, streets, buildings, cfg, artwork };
}

// ------------------------------------------------------------ build
const mods = loadModules();
const DATA = { world: world(mods), island: island(), sources, generated: new Date().toISOString().slice(0, 10), branch: BRANCH, refs: REFS.length };

if (args.includes("--sources")) {
    for (const s of sources) console.log(`${s.file.padEnd(36)} ${s.from}${s.commit ? ` @ ${s.commit} ${s.date}` : ""}${s.elsewhere ? "   <- newer on another branch" : ""}`);
    process.exit(0);
}

const template = fs.readFileSync(path.join(__dirname, "atlas-template.html"), "utf8");
const page = template.replace("/*__DATA__*/null", () => JSON.stringify(DATA));
process.stdout.write(FRAGMENT ? page : `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n</head>\n<body>\n${page}\n</body>\n</html>\n`);
