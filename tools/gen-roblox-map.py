#!/usr/bin/env python3
# ============================================================
# tools/gen-roblox-map.py — lays the whole island out for Roblox
#
#   python3 tools/gen-roblox-map.py
#
# Source: street-renders/streets.json (every named road, from
# tools/render-streets.js) and the coastline, mountain, airport and
# districts from tools/gen-island-map.py. Same island, same 108 roads,
# same names, now in Roblox studs.
#
# Writes:
#   roblox/src/server/Map/MapData.luau   what MapBuilder builds in Studio
#   roblox/map/layout.json               the same, as JSON (studs)
#   roblox/map/layout.svg                top-down map, every road labeled
#   roblox/map/layout-labeled.png        that map as an image (for Kimi)
#   roblox/map/layout-clean.png          no labels, no grid (a base to paint on)
#
# Scale: 1 island unit = 2 m = 6 studs. The island is 9,000 x 6,000
# studs (about 3 x 2 km), centred on the origin. North is -Z.
# ============================================================
import json, math, pathlib, subprocess

import numpy as np

REPO = pathlib.Path(__file__).resolve().parent.parent
OUT_LUAU = REPO / "roblox/src/server/Map/MapData.luau"
OUT_DIR = REPO / "roblox/map"

S = 6.0                     # studs per island unit
CX, CY = 750.0, 500.0       # island unit at the Roblox origin
CITY_LABEL = {"312": "312 (north)", "770": "770 (the middle)", "1017": "1017 (south)"}

# Road widths in studs (a Roblox character is ~5 studs tall; a car ~8 wide)
WIDTH = {"highway": 56, "arterial": 40, "street": 28, "street312": 28, "backroad": 20, "track": 14}
# Top-of-road height above the grass, so crossing roads of different kinds never z-fight
TOP = {"highway": 1.10, "arterial": 1.06, "street": 1.02, "street312": 1.02, "backroad": 0.98, "track": 0.94}

# From tools/gen-island-map.py (island units)
ISLAND = [(150,330),(240,205),(420,150),(640,105),(900,92),(1120,112),(1290,165),(1395,265),(1445,420),
          (1435,600),(1390,745),(1300,840),(1180,872),(760,880),(300,872),(195,840),(115,735),(72,600),(62,455),(90,375)]
MOUNTAIN = (780, 435, 205, 150)       # centre x, y, radius x, y — the rock
AIRPORT = [(210,882),(1250,882),(1250,975),(250,975)]
APRON = [(1250,860),(1440,830),(1470,930),(1250,975)]
RUNWAY = (270, 935, 930, 22)          # x, y, w, h
LANDMARKS = [  # name, kind, x0, y0, x1, y1 (island units)
    ("312 Downtown towers", "towers", 560, 140, 960, 230),
    ("312 Port (piers, cranes, ships)", "port", 1170, 60, 1460, 280),
    ("312 West port", "port", 230, 160, 390, 215),
    ("West tower district", "towers", 242, 408, 498, 612),
    ("The mountain", "mountain", 575, 285, 985, 585),
    ("1017 North towers", "towers", 680, 590, 850, 640),
    ("1017 South towers", "towers", 650, 670, 880, 760),
    ("The airport", "airport", 210, 830, 1470, 975),
]

PEAK = 700.0           # mountain peak, studs above the grass
CELL = 16              # mountain column size, studs
ROW = 32               # terrain row height for land fills, studs
BEACH = 135            # beach width, studs (45 m)


def to_studs(u, v):
    return ((u - CX) * S, (v - CY) * S)


def r1(x):
    return round(x, 1)


# ------------------------------------------------------------ geometry helpers
def catmull_closed(points, per=12):
    """The same Catmull-Rom the island map draws, sampled into a polygon."""
    n = len(points)
    out = []
    for i in range(n):
        p0, p1, p2, p3 = points[(i - 1) % n], points[i], points[(i + 1) % n], points[(i + 2) % n]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        for k in range(per):
            t = k / per
            mt = 1 - t
            x = mt**3 * p1[0] + 3 * mt**2 * t * c1[0] + 3 * mt * t**2 * c2[0] + t**3 * p2[0]
            y = mt**3 * p1[1] + 3 * mt**2 * t * c1[1] + 3 * mt * t**2 * c2[1] + t**3 * p2[1]
            out.append((x, y))
    return out


