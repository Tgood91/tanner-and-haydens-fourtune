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
  body { padding: 2vh 2vw; justify-content: center; min-height: 100vh; }
  #app { display: none; flex-direction: column; align-items: center; }
  #app.open { display: flex; }
  #app h1, #app p.note { text-shadow: 0 2px 6px rgba(0,0,0,.8); }
  .frame { width: min(96vw, 128vh); }
  .legend { width: min(96vw, 128vh); max-height: 34vh; overflow: auto; display: none; }
  .legend.open { display: block; }
  .hint { margin: 12px auto 0; width: fit-content; padding: 6px 14px; border-radius: 999px;
          background: rgba(6,12,22,.78); color: #cfe0f2; font-size: 13px; letter-spacing: 1px; }
</style>
</head>"""
page = page.replace("</head>", shell_css, 1)
page = page.replace("<body>", '<body>\n<div id="app">', 1)
page = page.replace('  <div class="legend">', '  <div class="hint">M or ESC: CLOSE &nbsp;·&nbsp; L: LEGEND &nbsp;·&nbsp; HOVER FOR NAMES</div>\n  <div class="legend">', 1)
page = page.replace("<script>", "</div><!-- #app -->\n<script>", 1)
shell_js = """<script>
  // client.lua owns focus; this page only shows, hides and asks to close.
  const app = document.getElementById('app');
  const legend = document.querySelector('.legend');
  const close = () => {
    const res = typeof GetParentResourceName === 'function' ? GetParentResourceName() : null;
    if (res) fetch(`https://${res}/close`, { method: 'POST', body: '{}' });
  };
  window.addEventListener('message', (e) => {
    const d = e.data || {};
    if (d.type !== 'map:visibility') return;
    const visible = !!(d.payload && d.payload.visible);
    app.classList.toggle('open', visible);
    if (visible && window.placeOnRoad) window.placeOnRoad();   // new hot dog cart spots each time
  });
  document.addEventListener('keyup', (e) => {
    if (!app.classList.contains('open')) return;
    if (e.key === 'Escape' || e.key === 'm' || e.key === 'M') close();
    if (e.key === 'l' || e.key === 'L') legend.classList.toggle('open');
  });
</script>
</body>"""
page = page.replace("</body>", shell_js, 1)
assert page.count("</html>") == 1 and page.rstrip().endswith("</html>"), "nothing may follow </html>"
out = root / "world-map" / "html" / "index.html"
out.write_text(page)
print(f"wrote {out.relative_to(root)} ({len(page)//1024} KB)")
