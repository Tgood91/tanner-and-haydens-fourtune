#!/usr/bin/env python3
# ============================================================
# tools/gen-island-map.py — draws island-map.html, the whole island
#
#   python3 tools/gen-island-map.py > island-map.html
#
# The aerial concept shots, as a top-down map: the 312 port city in
# the north, the farm country and the mountain in the middle, the
# 1017 at the south end with the airport on the water. Everything
# we've built is on it: towers, docks and ships, Glizzys-2-Go and
# dockhand stations, hot dog carts (new spots every load), traffic,
# potholes and construction, casings. Schematic, not walked coords.
# ============================================================
import json, math, random, pathlib, re, subprocess, sys
random.seed(1017312)
W, H = 1500, 1000
out = []
def a(s): out.append(s)
def f(v): return f"{v:.1f}"

def smooth(points, closed=True):
    """Catmull-Rom through the points, as a cubic bezier path."""
    p = points[:]
    n = len(p)
    d = f"M{f(p[0][0])} {f(p[0][1])}"
    rng = range(n) if closed else range(n - 1)
    for i in rng:
        p0 = p[(i - 1) % n] if closed or i > 0 else p[0]
        p1 = p[i]; p2 = p[(i + 1) % n]
        p3 = p[(i + 2) % n] if closed or i + 2 < n else p2
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        d += f" C{f(c1[0])} {f(c1[1])} {f(c2[0])} {f(c2[1])} {f(p2[0])} {f(p2[1])}"
    return d + (" Z" if closed else "")

def ellipse_path(cx, cy, rx, ry):
    return f"M{cx-rx} {cy} A{rx} {ry} 0 1 0 {cx+rx} {cy} A{rx} {ry} 0 1 0 {cx-rx} {cy} Z"

def inside_ellipse(x, y, cx, cy, rx, ry): return ((x-cx)/rx)**2 + ((y-cy)/ry)**2 <= 1

ISLAND = [(150,330),(240,205),(420,150),(640,105),(900,92),(1120,112),(1290,165),(1395,265),(1445,420),
          (1435,600),(1390,745),(1300,840),(1180,872),(760,880),(300,872),(195,840),(115,735),(72,600),(62,455),(90,375)]
MOUNTAIN = (780, 455)
WEST_TOWERS = (370, 510, 128, 102)  # the west tower district (FAFO ST ... EUPHORIA Lane): no trees or farms in it
RING = (760, 470, 620, 345)        # The Perimeter: round the 312 waterfront, shares the south run with the Inner Loop
INNER = (760, 700, 380, 115)       # the Inner Loop round the 1017 towers
MLOOP = (820, 470, 285, 150)       # County Line Road, round the mountain (clear of the 312)

# ---------------------------------------------------------------- defs
a(f'''<svg id="island" viewBox="0 0 {W} {H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The island: 312 north, the mountain, 1017 south">
<defs>
  <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a6f9a"/><stop offset="1" stop-color="#174f78"/></linearGradient>
  <linearGradient id="land" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9aa36f"/><stop offset=".5" stop-color="#8f9a5e"/><stop offset="1" stop-color="#a49c70"/></linearGradient>
  <radialGradient id="rock" cx=".5" cy=".35" r=".7"><stop offset="0" stop-color="#b4ab9b"/><stop offset=".55" stop-color="#8a8172"/><stop offset="1" stop-color="#5f6a45"/></radialGradient>
  <radialGradient id="hill" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#7d8a4a"/><stop offset=".7" stop-color="#8a9356"/><stop offset="1" stop-color="#8f9a5e" stop-opacity="0"/></radialGradient>
  <clipPath id="clip-island"><path d="{smooth(ISLAND)}"/></clipPath>
  <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="1.5" dy="2" stdDeviation="1.2" flood-opacity=".45"/></filter>
  <pattern id="containers" width="12" height="6" patternUnits="userSpaceOnUse">
    <rect width="6" height="6" fill="#c0392b"/><rect x="6" width="6" height="6" fill="#2e86c1"/></pattern>
</defs>
<rect width="{W}" height="{H}" fill="url(#sea)"/>
<g id="waves" stroke="rgba(255,255,255,.08)" stroke-width="1.5" fill="none">''')
for i in range(40):
    x, y = random.uniform(0, W), random.uniform(0, H)
    a(f'  <path d="M{f(x)} {f(y)} q8 -4 16 0 t16 0"/>')
a('</g>')

# beach + island
a(f'<path d="{smooth(ISLAND)}" fill="#e2d3a4" transform="translate(0 4)" opacity=".9"/>')
a(f'<path id="coast" d="{smooth(ISLAND)}" fill="url(#land)" stroke="#d8c690" stroke-width="5"/>')

# ---------------------------------------------------------------- farmland patchwork (under everything)
a('<g id="fields" clip-path="url(#clip-island)">')
FIELD_COLORS = ["#6f8f45","#7f9b4c","#a8a25a","#c2b064","#5f7f3e","#93a254","#b39b55","#86a04f"]
cx, cy, rx, ry = RING
for gx in range(120, 1420, 46):
    for gy in range(250, 820, 40):
        x = gx + random.uniform(-6, 6); y = gy + random.uniform(-5, 5)
        if not inside_ellipse(x, y, cx, cy, rx - 15, ry - 15): continue
        if inside_ellipse(x, y, MOUNTAIN[0], MOUNTAIN[1], 230, 160): continue    # the mountain
        if y > 560 and 470 < x < 1080: continue                                  # 1017
        if y < 300 and 400 < x < 1150: continue                                  # 312
        if x < 360 and y < 640 and inside_ellipse(x, y, 250, 470, 170, 200): continue  # west hills
        w = random.uniform(30, 44); h = random.uniform(26, 36)
        a(f'  <rect x="{f(x)}" y="{f(y)}" width="{f(w)}" height="{f(h)}" fill="{random.choice(FIELD_COLORS)}" '
          f'transform="rotate({f(random.uniform(-8,8))} {f(x+w/2)} {f(y+h/2)})" opacity=".9"/>')
a('</g>')

# west hills + forests
a(f'<ellipse cx="250" cy="470" rx="190" ry="215" fill="url(#hill)"/>')
a(f'<ellipse cx="1360" cy="560" rx="90" ry="150" fill="url(#hill)" opacity=".7"/>')
def forest(cx, cy, rx, ry, n, dark="#2f5a2c", light="#3f7036", title=""):
    a(f'<g class="woods">' + (f'<title>{title}</title>' if title else ''))
    for _ in range(n):
        t = random.uniform(0, 2*math.pi); r = math.sqrt(random.random())
        x = cx + rx*r*math.cos(t); y = cy + ry*r*math.sin(t)
        if inside_ellipse(x, y, *WEST_TOWERS): continue          # cleared for the west towers
        s = random.uniform(4, 7.5)
        a(f'  <circle cx="{f(x)}" cy="{f(y)}" r="{f(s)}" fill="{random.choice([dark, light])}"/>')
    a('</g>')
forest(230, 420, 120, 150, 260, title="The west hills")
forest(300, 640, 70, 60, 70)
forest(1350, 560, 50, 90, 60)
forest(520, 330, 60, 30, 40)
forest(1080, 340, 60, 26, 40)

# ---------------------------------------------------------------- the mountain
mx, my = MOUNTAIN
forest(mx, my + 40, 235, 150, 520, title="The mountain's forest")
peak = [(mx-200,my+95),(mx-150,my+20),(mx-95,my-55),(mx-40,my-120),(mx+5,my-150),(mx+55,my-110),(mx+120,my-40),
        (mx+175,my+25),(mx+215,my+100),(mx+120,my+130),(mx,my+120),(mx-110,my+135)]
a(f'<path d="{smooth(peak)}" fill="url(#rock)" opacity=".95"><title>The mountain</title></path>')
for dx, dy in [(-130,90),(-70,95),(-20,100),(40,95),(100,100),(160,90)]:
    a(f'<path d="M{mx+5} {my-150} Q{mx+dx*.5} {my-30} {mx+dx} {my+dy}" stroke="rgba(60,52,40,.45)" stroke-width="3" fill="none"/>')
a(f'<path d="M{mx-35} {my-125} L{mx+5} {my-152} L{mx+50} {my-112} Q{mx+5} {my-120} {mx-35} {my-125}Z" fill="#f1f0ea"/>')
forest(mx-60, my+80, 90, 40, 120)
forest(mx+90, my+70, 90, 40, 120)

# ---------------------------------------------------------------- 312 city blocks (grid)
# Buildings are collected here and drawn once every road is known (see "buildings meet
# the streets" near the end): any that would sit on a road are left out, and the city
# streets get buildings along both sides, facing the street.
BUILDINGS = []    # (group, x, y, w, h, svg) — x, y, w, h is the footprint's bounding box
def bld(group, x, y, w, h, svg): BUILDINGS.append((group, x, y, w, h, svg))