def rdp(points, tol):
    """Ramer-Douglas-Peucker: drop points that don't change the shape."""
    if len(points) < 3:
        return points
    a, b = np.array(points[0]), np.array(points[-1])
    ab = b - a
    L = np.hypot(*ab)
    best, idx = -1.0, 0
    for i in range(1, len(points) - 1):
        p = np.array(points[i])
        d = np.hypot(*(p - a)) if L == 0 else abs(ab[0] * (p - a)[1] - ab[1] * (p - a)[0]) / L
        if d > best:
            best, idx = d, i
    if best <= tol:
        return [points[0], points[-1]]
    return rdp(points[: idx + 1], tol)[:-1] + rdp(points[idx:], tol)


def seg_intersect(p, p2, q, q2, eps=1e-6):
    r = (p2[0] - p[0], p2[1] - p[1])
    s = (q2[0] - q[0], q2[1] - q[1])
    den = r[0] * s[1] - r[1] * s[0]
    if abs(den) < 1e-9:
        return None
    qp = (q[0] - p[0], q[1] - p[1])
    t = (qp[0] * s[1] - qp[1] * s[0]) / den
    u = (qp[0] * r[1] - qp[1] * r[0]) / den
    if -eps <= t <= 1 + eps and -eps <= u <= 1 + eps:
        return (p[0] + t * r[0], p[1] + t * r[1])
    return None


def project(pt, a, b):
    ax, ay = b[0] - a[0], b[1] - a[1]
    L2 = ax * ax + ay * ay
    t = 0.0 if L2 == 0 else max(0.0, min(1.0, ((pt[0] - a[0]) * ax + (pt[1] - a[1]) * ay) / L2))
    c = (a[0] + t * ax, a[1] + t * ay)
    return c, math.dist(pt, c)


def poly_runs(poly, z):
    """x-ranges inside a polygon on the horizontal line at z (even-odd)."""
    xs = []
    n = len(poly)
    for i in range(n):
        (x1, z1), (x2, z2) = poly[i], poly[(i + 1) % n]
        if (z1 <= z < z2) or (z2 <= z < z1):
            xs.append(x1 + (z - z1) * (x2 - x1) / (z2 - z1))
    xs.sort()
    return [(xs[i], xs[i + 1]) for i in range(0, len(xs) - 1, 2)]


def unit(dx, dz):
    L = math.hypot(dx, dz) or 1.0
    return (dx / L, dz / L)


# ------------------------------------------------------------ roads
streets = json.loads((REPO / "street-renders/streets.json").read_text())
roads = []
for s in streets:
    pts = [tuple(p) for p in s["points"]]
    # drop repeated points, then simplify (0.35 units = 2 studs)
    clean = [pts[0]]
    for p in pts[1:]:
        if math.dist(p, clean[-1]) > 0.05:
            clean.append(p)
    if len(clean) < 2:
        continue
    closed = math.dist(clean[0], clean[-1]) < 1.0 and len(clean) > 3
    simple = rdp(clean, 0.35)
    roads.append({
        "code": s["code"],
        "name": s["name"],
        "kind": s["kind"],
        "city": s["code"].split("-")[0],
        "width": WIDTH[s["kind"]],
        "top": TOP[s["kind"]],
        "closed": closed,
        "points": [to_studs(*p) for p in simple],
    })

# T-junctions: snap a road's loose end onto the road it stops at
for r in roads:
    if r["closed"]:
        continue
    for end in (0, -1):
        pt = r["points"][end]
        best = None
        for o in roads:
            if o is r:
                continue
            for a, b in zip(o["points"], o["points"][1:]):
                c, d = project(pt, a, b)
                if d < o["width"] / 2 + 15 and (best is None or d < best[1]):
                    best = (c, d)
        if best and best[1] > 0.05:
            r["points"][end] = best[0]

