#!/usr/bin/env node
// ============================================================
// tools/kb.js — the crew knowledge base, from the command line
//
//   node tools/kb.js list                 every note, doc, lesson and resource, by area
//   node tools/kb.js search <words...>    find where something is written down (ranked)
//   node tools/kb.js show <name>          print one entry (part of its path is enough)
//   node tools/kb.js where <x> <y> [z]    name a coordinate: road, district, city
//   node tools/kb.js stats                how big the knowledge base is
//
// Or through npm:  npm run kb -- search inventory
//
// Everything is read live from the repo: the docs, the README notes, the Lua
// lessons, the ~/ workspace notes, the game core and the generated world data.
// Nothing is copied, so this never goes stale. Plain Node, no installs.
// ============================================================

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

// Folders and files that are not knowledge
const SKIP_DIRS = new Set([".git", "node_modules", "server"]);
const SKIP_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".zip", ".ytd", ".ydr", ".ydd", ".yft", ".ogg", ".mp3", ".lock"]);
const SKIP_FILES = new Set(["package-lock.json"]);
const MAX_BYTES = 2 * 1024 * 1024;

// What part of the knowledge base a file belongs to, from where it lives
function areaOf(rel) {
    const top = rel.split("/")[0];
    if (top === "docs") return "docs";
    if (top === "js-snippets") return "game core (JS)";
    if (top === "tools") return "tools";
    if (top === "~") return "workspace notes";
    if (top === ".github") return "ci";
    if (["world", "crew", "world-map"].includes(top)) return "resources (Lua)";
    if (rel.endsWith(".md") || top === "LICENSE") return "repo";
    if (/\.(html|css)$/.test(rel) || /map|preview/.test(rel)) return "maps & UI";
    return "notes & lessons";
}

// A file is text if its first 4 KB has no NUL byte
function isText(buf) {
    return !buf.subarray(0, 4096).includes(0);
}

// Walk the repo and load every text file as an entry
function load(root = ROOT) {
    const entries = [];
    (function walk(dir) {
        for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, d.name);
            if (d.isDirectory()) {
                if (!SKIP_DIRS.has(d.name)) walk(full);
                continue;
            }
            if (!d.isFile()) continue;
            if (SKIP_FILES.has(d.name) || SKIP_EXT.has(path.extname(d.name).toLowerCase())) continue;
            const stat = fs.statSync(full);
            if (stat.size === 0 || stat.size > MAX_BYTES) continue;
            const buf = fs.readFileSync(full);
            if (!isText(buf)) continue;
            const rel = path.relative(root, full).split(path.sep).join("/");
            const text = buf.toString("utf8");
            entries.push({ path: rel, area: areaOf(rel), text, lines: text.split(/\r?\n/), summary: summarize(text) });
        }
    })(root);
    return entries.sort((a, b) => a.path.localeCompare(b.path));
}

