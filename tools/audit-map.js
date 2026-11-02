// ============================================================
// tools/audit-map.js — glitch audit for the in-game map
//
//   node tools/audit-map.js
//
// Opens world-map/html/index.html the way the game does (hidden, then
// shown by message) in a headless browser and checks for every glitch
// we know how to measure. Exits 1 if any check fails.
//
// Needs Playwright with Chromium (a dev tool, not part of the server):
//   npm i -g playwright && npx playwright install chromium
// ============================================================

const path = require("path");
const { chromium } = require("playwright");
const places = require(path.join(__dirname, "..", "js-snippets", "places.js"));

const PAGE = "file://" + path.join(__dirname, "..", "world-map", "html", "index.html");
const results = [];
const check = (name, ok, detail = "") => results.push({ name, ok, detail });

(async () => {
    const browser = await chromium.launch();
    const errors = [];

    for (const [w, h] of [[1920, 1080], [2560, 1440], [1366, 768]]) {
        const page = await browser.newPage({ viewport: { width: w, height: h } });
        page.on("pageerror", (e) => errors.push(`${w}x${h}: ${e.message}`));
        page.on("console", (m) => m.type() === "error" && errors.push(`${w}x${h}: ${m.text()}`));
        await page.addInitScript(() => {
            window.__posts = [];
            window.GetParentResourceName = () => "world-map";
            window.fetch = (u, o) => { window.__posts.push([u.split("/").pop(), o && o.body]); return Promise.resolve({ json: () => ({ ok: true }) }); };
        });
        await page.goto(PAGE);
        const tag = `${w}x${h}`;

        // ---- lifecycle -------------------------------------------------------
        check(`${tag} hidden until the game opens it`, await page.evaluate(() => getComputedStyle(document.getElementById("app")).display === "none"));
        check(`${tag} posts ready on load`, await page.evaluate(() => window.__posts.some((p) => p[0] === "ready")));
        const open = () => page.evaluate(() => postMessage({ type: "map:visibility", payload: { visible: true } }, "*"));
        const close = () => page.evaluate(() => postMessage({ type: "map:visibility", payload: { visible: false } }, "*"));
        await open(); await page.waitForTimeout(120);
        await page.evaluate(() => postMessage({ type: "map:player", payload: { x: 262, y: -1240, heading: 90 } }, "*"));
        await page.keyboard.press("l"); await page.waitForTimeout(80);

        // ---- fits the screen -------------------------------------------------
        const fit = await page.evaluate(() => {
            const ul = document.querySelector(".legend");
            return { page: document.documentElement.scrollHeight <= innerHeight && document.documentElement.scrollWidth <= innerWidth,
                     legendScrolls: ul.scrollHeight > ul.clientHeight + 1 };
        });
        check(`${tag} map + legend fit the screen`, fit.page);
        if (h >= 1080) check(`${tag} legend shows every row without scrolling`, !fit.legendScrolls);

        if (w === 1920) {
            // ---- geometry: buildings never on a road -------------------------
            const geo = await page.evaluate(() => {
                const pts = [];
                for (const r of document.querySelectorAll("#roads path.road, #streets path.road")) {
                    const L = r.getTotalLength(), hw = parseFloat(r.getAttribute("stroke-width")) / 2;
                    for (let t = 0; t <= L; t += 1.5) { const q = r.getPointAtLength(t); pts.push([q.x, q.y, hw]); }
                }
                const box = (el) => { const b = el.getBBox(), m = el.getAttribute("transform");
                    if (!m) return [b.x, b.y, b.width, b.height];
                    const c = [b.x + b.width / 2, b.y + b.height / 2], r = Math.min(b.width, b.height) / 2;   // inscribed: a turned house's core
                    return [c[0] - r, c[1] - r, 2 * r, 2 * r]; };
                const onRoad = ([x, y, w, h]) => pts.some(([px, py, hw]) => px > x - hw && px < x + w + hw && py > y - hw && py < y + h + hw);
                const bad = [];
                for (const el of document.querySelectorAll("#buildings rect, .tower rect:nth-child(3)")) {
                    const b = box(el); if (onRoad(b)) bad.push(b.map((v) => Math.round(v)).join(","));
                }
                // ---- stations never on a road or a building -----------------
                const stations = [...document.querySelectorAll("#stations .station")].map((g) => { const r = g.getBoundingClientRect(); return r; });
                const buildingRects = [...document.querySelectorAll("#buildings rect, .tower rect:nth-child(3)")].map((e) => e.getBoundingClientRect());
                const hit = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
                const stationOnBuilding = stations.filter((s) => buildingRects.some((b) => hit(s, b))).length;
                return { buildingsOnRoads: bad, stationOnBuilding };
            });
            check("no building sits on a road", geo.buildingsOnRoads.length === 0, geo.buildingsOnRoads.slice(0, 5).join(" | "));
            check("no job station sits on a building", geo.stationOnBuilding === 0, `${geo.stationOnBuilding} overlapping`);

            // ---- depth: layers, shadows, footing ------------------------------
            const depth = await page.evaluate(() => {
                const svg = document.getElementById("island"), coast = document.getElementById("coast"), rock = document.getElementById("mountain-rock");
                const pt = svg.createSVGPoint();
                const inFill = (el, x, y) => { pt.x = x; pt.y = y; return el.isPointInFill(pt); };
                // 1. paint order: ground, then roads, then anything standing, then markings
                const order = ["fields", "streets", "roads", "buildings", "towers", "on-road", "stations", "names", "you"];
                const all = [...svg.querySelectorAll("*")];
                const idx = order.map((id) => all.indexOf(document.getElementById(id)));
                const orderOk = idx.every((v, i) => v >= 0 && (i === 0 || v > idx[i - 1]));
                // 2. tower shadows: all fall south-east, length set by floors, same scale within each district
                const scale = {}; let wrongWay = 0, offScale = 0;
                for (const g of document.querySelectorAll(".tower")) {
                    const [sh, body] = g.querySelectorAll("rect");
                    const dx = +sh.getAttribute("x") - +body.getAttribute("x"), dy = +sh.getAttribute("y") - +body.getAttribute("y");
                    const floors = +(g.querySelector("title").textContent.match(/(\d+) floors/) || [])[1];
                    const district = g.querySelector("title").textContent.split(" — ")[0];
                    if (!(dx > 0 && Math.abs(dx - dy) < 0.15)) wrongWay++;
                    const k = dx / floors; scale[district] = scale[district] || k;
                    if (Math.abs(k - scale[district]) > 0.002) offScale++;
                }
                // 3. every building stands on land, off the mountain's rock
                let offLand = 0, onRock = 0, n = 0;
                for (const el of document.querySelectorAll("#buildings rect, .tower rect:nth-child(2)")) {
                    const b = el.getBBox(), cx = b.x + b.width / 2, cy = b.y + b.height / 2; n++;
                    if (!inFill(coast, cx, cy)) offLand++;
                    if (inFill(rock, cx, cy)) onRock++;
                }
                // 4. ships float, planes sit on the airport
                let shipsAground = 0, planesOff = 0;
                for (const g of document.querySelectorAll("#docks > g")) {
                    const t = g.querySelector("title"); if (!t || !/ship|Tanker|Ferry|Boat/.test(t.textContent)) continue;
                    const b = g.getBBox(); pt.x = b.x + b.width / 2; pt.y = b.y + b.height / 2;
                    const c = pt.matrixTransform(g.getCTM()).matrixTransform(svg.getCTM().inverse());   // into map units
                    if (inFill(coast, c.x, c.y)) shipsAground++;
                }
                const ap = [...document.querySelectorAll("#airport path, #airport rect")].filter((e) => !e.closest("[transform]") && e.tagName === "path" && !e.getAttribute("transform"));
                for (const pl of document.querySelectorAll("#airport path[transform]")) {
                    const m = pl.getAttribute("transform").match(/translate\(([-\d.]+) ([-\d.]+)\)/);
                    if (!ap.some((a) => inFill(a, +m[1], +m[2]))) planesOff++;
                }
                // 5. no road runs over the rock face
                const overRock = [];
                for (const r of document.querySelectorAll("#roads path.road, #streets path.road")) {
                    const L = r.getTotalLength(); let hits = 0;
                    for (let t = 0; t <= L; t += 3) { const q = r.getPointAtLength(t); if (inFill(rock, q.x, q.y)) hits++; }
                    if (hits > 1) overRock.push(r.querySelector("title").textContent.split(" · ")[0]);
                }
                return { orderOk, idx, wrongWay, offScale, offLand, onRock, n, shipsAground, planesOff, overRock };
            });
            check("layers stack right: ground, roads, buildings, traffic, stations, names, you", depth.orderOk, depth.idx.join(" < "));
            check("every tower's shadow falls the same way (south-east)", depth.wrongWay === 0, `${depth.wrongWay} off`);
            check("tower shadows match their height (same scale in each district)", depth.offScale === 0, `${depth.offScale} off`);
            check(`every building stands on land (${depth.n} checked)`, depth.offLand === 0, `${depth.offLand} in the water`);
            check("no building stands on the mountain's rock", depth.onRock === 0, `${depth.onRock}`);
            check("every ship floats, none on land", depth.shipsAground === 0, `${depth.shipsAground} aground`);
            check("every plane is on the airport", depth.planesOff === 0, `${depth.planesOff} off`);
            check("no road runs over the mountain's rock face", depth.overRock.length === 0, depth.overRock.join(", "));

            // ---- on-road items: on land, not on each other ------------------
            for (let round = 0; round < 5; round++) {
                await close(); await open(); await page.waitForTimeout(60);     // carts move each open
                const items = await page.evaluate(() => {
                    const coast = document.getElementById("coast");
                    const svg = document.getElementById("island");
                    const items = [...document.querySelectorAll("#on-road > g")].map((g) => {
                        const r = g.getBoundingClientRect(); return { cls: g.getAttribute("class"), r, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
                    });
                    const pt = svg.createSVGPoint();
                    const airport = document.getElementById("airport").getBBox();     // the airport and the bridge are built over the sea
                    const offLand = items.filter((it) => { pt.x = it.cx; pt.y = it.cy; const p = pt.matrixTransform(svg.getScreenCTM().inverse());
                        const onAirport = p.x >= airport.x && p.x <= airport.x + airport.width && p.y >= airport.y && p.y <= airport.y + airport.height + 30;
                        return !coast.isPointInFill(p) && !onAirport; }).length;
                    const carts = items.filter((i) => i.cls === "cart");
                    const stations = [...document.querySelectorAll("#stations .station")].map((g) => g.getBoundingClientRect());
                    const near = (a, b) => Math.hypot(a.cx - (b.left + b.width / 2), a.cy - (b.top + b.height / 2)) < Math.max(b.width, 12);
                    const cartOnStation = carts.filter((c) => stations.some((s) => near(c, s))).length;
                    let cartOnCart = 0;
                    for (let i = 0; i < carts.length; i++) for (let j = i + 1; j < carts.length; j++)
                        if (Math.hypot(carts[i].cx - carts[j].cx, carts[i].cy - carts[j].cy) < 10) cartOnCart++;
                    const cartOnWater = carts.filter((c) => { pt.x = c.cx; pt.y = c.cy; const p = pt.matrixTransform(svg.getScreenCTM().inverse()); return !coast.isPointInFill(p); }).length;
                    return { total: items.length, offLand, cartOnStation, cartOnCart, cartOnWater };
                });
                if (round === 0) check("cars, potholes and cones all on land", items.offLand === 0, `${items.offLand} off`);
                check(`round ${round + 1}: hot dog carts clear of stations, each other and the water`,
                    items.cartOnStation + items.cartOnCart + items.cartOnWater === 0,
                    `on a station ${items.cartOnStation}, stacked ${items.cartOnCart}, on water ${items.cartOnWater}`);
            }

            // ---- labels: no two visible labels overlap at any zoom ----------
            const svgBox = await page.locator("#island").boundingBox();
            for (const z of [1, 1.7, 2.7, 4, 6]) {
                await page.evaluate((z) => { window.mapZoom("reset"); const k = z; window.__setZoom && window.__setZoom(k); }, z);
                await page.evaluate((z) => { if (z > 1) { const vbW = 1500 / z; const svg = document.getElementById("island");
                    svg.setAttribute("viewBox", `${750 - vbW / 2} ${560 - vbW / 3} ${vbW} ${vbW * 2 / 3}`);
                    svg.classList.toggle("z-main", z >= 1.6); svg.classList.toggle("z-street", z >= 2.6);
                    window.dispatchEvent(new Event("map:zoomed")); } }, z);
                await page.waitForTimeout(120);
                const clash = await page.evaluate(() => {
                    // glyph by glyph: a box round curved text is far bigger than the text
                    const labels = [...document.querySelectorAll("#names text")]
                        .filter((t) => getComputedStyle(t).display !== "none" && getComputedStyle(t).visibility !== "hidden");
                    const glyphs = labels.map((t) => { const g = [];
                        for (let i = 0; i < t.getNumberOfChars(); i++) { const e = t.getExtentOfChar(i); if (e.width > 0) g.push([e.x, e.y, e.x + e.width, e.y + e.height]); }
                        return { name: t.textContent.trim(), g }; });
                    const hits = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
                    const out = [];
                    for (let i = 0; i < glyphs.length; i++) for (let j = i + 1; j < glyphs.length; j++)
                        if (glyphs[i].g.some((a) => glyphs[j].g.some((b) => hits(a, b)))) out.push(`${glyphs[i].name} × ${glyphs[j].name}`);
                    return { shown: labels.length, out };
                });
                check(`zoom ${z}x: no visible labels overlap (${clash.shown} shown)`, clash.out.length === 0, clash.out.slice(0, 4).join(" | "));
            }
            await page.evaluate(() => window.mapZoom("reset"));

            // ---- every road keeps a readable name ---------------------------
            const names = await page.evaluate(() => {
                const svg = document.getElementById("island"); svg.classList.add("z-main", "z-street");
                const flats = [...document.querySelectorAll(".flat-name")].map((f) => f.textContent.trim());
                const lost = [...document.querySelectorAll("#names text:not(.flat-name).culled")].map((t) => t.textContent.trim()).filter((n) => !flats.includes(n));
                const cut = [...document.querySelectorAll("#names text")].filter((t) => !t.classList.contains("culled") && getComputedStyle(t).display !== "none")
                    .filter((t) => { let n = t.getNumberOfChars(), shown = 0; for (let i = 0; i < n; i++) if (t.getExtentOfChar(i).width > 0) shown++; return shown < n; })
                    .map((t) => t.textContent.trim());
                svg.classList.remove("z-main", "z-street");
                return { lost, cut };
            });
            check("every road and place keeps its name on the map", names.lost.length === 0, names.lost.join(", "));
            check("no name is cut off at the end of its road", names.cut.length === 0, names.cut.join(", "));

            // ---- zoom and pan stay in bounds ---------------------------------
            for (let i = 0; i < 40; i++) await page.keyboard.press("+");
            const zin = await page.evaluate(() => document.getElementById("island").getAttribute("viewBox").split(" ").map(Number));
            check("zoom in stops at its limit", zin[2] >= 1500 / 8 - 0.01, `width ${zin[2]}`);
            await page.mouse.move(svgBox.x + 50, svgBox.y + 50); await page.mouse.down();
            await page.mouse.move(svgBox.x + svgBox.width - 10, svgBox.y + svgBox.height - 10, { steps: 8 }); await page.mouse.up();
            const pan = await page.evaluate(() => document.getElementById("island").getAttribute("viewBox").split(" ").map(Number));
            check("dragging never shows past the map's edge", pan[0] >= 0 && pan[1] >= 0 && pan[0] + pan[2] <= 1500.01 && pan[1] + pan[3] <= 1000.01, pan.join(" "));
            for (let i = 0; i < 40; i++) await page.keyboard.press("-");
            const zout = await page.evaluate(() => document.getElementById("island").getAttribute("viewBox"));
            check("zoom out stops at the whole island", zout === "0 0 1500 1000", zout);

            // ---- reopening starts fresh --------------------------------------
            await page.keyboard.press("+"); await page.keyboard.press("+");
            await close(); await open(); await page.waitForTimeout(60);
            check("reopening the map shows the whole island", await page.evaluate(() => document.getElementById("island").getAttribute("viewBox") === "0 0 1500 1000"));

            // ---- coordinates: game -> map -> game is exact -----------------
            const rt = await page.evaluate((pts) => pts.map(([x, y]) => { const m = gameToMap(x, y), g = mapToGame(m.x, m.y); return Math.hypot(g.x - x, g.y - y); }),
                places.ROADS.flatMap((r) => r.points.map((p) => [p.x, p.y])));
            check("every road point converts game→map→game exactly", Math.max(...rt) < 0.01, `worst ${Math.max(...rt).toFixed(3)}`);

            // ---- bad messages from the game don't break the page ------------
            await page.evaluate(() => {
                for (const p of [null, {}, { x: "a", y: 1 }, { x: NaN, y: 5 }, { x: 1e12, y: -1e12 }, "junk"]) {
                    postMessage({ type: "map:player", payload: p }, "*"); postMessage({ type: "map:waypoint", payload: p }, "*");
                }
                postMessage(null, "*"); postMessage("hello", "*"); postMessage({ type: "unknown" }, "*");
            });
            await page.waitForTimeout(100);
            const after = await page.evaluate(() => ({ you: document.getElementById("you").getAttribute("transform") || "", ok: !!document.getElementById("island") }));
            check("bad messages from the game are ignored, nothing breaks", after.ok && !/NaN|Infinity/.test(after.you), after.you);
        }
        await page.close();
    }
    check("no script errors at any screen size", errors.length === 0, errors.slice(0, 3).join(" | "));
    await browser.close();

    let failed = 0;
    for (const r of results) {
        if (!r.ok) failed++;
        console.log(`${r.ok ? "ok  " : "FAIL"}  ${r.name}${!r.ok && r.detail ? `\n        ${r.detail}` : ""}`);
    }
    console.log(`\n${results.length - failed} passed, ${failed} failed`);
    process.exit(failed ? 1 : 0);
})();
