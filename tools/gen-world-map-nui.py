#!/usr/bin/env python3
# ============================================================
# tools/gen-world-map-nui.py — builds the in-game map page
#
#   python3 tools/gen-island-map.py > island-map.html
#   python3 tools/gen-world-map-nui.py
#
# Wraps island-map.html in the NUI shell and writes
# world-map/html/index.html: the game shows through, the map starts
# hidden, client.lua's 'map:visibility' message shows or hides it,
# and M or Esc posts 'close' back. Each open re-places the hot dog
# carts. L toggles the legend.
# ============================================================
import pathlib, re
root = pathlib.Path(__file__).resolve().parent.parent
page = (root / "island-map.html").read_text()

shell_css = """<style>
  /* NUI shell: the game shows through, the map starts hidden and fits the screen. */
  html, body { background: transparent !important; }
  body { padding: 12px 16px; justify-content: center; height: 100vh; overflow: hidden; }
  #app { display: none; flex-direction: column; align-items: center; }
  #app.open { display: flex; }
  #app h1, #app p.note { text-shadow: 0 2px 6px rgba(0,0,0,.8); }
  /* map and legend side by side; the map takes what's left after the header, hint and legend */
  .stage { display: flex; gap: 14px; align-items: flex-start; justify-content: center; }
  .frame { width: min(calc(100vw - 32px), calc((100vh - 190px) * 1.5)); flex: 0 0 auto; }
  .stage.with-legend .frame { width: min(calc(100vw - 32px - 314px), calc((100vh - 190px) * 1.5)); }
  .legend { display: none; width: 300px; margin-top: 0; padding: 12px 12px 14px;
            max-height: calc(100vh - 190px); overflow-y: auto; flex: 0 0 300px; }
  .stage.with-legend .legend { display: block; }
  .legend ul { grid-template-columns: 1fr; gap: 2px; }
  .legend li { min-height: 24px; font-size: 12px; gap: 8px; }
  .legend .sw { flex-basis: 38px; height: 23px; }
  .zoombar { margin-top: 8px; }
  .hint { margin: 8px auto 0; width: fit-content; padding: 6px 14px; border-radius: 999px;
          background: rgba(6,12,22,.78); color: #cfe0f2; font-size: 13px; letter-spacing: 1px; }
</style>
</head>"""
page = page.replace("</head>", shell_css, 1)
page = page.replace("<body>", '<body>\n<div id="app">', 1)
zoombar = re.search(r'  <div class="zoombar">.*?</div>\n', page).group(0)
page = page.replace(zoombar, "", 1)                         # the zoom buttons go under the map, not into the row
page = page.replace('  <div class="frame">', '  <div class="stage">\n  <div class="frame">', 1)
page = page.replace("<script>", '  </div><!-- .stage -->\n' + zoombar + '  <div class="hint">M or ESC: CLOSE &nbsp;·&nbsp; L: LEGEND &nbsp;·&nbsp; CLICK: SET WAYPOINT &nbsp;·&nbsp; RIGHT-CLICK: CLEAR &nbsp;·&nbsp; SCROLL: ZOOM &nbsp;·&nbsp; DRAG: MOVE &nbsp;·&nbsp; 0: WHOLE ISLAND</div>\n</div><!-- #app -->\n<script>', 1)
shell_js = """<script>
  // client.lua owns focus. This page shows and hides, draws you and the waypoint from what
  // the client sends, and asks the client to close, set or clear the waypoint.
  const app = document.getElementById('app');
  const stage = document.querySelector('.stage');
  const post = (name, body) => {
    const res = typeof GetParentResourceName === 'function' ? GetParentResourceName() : null;
    if (res) fetch(`https://${res}/${name}`, { method: 'POST', body: JSON.stringify(body || {}) });
  };
  window.addEventListener('message', (e) => {
    const d = e.data || {};
    if (d.type === 'map:visibility') {
      const visible = !!(d.payload && d.payload.visible);
      app.classList.toggle('open', visible);
      if (visible && window.placeOnRoad) window.placeOnRoad();   // new hot dog cart spots each time
    }
    if (d.type === 'map:player') window.mapSetPlayer && window.mapSetPlayer(d.payload);
    if (d.type === 'map:waypoint') window.mapSetWaypoint && window.mapSetWaypoint(d.payload || null);
  });
  // Click a spot on a city's streets: the GPS waypoint goes there. Right-click clears it.
  window.onMapClick = (pt) => {
    const g = window.mapToGame(pt.x, pt.y);
    if (!g) return;                                  // countryside / sea: no game position to send
    window.mapSetWaypoint(g);
    post('waypoint', { x: Math.round(g.x * 10) / 10, y: Math.round(g.y * 10) / 10 });
  };
  window.onMapRightClick = () => { window.mapSetWaypoint(null); post('clearWaypoint'); };
  document.addEventListener('keyup', (e) => {
    if (!app.classList.contains('open')) return;
    if (e.key === 'Escape' || e.key === 'm' || e.key === 'M') { post('close'); window.mapZoom && window.mapZoom('reset'); }
    if (e.key === 'l' || e.key === 'L') stage.classList.toggle('with-legend');
  });
  // Tell the client the page is up: until it hears this it won't take focus,
  // so a page that failed to load can never trap the player.
  post('ready');
</script>
</body>"""
page = page.replace("</body>", shell_js, 1)
assert page.count("</html>") == 1 and page.rstrip().endswith("</html>"), "nothing may follow </html>"
out = root / "world-map" / "html" / "index.html"
out.write_text(page)
print(f"wrote {out.relative_to(root)} ({len(page)//1024} KB)")