// The first line that says something: skips blanks, rulers and comment noise
function summarize(text) {
    for (const raw of text.split(/\r?\n/)) {
        const line = raw
            .replace(/^\s*(\/\/+|--+|#+|<!--|\*|•)\s*/, "")
            .replace(/-->\s*$/, "")
            .trim();
        if (!line || /^[=\-#_*~│┌└─\s]+$/.test(line) || /^<!doctype|^<html|^<meta|^"use strict"/i.test(line)) continue;
        return line.length > 90 ? line.slice(0, 87) + "..." : line;
    }
    return "";
}

function terms(query) {
    return String(query).toLowerCase().split(/\s+/).filter(Boolean);
}

// Rank entries: every word must appear somewhere; hits in the path count most,
// then lines that hold more of the words, then plain hit counts.
function search(entries, query, { limit = 10, perFile = 3 } = {}) {
    const words = terms(query);
    if (!words.length) return [];
    const results = [];
    for (const e of entries) {
        const lower = e.text.toLowerCase();
        const p = e.path.toLowerCase();
        if (!words.every((w) => lower.includes(w) || p.includes(w))) continue;
        let score = 0;
        for (const w of words) {
            if (p.includes(w)) score += 25;
            score += Math.min(lower.split(w).length - 1, 20);
        }
        const hits = [];
        e.lines.forEach((line, i) => {
            const l = line.toLowerCase();
            const n = words.filter((w) => l.includes(w)).length;
            if (n) hits.push({ line: i + 1, text: line.trim(), n });
        });
        hits.sort((a, b) => b.n - a.n || a.line - b.line);
        if (hits.length && hits[0].n === words.length) score += 10 * words.length;
        results.push({ entry: e, score, hits: hits.slice(0, perFile) });
    }
    return results.sort((a, b) => b.score - a.score || a.entry.path.localeCompare(b.entry.path)).slice(0, limit);
}

// Exact path first, then the shortest path that contains the name
function find(entries, name) {
    const n = String(name).toLowerCase().replace(/\\/g, "/");
    const exact = entries.find((e) => e.path.toLowerCase() === n);
    if (exact) return exact;
    const matches = entries.filter((e) => e.path.toLowerCase().includes(n));
    return matches.sort((a, b) => a.path.length - b.path.length)[0] || null;
}

function groupByArea(entries) {
    const groups = {};
    for (const e of entries) (groups[e.area] = groups[e.area] || []).push(e);
    return groups;
}

// Name a coordinate the same way the game does (places.js)
function where(x, y, z = 0) {
    const places = require(path.join(ROOT, "js-snippets", "places.js"));
    const pos = { x: Number(x), y: Number(y), z: Number(z) };
    if (![pos.x, pos.y, pos.z].every(Number.isFinite)) return null;
    return places.describe(pos);
}

function stats(entries) {
    const groups = groupByArea(entries);
    const lines = entries.reduce((n, e) => n + e.lines.length, 0);
    const places = require(path.join(ROOT, "js-snippets", "places.js"));
    const { SHOPS } = require(path.join(ROOT, "js-snippets", "shops.js"));
    return {
        entries: entries.length,
        lines,
        areas: Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, v.length])),
        world: { zones: places.ZONES.length, roads: places.ROADS.length, shops: Object.keys(SHOPS).length },
    };
}

// ------------------------------------------------------------
// CLI
// ------------------------------------------------------------
const USAGE = `Usage:
  kb list                 every entry, by area
  kb search <words...>    find where something is written down
  kb show <name>          print one entry (part of its path is enough)
  kb where <x> <y> [z]    name a coordinate the way the game does
  kb stats                size of the knowledge base`;

function main(argv, out = console.log, err = console.error) {
    const [cmd, ...args] = argv;
    const entries = load();

    switch (cmd) {
        case "list": {
            for (const [area, list] of Object.entries(groupByArea(entries))) {
                out(`\n${area} (${list.length})`);
                for (const e of list) out(`  ${e.path.padEnd(42)} ${e.summary}`);
            }
            return 0;
        }
        case "search":
        case "s": {
            if (!args.length) { err("search what? e.g. kb search inventory weight"); return 1; }
            const results = search(entries, args.join(" "));
            if (!results.length) { out(`Nothing in the knowledge base mentions "${args.join(" ")}".`); return 1; }
            for (const r of results) {
                out(`\n${r.entry.path}  [${r.entry.area}]`);
                for (const h of r.hits) out(`  ${String(h.line).padStart(5)}: ${h.text.length > 110 ? h.text.slice(0, 107) + "..." : h.text}`);
            }
            return 0;
        }
        case "show": {
            if (!args.length) { err("show which entry? e.g. kb show RESOURCES"); return 1; }
            const e = find(entries, args.join(" "));
            if (!e) { err(`No entry matching "${args.join(" ")}". Try: kb list`); return 1; }
            out(`# ${e.path}  [${e.area}]\n`);
            out(e.text);
            return 0;
        }
        case "where": {
            const name = where(args[0], args[1], args[2] || 0);
            if (name === null) { err("where needs numbers: kb where <x> <y> [z]"); return 1; }
            out(name);
            return 0;
        }
        case "stats": {
            const s = stats(entries);
            out(`${s.entries} entries, ${s.lines} lines`);
            for (const [area, n] of Object.entries(s.areas)) out(`  ${area.padEnd(20)} ${n}`);
            out(`World: ${s.world.zones} districts/parks, ${s.world.roads} roads, ${s.world.shops} shops`);
            return 0;
        }
        default:
            (cmd ? err : out)(cmd ? `Unknown command "${cmd}".\n\n${USAGE}` : USAGE);
            return cmd ? 1 : 0;
    }
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));

module.exports = { ROOT, load, summarize, search, find, groupByArea, where, stats, main };
