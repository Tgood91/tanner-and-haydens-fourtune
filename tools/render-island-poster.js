#!/usr/bin/env node
// ============================================================
// tools/render-island-poster.js — labeled island images (for Kimi, or print)
//
//   python3 tools/gen-island-map.py > island-map.html
//   node tools/render-island-poster.js
//
// Writes island-poster/:
//   overview.png         the whole island, main roads + districts named
//   overview-clean.png   the same, no text at all (a base to paint over)
//   regions/<name>.png   close-ups where every street's name and number is readable
// ============================================================
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const REPO = path.resolve(__dirname, "..");
const OUT = path.join(REPO, "island-poster");
const CANVAS = { x: -620, y: 0, w: 3400, h: 1300 };   // gen-island-map.py VX0, VY0, W, H
const REGIONS = [  // name, x, y, w (map units); height follows the 16:10 sheet
  ["01-west-woods-and-hunting-grounds", -600, 240, 760],
  ["02-copper-hills-and-sundown-beach", -600, 680, 760],
  ["03-312-port-city", 380, 60, 820],
  ["04-770-farms-and-the-mountain", 380, 300, 820],
  ["05-1017-and-the-airport", 250, 560, 1100],
  ["06-grande-p-and-foundry-flats", 1450, 120, 900],
  ["07-harrow-heights-and-lighthouse-point", 2050, 100, 760],
  ["08-eastgate-and-saltwater-strand", 1450, 690, 1150],
];

(async () => {
  fs.mkdirSync(path.join(OUT, "regions"), { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 3400, height: 1300 }, deviceScaleFactor: 1 });
  await page.goto("file://" + path.join(REPO, "island-map.html"));
  await page.evaluate(() => {
    document.body.style.cssText = "margin:0;padding:0;background:#0b1526;overflow:hidden";
    const svg = document.getElementById("island");
    for (const el of document.body.children) if (!el.contains(svg)) el.style.display = "none";
    const frame = svg.closest(".frame");
    frame.style.cssText = "width:100vw;height:100vh;border-radius:0;box-shadow:none";
    for (const el of frame.parentElement.children) if (el !== frame) el.style.display = "none";
    svg.style.cssText = "width:100vw;height:100vh;display:block";
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  });
  const view = (x, y, w, h, names) => page.evaluate(({ x, y, w, h, names }) => {
    const svg = document.getElementById("island");
    svg.setAttribute("viewBox", `${x} ${y} ${w} ${h}`);
    svg.classList.toggle("z-main", names !== "none");
    svg.classList.toggle("z-street", names === "all");
    for (const t of svg.querySelectorAll("svg > text")) t.style.display = names === "none" ? "none" : "";   // the big area names
  }, { x, y, w, h, names });

  // the whole island, 2 px a map unit
  await page.setViewportSize({ width: CANVAS.w * 2, height: CANVAS.h * 2 });
  await view(CANVAS.x, CANVAS.y, CANVAS.w, CANVAS.h, "main");
  await page.screenshot({ path: path.join(OUT, "overview.png") });
  await view(CANVAS.x, CANVAS.y, CANVAS.w, CANVAS.h, "none");
  await page.screenshot({ path: path.join(OUT, "overview-clean.png") });

  // region sheets, 3200 x 2000
  await page.setViewportSize({ width: 3200, height: 2000 });
  for (const [name, x, y, w] of REGIONS) {
    await view(x, y, w, w * 2000 / 3200, "all");
    await page.screenshot({ path: path.join(OUT, "regions", name + ".png") });
  }
  await browser.close();
  console.log(`wrote island-poster/overview.png, overview-clean.png and ${REGIONS.length} region sheets`);
})();