# 312 high-rises: every block gets a tower, tallest in the core round the Connector and
# B Avenue and stepping down to the waterfront. Candidates in order of preference: one big
# tower, a pair of slender ones, four small ones, then six slim point towers; whichever clear the roads stay, and
# the low-rise below fills what's left. Own random stream, so nothing else on the map moves.
HR = random.Random(312)
def highrise(x, y, s_w, s_h, core):
    fl = int(18 + 52 * core + HR.uniform(0, 14))
    sh = fl * .1
    bld("312-towers", x, y, s_w, s_h,
        f'  <g class="tower"><title>312 high-rise — {fl} floors</title>'
        f'<rect x="{f(x + sh)}" y="{f(y + sh)}" width="{f(s_w)}" height="{f(s_h)}" fill="rgba(20,24,30,.4)"/>'
        f'<rect x="{f(x)}" y="{f(y)}" width="{f(s_w)}" height="{f(s_h)}" fill="#aeb6bf" stroke="#353b42" stroke-width="1"/>'
        f'<rect x="{f(x + s_w * .22)}" y="{f(y + s_h * .22)}" width="{f(s_w * .56)}" height="{f(s_h * .56)}" fill="none" stroke="#7a838c" stroke-width=".8"/></g>')

a('<g id="city-312" clip-path="url(#clip-island)">')
for gx in range(430, 1130, 34):
    for gy in range(140, 300, 30):
        if not inside_ellipse(gx, gy, 770, 165, 380, 175): continue
        if random.random() < .08: continue
        shade = random.choice(["#8f9499","#a2a6aa","#7d838a","#b2b0a8","#969a90"])
        a(f'  <rect x="{gx+3}" y="{gy+3}" width="26" height="22" fill="#6f7479"/>')      # the block's pavement stays
        core = max(0.0, 1 - math.hypot((gx + 16 - 760) / 330, (gy + 14 - 205) / 120))
        bx0, by0, bw_, bh_ = gx + 5, gy + 5, 22, 18                                     # the block, clear of its streets
        highrise(bx0 + 2 + HR.uniform(0, 2), by0 + 1 + HR.uniform(0, 2), 16, 14, core)   # one big tower
        for k in range(2):                                                               # or a slender pair
            highrise(bx0 + k * 11.5, by0 + HR.uniform(0, 3), 10, 15, core * .9)
        for k in range(4):                                                               # or up to four small ones
            highrise(bx0 + (k % 2) * 12, by0 + (k // 2) * 9.5, 9.5, 8.5, core * .7)
        for k in range(6):                                                               # or slim point towers in the corners a road left
            highrise(bx0 + (k % 3) * 7.8, by0 + (k // 3) * 10, 6.4, 7.2, core * .6)
        for _ in range(8):          # candidates: the ones clear of roads and each other are kept
            bw, bh = random.uniform(7, 14), random.uniform(6, 10)
            bx, by = gx + 4 + random.uniform(0, 26 - bw - 2), gy + 4 + random.uniform(0, 22 - bh - 2)
            bld("city-312", bx, by, bw, bh, f'  <rect x="{f(bx)}" y="{f(by)}" width="{f(bw)}" height="{f(bh)}" fill="{shade}" filter="url(#shadow)"/>')
a('%%city-312%%')          # after the pavement, so the buildings sit on top of it
a('</g>')

# ---------------------------------------------------------------- 1017 houses (east and west of downtown)
a('<g id="houses-1017">')
for gx in range(930, 1250, 15):
    for gy in range(610, 800, 14):
        if not inside_ellipse(gx, gy, *RING[:2], RING[2]-20, RING[3]-20): continue
        if inside_ellipse(gx, gy, *INNER[:2], INNER[2]-25, INNER[3]-12) and gx < 1080: continue
        if random.random() < .25: continue
        col = random.choice(["#a8674c","#8f5e48","#b9b2a3","#7b8b9a","#c4a07a"])
        bld("houses-1017", gx, gy, 9, 8, f'  <rect x="{gx}" y="{gy}" width="9" height="8" fill="{col}" filter="url(#shadow)"/>')
for gx in range(330, 560, 26):
    for gy in range(620, 790, 22):
        if not inside_ellipse(gx, gy, *RING[:2], RING[2]-20, RING[3]-20): continue
        if random.random() < .3: continue
        bld("houses-1017", gx - 1, gy - 4, 20, 20, f'  <rect x="{gx}" y="{gy}" width="18" height="12" fill="#8d8579" transform="rotate(-28 {gx+9} {gy+6})" filter="url(#shadow)"/>')
a('%%houses-1017%%')
a('%%frontage%%')
a('</g>')

# ---------------------------------------------------------------- roads
ROADS = []   # (id, name, d, kind)
def road(rid, name, d, kind="highway"): ROADS.append((rid, name, d, kind))
road("perimeter", "The Perimeter — the island ring", ellipse_path(*RING))
road("inner-loop", "The Inner Loop — round the 1017 towers", ellipse_path(*INNER))
road("county-line", "County Line Road — round the mountain", ellipse_path(*MLOOP), "arterial")
road("connector", "The Connector — 312 to 1017, round the mountain and out over the bridge",
     smooth([(760,120),(760,230),(700,320),(615,410),(610,520),(660,600),(745,650),(760,720),(760,860),(760,1000)], closed=False))
road("flyover", "The Flyover — off the Perimeter into the 1017 interchange",
     smooth([(300,640),(420,640),(560,620),(700,640),(760,655)], closed=False), "arterial")
road("lakeshore", "Lakeshore Drive — the 312 waterfront", smooth([(1130,120),(1240,180),(1330,250),(1385,330)], closed=False), "arterial")
road("skyway", "The 312 Skyway", "M470 230 L1060 160", "arterial")
road("ironline", "Ironline Expressway", smooth([(330,210),(420,250),(480,320),(470,420)], closed=False), "arterial")
road("palisade", "Palisade Boulevard", "M440 300 L1120 300", "arterial")
road("causeway", "The Causeway — to the 312 docks", "M1120 230 L1300 150", "arterial")
road("backroads", "The Backroads", smooth([(420,560),(470,470),(560,420),(615,410)], closed=False), "street")
road("backroads-hwy", "Backroads Highway", smooth([(1105,460),(1180,520),(1240,620),(1280,700)], closed=False), "arterial")
road("red-clay", "Red Clay Expressway", "M560 680 L960 690", "arterial")
road("westside-run", "Westside Run", smooth([(150,700),(260,690),(390,680)], closed=False), "arterial")
road("peachline", "Peachline Road", "M400 720 L590 735", "street")
road("highfield", "Highfield Park Drive — down to the 1017 harbor", smooth([(1090,720),(1230,760),(1320,790)], closed=False), "street")
road("primrose", "Primrose Street — south off Highfield Park Drive", "M1150 737 L1150 812", "street")
road("crystal-lake", "Crystal Lake Drive — along the south of the east houses to Primrose", "M935 812 L1150 812", "street")
road("airport-road", "Airport Road", "M260 860 L1250 860", "street")
# The west tower district, in the west hills: three streets across, one down the middle,
# and a lane curving through to The Backroads.
road("fafo-st", "FAFO ST.", "M268 455 L470 455", "street")
road("fomo-st", "FOMO ST", "M250 505 L490 505", "street")
road("fud-st", "FUD ST", "M262 555 L478 555", "street")
road("cope-st", "COPE ST", "M368 418 L368 600", "street")
road("euphoria-ln", "EUPHORIA Lane", smooth([(285,590),(340,575),(400,540),(440,500),(470,450)], closed=False) + " M400 540 L420 560", "street")
road("hodl-st", "HODL ST", smooth([(286,505),(289,530),(291,555),(296,572),(302,586)], closed=False), "street")   # FOMO ST down to EUPHORIA Lane
FARM_NAMES = ["Orchard Track", "Millpond Lane", "Windmill Lane", "Sawmill Track", "Pasture Way", "Haybale Lane", "Ridge Track"]
for i, (x1, y1, x2, y2) in enumerate([(500,640,575,610),(980,560,1100,600),(1180,420,1260,330),(260,330,380,300),(1050,380,1170,330),(480,470,520,560),(1000,250,1080,330)]):
    road(f"farm-{i+1}", FARM_NAMES[i], f"M{x1} {y1} Q{(x1+x2)/2+20} {(y1+y2)/2-20} {x2} {y2}", "track")
# 312 grid streets: numbered west to east, lettered avenues north to south, like a real downtown
def ordinal(n): return f"{n}{'th' if 10 <= n % 100 <= 20 else {1: 'st', 2: 'nd', 3: 'rd'}.get(n % 10, 'th')}"
for n, gx in enumerate([g for g in range(430, 1140, 34) if abs(g - 760) > 15], 1):   # none doubling up on the Connector
    road(f"st312-v{gx}", f"{ordinal(n)} Street", f"M{gx} {150 if 560<gx<1000 else 175} L{gx} 300", "street312")
for n, gy in enumerate(range(170, 290, 30)):   # A-D: the ring road is the waterfront edge, Palisade the south one
    road(f"st312-h{gy}", f"{'ABCDEF'[n]} Avenue", f"M{440 if gy>200 else 520} {gy} L{1120 if gy>200 else 1030} {gy}", "street312")
# Added after the grid so it takes the next 312 number and nothing else is renumbered.
road("cut-st", "Cut St.", smooth([(821,189),(815,208),(817,228),(810,250),(812,270),(819,288),(822,300)], closed=False), "street")   # the 312: the Skyway down to Palisade

STYLE = {"highway": (16, "#5c5f63", "#cfd0cc"), "arterial": (11, "#5c5f63", "#d4d4cf"),
         "street": (7, "#6a6c6e", "#d9d6cc"), "street312": (4, None, "#8a8e93"), "track": (3, None, "#c9b48a")}
# ---------------------------------------------------------------- every gameplay street (from js-snippets/places.js)
# Each city's named roads are fitted into its part of the island; the main roads the island
# already draws by hand are skipped so nothing shows twice. Names on hover, and as labels once zoomed in.
REPO = pathlib.Path(__file__).resolve().parent.parent
GAME = json.loads(subprocess.run(["node", "-e", """
const p = require('./js-snippets/places.js'), c = require('./js-snippets/cities.js');
console.log(JSON.stringify({
  roads: p.ROADS.map(r => ({ name: r.name, code: r.code, pinned: !!r.pinned, kind: r.kind, city: c.cityAt(r.points[0]), points: r.points.map(q => [q.x, q.y]) })),
  cityCode: p.CITY_CODE, kindLetter: p.KIND_LETTER,
  zones: p.ZONES.map(z => ({ name: z.name, kind: z.kind, city: z.city, x: z.center.x, y: z.center.y, r: z.radius })),
  borders: { chicago: c.CHICAGO_STARTS_AT_Y, geepee: c.GEEPEE_STARTS_AT_Y },
}));"""], cwd=REPO, capture_output=True, text=True, check=True).stdout)
ON_ISLAND = {"Cut St.", "Primrose Street", "Crystal Lake Drive", "The Perimeter", "County Line Road", "The Connector", "Lakeshore Drive", "The 312 Skyway", "Ironline Expressway",
             "Palisade Boulevard", "The Causeway", "Backroads Highway", "Red Clay Expressway", "Westside Run", "Peachline Road"}
CITY_BOX = {"chicago": (440, 1120, 128, 300), "geepee": (360, 1200, 320, 575), "atlanta": (300, 1260, 590, 860)}
CODE = {"chicago": "312", "geepee": "770", "atlanta": "1017"}
def fitter(city):
    xs = [q[0] for r in GAME["roads"] if r["city"] == city for q in r["points"]]
    ys = [q[1] for r in GAME["roads"] if r["city"] == city for q in r["points"]]
    for z in GAME["zones"]:
        if z["city"] == city: xs += [z["x"] - z["r"], z["x"] + z["r"]]; ys += [z["y"] - z["r"], z["y"] + z["r"]]
    # Stretched to fill the city's whole area (x and y scale separately): the island is schematic,
    # and spreading the streets out keeps every name readable when zoomed in.
    x0, x1, y0, y1 = CITY_BOX[city]
    kx = (x1 - x0) / (max(xs) - min(xs)); ky = (y1 - y0) / (max(ys) - min(ys))
    FIT_PARAMS[city] = {"minX": min(xs), "maxX": max(xs), "minY": min(ys), "maxY": max(ys), "x0": x0, "x1": x1, "y0": y0, "y1": y1}
    return lambda x, y: (x0 + (x - min(xs)) * kx, y0 + (max(ys) - y) * ky)     # game y runs north
FIT_PARAMS = {}   # the same fit, handed to the page: "you are here" and click-to-waypoint use it
FIT = {c: fitter(c) for c in CITY_BOX}

# Every road on the island gets a name and a number. Roads the game knows keep their
# places.js number (1017-H1 ...); the map-only ones carry on each city's sequence.
CODE_BY_NAME = {r["name"]: r["code"] for r in GAME["roads"]}
NEXT = {}
for r in GAME["roads"]:
    if r["pinned"]: continue                  # its own number, not a place in the sequence
    key = (r["city"], GAME["kindLetter"][r["kind"]]); NEXT[key] = NEXT.get(key, 0) + 1
MAP_ONLY = {"fafo-st": ("geepee", "S"), "fomo-st": ("geepee", "S"), "fud-st": ("geepee", "S"),
            "cope-st": ("geepee", "S"), "euphoria-ln": ("geepee", "S"), "hodl-st": ("geepee", "S"),
            "inner-loop": ("atlanta", "H"), "flyover": ("atlanta", "A"), "backroads": ("geepee", "S"),
            "highfield": ("atlanta", "S"), "airport-road": ("atlanta", "S"),
            "cut-st": ("chicago", "S")}
def map_only_kind(rid):
    if rid in MAP_ONLY: return MAP_ONLY[rid]
    if rid.startswith("farm-"): return ("geepee", "B")
    if rid.startswith("st312-"): return ("chicago", "S")
    return None
ROAD_CODE = {}
for rid, name, d, k in ROADS:
    base = name.split(" — ")[0]
    if base in CODE_BY_NAME: ROAD_CODE[rid] = CODE_BY_NAME[base]; continue
    city, letter = map_only_kind(rid)
    NEXT[(city, letter)] = NEXT.get((city, letter), 0) + 1
    ROAD_CODE[rid] = f'{GAME["cityCode"][city]}-{letter}{NEXT[(city, letter)]}'
assert len(set(ROAD_CODE.values())) == len(ROAD_CODE), "two island roads share a number"
STREET_STYLE = {"highway": (6, "#cfd0cc", "#5c5f63", ""), "arterial": (5, "#d4d4cf", "#5c5f63", ""),
                "street": (3.2, "#d9d6cc", "#6a6c6e", ""), "backroad": (2.2, "#c9b48a", None, "4 3")}
LABELS = []   # (path id, name, kind)
STREET_LINES = []   # (points, width, kind, city) of every game street drawn, for the buildings
a('<g id="streets" fill="none" stroke-linecap="round" stroke-linejoin="round">')
for kind in ["backroad", "street", "arterial", "highway"]:
    for i, r in enumerate(GAME["roads"]):
        if r["kind"] != kind or r["name"] in ON_ISLAND: continue
        pts = [FIT[r["city"]](x, y) for x, y in r["points"]]
        if pts[-1][0] < pts[0][0]: pts.reverse()                    # so the label reads left to right
        d = "M" + " L".join(f"{f(x)} {f(y)}" for x, y in pts)
        w, fill, casing, dash = STREET_STYLE[kind]
        if casing: a(f'  <path d="{d}" stroke="{casing}" stroke-width="{w + 2}"/>')
        rid = f"gs-{i}"
        a(f'  <path id="{rid}" class="road gp-street {kind}" d="{d}" stroke="{fill}" stroke-width="{w}"'
          + (f' stroke-dasharray="{dash}"' if dash else "") + f'><title>{r["name"]} · {r["code"]} ({kind})</title></path>')
        LABELS.append((rid, r["name"], kind, r["code"]))
        STREET_LINES.append((pts, w, kind, r["city"]))
a('</g>')

a('<g id="roads" fill="none" stroke-linecap="round" stroke-linejoin="round">')
for kind in ["street312", "track", "street", "arterial", "highway"]:
    for rid, name, d, k in ROADS:
        if k != kind: continue
        w, casing, fill = STYLE[k]
        clip = ' clip-path="url(#clip-island)"' if k == "street312" else ""
        if casing: a(f'  <path d="{d}" stroke="{casing}" stroke-width="{w+4}"{clip}/>')
        dash = ' stroke-dasharray="6 4"' if k == "track" else ""
        a(f'  <path id="{rid}" class="road {k}" d="{d}" stroke="{fill}" stroke-width="{w}"{dash}{clip}><title>{name} · {ROAD_CODE[rid]}</title></path>')
        if k == "highway": a(f'  <path d="{d}" stroke="#e8c45a" stroke-width="1" stroke-dasharray="10 8" opacity=".8"/>')
a('</g>')
# interchanges
for x, y, name in [(760,655,"The central interchange"),(760,798,"The south stack"),(745,320,"The 312 junction")]:
    a(f'<circle cx="{x}" cy="{y}" r="22" fill="none" stroke="#cfd0cc" stroke-width="7"><title>{name}</title></circle>')

# ---------------------------------------------------------------- 1017 towers (25+ floors)
a('<g id="towers">')
def towers(x0, x1, y0, y1, step, label):
    for gx in range(x0, x1, step):
        for gy in range(y0, y1, step):
            if abs(gx + step/2 - 760) < 16: continue      # leave the Connector clear
            if random.random() < .15: continue
            fl = random.randint(25, 64)
            s = step - 6; sh = fl * .14
            bld("towers", gx + 3, gy + 3, s, s,
              f'  <g class="tower"><title>{label} — {fl} floors</title>'
              f'<rect x="{gx+3+sh}" y="{gy+3+sh}" width="{s}" height="{s}" fill="rgba(20,24,30,.4)"/>'
              f'<rect x="{gx+3}" y="{gy+3}" width="{s}" height="{s}" fill="#b5bcc4" stroke="#3e444b" stroke-width="1"/>'
              f'<rect x="{gx+3+s*.25}" y="{gy+3+s*.25}" width="{s*.5}" height="{s*.5}" fill="none" stroke="#7f878f" stroke-width=".8"/></g>')
towers(650, 880, 670, 760, 22, "1017 south towers")
towers(680, 850, 590, 640, 20, "1017 north towers")
towers(560, 960, 140, 230, 26, "312 downtown")
# The west towers: the island's biggest. Several candidate spots in each gap between
# FAFO, FOMO, FUD, COPE and EUPHORIA; the ones clear of every road (and each other) stay.
for _ in range(260):
    cx_, cy_ = random.uniform(255, 485), random.uniform(420, 600)
    if not inside_ellipse(cx_, cy_, *WEST_TOWERS): continue
    fl = random.randint(45, 95); sz = random.choice([12, 14, 16]); sh = fl * .09
    x_, y_ = cx_ - sz / 2, cy_ - sz / 2
    bld("west-towers", x_, y_, sz, sz,
        f'  <g class="tower"><title>West towers — {fl} floors</title>'
        f'<rect x="{f(x_ + sh)}" y="{f(y_ + sh)}" width="{sz}" height="{sz}" fill="rgba(20,24,30,.42)"/>'
        f'<rect x="{f(x_)}" y="{f(y_)}" width="{sz}" height="{sz}" fill="#c3cad2" stroke="#2f343a" stroke-width="1.1"/>'
        f'<rect x="{f(x_ + sz * .2)}" y="{f(y_ + sz * .2)}" width="{f(sz * .6)}" height="{f(sz * .6)}" fill="none" stroke="#7f878f" stroke-width=".8"/>'
        f'<rect x="{f(x_ + sz * .4)}" y="{f(y_ + sz * .4)}" width="{f(sz * .2)}" height="{f(sz * .2)}" fill="#8d959d"/></g>')
a('%%towers%%')
a('</g>')

# ---------------------------------------------------------------- the airport
a('<g id="airport">')
a('<path d="M210 882 L1250 882 L1250 975 L250 975 Z" fill="#b9b6ad" stroke="#8d8a83" stroke-width="2"><title>The airport</title></path>')
a('<path d="M1250 860 L1440 830 L1470 930 L1250 975 Z" fill="#b9b6ad" stroke="#8d8a83" stroke-width="2"><title>East apron</title></path>')
a('<rect x="270" y="935" width="930" height="22" fill="#4f5357"><title>Runway</title></rect>')
a('<line x1="285" y1="946" x2="1185" y2="946" stroke="#f2f2f2" stroke-width="2" stroke-dasharray="14 12"/>')
a('<line x1="280" y1="926" x2="1190" y2="926" stroke="#e2b93b" stroke-width="1.5" stroke-dasharray="8 5"/>')
for x, w in [(300,110),(440,90),(860,100),(1010,110),(1300,70)]:
    y = 888 if x < 1250 else 870
    a(f'<rect x="{x}" y="{y}" width="{w}" height="22" rx="2" fill="#4f565d" stroke="#2c3136"><title>Terminal</title></rect>')
a('<circle cx="560" cy="896" r="8" fill="#e8e6df" stroke="#5b6066" stroke-width="2"><title>Control tower</title></circle>')
a('<circle cx="1385" cy="880" r="7" fill="#e8e6df" stroke="#5b6066" stroke-width="2"><title>Control tower</title></circle>')
PLANE = "M0 -12 L1.6 -4 L12 1 L12 3 L1.6 1 L1.2 8 L4.5 11 L4.5 12.5 L0 11.5 L-4.5 12.5 L-4.5 11 L-1.2 8 L-1.6 1 L-12 3 L-12 1 L-1.6 -4 Z"
for x, y, r in [(340,918,180),(380,918,180),(890,918,180),(1050,918,180),(1330,905,160),(1400,900,160),(620,946,90),(1120,946,-90)]:
    a(f'<path d="{PLANE}" transform="translate({x} {y}) rotate({r}) scale(1.3)" fill="#f4f4f0" filter="url(#shadow)"><title>Plane</title></path>')
a('<rect x="752" y="975" width="16" height="25" fill="#7d7f80"><title>The bridge</title></rect>')
a('</g>')

# ---------------------------------------------------------------- docks + ships
a('<g id="docks">')
def pier(x, y, w, h, rot=0, title="Pier"):
    a(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="#8a8f93" stroke="#55595d" transform="rotate({rot} {x} {y})"><title>{title}</title></rect>')
def boxes(x, y, w, h, rot=0):
    a(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="url(#containers)" transform="rotate({rot} {x} {y})"><title>Containers</title></rect>')
def crane(x, y, rot=0):
    a(f'<g transform="translate({x} {y}) rotate({rot})"><title>Crane</title><rect x="-4" y="-4" width="8" height="8" fill="#f2c230" stroke="#7a5d0a"/><rect x="-1.5" y="-22" width="3" height="20" fill="#f2c230" stroke="#7a5d0a" stroke-width=".6"/></g>')
def ship(x, y, l, rot, kind="cargo"):
    body = {"cargo": "#2f3a46", "tanker": "#2f3a46", "ferry": "#efefea", "boat": "#efeadf"}[kind]
    a(f'<g transform="translate({x} {y}) rotate({rot})" filter="url(#shadow)"><title>{ {"cargo":"Cargo ship","tanker":"Tanker","ferry":"Ferry","boat":"Boat"}[kind] }</title>'
      f'<path d="M{-l/2} -{l*.09} L{l*.36} -{l*.09} L{l/2} 0 L{l*.36} {l*.09} L{-l/2} {l*.09} Z" fill="{body}"/>')
    if kind == "cargo": a(f'<rect x="{-l*.4}" y="{-l*.055}" width="{l*.62}" height="{l*.11}" fill="url(#containers)"/>')
    if kind == "tanker": a(f'<rect x="{-l*.38}" y="{-l*.045}" width="{l*.6}" height="{l*.09}" rx="{l*.04}" fill="#b03a2e"/>')
    if kind == "ferry": a(f'<rect x="{-l*.35}" y="{-l*.03}" width="{l*.6}" height="{l*.06}" fill="#2b3a4a"/>')
    a('</g>')
# 312 north-east docks: piers off the coast, the photo's big port
for i, (x, y) in enumerate([(1180,105),(1250,140),(1320,190),(1375,250)]):
    pier(x, y, 120, 22, -38 + i*12, "312 Port pier")
    boxes(x+12, y+5, 70, 11, -38 + i*12)
    crane(x+20, y-6, -38 + i*12)
for x, y, l, r, k in [(1215,70,90,-38,"cargo"),(1300,105,95,-28,"cargo"),(1390,170,90,-14,"tanker"),(1445,250,80,-4,"cargo")]:
    ship(x, y, l, r, k)
# 312 north-west port
pier(240, 185, 140, 26, -18, "312 west port")
boxes(255, 188, 90, 14, -18); crane(270, 180, -18); crane(320, 163, -18)
ship(230, 150, 85, -18, "cargo"); ship(120, 260, 70, 70, "tanker")
ship(560, 70, 90, -4, "ferry")
# 1017 west marina
pier(105, 690, 105, 70, 0, "1017 west yard")
boxes(115, 700, 60, 40)
crane(190, 700)
for y in (770, 790, 810): a(f'<rect x="90" y="{y}" width="70" height="4" fill="#8a7d6b"><title>Marina jetty</title></rect>')
ship(60, 735, 70, 90, "cargo")
for x, y in [(110,780),(120,800),(100,820)]: ship(x, y, 22, 0, "boat")
# 1017 harbor (east)
pier(1300, 760, 26, 90, 0, "1017 Harbor quay")
for y in (770, 800, 830): pier(1326, y, 90, 10, 0, "1017 Harbor pier")
crane(1318, 785, 90); crane(1318, 815, 90)
ship(1375, 787, 80, 0, "cargo"); ship(1375, 817, 76, 0, "tanker")
ship(1460, 700, 90, -60, "cargo"); ship(1120, 990, 100, 180, "tanker"); ship(380, 992, 100, 0, "cargo")
for x, y in [(60,200),(1460,420),(40,560),(1470,560)]:
    a(f'<path d="M{x} {y-8} L{x+6} {y+6} L{x-6} {y+6} Z" fill="#f4f4f0" filter="url(#shadow)"><title>Sailboat</title></path>')
a('</g>')

# ---------------------------------------------------------------- farmsteads
for x, y in [(330,370),(1150,420),(1000,560),(560,640),(1230,320),(560,520)]:
    a(f'<g filter="url(#shadow)"><title>Farm (barn and silo)</title><rect x="{x}" y="{y}" width="16" height="11" fill="#8e2f22" stroke="#4a160f"/><circle cx="{x+22}" cy="{y+3}" r="5" fill="#b8bcc0" stroke="#6f7478"/></g>')

# ---------------------------------------------------------------- parks
for x, y, r, name in [(600,590,22,"Groveland Park"),(1150,690,20,"Harvest Common"),(980,270,18,"Harbor Green"),(470,250,15,"Winterline Park")]:
    a(f'<circle cx="{x}" cy="{y}" r="{r}" fill="#4f8a44" stroke="#2f5a2c" stroke-width="2"><title>{name}</title></circle>')

# ---------------------------------------------------------------- on-road things, placed by script along the roads
# data-on="road-id"  data-t="0..1"  data-lane="px off the centre line"
ON = []
def on(cls, rid, t, lane=0, extra=""): ON.append((cls, rid, t, lane, extra))
for rid, ts in {"perimeter":[.03,.12,.21,.33,.45,.58,.66,.74,.88,.95], "connector":[.08,.2,.35,.5,.62,.8,.92],
                "inner-loop":[.1,.3,.55,.8], "county-line":[.15,.4,.7,.9], "primrose":[.5], "crystal-lake":[.4], "palisade":[.3,.7], "red-clay":[.25,.8],
                "lakeshore":[.5], "backroads-hwy":[.4], "highfield":[.5], "airport-road":[.3,.7]}.items():
    for i, t in enumerate(ts):
        on("car", rid, t, 4 if i % 2 else -4, f'data-color="{random.choice(["#c0392b","#2e86c1","#f4f4f0","#1c1c1c","#e6b422","#27ae60","#8e44ad","#7f8c8d"])}"' + (' data-flip="1"' if i % 2 else ""))
for rid, t in [("perimeter",.16),("perimeter",.52),("perimeter",.8),("connector",.28),("connector",.7),("inner-loop",.42),("county-line",.55),("red-clay",.45),("palisade",.5),("westside-run",.4)]:
    on("pothole", rid, t)
for rid, t in [("connector",.42),("connector",.44),("perimeter",.62),("perimeter",.64)]:
    on("cone", rid, t, 6)
on("barrier", "connector", .43, 5); on("dig", "perimeter", .63, 0)
for rid, t in [("perimeter",.27),("connector",.57),("county-line",.25),("inner-loop",.67),("palisade",.15),("red-clay",.6),("airport-road",.5),("highfield",.3)]:
    on("cart", rid, t, 0, 'data-random="1"')

a('<g id="on-road"></g>')

# ---------------------------------------------------------------- stations (fixed)
def station(x, y, kind, title):
    if kind == "glizzy":
        a(f'<g class="station" transform="translate({x} {y})"><title>{title} — /apply glizzys</title>'
          '<rect x="-12" y="-12" width="24" height="24" rx="5" fill="#f7c948" stroke="#d62828" stroke-width="3"/>'
          '<rect x="-9" y="-3.5" width="18" height="7" rx="3.5" fill="#e0a95a"/><rect x="-10" y="-1.6" width="20" height="3.2" rx="1.6" fill="#b5452b"/></g>')
    else:
        a(f'<g class="station" transform="translate({x} {y})"><title>{title} — /apply dockhand</title>'
          '<rect x="-12" y="-12" width="24" height="24" rx="5" fill="#1f4e79" stroke="#f2c230" stroke-width="3"/>'
          '<rect x="-6" y="-6" width="12" height="12" fill="#c46a2c" stroke="#5a2d0e"/><line x1="-2" y1="-6" x2="-2" y2="6" stroke="#8f4a1c"/><line x1="2" y1="-6" x2="2" y2="6" stroke="#8f4a1c"/></g>')
a('<g id="stations" filter="url(#shadow)">')
for x, y, t in [(705,705,"Glizzys-2-Go, south towers"),(890,630,"Glizzys-2-Go, north-east"),(600,690,"Glizzys-2-Go, Red Clay"),
                (960,760,"Glizzys-2-Go, east houses"),(640,770,"Glizzys-2-Go, west towers")]:
    station(x, y, "glizzy", t)
station(1290, 745, "dock", "Dockhand, 1017 Harbor")
station(1150, 255, "dock", "Dockhand, 312 Port")
a('</g>')

# casings
for cx_, cy_ in [(520,610),(1010,700),(620,180),(380,700)]:
    a(f'<g class="casings"><title>Spent casings</title>')
    for _ in range(6):
        x = cx_ + random.uniform(-10, 10); y = cy_ + random.uniform(-8, 8)
        a(f'<rect x="{f(x)}" y="{f(y)}" width="2" height="5" rx="1" fill="#e0b84f" transform="rotate({random.randint(0,179)} {f(x)} {f(y)})"/>')
    a('</g>')

# ---------------------------------------------------------------- area codes
# ---------------------------------------------------------------- road and place names (show when zoomed in)
a('<g id="names" font-family="Arial, Helvetica, sans-serif" font-weight="700" paint-order="stroke" stroke="#1d2125" stroke-linejoin="round">')
def num(code, size): return f'<tspan class="road-no" font-size="{size}" fill="#9fe3ff"> {code}</tspan>'
for rid, name, d, k in ROADS:
    label = name.split(" — ")[0]
    if k in ("street312", "track", "street"):     # the island's smaller roads: named once zoomed in close
        fill = "#f3e2b8" if k == "track" else "#fff"
        at = {"cope-st": 22}.get(rid, 50)      # move a label off a crossing where it would sit on another
        a(f'  <text class="name street-name" font-size="4.6" fill="{fill}" stroke-width="1.5" dy="1.6"><textPath href="#{rid}" startOffset="{at}%" text-anchor="middle">{label}{num(ROAD_CODE[rid], 3.6)}</textPath></text>')
    else:
        a(f'  <text class="name main-name" font-size="8" fill="#fff" stroke-width="2.4" dy="2.6"><textPath href="#{rid}" startOffset="{25 if d.endswith("Z") else 50}%" text-anchor="middle">{label}{num(ROAD_CODE[rid], 6)}</textPath></text>')
for rid, name, kind, code in LABELS:
    a(f'  <text class="name street-name" font-size="{5 if kind != "backroad" else 4.4}" fill="{"#fff" if kind != "backroad" else "#f3e2b8"}" stroke-width="1.6" dy="1.7"><textPath href="#{rid}" startOffset="50%" text-anchor="middle">{name}{num(code, 3.8)}</textPath></text>')
for z in GAME["zones"]:
    x, y = FIT[z["city"]](z["x"], z["y"])
    a(f'  <text class="name zone-name" x="{f(x)}" y="{f(y)}" text-anchor="middle" font-size="{9 if z["kind"] == "district" else 7}" font-style="italic" '
      f'fill="{"#ffe9a8" if z["kind"] == "district" else "#c9f2b8"}" stroke-width="2.4">{z["name"]}</text>')
a('</g>')

# ---------------------------------------------------------------- you-are-here and the waypoint (placed by script)
a('<g id="waypoint" class="marker" style="display:none"><title>Waypoint</title>'
  '<path d="M0 0 C-3 -7 -9 -10 -9 -17 A9 9 0 1 1 9 -17 C9 -10 3 -7 0 0 Z" fill="#a855f7" stroke="#fff" stroke-width="2"/>'
  '<circle cx="0" cy="-17" r="3.5" fill="#fff"/></g>')
a('<g id="you" class="marker" style="display:none"><title>You are here</title>'
  '<circle r="16" fill="rgba(56,189,248,.25)" class="pulse"/><circle r="8" fill="#38bdf8" stroke="#fff" stroke-width="2.5"/>'
  '<path class="heading" d="M0 -17 L5 -9 L-5 -9 Z" fill="#fff" stroke="#0c4a6e" stroke-width="1"/></g>')

for x, y, t, s in [(770,120,"312",96),(1010,600,"1017",104)]:   # 1017 sits over the east houses, off the towers
    a(f'<text x="{x}" y="{y}" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="{s}" '
      f'fill="#fff" stroke="#111" stroke-width="7" paint-order="stroke" style="filter:drop-shadow(0 6px 8px rgba(0,0,0,.5))">{t}</text>')
a('</svg>')
# ---------------------------------------------------------------- buildings meet the streets
# Every road is known now: sample each one into points (with its half-width) and keep
# only the buildings clear of all of them. Then line the city streets with buildings.
def sample_path(d, step=2.0):
    """Points along an SVG path made of M, L, C, Q and full-ellipse A segments."""
    toks = re.findall(r"[MLCQAZ]|-?\d+(?:\.\d+)?", d)
    pts, cur, i, cmd = [], (0.0, 0.0), 0, None
    def nums(n):
        nonlocal i
        v = [float(t) for t in toks[i:i + n]]; i += n; return v
    def line(p0, p1):
        n = max(1, int(math.dist(p0, p1) / step))
        for k in range(n + 1): pts.append((p0[0] + (p1[0] - p0[0]) * k / n, p0[1] + (p1[1] - p0[1]) * k / n))
    while i < len(toks):
        if toks[i] in "MLCQAZ": cmd = toks[i]; i += 1
        if cmd == "Z": continue
        if cmd == "M": x, y = nums(2); cur = (x, y); pts.append(cur); cmd = "L"
        elif cmd == "L": x, y = nums(2); line(cur, (x, y)); cur = (x, y)
        elif cmd in "CQ":
            v = nums(6 if cmd == "C" else 4); ctrl = [cur] + [(v[k], v[k + 1]) for k in range(0, len(v), 2)]
            n = max(2, int(sum(math.dist(ctrl[k], ctrl[k + 1]) for k in range(len(ctrl) - 1)) / step))
            for k in range(n + 1):
                t = k / n; q = ctrl[:]
                while len(q) > 1: q = [(q[m][0] + (q[m + 1][0] - q[m][0]) * t, q[m][1] + (q[m + 1][1] - q[m][1]) * t) for m in range(len(q) - 1)]
                pts.append(q[0])
            cur = ctrl[-1]
        elif cmd == "A":
            rx, ry, _, _, _, x, y = nums(7); cx, cy = (cur[0] + x) / 2, (cur[1] + y) / 2
            n = max(8, int(math.pi * (rx + ry) / step))
            for k in range(n + 1): pts.append((cx + rx * math.cos(2 * math.pi * k / n), cy + ry * math.sin(2 * math.pi * k / n)))
            cur = (x, y)
    return pts

ROAD_PTS = []     # (x, y, half-width) every couple of units along every road
for rid, name, d, k in ROADS:
    hw = STYLE[k][0] / 2 + (2 if STYLE[k][1] else 0)
    ROAD_PTS += [(x, y, hw) for x, y in sample_path(d)]
for pts, w, kind, city in STREET_LINES:
    d = "M" + " L".join(f"{x} {y}" for x, y in pts)
    ROAD_PTS += [(x, y, w / 2 + 1) for x, y in sample_path(d)]
CELL = 10
GRID = {}
for x, y, hw in ROAD_PTS: GRID.setdefault((int(x // CELL), int(y // CELL)), []).append((x, y, hw))

def on_road(x, y, w, h, margin=1.5):
    reach = 9 + margin
    for cx in range(int((x - reach) // CELL), int((x + w + reach) // CELL) + 1):
        for cy in range(int((y - reach) // CELL), int((y + h + reach) // CELL) + 1):
            for px, py, hw in GRID.get((cx, cy), ()):
                if x - hw - margin <= px <= x + w + hw + margin and y - hw - margin <= py <= y + h + hw + margin: return True
    return False

def on_land(x, y):
    """Inside the island's outline, off the mountain's rock and the airport."""
    poly, inside = ISLAND, False
    for k in range(len(poly)):
        (x1, y1), (x2, y2) = poly[k], poly[(k + 1) % len(poly)]
        if (y1 > y) != (y2 > y) and x < x1 + (y - y1) * (x2 - x1) / (y2 - y1): inside = not inside
    return inside and not inside_ellipse(x, y, MOUNTAIN[0], MOUNTAIN[1] - 20, 205, 150) and y < 866

kept = {"312-towers": [], "city-312": [], "houses-1017": [], "towers": [], "west-towers": []}
TAKEN = {}        # footprints already used, so frontage never lands on a building
def take(x, y, w, h):
    for cx in range(int(x // CELL), int((x + w) // CELL) + 1):
        for cy in range(int(y // CELL), int((y + h) // CELL) + 1): TAKEN.setdefault((cx, cy), []).append((x, y, w, h))
def taken(x, y, w, h, gap=1.5):
    for cx in range(int((x - gap) // CELL), int((x + w + gap) // CELL) + 1):
        for cy in range(int((y - gap) // CELL), int((y + h + gap) // CELL) + 1):
            for bx, by, bw, bh in TAKEN.get((cx, cy), ()):
                if x - gap < bx + bw and bx < x + w + gap and y - gap < by + bh and by < y + h + gap: return True
    return False
cleared = 0
for group, x, y, w, h, svg in BUILDINGS:
    if on_road(x, y, w, h) or (group in ("312-towers", "city-312", "west-towers") and taken(x, y, w, h, 1.5)): cleared += 1; continue
    kept[group].append(svg); take(x, y, w, h)

# Frontage: walk each city street and set a building on either side every few units,
# turned to face the street. 312 gets grey city buildings, 1017 houses, 770 the odd farmhouse.
FRONT_STYLE = {"chicago": (["#8f9499","#a2a6aa","#7d838a","#b2b0a8"], 11, 8, 14),
               "atlanta": (["#a8674c","#8f5e48","#b9b2a3","#7b8b9a","#c4a07a"], 8, 7, 12),
               "geepee":  (["#b9a27e","#a8674c","#c4a07a"], 8, 7, 40)}
frontage = []
def frontage_along(pts, w, city):
    colours, bw, bh, spacing = FRONT_STYLE[city]
    walked = spacing / 2
    for k in range(len(pts) - 1):
        (x1, y1), (x2, y2) = pts[k], pts[k + 1]
        seg = math.dist((x1, y1), (x2, y2))
        if seg < 1e-6: continue
        ux, uy = (x2 - x1) / seg, (y2 - y1) / seg; nx, ny = -uy, ux
        ang = math.degrees(math.atan2(uy, ux))
        t = walked
        while t < seg:
            mx, my = x1 + ux * t, y1 + uy * t
            for side in (1, -1):
                off = w / 2 + 2 + bh / 2
                cx, cy = mx + nx * off * side, my + ny * off * side
                r = math.hypot(bw, bh) / 2          # the turned footprint's bounding box
                bx, by, bs = cx - r, cy - r, 2 * r
                if not on_land(cx, cy) or on_road(bx + 2, by + 2, bs - 4, bs - 4, 0.5) or taken(bx + 1, by + 1, bs - 2, bs - 2, 0.5): continue
                take(bx + 1, by + 1, bs - 2, bs - 2)
                frontage.append(f'  <rect x="{f(cx - bw / 2)}" y="{f(cy - bh / 2)}" width="{bw}" height="{bh}" fill="{random.choice(colours)}" '
                                f'transform="rotate({f(ang)} {f(cx)} {f(cy)})" filter="url(#shadow)"/>')
            t += spacing
        walked = t - seg
for pts, w, kind, city in STREET_LINES:
    if kind in ("street", "arterial") and (city != "geepee" or kind == "street"): frontage_along(pts, w, city)
for rid in ("highfield", "primrose", "crystal-lake", "airport-road"):      # the island's own 1017 streets
    d = next(d for r, n, d, k in ROADS if r == rid)
    frontage_along(sample_path(d, 6), STYLE["street"][0], "atlanta")

FILL = {"%%city-312%%": "\n".join(kept["city-312"]), "%%houses-1017%%": "\n".join(kept["houses-1017"]),
        "%%towers%%": "\n".join(kept["towers"] + kept["west-towers"] + kept["312-towers"]), "%%frontage%%": "\n".join(frontage)}
out = [FILL.get(line, line) for line in out]
print(f"buildings: {len(BUILDINGS) - cleared} kept, {cleared} left out (on a road, or overlapping in a 312 block), {len(frontage)} added along streets", file=sys.stderr)

SVG = "\n".join(out)

LEGEND = [
 ('<path d="M4 17 H48" stroke="#5c5f63" stroke-width="12"/><path d="M4 17 H48" stroke="#cfd0cc" stroke-width="9"/><path d="M4 17 H48" stroke="#e8c45a" stroke-width="1" stroke-dasharray="5 4"/>', "Highway (hover for names)"),
 ('<path d="M4 17 H48" stroke="#5c5f63" stroke-width="9"/><path d="M4 17 H48" stroke="#d4d4cf" stroke-width="6"/>', "Main road"),
 ('<path d="M4 17 H48" stroke="#6a6c6e" stroke-width="6"/><path d="M4 17 H48" stroke="#d9d6cc" stroke-width="4"/>', "Street"),
 ('<path d="M4 17 H48" stroke="#c9b48a" stroke-width="3" stroke-dasharray="6 4"/>', "Farm track"),
 ('<circle cx="26" cy="17" r="11" fill="none" stroke="#cfd0cc" stroke-width="5"/>', "Interchange"),
 ('<rect x="13" y="6" width="20" height="20" fill="rgba(20,24,30,.4)"/><rect x="10" y="3" width="20" height="20" fill="#b5bcc4" stroke="#3e444b"/>', "Tower, 25+ floors (hover)"),
 ('<rect x="6" y="6" width="40" height="22" fill="#6f7479"/><rect x="10" y="10" width="12" height="8" fill="#a2a6aa"/><rect x="26" y="12" width="14" height="9" fill="#8f9499"/>', "312 city block"),
 ('<rect x="8" y="10" width="9" height="8" fill="#a8674c"/><rect x="22" y="12" width="9" height="8" fill="#b9b2a3"/><rect x="36" y="9" width="9" height="8" fill="#7b8b9a"/>', "Houses"),
 ('<rect x="4" y="5" width="20" height="12" fill="#7f9b4c"/><rect x="26" y="7" width="22" height="11" fill="#c2b064"/><rect x="8" y="19" width="22" height="11" fill="#5f7f3e"/>', "Farmland"),
 ('<rect x="14" y="12" width="16" height="11" fill="#8e2f22"/><circle cx="36" cy="15" r="5" fill="#b8bcc0" stroke="#6f7478"/>', "Farm (barn and silo)"),
 ('<circle cx="14" cy="14" r="6" fill="#2f5a2c"/><circle cx="26" cy="20" r="6" fill="#3f7036"/><circle cx="37" cy="12" r="6" fill="#2f5a2c"/>', "Forest"),
 ('<path d="M6 30 L26 4 L46 30 Z" fill="#8a8172"/><path d="M20 12 L26 4 L32 12 Z" fill="#f1f0ea"/>', "The mountain"),
 ('<circle cx="26" cy="17" r="11" fill="#4f8a44" stroke="#2f5a2c" stroke-width="2"/>', "Park"),
 ('<rect x="6" y="11" width="40" height="12" fill="#8a8f93" stroke="#55595d"/><rect x="10" y="13" width="28" height="7" fill="url(#lg-cont)"/>', "Pier / dock yard"),
 ('<rect x="22" y="12" width="8" height="8" fill="#f2c230" stroke="#7a5d0a"/><rect x="24.5" y="2" width="3" height="11" fill="#f2c230" stroke="#7a5d0a" stroke-width=".6"/>', "Crane"),
 ('<path d="M6 13 L38 13 L46 17 L38 21 L6 21 Z" fill="#2f3a46"/><rect x="9" y="15" width="25" height="4" fill="url(#lg-cont)"/>', "Cargo ship"),
 ('<path d="M6 13 L38 13 L46 17 L38 21 L6 21 Z" fill="#2f3a46"/><rect x="10" y="15" width="24" height="4" rx="2" fill="#b03a2e"/>', "Tanker"),
 ('<path d="M6 13 L38 13 L46 17 L38 21 L6 21 Z" fill="#efefea"/><rect x="12" y="16" width="22" height="2" fill="#2b3a4a"/>', "Ferry / boat"),
 ('<rect x="2" y="10" width="48" height="14" fill="#4f5357"/><path d="M5 17 H47" stroke="#fff" stroke-width="2" stroke-dasharray="6 5"/>', "Runway"),
 ('<rect x="6" y="9" width="40" height="16" rx="2" fill="#4f565d" stroke="#2c3136"/>', "Terminal"),
 (f'<path d="{PLANE}" transform="translate(26 17) scale(1.2)" fill="#f4f4f0"/>', "Plane"),
 ('<rect x="15" y="12" width="22" height="10" rx="5" fill="#2e86c1"/><rect x="19" y="13.5" width="3" height="7" fill="rgba(20,30,40,.7)"/><rect x="29" y="13.5" width="3" height="7" fill="rgba(20,30,40,.8)"/>', "Traffic"),
 ('<ellipse cx="26" cy="17" rx="9" ry="6.5" fill="#2a241f" stroke="#4a4238" stroke-width="2"/>', "Pothole"),
 ('<path d="M26 5 L33 28 L19 28 Z" fill="#ff7a1a"/>', "Traffic cone"),
 ('<rect x="8" y="12" width="36" height="10" fill="url(#lg-barrier)" stroke="#555"/>', "Construction barrier"),
 ('<rect x="14" y="10" width="24" height="14" rx="3" fill="#6b5636"/>', "Road dug up"),
 ('<rect x="15" y="10" width="2" height="6" fill="#e0b84f" transform="rotate(30 16 13)"/><rect x="25" y="16" width="2" height="6" fill="#e0b84f" transform="rotate(110 26 19)"/><rect x="34" y="9" width="2" height="6" fill="#e0b84f" transform="rotate(70 35 12)"/>', "Spent casings"),
 ('<rect x="17" y="9" width="18" height="15" rx="2" fill="url(#lg-glizzy)" stroke="#5a1a1a"/><path d="M14 10 A12 7 0 0 1 38 10 Z" fill="#d62828"/>', "Glizzys-2-Go cart (moves each load)"),
 ('<rect x="14" y="5" width="24" height="24" rx="5" fill="#f7c948" stroke="#d62828" stroke-width="3"/><rect x="18" y="14" width="16" height="6" rx="3" fill="#b5452b"/>', "Glizzys-2-Go job station"),
 ('<rect x="14" y="5" width="24" height="24" rx="5" fill="#1f4e79" stroke="#f2c230" stroke-width="3"/><rect x="20" y="11" width="12" height="12" fill="#c46a2c"/>', "Dockhand job station"),
 ('<path d="M4 17 H48" stroke="#6a6c6e" stroke-width="5"/><path d="M4 17 H48" stroke="#d9d6cc" stroke-width="3.2"/><text x="26" y="12" font-size="7" text-anchor="middle" fill="#fff" stroke="#1d2125" stroke-width="1.4" paint-order="stroke" font-weight="700">Mill St</text>', "Named street (names show zoomed in)"),
 ('<path d="M4 17 H48" stroke="#c9b48a" stroke-width="2.2" stroke-dasharray="4 3"/>', "Backroad"),
 ('<text x="26" y="21" font-size="9" text-anchor="middle" font-style="italic" fill="#ffe9a8" stroke="#1d2125" stroke-width="2" paint-order="stroke" font-weight="700">Midway</text>', "District / park name"),
 ('<text x="26" y="21" font-size="9" text-anchor="middle" fill="#9fe3ff" stroke="#1d2125" stroke-width="2" paint-order="stroke" font-weight="700">1017-S10</text>', "Road number: area code · H highway / A avenue / S street / B backroad · number"),
 ('<circle cx="26" cy="19" r="8" fill="#38bdf8" stroke="#fff" stroke-width="2.5"/><path d="M26 3 L31 11 L21 11 Z" fill="#fff" stroke="#0c4a6e" stroke-width="1"/>', "You are here (arrow: facing)"),
 ('<g transform="translate(26 30) scale(1.2)"><path d="M0 0 C-3 -7 -9 -10 -9 -17 A9 9 0 1 1 9 -17 C9 -10 3 -7 0 0 Z" fill="#a855f7" stroke="#fff" stroke-width="2"/><circle cx="0" cy="-17" r="3.5" fill="#fff"/></g>', "Waypoint (click map to set, right-click to clear)"),
]
legend_items = "\n".join(
    f'      <li><svg class="sw" viewBox="0 0 52 34"><rect width="52" height="34" fill="#9aa36f"/>{g}</svg>{t}</li>' for g, t in LEGEND)

print(f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>The Island — 312 to 1017</title>
<!-- GENERATED by tools/gen-island-map.py — edit the script, then: python3 tools/gen-island-map.py > island-map.html -->
<style>
  * {{ margin: 0; padding: 0; box-sizing: border-box; }}
  body {{ background: #0b1526; font-family: Arial, Helvetica, sans-serif; color: #dfe7f2;
         display: flex; flex-direction: column; align-items: center; padding: 24px 16px; }}
  h1 {{ color: #e8eef7; font-size: 20px; letter-spacing: 2px; margin-bottom: 4px; }}
  p.note {{ color: #8fa5c0; font-size: 13px; margin-bottom: 16px; text-align: center; }}
  .frame {{ width: min(96vw, 1500px); border-radius: 18px; overflow: hidden; box-shadow: 0 18px 50px rgba(0,0,0,.55); }}
  #island {{ display: block; width: 100%; height: auto; }}
  #island .road {{ cursor: help; }}
  #island .road:hover {{ stroke: #fff6c2; }}
  #island .tower:hover rect:nth-child(2) {{ fill: #dfe5ea; }}
  #island .station {{ cursor: help; }}
  #island {{ touch-action: none; cursor: grab; }}
  #island.dragging {{ cursor: grabbing; }}
  #island .name {{ display: none; pointer-events: none; }}
  #island .marker {{ pointer-events: none; }}
  #island .pulse {{ animation: pulse 1.6s ease-out infinite; transform-box: fill-box; transform-origin: center; }}
  @keyframes pulse {{ from {{ transform: scale(.6); opacity: 1; }} to {{ transform: scale(1.6); opacity: 0; }} }}
  #island.z-main .main-name, #island.z-main .zone-name {{ display: inline; }}
  #island.z-street .street-name {{ display: inline; }}
  .zoombar {{ display: flex; gap: 6px; justify-content: center; margin: 10px 0 0; }}
  .zoombar button {{ background: #13223a; color: #dfe7f2; border: 1px solid rgba(143,165,192,.35); border-radius: 8px;
                     padding: 5px 12px; font: 600 13px Arial, sans-serif; cursor: pointer; }}
  .zoombar button:hover {{ background: #1c3254; }}
  .legend {{ width: min(96vw, 1500px); margin-top: 18px; padding: 16px 18px 18px; background: #13223a;
             border: 1px solid rgba(143,165,192,.25); border-radius: 14px; font-size: 13px; }}
  .legend h2 {{ font-size: 13px; letter-spacing: 2px; color: #8fa5c0; margin-bottom: 12px; }}
  .legend ul {{ list-style: none; display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 10px 18px; }}
  .legend li {{ display: flex; align-items: center; gap: 10px; min-height: 34px; }}
  .legend .sw {{ flex: 0 0 52px; height: 34px; border-radius: 6px; box-shadow: inset 0 0 0 1px rgba(0,0,0,.25); }}
</style>
</head>
<body>
  <h1>THE ISLAND — 312 TO 1017</h1>
  <p class="note">The whole island, top down: the 312 port city north, the farm country and the mountain, the 1017 and the airport south.<br>
  Scroll or + / − to zoom in for every street name, drag to move around. Hover roads, towers and stations for names. Schematic — real positions come from docs/WALK-LIST.md.</p>
  <div class="frame">
{SVG}
  </div>
  <div class="zoombar"><button data-zoom="in">+ Zoom in</button><button data-zoom="out">− Zoom out</button><button data-zoom="reset">Whole island</button></div>
  <div class="legend">
    <h2>LEGEND</h2>
    <svg width="0" height="0" style="position:absolute"><defs>
      <pattern id="lg-cont" width="8" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="4" fill="#c0392b"/><rect x="4" width="4" height="4" fill="#2e86c1"/></pattern>
      <pattern id="lg-barrier" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="4" height="8" fill="#ff7a1a"/><rect x="4" width="4" height="8" fill="#f5f2e8"/></pattern>
      <linearGradient id="lg-glizzy"><stop offset=".33" stop-color="#d62828"/><stop offset=".33" stop-color="#f7c948"/><stop offset=".66" stop-color="#f7c948"/><stop offset=".66" stop-color="#d62828"/></linearGradient>
    </defs></svg>
    <ul>
{legend_items}
    </ul>
  </div>
<script>
// Places cars, potholes, cones, the barrier, the dig and the hot dog carts along the road paths.
// window.placeOnRoad() can be called again (the in-game map does, on every open) for new cart spots.
window.placeOnRoad = function () {{
  const NS = "http://www.w3.org/2000/svg";
  const layer = document.getElementById("on-road");
  layer.replaceChildren();
  const ON = {json.dumps(ON)};
  const el = (tag, attrs, parent) => {{ const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); (parent || layer).appendChild(e); return e; }};
  const tip = (g, text) => {{ const t = document.createElementNS(NS, "title"); t.textContent = text; g.appendChild(t); }};
  for (const [cls, rid, t0, lane, extra] of ON) {{
    const path = document.getElementById(rid); if (!path) continue;
    const t = extra.includes('data-random') ? 0.04 + Math.random() * 0.92 : t0;
    const L = path.getTotalLength(), p = path.getPointAtLength(L * t), q = path.getPointAtLength(Math.min(L, L * t + 1));
    let ang = Math.atan2(q.y - p.y, q.x - p.x) * 180 / Math.PI;
    const nx = -(q.y - p.y), ny = q.x - p.x, nl = Math.hypot(nx, ny) || 1;
    const x = p.x + nx / nl * lane, y = p.y + ny / nl * lane;
    if (extra.includes('data-flip')) ang += 180;
    const g = el("g", {{ transform: `translate(${{x}} ${{y}}) rotate(${{ang}})`, class: cls }});
    const color = (extra.match(/data-color="([^"]+)"/) || [])[1];
    if (cls === "car") {{ tip(g, "Traffic"); el("rect", {{ x: -5, y: -2.2, width: 10, height: 4.4, rx: 2, fill: color }}, g); el("rect", {{ x: 1.5, y: -1.8, width: 1.8, height: 3.6, fill: "rgba(20,30,40,.8)" }}, g); el("rect", {{ x: -3.5, y: -1.8, width: 1.5, height: 3.6, fill: "rgba(20,30,40,.7)" }}, g); }}
    if (cls === "pothole") {{ tip(g, "Pothole"); el("ellipse", {{ rx: 4.5, ry: 3.2, fill: "#2a241f", stroke: "#4a4238", "stroke-width": 1 }}, g); }}
    if (cls === "cone") {{ tip(g, "Traffic cone"); el("path", {{ d: "M0 -5 L3.5 4 L-3.5 4 Z", fill: "#ff7a1a", transform: `rotate(${{-ang}})` }}, g); }}
    if (cls === "barrier") {{ tip(g, "Construction — lane closed"); el("rect", {{ x: -9, y: -2, width: 18, height: 4, fill: "#ff7a1a", stroke: "#f5f2e8", "stroke-dasharray": "3 3" }}, g); }}
    if (cls === "dig") {{ tip(g, "Road dug up"); el("rect", {{ x: -8, y: -5, width: 16, height: 10, rx: 2, fill: "#6b5636" }}, g); }}
    if (cls === "cart") {{ tip(g, "Glizzys-2-Go cart"); const c = el("g", {{ transform: `rotate(${{-ang}})` }}, g);
      el("rect", {{ x: -6, y: -4, width: 12, height: 9, rx: 1.5, fill: "#f7c948", stroke: "#5a1a1a", "stroke-width": .8 }}, c);
      el("rect", {{ x: -6, y: -4, width: 4, height: 9, fill: "#d62828" }}, c); el("rect", {{ x: 2, y: -4, width: 4, height: 9, fill: "#d62828" }}, c);
      el("path", {{ d: "M-8 -4 A8 5 0 0 1 8 -4 Z", fill: "#d62828", stroke: "#fff", "stroke-width": .6 }}, c); }}
  }}
}};
window.placeOnRoad();

// Zoom and pan by moving the viewBox. Main road and district names appear from 1.6x,
// every street's name from 2.6x. Wheel zooms on the cursor; drag pans; + - 0 on the keyboard.
(function () {{
  const svg = document.getElementById("island");
  const W = {W}, H = {H}, MIN = W / 8;
  let vb = {{ x: 0, y: 0, w: W, h: H }};
  const apply = () => {{
    vb.w = Math.min(W, Math.max(MIN, vb.w)); vb.h = vb.w * H / W;
    vb.x = Math.min(W - vb.w, Math.max(0, vb.x)); vb.y = Math.min(H - vb.h, Math.max(0, vb.y));
    svg.setAttribute("viewBox", `${{vb.x}} ${{vb.y}} ${{vb.w}} ${{vb.h}}`);
    const z = W / vb.w;
    svg.classList.toggle("z-main", z >= 1.6);
    svg.classList.toggle("z-street", z >= 2.6);
    drawMarkers(z);
  }};

  // ---- game coordinates <-> map. The same per-city fit the streets are drawn with
  // (tools/gen-island-map.py), so a position lands where its street is drawn.
  const FIT = {json.dumps(FIT_PARAMS)};
  const BORDERS = {json.dumps(GAME["borders"])};
  const cityAt = (y) => y >= BORDERS.chicago ? "chicago" : y >= BORDERS.geepee ? "geepee" : "atlanta";
  window.gameToMap = (x, y) => {{
    const f = FIT[cityAt(y)];
    let px = f.x0 + (x - f.minX) / (f.maxX - f.minX) * (f.x1 - f.x0);
    let py = f.y0 + (f.maxY - y) / (f.maxY - f.minY) * (f.y1 - f.y0);
    const off = px < f.x0 || px > f.x1 || py < f.y0 || py > f.y1;      // outside the city's drawn streets
    px = Math.min(f.x1, Math.max(f.x0, px)); py = Math.min(f.y1, Math.max(f.y0, py));
    return {{ x: px, y: py, off }};
  }};
  window.mapToGame = (px, py) => {{
    for (const f of Object.values(FIT)) {{
      if (px < f.x0 || px > f.x1 || py < f.y0 || py > f.y1) continue;
      return {{ x: f.minX + (px - f.x0) / (f.x1 - f.x0) * (f.maxX - f.minX),
                y: f.maxY - (py - f.y0) / (f.y1 - f.y0) * (f.maxY - f.minY) }};
    }}
    return null;   // not over a city's streets: no game position to send
  }};

  // ---- markers. Kept a steady size on screen whatever the zoom.
  let you = null, wp = null;
  function drawMarkers(z) {{
    const k = 1 / Math.sqrt(z || W / vb.w);
    const g1 = document.getElementById("you"), g2 = document.getElementById("waypoint");
    if (you) {{ const m = window.gameToMap(you.x, you.y);
      g1.style.display = ""; g1.setAttribute("transform", `translate(${{m.x}} ${{m.y}}) scale(${{k}})`);
      g1.querySelector(".heading").setAttribute("transform", `rotate(${{-(you.heading || 0)}})`);   // GTA heading: degrees anticlockwise from north
      g1.querySelector("title").textContent = m.off ? "You are here (off the drawn streets)" : "You are here"; }}
    else g1.style.display = "none";
    if (wp) {{ const m = window.gameToMap(wp.x, wp.y);
      g2.style.display = ""; g2.setAttribute("transform", `translate(${{m.x}} ${{m.y}}) scale(${{k}})`); }}
    else g2.style.display = "none";
  }}
  window.mapSetPlayer = (p) => {{ you = p && isFinite(p.x) && isFinite(p.y) ? p : null; drawMarkers(); }};
  window.mapSetWaypoint = (p) => {{ wp = p && isFinite(p.x) && isFinite(p.y) ? p : null; drawMarkers(); }};
  window.mapCentreOn = (x, y) => {{ const m = window.gameToMap(x, y); vb.x = m.x - vb.w / 2; vb.y = m.y - vb.h / 2; apply(); }};

  // Outside the game (this page on its own), a click just drops the pin.
  window.onMapClick = window.onMapClick || ((pt) => {{ const g = window.mapToGame(pt.x, pt.y); if (g) window.mapSetWaypoint(g); }});
  window.onMapRightClick = window.onMapRightClick || (() => window.mapSetWaypoint(null));
  const toSvg = (cx, cy) => {{ const r = svg.getBoundingClientRect(); return {{ x: vb.x + (cx - r.left) / r.width * vb.w, y: vb.y + (cy - r.top) / r.height * vb.h }}; }};
  const zoomAt = (k, px, py) => {{ const nw = Math.min(W, Math.max(MIN, vb.w / k)); const f = nw / vb.w;
    vb.x = px - (px - vb.x) * f; vb.y = py - (py - vb.y) * f; vb.w = nw; apply(); }};
  window.mapZoom = (how) => {{
    if (how === "reset") {{ vb = {{ x: 0, y: 0, w: W, h: H }}; return apply(); }}
    zoomAt(how === "in" ? 1.6 : 1 / 1.6, vb.x + vb.w / 2, vb.y + vb.h / 2);
  }};
  svg.addEventListener("wheel", (e) => {{ e.preventDefault(); const p = toSvg(e.clientX, e.clientY); zoomAt(e.deltaY < 0 ? 1.25 : 0.8, p.x, p.y); }}, {{ passive: false }});
  let drag = null;
  svg.addEventListener("pointerdown", (e) => {{ if (e.button !== 0) return;   // left button only: right-click is "clear waypoint"
    drag = {{ x: e.clientX, y: e.clientY, vx: vb.x, vy: vb.y }}; svg.classList.add("dragging"); svg.setPointerCapture(e.pointerId); }});
  svg.addEventListener("pointermove", (e) => {{ if (!drag) return; const r = svg.getBoundingClientRect();
    vb.x = drag.vx - (e.clientX - drag.x) / r.width * vb.w; vb.y = drag.vy - (e.clientY - drag.y) / r.height * vb.h; apply(); }});
  // A press that barely moves is a click (a waypoint), not a drag.
  const end = (e) => {{
    if (drag && e && e.type === "pointerup" && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 5 && window.onMapClick) window.onMapClick(toSvg(e.clientX, e.clientY));
    drag = null; svg.classList.remove("dragging");
  }};
  svg.addEventListener("pointerup", end); svg.addEventListener("pointercancel", end);
  svg.addEventListener("contextmenu", (e) => {{ e.preventDefault(); if (window.onMapRightClick) window.onMapRightClick(); }});
  document.querySelectorAll(".zoombar [data-zoom]").forEach((b) => b.addEventListener("click", () => window.mapZoom(b.dataset.zoom)));
  document.addEventListener("keydown", (e) => {{
    if (e.key === "+" || e.key === "=") window.mapZoom("in");
    if (e.key === "-" || e.key === "_") window.mapZoom("out");
    if (e.key === "0") window.mapZoom("reset");
  }});
  apply();
}})();
</script>
</body>
</html>''')