# Junctions: every place two different roads cross or touch
hits = []
for i, r in enumerate(roads):
    for j in range(i + 1, len(roads)):
        o = roads[j]
        for a, b in zip(r["points"], r["points"][1:]):
            for c, d in zip(o["points"], o["points"][1:]):
                if max(a[0], b[0]) + 1 < min(c[0], d[0]) or max(c[0], d[0]) + 1 < min(a[0], b[0]):
                    continue
                if max(a[1], b[1]) + 1 < min(c[1], d[1]) or max(c[1], d[1]) + 1 < min(a[1], b[1]):
                    continue
                p = seg_intersect(a, b, c, d, eps=1e-3)
                if p:
                    hits.append((p, {i, j}))

# Merge hits closer than 30 studs into one junction
junctions = []
for p, rs in hits:
    for jn in junctions:
        if math.dist(p, jn["pos"]) < 30:
            jn["roads"] |= rs
            break
    else:
        junctions.append({"pos": p, "roads": set(rs)})


def dir_at(r, pt):
    """The road's direction at the point on it nearest pt."""
    best = None
    for a, b in zip(r["points"], r["points"][1:]):
        c, d = project(pt, a, b)
        if best is None or d < best[0]:
            best = (d, unit(b[0] - a[0], b[1] - a[1]), c)
    return best[1], best[2]


# Street signs: one post at a corner of each junction, a blade per road
signs = []
for jn in junctions:
    rs = sorted(jn["roads"], key=lambda k: -roads[k]["width"])[:3]
    d1, _ = dir_at(roads[rs[0]], jn["pos"])
    perp = (-d1[1], d1[0])
    w1 = roads[rs[0]]["width"]
    w2 = roads[rs[1]]["width"] if len(rs) > 1 else 0
    post = (jn["pos"][0] + perp[0] * (w1 / 2 + 6) + d1[0] * (w2 / 2 + 6),
            jn["pos"][1] + perp[1] * (w1 / 2 + 6) + d1[1] * (w2 / 2 + 6))
    blades = []
    for k in rs:
        d, _ = dir_at(roads[k], jn["pos"])
        blades.append({"road": k, "dir": d})
    signs.append({"pos": post, "blades": blades, "junction": True})

