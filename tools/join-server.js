#!/usr/bin/env node
// ============================================================
// join-server.js — copy your gta-rp-server folder into this repo, safely
//
// Run it on your PC from inside this repo:
//   node tools/join-server.js                          (uses ~/workspace/gta-rp-server)
//   node tools/join-server.js "C:\path\to\gta-rp-server"
//   node tools/join-server.js <path> --dry-run         (show what would happen, change nothing)
//
// What it does:
//   1. Copies the folder into server/ in this repo
//   2. Leaves out things that must never be on GitHub: .env files,
//      node_modules, FXServer cache/txData, logs, zips, keys
//   3. In .cfg files, blanks out the Cfx license key, rcon password,
//      Steam key and MySQL connection string (keeps the line, hides the value)
//   4. Scans everything it copied for anything else that looks like a secret.
//      If it finds one it STOPS and tells you the file and line.
//   5. Commits server/ — then you push.
//
// Plain Node, no installs. Works on Windows, Mac and Linux.
// ============================================================

const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");

const REPO = path.resolve(__dirname, "..");
const DEST = path.join(REPO, "server");

const SKIP_DIRS = new Set(["node_modules", ".git", "cache", "txData", "logs", "dist", "build"]);
const SKIP_FILE = [/^\.env(\..*)?$/i, /\.log$/i, /\.zip$/i, /\.pem$/i, /\.key$/i, /\.pfx$/i, /\.sqlite$/i, /\.db$/i];
const KEEP_FILE = [/^\.env\.example$/i]; // a template with no real values is fine

// .cfg lines whose VALUE gets blanked (setr / set / sets / plain)
const CFG_SECRETS = /^(\s*(?:set[rs]?\s+)?)(sv_licenseKey|rcon_password|steam_webApiKey|mysql_connection_string|sv_tebexSecret)(\s+)(.*)$/i;

