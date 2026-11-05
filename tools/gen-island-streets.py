#!/usr/bin/env python3
# ============================================================
# tools/gen-island-streets.py — the island's road names, for the game
#
#   python3 tools/gen-island-map.py > island-map.html
#   node tools/render-streets.js        (street-renders/streets.json)
#   python3 tools/gen-island-terrain.py (island-terrain/ground.f32)
#   python3 tools/gen-island-streets.py
#
# Writes island-streets/data.lua: every island street as a world-space
# centre line, every junction (where two named roads meet) with its
# ground height, and every district / park name with its centre. The
# island-streets resource uses it for the street name on the HUD, the
# 3D street signs at junctions and the pause-map blips.
# ============================================================
import json, math, pathlib, re

import numpy as np

REPO = pathlib.Path(__file__).resolve().parent.parent
OUT = REPO / "island-streets/data.lua"
CFG = {"metresPerUnit": 2.0, "cx": -5500.0, "cy": -6500.0}   # tools/gen-road-ymaps.js CONFIG
CITY = {"312": "312", "770": "770", "1017": "1017"}


def to_world(mx, my):
    return (CFG["cx"] + (mx - 750) * CFG["metresPerUnit"], CFG["cy"] - (my - 500) * CFG["metresPerUnit"])


# ground height (island-terrain/ground.f32, the same grid as road-guide.json)
G = json.loads((REPO / "island-terrain/road-guide.json").read_text())
ground = np.frombuffer((REPO / "island-terrain/ground.f32").read_bytes(), "<f4").reshape(G["rows"], G["cols"])


def ground_z(wx, wy):
    c = (wx - G["x0"]) / G["spacing"]
    r = (wy - G["y0"]) / G["spacing"]
    c0, r0 = int(math.floor(c)), int(math.floor(r))
    if not (0 <= c0 < G["cols"] - 1 and 0 <= r0 < G["rows"] - 1):
        return 10.0
    fc, fr = c - c0, r - r0
    g = ground
    return float(g[r0, c0] * (1 - fc) * (1 - fr) + g[r0, c0 + 1] * fc * (1 - fr)
                 + g[r0 + 1, c0] * (1 - fc) * fr + g[r0 + 1, c0 + 1] * fc * fr)


streets = json.loads((REPO / "street-renders/streets.json").read_text())
roads = []
for s in streets:
    pts = [to_world(x, y) for x, y in s["points"]]
    roads.append({"code": s["code"], "name": s["name"], "kind": s["kind"], "city": s["code"].split("-")[0], "pts": pts})


def seg_hit(p, p2, q, q2):
    r = (p2[0] - p[0], p2[1] - p[1]); sv = (q2[0] - q[0], q2[1] - q[1])
    den = r[0] * sv[1] - r[1] * sv[0]
    if abs(den) < 1e-9:
        return None
    qp = (q[0] - p[0], q[1] - p[1])
    t = (qp[0] * sv[1] - qp[1] * sv[0]) / den
    u = (qp[0] * r[1] - qp[1] * r[0]) / den
    return (p[0] + t * r[0], p[1] + t * r[1]) if -0.02 <= t <= 1.02 and -0.02 <= u <= 1.02 else None


def near_point(pt, pts):
    best = 1e18, None
    for a, b in zip(pts, pts[1:]):
        ax, ay = b[0] - a[0], b[1] - a[1]
        L2 = ax * ax + ay * ay or 1e-9
        t = max(0, min(1, ((pt[0] - a[0]) * ax + (pt[1] - a[1]) * ay) / L2))
        c = (a[0] + t * ax, a[1] + t * ay)
        d = math.dist(pt, c)
        if d < best[0]:
            best = d, c
    return best


# Junctions: crossings, plus a road's end within 14 m of another road (a T-junction)
hits = []
for i, r in enumerate(roads):
    for j in range(i + 1, len(roads)):
        o = roads[j]
        for a, b in zip(r["pts"], r["pts"][1:]):
            for c, d in zip(o["pts"], o["pts"][1:]):
                if max(a[0], b[0]) + 2 < min(c[0], d[0]) or max(c[0], d[0]) + 2 < min(a[0], b[0]):
                    continue
                if max(a[1], b[1]) + 2 < min(c[1], d[1]) or max(c[1], d[1]) + 2 < min(a[1], b[1]):
                    continue
                p = seg_hit(a, b, c, d)
                if p:
                    hits.append((p, {i, j}))
