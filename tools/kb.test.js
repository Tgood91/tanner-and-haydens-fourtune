// ============================================================
// kb.test.js — checks the knowledge base tool against the real repo
// Run it:  node --test tools/kb.test.js   (or npm test)
// ============================================================

const test = require("node:test");
const assert = require("node:assert/strict");
const kb = require("./kb");

const entries = kb.load();

test("loads the docs, the game core and the Lua resources, and skips images", () => {
    const paths = entries.map((e) => e.path);
    assert.ok(paths.includes("docs/RESOURCES.md"));
    assert.ok(paths.includes("js-snippets/game.js"));
    assert.ok(paths.includes("world/data.lua"));
    assert.ok(!paths.some((p) => p.endsWith(".png")));
    assert.ok(!paths.some((p) => p.startsWith(".git/")));
});

test("summary skips rulers and comment markers", () => {
    assert.equal(kb.summarize("// =====\n// hello there\n"), "hello there");
    assert.equal(kb.summarize("\n\n# Title\n"), "Title");
});

test("search needs every word and ranks the path match first", () => {
    const results = kb.search(entries, "inventory weight");
    assert.ok(results.length > 0);
    for (const r of results) {
        const t = (r.entry.text + r.entry.path).toLowerCase();
        assert.ok(t.includes("inventory") && t.includes("weight"));
    }
    // built at runtime so the word itself never appears in this file
    assert.equal(kb.search(entries, ["zzq", "qxx", "nowhere"].join("-")).length, 0);
    assert.equal(kb.search(entries, "   ").length, 0);
    assert.match(kb.search(entries, "inventory")[0].entry.path, /inventory/i);
});

test("find takes an exact path or part of one", () => {
    assert.equal(kb.find(entries, "docs/TUNING.md").path, "docs/TUNING.md");
    assert.equal(kb.find(entries, "resources.md").path, "docs/RESOURCES.md");
    assert.equal(kb.find(entries, "no-such-entry-anywhere"), null);
});

test("where names a coordinate the same way places.js does", () => {
    const places = require("../js-snippets/places.js");
    const zone = places.ZONES[0];
    assert.equal(kb.where(zone.center.x, zone.center.y, zone.center.z || 0), places.describe(zone.center));
    assert.equal(kb.where("abc", 1), null);
});

test("stats counts entries and the world", () => {
    const s = kb.stats(entries);
    assert.equal(s.entries, entries.length);
    assert.ok(s.world.roads > 0 && s.world.zones > 0 && s.world.shops > 0);
});

test("CLI returns 0 on success and 1 on a bad command", () => {
    const quiet = () => {};
    assert.equal(kb.main(["stats"], quiet, quiet), 0);
    assert.equal(kb.main(["search", "spawn"], quiet, quiet), 0);
    assert.equal(kb.main(["show"], quiet, quiet), 1);
    assert.equal(kb.main(["bogus"], quiet, quiet), 1);
});