// Anything that looks like a secret anywhere else -> stop and report
const SECRET_PATTERNS = [
    { name: "Cfx license key", re: /cfxk_[A-Za-z0-9_]{10,}/ },
    { name: "database URL with password", re: /(mysql|postgres(ql)?|mongodb(\+srv)?):\/\/[^:\s"']+:[^@\s"']+@/i },
    { name: "private key", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
    { name: "Discord bot token", re: /[MN][A-Za-z\d]{23,25}\.[\w-]{6}\.[\w-]{27,}/ },
    { name: "GitHub token", re: /gh[pousr]_[A-Za-z0-9]{36,}/ },
    { name: "hard-coded password/secret", re: /\b(password|passwd|secret|api_?key|token)\b\s*[:=]\s*["'][^"'\s]{6,}["']/i },
];

const TEXT_EXT = new Set([".js", ".ts", ".json", ".lua", ".cfg", ".md", ".sql", ".yml", ".yaml", ".txt", ".html", ".css", ".env", ".example", ".cmd", ".bat", ".ps1", ".sh"]);

// ---------------- args ----------------
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const source = path.resolve(
    (args.find((a) => !a.startsWith("--")) || path.join(os.homedir(), "workspace", "gta-rp-server")).replace(/^~(?=$|[\\/])/, os.homedir()),
);

function fail(msg) {
    console.error(`\n✗ ${msg}`);
    process.exit(1);
}

if (!fs.existsSync(source) || !fs.statSync(source).isDirectory()) {
    fail(`Can't find the server folder: ${source}\n  Pass the path: node tools/join-server.js "<path to gta-rp-server>"`);
}
if (path.resolve(source) === REPO || REPO.startsWith(path.resolve(source) + path.sep)) {
    fail("The source folder contains this repo — point it at gta-rp-server itself.");
}

// ---------------- 1+2. walk and pick files ----------------
const copied = [];
const skipped = [];

function walk(dir, rel = "") {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const from = path.join(dir, entry.name);
        const relPath = path.join(rel, entry.name);
        if (entry.isSymbolicLink()) { skipped.push(`${relPath} (link)`); continue; }
        if (entry.isDirectory()) {
            if (SKIP_DIRS.has(entry.name)) { skipped.push(`${relPath}/`); continue; }
            walk(from, relPath);
            continue;
        }
        const keep = KEEP_FILE.some((re) => re.test(entry.name));
        if (!keep && SKIP_FILE.some((re) => re.test(entry.name))) { skipped.push(relPath); continue; }
        copied.push(relPath);
    }
}
walk(source);

// ---------------- 3. read + redact ----------------
const redactions = [];
const files = copied.map((rel) => {
    const from = path.join(source, rel);
    const isText = TEXT_EXT.has(path.extname(rel).toLowerCase()) || path.basename(rel).startsWith(".");
    if (!isText) return { rel, data: fs.readFileSync(from) };

    let text = fs.readFileSync(from, "utf8");
    if (rel.toLowerCase().endsWith(".cfg")) {
        text = text.split(/\r?\n/).map((line, i) => {
            const m = line.match(CFG_SECRETS);
            if (!m || /^\s*#/.test(line)) return line;
            const value = m[4].trim();
            if (value === "" || value === '""' || /changeme|^<.*>$|^"?\$\{/.test(value)) return line;
            redactions.push(`${rel}:${i + 1} ${m[2]}`);
            return `${m[1]}${m[2]}${m[3]}"CHANGE_ME" # real value kept out of git — set it on the server`;
        }).join("\n");
    }
    return { rel, data: text, isText: true };
});

// ---------------- 4. scan ----------------
const findings = [];
for (const f of files) {
    if (!f.isText) continue;
    f.data.split(/\r?\n/).forEach((line, i) => {
        for (const p of SECRET_PATTERNS) {
            if (p.re.test(line)) findings.push(`${f.rel}:${i + 1}  looks like a ${p.name}`);
        }
    });
}

// ---------------- report ----------------
console.log(`Source:  ${source}`);
console.log(`Into:    ${DEST}`);
console.log(`Copying: ${files.length} files`);
console.log(`Left out (${skipped.length}): ${skipped.slice(0, 15).join(", ")}${skipped.length > 15 ? ", …" : ""}`);
if (redactions.length) console.log(`Blanked in .cfg files:\n  ${redactions.join("\n  ")}`);

if (findings.length) {
    fail(
        `Stopped — these lines look like secrets, so nothing was copied:\n  ${findings.join("\n  ")}\n\n` +
        "  Move each value into .env (which stays off GitHub) and read it with process.env, then run this again.",
    );
}

if (dryRun) {
    console.log("\nDry run — nothing copied. Run again without --dry-run to do it.");
    process.exit(0);
}

// ---------------- copy ----------------
if (fs.existsSync(DEST)) fs.rmSync(DEST, { recursive: true, force: true }); // server/ is always a fresh copy
for (const f of files) {
    const to = path.join(DEST, f.rel);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.writeFileSync(to, f.data);
}

// Make sure the repo itself never picks these up later
const ignorePath = path.join(REPO, ".gitignore");
const ignoreLines = ["node_modules/", ".env", ".env.*", "!.env.example", "*.log", "server/cache/", "server/txData/"];
const existing = fs.existsSync(ignorePath) ? fs.readFileSync(ignorePath, "utf8") : "";
const missing = ignoreLines.filter((l) => !existing.split(/\r?\n/).includes(l));
if (missing.length) fs.appendFileSync(ignorePath, (existing && !existing.endsWith("\n") ? "\n" : "") + missing.join("\n") + "\n");

// ---------------- 5. commit ----------------
function git(...gitArgs) {
    return execFileSync("git", gitArgs, { cwd: REPO, encoding: "utf8" }).trim();
}

try {
    git("add", "server", ".gitignore");
    const staged = git("diff", "--cached", "--name-only");
    if (!staged) {
        console.log("\n✓ Copied — nothing changed since the last join.");
        process.exit(0);
    }
    git("commit", "-m", "Join gta-rp-server into the repo (secrets left out)");
    const branch = git("rev-parse", "--abbrev-ref", "HEAD");
    console.log(`\n✓ Copied and committed on ${branch}. Look it over, then push:\n  git push -u origin ${branch}`);
} catch (err) {
    console.log(`\n✓ Copied into server/, but the commit didn't go through:\n  ${err.message.split("\n")[0]}\n  Commit it yourself with: git add server .gitignore && git commit`);
}