for i, r in enumerate(roads):
    for end in (r["pts"][0], r["pts"][-1]):
        for j, o in enumerate(roads):
            if j == i:
                continue
            d, c = near_point(end, o["pts"])
            if d < 14:
                hits.append((c, {i, j}))

junctions = []
for p, rs in hits:
    for jn in junctions:
        if math.dist(p, jn["pos"]) < 25:
            jn["roads"] |= rs
            break
    else:
        junctions.append({"pos": p, "roads": set(rs)})

# District and park names, where the map draws them
html = (REPO / "island-map.html").read_text()
zones = []
for m in re.finditer(r'<text class="name zone-name" x="([-\d.]+)" y="([-\d.]+)"[^>]*font-size="(\d+)"[^>]*>([^<]+)</text>', html):
    x, y = to_world(float(m.group(1)), float(m.group(2)))
    zones.append({"name": m.group(4), "kind": "district" if m.group(3) == "9" else "park", "x": x, "y": y})


# Points of interest the map draws (map units): the pause-map blips use these
POIS = [  # name, kind, map x, y, radius in map units (0 = a point)
    ("West Woods Hunting Grounds", "hunting", -290, 425, 150),
    ("Antler Lodge (hunting)", "lodge", -255, 392, 0),
]
pois = [{"name": n, "kind": k, "x": to_world(x, y)[0], "y": to_world(x, y)[1], "r": r * CFG["metresPerUnit"]} for n, k, x, y, r in POIS]

# ------------------------------------------------------------ write
def q(s):
    return '"' + s.replace("\\", "\\\\").replace('"', '\\"') + '"'


L = ["-- GENERATED by tools/gen-island-streets.py — do not edit; rerun the script.",
     "-- World coordinates (the island sits round X -5500, Y -6500). Read by client.lua.",
     "ISLAND_STREETS = {",
     "  bounds = { minX = %.0f, maxX = %.0f, minY = %.0f, maxY = %.0f }," % (
         min(p[0] for r in roads for p in r["pts"]) - 400, max(p[0] for r in roads for p in r["pts"]) + 400,
         min(p[1] for r in roads for p in r["pts"]) - 400, max(p[1] for r in roads for p in r["pts"]) + 400),
     "  streets = {"]
for r in roads:
    L.append("    { code = %s, name = %s, kind = %s, city = %s, pts = { %s } }," % (
        q(r["code"]), q(r["name"]), q(r["kind"]), q(CITY.get(r["city"], r["city"])),
        ", ".join("%.1f, %.1f" % p for p in r["pts"])))
L.append("  },")
L.append("  junctions = {")
for jn in junctions:
    x, y = jn["pos"]
    L.append("    { x = %.1f, y = %.1f, z = %.1f, streets = { %s } }," % (
        x, y, ground_z(x, y), ", ".join(str(k + 1) for k in sorted(jn["roads"]))))
L.append("  },")
L.append("  zones = {")
for z in zones:
    L.append("    { name = %s, kind = %s, x = %.1f, y = %.1f }," % (q(z["name"]), q(z["kind"]), z["x"], z["y"]))
L.append("  },")
L.append("  pois = {")
for p_ in pois:
    L.append("    { name = %s, kind = %s, x = %.1f, y = %.1f, z = %.1f, radius = %.0f }," % (
        q(p_["name"]), q(p_["kind"]), p_["x"], p_["y"], ground_z(p_["x"], p_["y"]), p_["r"]))
L.append("  },")
L.append("}")
OUT.parent.mkdir(exist_ok=True)
OUT.write_text("\n".join(L) + "\n")
print(f"{len(roads)} streets, {len(junctions)} junctions, {len(zones)} named areas -> {OUT.relative_to(REPO)}")