# Roads with long stretches between junctions get a reassurance sign every ~900 studs
for k, r in enumerate(roads):
    mine = [jn["pos"] for jn in junctions if k in jn["roads"]]
    walked = 0.0
    last_sign = -450.0
    for a, b in zip(r["points"], r["points"][1:]):
        L = math.dist(a, b)
        t = 0.0
        while t < L:
            step = min(60.0, L - t)
            t += step
            walked += step
            if walked - last_sign < 900:
                continue
            p = (a[0] + (b[0] - a[0]) * t / L, a[1] + (b[1] - a[1]) * t / L)
            if any(math.dist(p, m) < 300 for m in mine):
                continue
            d = unit(b[0] - a[0], b[1] - a[1])
            perp = (-d[1], d[0])
            signs.append({
                "pos": (p[0] + perp[0] * (r["width"] / 2 + 6), p[1] + perp[1] * (r["width"] / 2 + 6)),
                "blades": [{"road": k, "dir": d}],
                "junction": False,
            })
            last_sign = walked
    # Short road with no junction and no sign yet: one at the middle
    if not mine and not any(s["blades"][0]["road"] == k for s in signs if not s["junction"]):
        a, b = r["points"][len(r["points"]) // 2 - 1], r["points"][len(r["points"]) // 2]
        p = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
        d = unit(b[0] - a[0], b[1] - a[1])
        perp = (-d[1], d[0])
        signs.append({"pos": (p[0] + perp[0] * (r["width"] / 2 + 6), p[1] + perp[1] * (r["width"] / 2 + 6)),
                      "blades": [{"road": k, "dir": d}], "junction": False})

# Where each road's name label goes: the middle of its longest segment
for r in roads:
    best = max(zip(r["points"], r["points"][1:]), key=lambda ab: math.dist(*ab))
    r["label"] = ((best[0][0] + best[1][0]) / 2, (best[0][1] + best[1][1]) / 2)
    r["length"] = sum(math.dist(a, b) for a, b in zip(r["points"], r["points"][1:]))

# ------------------------------------------------------------ cities + spawns
cities = []
for code in ("312", "770", "1017"):
    pts = [p for r in roads if r["city"] == code for p in r["points"]]
    xs, zs = [p[0] for p in pts], [p[1] for p in pts]
    centre = (sum(xs) / len(xs), sum(zs) / len(zs))
    mine = [jn for jn in junctions if any(roads[k]["city"] == code for k in jn["roads"])]
    spawn = min(mine, key=lambda jn: math.dist(jn["pos"], centre))
    names = sorted({roads[k]["name"] for k in spawn["roads"]})
    cities.append({
        "code": code, "label": CITY_LABEL[code], "centre": centre,
        "bbox": (min(xs), min(zs), max(xs), max(zs)),
        "spawn": spawn["pos"], "spawnName": " & ".join(names[:2]),
        "spawnTop": max(roads[k]["top"] for k in spawn["roads"]),
    })

# ------------------------------------------------------------ terrain
coast = [to_studs(*p) for p in catmull_closed(ISLAND)]
cz0, cz1 = min(p[1] for p in coast), max(p[1] for p in coast)
cx0, cx1 = min(p[0] for p in coast), max(p[0] for p in coast)


def fill_rows(poly, inset=0.0):
    rows = []
    z = math.floor(min(p[1] for p in poly) / ROW) * ROW
    zmax = max(p[1] for p in poly)
    while z < zmax:
        zc = z + ROW / 2
        runs = poly_runs(poly, zc)
        if inset:
            # keep only what is inside at zc - inset and zc + inset too (a cheap inset for a convex-ish island)
            above, below = poly_runs(poly, zc - inset), poly_runs(poly, zc + inset)
            out = []
            for x0, x1 in runs:
                lo, hi = x0 + inset, x1 - inset
                for rr in (above, below):
                    if not rr:
                        lo, hi = 1, 0
                        break
                    lo = max(lo, min(r_[0] for r_ in rr) + inset)
                    hi = min(hi, max(r_[1] for r_ in rr) - inset)
                if hi - lo > 8:
                    out.append((lo, hi))
            runs = out
        for x0, x1 in runs:
            if x1 - x0 > 4:
                rows.append((r1(zc), r1(x0), r1(x1)))
        z += ROW
    return rows


terrain = {
    "sand": fill_rows(coast),
    "grass": fill_rows(coast, BEACH),
    "concrete": fill_rows([to_studs(*p) for p in AIRPORT]) + fill_rows([to_studs(*p) for p in APRON]),
    "rowHeight": ROW,
    "water": {"x0": r1(cx0 - 1500), "x1": r1(cx1 + 1500), "z0": r1(cz0 - 1500), "z1": r1(cz1 + 1500)},
}

# Mountain: a height per 16-stud column, flattened near every road
mx, mz = to_studs(MOUNTAIN[0], MOUNTAIN[1])
rx, rz = MOUNTAIN[2] * S, MOUNTAIN[3] * S
gx = np.arange(mx - rx, mx + rx, CELL) + CELL / 2
gz = np.arange(mz - rz, mz + rz, CELL) + CELL / 2
GX, GZ = np.meshgrid(gx, gz)
rr = ((GX - mx) / rx) ** 2 + ((GZ - mz) / rz) ** 2
rng = np.random.default_rng(1017312)
bumps = np.zeros_like(GX)
for _ in range(14):  # a few ridges so it isn't a perfect dome
    bx, bz = mx + rng.uniform(-0.6, 0.6) * rx, mz + rng.uniform(-0.6, 0.6) * rz
    br = rng.uniform(0.15, 0.35) * rx
    bumps += rng.uniform(0.08, 0.22) * np.exp(-(((GX - bx) ** 2 + (GZ - bz) ** 2) / (br * br)))
height = PEAK * np.clip(1 - rr, 0, None) ** 1.5 * (1 + bumps)
# distance from every column to the nearest road edge
dist = np.full(GX.shape, 1e9)
for r in roads:
    for a, b in zip(r["points"], r["points"][1:]):
        ax, az = b[0] - a[0], b[1] - a[1]
        L2 = ax * ax + az * az or 1.0
        t = np.clip(((GX - a[0]) * ax + (GZ - a[1]) * az) / L2, 0, 1)
        d = np.hypot(GX - (a[0] + t * ax), GZ - (a[1] + t * az)) - r["width"] / 2
        dist = np.minimum(dist, d)
blend = np.clip((dist - 20) / 160, 0, 1)        # flat within 20 studs of a road, full height 180 out
height = np.round(height * blend / 4) * 4         # whole voxels (4 studs)
mountain = {
    "x0": r1(gx[0] - CELL / 2), "z0": r1(gz[0] - CELL / 2), "cell": CELL,
    "cols": len(gx), "rows": [[int(h) for h in row] for row in height],
    "rockAbove": 200, "snowAbove": 520,
}

# ------------------------------------------------------------ landmarks + runway
landmarks = []
for name, kind, x0, y0, x1, y1 in LANDMARKS:
    a, b = to_studs(x0, y0), to_studs(x1, y1)
    landmarks.append({"name": name, "kind": kind, "x0": r1(a[0]), "z0": r1(a[1]), "x1": r1(b[0]), "z1": r1(b[1])})
ra, rb = to_studs(RUNWAY[0], RUNWAY[1]), to_studs(RUNWAY[0] + RUNWAY[2], RUNWAY[1] + RUNWAY[3])
runway = {"x0": r1(ra[0]), "z0": r1(ra[1]), "x1": r1(rb[0]), "z1": r1(rb[1])}

# ------------------------------------------------------------ write MapData.luau
def lua_str(s):
    return '"' + s.replace("\\", "\\\\").replace('"', '\\"') + '"'


def lua_pt(p):
    return "{%s, %s}" % (r1(p[0]), r1(p[1]))


L = []
w = L.append
w("-- GENERATED by tools/gen-roblox-map.py — do not edit by hand; rerun the script.")
w("-- The island in Roblox studs: 1 island unit = 6 studs, origin at the island centre, north = -Z.")
w("-- Points are {x, z}. Heights are studs above the grass (the grass top is Y = 0).")
w("-- Read by MapBuilder.luau. Source: street-renders/streets.json + tools/gen-island-map.py")
w("")
w("return {")
w("\tscale = %s," % S)
w("\troads = {")
for r in roads:
    w("\t\t{ code = %s, name = %s, kind = %s, city = %s, width = %d, top = %s, closed = %s," % (
        lua_str(r["code"]), lua_str(r["name"]), lua_str(r["kind"]), lua_str(r["city"]),
        r["width"], r["top"], "true" if r["closed"] else "false"))
    w("\t\t\tlabel = %s, points = { %s } }," % (lua_pt(r["label"]), ", ".join(lua_pt(p) for p in r["points"])))
w("\t},")
w("\tjunctions = {")
for jn in junctions:
    w("\t\t{ pos = %s, roads = { %s } }," % (lua_pt(jn["pos"]), ", ".join(str(k + 1) for k in sorted(jn["roads"]))))
w("\t},")
w("\tsigns = {")
for s in signs:
    blades = ", ".join("{ road = %d, dir = {%s, %s} }" % (b["road"] + 1, round(b["dir"][0], 4), round(b["dir"][1], 4))
                       for b in s["blades"])
    w("\t\t{ pos = %s, blades = { %s } }," % (lua_pt(s["pos"]), blades))
w("\t},")
w("\tcities = {")
for c in cities:
    w("\t\t{ code = %s, label = %s, centre = %s, spawn = %s, spawnName = %s, spawnTop = %s }," % (
        lua_str(c["code"]), lua_str(c["label"]), lua_pt(c["centre"]), lua_pt(c["spawn"]),
        lua_str(c["spawnName"]), c["spawnTop"]))
w("\t},")
w("\tlandmarks = {")
for m in landmarks:
    w("\t\t{ name = %s, kind = %s, x0 = %s, z0 = %s, x1 = %s, z1 = %s }," % (
        lua_str(m["name"]), lua_str(m["kind"]), m["x0"], m["z0"], m["x1"], m["z1"]))
w("\t},")
w("\trunway = { x0 = %s, z0 = %s, x1 = %s, z1 = %s }," % (runway["x0"], runway["z0"], runway["x1"], runway["z1"]))
w("\tterrain = {")
w("\t\trowHeight = %d," % ROW)
wa = terrain["water"]
w("\t\twater = { x0 = %s, x1 = %s, z0 = %s, z1 = %s }," % (wa["x0"], wa["x1"], wa["z0"], wa["z1"]))
for key in ("sand", "grass", "concrete"):
    w("\t\t%s = { %s }," % (key, ", ".join("{%s, %s, %s}" % row for row in terrain[key])))
w("\t},")
w("\tmountain = {")
w("\t\tx0 = %s, z0 = %s, cell = %d, cols = %d, rockAbove = %d, snowAbove = %d," % (
    mountain["x0"], mountain["z0"], CELL, mountain["cols"], mountain["rockAbove"], mountain["snowAbove"]))
w("\t\trows = {")
for row in mountain["rows"]:
    w("\t\t\t{ %s }," % ", ".join(str(h) for h in row))
w("\t\t},")
w("\t},")
w("}")
OUT_LUAU.parent.mkdir(parents=True, exist_ok=True)
OUT_LUAU.write_text("\n".join(L) + "\n")

# ------------------------------------------------------------ layout.json
OUT_DIR.mkdir(parents=True, exist_ok=True)
layout = {
    "about": "The island for Roblox. Studs; origin at the island centre; north = -Z. 1 island unit = 6 studs = 2 m.",
    "size": {"x": r1(cx1 - cx0), "z": r1(cz1 - cz0)},
    "roads": [{"code": r["code"], "name": r["name"], "kind": r["kind"], "city": r["city"], "width": r["width"],
               "lengthStuds": round(r["length"]), "points": [[r1(x), r1(z)] for x, z in r["points"]]} for r in roads],
    "junctions": [{"pos": [r1(j["pos"][0]), r1(j["pos"][1])], "roads": sorted(roads[k]["name"] for k in j["roads"])}
                  for j in junctions],
    "cities": [{"code": c["code"], "label": c["label"], "centre": [r1(c["centre"][0]), r1(c["centre"][1])],
                "spawn": [r1(c["spawn"][0]), r1(c["spawn"][1])], "spawnName": c["spawnName"]} for c in cities],
    "landmarks": landmarks,
    "coast": [[r1(x), r1(z)] for x, z in coast],
}
(OUT_DIR / "layout.json").write_text(json.dumps(layout, indent=1))

# ------------------------------------------------------------ layout.svg (+ PNGs)
PAD = 500
VX0, VZ0 = cx0 - PAD, cz0 - PAD
VW, VH = (cx1 - cx0) + 2 * PAD, (cz1 + 700 - cz0) + 2 * PAD   # +700: room for the airport south of the coast
ROAD_FILL = {"highway": "#3f4347", "arterial": "#4a4e52", "street": "#5a5e62", "street312": "#5a5e62",
             "backroad": "#6c6a62", "track": "#8a7a5a"}


def path_d(pts, closed=False):
    d = "M" + " L".join("%s %s" % (r1(x), r1(z)) for x, z in pts)
    return d + (" Z" if closed else "")


def build_svg(labeled):
    o = []
    a = o.append
    a('<svg xmlns="http://www.w3.org/2000/svg" viewBox="%s %s %s %s" width="%d" height="%d">' % (
        r1(VX0), r1(VZ0), r1(VW), r1(VH), int(VW / 3), int(VH / 3)))
    a('<rect x="%s" y="%s" width="%s" height="%s" fill="#2a6f9a"/>' % (r1(VX0), r1(VZ0), r1(VW), r1(VH)))
    a('<path d="%s" fill="#e2d3a4"/>' % path_d(coast, True))
    grass_poly = coast  # draw grass slightly inset by stroking sand over the edge
    a('<path d="%s" fill="#8f9a5e" stroke="#e2d3a4" stroke-width="%d"/>' % (path_d(grass_poly, True), BEACH * 2))
    a('<path d="%s" fill="none" stroke="#d8c690" stroke-width="6"/>' % path_d(coast, True))
    # mountain contours
    for frac, col in ((0.02, "#7d8a4a"), (0.25, "#8a8172"), (0.5, "#9c9384"), (0.75, "#b4ab9b")):
        a('<ellipse cx="%s" cy="%s" rx="%s" ry="%s" fill="%s" opacity=".85"/>' % (
            r1(mx), r1(mz), r1(rx * math.sqrt(1 - (frac) ** (2 / 3))), r1(rz * math.sqrt(1 - (frac) ** (2 / 3))), col))
    for poly in (AIRPORT, APRON):
        a('<path d="%s" fill="#b9b6ad" stroke="#8d8a83" stroke-width="8"/>' % path_d([to_studs(*p) for p in poly], True))
    a('<rect x="%s" y="%s" width="%s" height="%s" fill="#3a3d40"/>' % (
        runway["x0"], runway["z0"], r1(runway["x1"] - runway["x0"]), r1(runway["z1"] - runway["z0"])))
    # landmark areas
    for m in landmarks:
        if m["kind"] in ("towers", "port"):
            a('<rect x="%s" y="%s" width="%s" height="%s" fill="%s" opacity=".35" rx="30"/>' % (
                m["x0"], m["z0"], r1(m["x1"] - m["x0"]), r1(m["z1"] - m["z0"]),
                "#c3cad2" if m["kind"] == "towers" else "#c08a3e"))
    # roads: casing then fill, widest last so big roads sit on top
    order = sorted(range(len(roads)), key=lambda k: roads[k]["width"])
    for k in order:
        r = roads[k]
        a('<path d="%s" fill="none" stroke="#2b2d30" stroke-width="%s" stroke-linejoin="round" stroke-linecap="round"/>' % (
            path_d(r["points"], r["closed"]), r["width"] + 8))
    for k in order:
        r = roads[k]
        a('<path id="r%d" d="%s" fill="none" stroke="%s" stroke-width="%s" stroke-linejoin="round" stroke-linecap="round"/>' % (
            k, path_d(r["points"], r["closed"]), ROAD_FILL[r["kind"]], r["width"]))
        if r["kind"] in ("highway", "arterial"):
            a('<path d="%s" fill="none" stroke="#e2b93b" stroke-width="2.5" stroke-dasharray="30 20"/>' % path_d(r["points"], r["closed"]))
    if labeled:
        # junction dots
        for jn in junctions:
            a('<circle cx="%s" cy="%s" r="9" fill="#ffffff" opacity=".8"/>' % (r1(jn["pos"][0]), r1(jn["pos"][1])))
        # road names along the road (text runs left to right)
        for k, r in enumerate(roads):
            pts = r["points"]
            if pts[-1][0] < pts[0][0] and not r["closed"]:
                pts = list(reversed(pts))
            fs = {"highway": 44, "arterial": 34, "street": 26, "street312": 26, "backroad": 22, "track": 20}[r["kind"]]
            if r["length"] < 200:
                fs = max(14, fs * 0.6)
            a('<path id="lp%d" d="%s" fill="none" stroke="none"/>' % (k, path_d(pts)))
            a('<text font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="%s" fill="#ffffff" '
              'stroke="#111" stroke-width="%s" paint-order="stroke" dy="%s">'
              '<textPath href="#lp%d" startOffset="50%%" text-anchor="middle">%s <tspan fill="#9fe3ff" font-size="%s">%s</tspan>'
              '</textPath></text>' % (r1(fs), r1(fs / 5), r1(fs / 3), k, r["name"].replace("&", "&amp;"),
                                      r1(fs * 0.7), r["code"]))
        for m in landmarks:
            a('<text x="%s" y="%s" font-family="Arial" font-size="70" font-weight="700" fill="#fff7d6" stroke="#000" '
              'stroke-width="10" paint-order="stroke" text-anchor="middle" opacity=".9">%s</text>' % (
                r1((m["x0"] + m["x1"]) / 2), r1(m["z0"] - 30 if m["kind"] != "mountain" else (m["z0"] + m["z1"]) / 2),
                m["name"].replace("&", "&amp;")))
        for c in cities:
            a('<text x="%s" y="%s" font-family="Arial" font-size="160" font-weight="900" fill="#ffffff" stroke="#000" '
              'stroke-width="18" paint-order="stroke" text-anchor="middle" opacity=".55">%s</text>' % (
                r1(c["centre"][0]), r1(c["centre"][1]), c["code"]))
            a('<circle cx="%s" cy="%s" r="26" fill="#3ddc84" stroke="#000" stroke-width="6"/>' % (
                r1(c["spawn"][0]), r1(c["spawn"][1])))
        # grid every 1000 studs + scale bar + north arrow
        g = 1000
        for x in range(int(math.floor(VX0 / g) * g), int(VX0 + VW), g):
            a('<line x1="%d" y1="%s" x2="%d" y2="%s" stroke="#ffffff" stroke-opacity=".15" stroke-width="4"/>' % (x, r1(VZ0), x, r1(VZ0 + VH)))
            a('<text x="%d" y="%s" font-family="Arial" font-size="50" fill="#ffffff" opacity=".6">X %d</text>' % (x + 10, r1(VZ0 + 60), x))
        for z in range(int(math.floor(VZ0 / g) * g), int(VZ0 + VH), g):
            a('<line x1="%s" y1="%d" x2="%s" y2="%d" stroke="#ffffff" stroke-opacity=".15" stroke-width="4"/>' % (r1(VX0), z, r1(VX0 + VW), z))
            a('<text x="%s" y="%d" font-family="Arial" font-size="50" fill="#ffffff" opacity=".6">Z %d</text>' % (r1(VX0 + 10), z - 10, z))
        bx, bz = VX0 + 200, VZ0 + VH - 200
        a('<rect x="%s" y="%s" width="1000" height="24" fill="#fff"/><text x="%s" y="%s" font-family="Arial" font-size="56" fill="#fff">'
          '1,000 studs (~333 m)</text>' % (r1(bx), r1(bz), r1(bx), r1(bz - 30)))
        nx, nz = VX0 + VW - 250, VZ0 + 250
        a('<path d="M%s %s l-60 160 l60 -40 l60 40 Z" fill="#fff"/><text x="%s" y="%s" font-family="Arial" font-size="80" '
          'font-weight="700" fill="#fff" text-anchor="middle">N</text>' % (r1(nx), r1(nz), r1(nx), r1(nz - 20)))
    a("</svg>")
    return "\n".join(o)


svg_labeled = build_svg(True)
(OUT_DIR / "layout.svg").write_text(svg_labeled)
(OUT_DIR / "_clean.svg").write_text(build_svg(False))

render = r"""
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ deviceScaleFactor: 1 });
  for (const [src, out, w] of JSON.parse(process.argv[1])) {
    const svg = fs.readFileSync(src, 'utf8');
    const m = svg.match(/viewBox="([^"]+)"/)[1].split(' ').map(Number);
    const h = Math.round(w * m[3] / m[2]);
    await p.setViewportSize({ width: w, height: h });
    await p.setContent(`<html><body style="margin:0">${svg.replace(/width="\d+" height="\d+"/, `width="${w}" height="${h}"`)}</body></html>`);
    await p.screenshot({ path: out, clip: { x: 0, y: 0, width: w, height: h } });
  }
  await b.close();
})();
"""
jobs = [[str(OUT_DIR / "layout.svg"), str(OUT_DIR / "layout-labeled.png"), 6000],
        [str(OUT_DIR / "_clean.svg"), str(OUT_DIR / "layout-clean.png"), 4000]]
subprocess.run(["node", "-e", render, json.dumps(jobs)], check=True)
(OUT_DIR / "_clean.svg").unlink()

print("roads %d, junctions %d, signs %d, mountain columns %d" % (
    len(roads), len(junctions), len(signs), int((height > 0).sum())))
print("island %d x %d studs" % (cx1 - cx0, cz1 - cz0))
print("wrote", OUT_LUAU.relative_to(REPO), "and roblox/map/")
