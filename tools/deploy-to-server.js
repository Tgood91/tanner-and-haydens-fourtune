#!/usr/bin/env node
// ============================================================
// deploy-to-server.js — put this repo's resources into your FXServer, in one go
//
// Run it on your PC from inside this repo, after a git pull:
//   node tools/deploy-to-server.js "C:\txData\<server>"              (copy world + crew)
//   node tools/deploy-to-server.js "C:\txData\<server>" --dry-run    (show what would happen, change nothing)
//   node tools/deploy-to-server.js "C:\txData\<server>" --link       (link instead of copy — set up once,
//                                                                     after that git pull IS the deploy)
//   node tools/deploy-to-server.js "C:\txData\<server>" --with-fourtune   (also js-snippets -> fourtune)
//
// The path can be the server data folder (the one with server.cfg) or its resources/ folder.
//
// What it does:
//   1. Copies world/ and crew/ into resources/ under the same names
//      (and js-snippets/ as fourtune/ with --with-fourtune — the folder name is the resource name)
//   2. Replaces the old copy each time, so nothing stale is left behind.
//      It only ever replaces a folder that is one of these resources (has an fxmanifest.lua);
//      anything else in the way and it STOPS.
//   3. Leaves out node_modules, .git and tests — the server doesn't need them
//   4. Checks server.cfg for the ensure lines and warns about the known mistakes:
//      a missing ensure, ensure js-snippets (wrong name), and world + fourtune together
//      (they overlap — see docs/RESOURCES.md). It never edits server.cfg.
//   5. Prints what to type in the txAdmin console to load the new code.
//
// Plain Node, no installs. Works on Windows, Mac and Linux.
// ============================================================

const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");

const REPO = path.resolve(__dirname, "..");

// repo folder -> resource name. Lua was chosen, so fourtune is opt-in (docs/RESOURCES.md).
const RESOURCES = [
    { from: "world", name: "world" },
    { from: "crew", name: "crew" },
];
const FOURTUNE = { from: "js-snippets", name: "fourtune" };

const SKIP_DIRS = new Set(["node_modules", ".git"]);
const SKIP_FILE = [/\.test\.js$/i, /^test\.lua$/i, /\.log$/i, /^\.env(\..*)?$/i];

// ---------------- args ----------------
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const link = args.includes("--link");
const withFourtune = args.includes("--with-fourtune");
const target = args.find((a) => !a.startsWith("--"));

function fail(msg) {
    console.error(`\n✗ ${msg}`);
    process.exit(1);
}

if (!target) {
    fail('Tell it where the server is: node tools/deploy-to-server.js "<server data folder>"\n  (the folder with server.cfg in it — txAdmin shows it under System → CFG Editor)');
}

let serverDir = path.resolve(target.replace(/^~(?=$|[\\/])/, os.homedir()));
if (path.basename(serverDir).toLowerCase() === "resources") serverDir = path.dirname(serverDir);
const resourcesDir = path.join(serverDir, "resources");
const cfgPath = path.join(serverDir, "server.cfg");

if (!fs.existsSync(resourcesDir) || !fs.statSync(resourcesDir).isDirectory()) {
    fail(`No resources/ folder in ${serverDir}\n  Point it at the folder that has server.cfg and resources/ in it.`);
}

const wanted = withFourtune ? [...RESOURCES, FOURTUNE] : RESOURCES;

// ---------------- 1+2. plan each resource ----------------
const plan = [];
for (const r of wanted) {
    const src = path.join(REPO, r.from);
    const dest = path.join(resourcesDir, r.name);
    if (!fs.existsSync(path.join(src, "fxmanifest.lua"))) fail(`${r.from}/ has no fxmanifest.lua — is this the right repo?`);

    let state = "new";
    if (fs.existsSync(dest) || isLink(dest)) {
        if (isLink(dest)) {
            state = sameFolder(dest, src) ? "linked" : "link-elsewhere";
        } else if (fs.existsSync(path.join(dest, "fxmanifest.lua"))) {
            state = "replace";
        } else {
            fail(`resources/${r.name} is already there and isn't a resource (no fxmanifest.lua).\n  Move it out of the way yourself, then run this again.`);
        }
    }
    if (state === "link-elsewhere") {
        fail(`resources/${r.name} is a link to somewhere else: ${safeRealpath(dest)}\n  Remove that link yourself if it's stale, then run this again.`);
    }
    plan.push({ ...r, src, dest, state, files: link ? [] : listFiles(src) });
}

function isLink(p) {
    try { return fs.lstatSync(p).isSymbolicLink(); } catch { return false; }
}
function safeRealpath(p) {
    try { return fs.realpathSync(p); } catch { return "(broken link)"; }
}
function sameFolder(a, b) {
    return safeRealpath(a).toLowerCase() === path.resolve(b).toLowerCase();
}
function listFiles(dir, rel = "") {
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const relPath = path.join(rel, entry.name);
        if (entry.isSymbolicLink()) continue;
        if (entry.isDirectory()) {
            if (!SKIP_DIRS.has(entry.name)) out.push(...listFiles(path.join(dir, entry.name), relPath));
            continue;
        }
        if (!SKIP_FILE.some((re) => re.test(entry.name))) out.push(relPath);
    }
    return out;
}

// ---------------- 4. check server.cfg ----------------
const cfgWarnings = [];
let ensured = new Set();
if (fs.existsSync(cfgPath)) {
    const lines = fs.readFileSync(cfgPath, "utf8").split(/\r?\n/);
    ensured = new Set(
        lines.map((l) => l.match(/^\s*(?:ensure|start)\s+(\S+)/i)).filter(Boolean).map((m) => m[1].toLowerCase()),
    );
    for (const r of wanted) {
        if (!ensured.has(r.name)) cfgWarnings.push(`no "ensure ${r.name}" line — add it after ensure chat`);
    }
    if (ensured.has("js-snippets")) cfgWarnings.push('"ensure js-snippets" won\'t work — the resource is called fourtune');
    if (ensured.has("world") && (ensured.has("fourtune") || withFourtune)) {
        cfgWarnings.push("world and fourtune would both run — they register the same commands; pick one (docs/RESOURCES.md)");
    }
    if (ensured.has("sessionmanager") && !fs.existsSync(path.join(resourcesDir, "sessionmanager")) && !findResource("sessionmanager")) {
        cfgWarnings.push('"ensure sessionmanager" but there\'s no such resource — harmless, but you can delete that line');
    }
} else {
    cfgWarnings.push(`no server.cfg in ${serverDir} — couldn't check the ensure lines`);
}

// resources can sit one level down in [category] folders
function findResource(name) {
    for (const entry of fs.readdirSync(resourcesDir, { withFileTypes: true })) {
        if (entry.isDirectory() && entry.name.startsWith("[") && fs.existsSync(path.join(resourcesDir, entry.name, name))) return true;
    }
    return false;
}

// ---------------- report ----------------
let commit = "";
try {
    commit = execFileSync("git", ["log", "-1", "--format=%h %s (%cr)"], { cwd: REPO, encoding: "utf8" }).trim();
} catch { /* not a git checkout — fine */ }

console.log(`From:    ${REPO}${commit ? `\n         at ${commit}` : ""}`);
console.log(`Into:    ${resourcesDir}`);
console.log(`Mode:    ${link ? "link (one-time setup)" : "copy"}`);
for (const p of plan) {
    const what = {
        new: link ? "link (new)" : `copy ${p.files.length} files (new)`,
        replace: link ? "replace the copy with a link" : `replace with ${p.files.length} files`,
        linked: "already linked — git pull keeps it current, nothing to do",
    }[p.state];
    console.log(`  ${p.from.padEnd(12)} -> resources/${p.name.padEnd(9)} ${what}`);
}
if (cfgWarnings.length) console.log(`\nserver.cfg:\n  ! ${cfgWarnings.join("\n  ! ")}`);

if (dryRun) {
    console.log("\nDry run — nothing changed. Run again without --dry-run to do it.");
    process.exit(0);
}

// ---------------- copy / link ----------------
for (const p of plan) {
    if (p.state === "linked") continue;
    if (p.state === "replace") fs.rmSync(p.dest, { recursive: true, force: true }); // only ever a folder with our fxmanifest.lua
    if (link) {
        // a junction on Windows needs no admin rights; elsewhere a plain folder symlink
        fs.symlinkSync(p.src, p.dest, process.platform === "win32" ? "junction" : "dir");
        continue;
    }
    for (const rel of p.files) {
        const to = path.join(p.dest, rel);
        fs.mkdirSync(path.dirname(to), { recursive: true });
        fs.copyFileSync(path.join(p.src, rel), to);
    }
}

// ---------------- 5. what to type next ----------------
const changed = plan.filter((p) => p.state !== "linked");
console.log(`\n✓ ${link ? "Linked" : "Deployed"} ${plan.map((p) => p.name).join(", ")}.`);
console.log("\nIn the txAdmin Live Console, type:");
if (plan.some((p) => p.state === "new")) console.log("  refresh                      (so the server sees the new folders)");
// ensure starts a stopped resource and restarts a running one, so it's right either way
for (const p of changed.length ? changed : plan) {
    console.log(`  ensure ${p.name}${ensured.has(p.name) ? "" : "".padEnd(22 - p.name.length) + "(and add it to server.cfg)"}`);
}
console.log("\nThen copy any red lines from the console (or use its download-log button) and paste them in.");
