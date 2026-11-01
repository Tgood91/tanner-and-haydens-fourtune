#!/usr/bin/env python3
# ============================================================
# tools/gen-island-terrain.py — the island's ground: a heightmap, cut into
# 256 m tiles, written as OBJ meshes plus the ytyp/ymap XML that places them.
#
#   python3 tools/gen-island-terrain.py   (also reruns tools/gen-road-ymaps.js, so the
#                                          roads climb the same hills the ground has)
#
# Needs only numpy. Reads the coastline and hill shapes from
# tools/gen-island-map.py, the island's world position from
# island-roads/xml/roads-index.json, and every road piece from the road ymaps,
# so the ground lines up with the roads exactly:
#   - land at road level, flattened under every road (and blended back out)
#   - beaches down to the sea, a seabed falling away offshore
#   - the mountain (320 m), the west hills, the east ridge, gentle farm swells
#   - flat pads for the 312 and 1017 city areas, the west towers and the airport
# Writes island-terrain/:
#   obj/island_terrain_<c>_<r>.obj (+ island_terrain.mtl)   meshes, local to each tile's centre
#   xml/island_terrain.ytyp.xml                             one archetype per tile
#   xml/island_terrain.ymap.xml                             one entity per tile
#   heightmap.png (16-bit) / preview.png / terrain-index.json
# ============================================================
import json, math, pathlib, re, struct, subprocess, zlib
import xml.etree.ElementTree as ET
import numpy as np

REPO = pathlib.Path(__file__).resolve().parent.parent
OUT = REPO / "island-terrain"
CFG = json.loads((REPO / "island-roads/xml/roads-index.json").read_text())["config"]   # where the island sits (gen-road-ymaps.js CONFIG)

SPACING = 8.0            # metres between height samples
TILE = 256.0             # metres per tile (33 x 33 vertices)
MARGIN = 220.0           # seabed beyond the coast
Z0 = CFG["z"]            # road level
ROAD_SINK = 0.3          # ground sits this far under the road pieces' origin
FLAT_R, BLEND_R = 9.0, 28.0      # road corridor: flat out to 9 m from a piece's centre, blended back by 28 m
BEACH = 45.0             # metres of beach slope inland from the waterline
MTL = {"grass": ("GRASS", (0.42, 0.52, 0.27)), "sand": ("SAND_COMPACT", (0.86, 0.79, 0.58)),
       "rock": ("ROCK", (0.52, 0.49, 0.44)), "pavement": ("CONCRETE", (0.45, 0.46, 0.47))}

# ---------------------------------------------------------------- shapes from the map generator
src = (REPO / "tools/gen-island-map.py").read_text()
ISLAND = eval(re.search(r"^ISLAND = (\[.*?\])\n", src, re.S | re.M).group(1))
MOUNTAIN = eval(re.search(r"^MOUNTAIN = (\(.*?\))", src, re.M).group(1))
WEST_TOWERS = eval(re.search(r"^WEST_TOWERS = (\(.*?\))", src, re.M).group(1))
AIRPORT = [[(210, 882), (1250, 882), (1250, 975), (250, 975)], [(1250, 860), (1440, 830), (1470, 930), (1250, 975)]]

def catmull(points, per=40):
    """The same closed Catmull-Rom the map draws the coast with, as a dense polyline."""
    n, out = len(points), []
    for i in range(n):
        p0, p1, p2, p3 = (np.array(points[(i + k) % n], float) for k in (-1, 0, 1, 2))
        c1, c2 = p1 + (p2 - p0) / 6, p2 - (p3 - p1) / 6
        for t in np.linspace(0, 1, per, endpoint=False):
            out.append((1-t)**3*p1 + 3*(1-t)**2*t*c1 + 3*(1-t)*t**2*c2 + t**3*p2)
    return np.array(out)

M = CFG["metresPerUnit"]; CX, CY = CFG["centre"]["x"], CFG["centre"]["y"]
to_world = lambda mx, my: (CX + (mx - 750) * M, CY - (my - 500) * M)
to_map = lambda wx, wy: ((wx - CX) / M + 750, 500 - (wy - CY) / M)

coast = catmull(ISLAND)
cwx, cwy = to_world(coast[:, 0], coast[:, 1])
air = [np.array([to_world(*p) for p in poly]) for poly in AIRPORT]

# ---------------------------------------------------------------- the grid (world-aligned, whole tiles)
allx = np.concatenate([cwx] + [a[:, 0] for a in air]); ally = np.concatenate([cwy] + [a[:, 1] for a in air])
x0 = math.floor((allx.min() - MARGIN) / TILE) * TILE; x1 = math.ceil((allx.max() + MARGIN) / TILE) * TILE
y0 = math.floor((ally.min() - MARGIN) / TILE) * TILE; y1 = math.ceil((ally.max() + MARGIN) / TILE) * TILE
xs = np.arange(x0, x1 + .1, SPACING); ys = np.arange(y0, y1 + .1, SPACING)
GX, GY = np.meshgrid(xs, ys)                    # row = y (south -> north), col = x
MX, MY = to_map(GX, GY)

def inside(poly_x, poly_y, px, py):
    """Even-odd point-in-polygon over the whole grid."""
    res = np.zeros(px.shape, bool); n = len(poly_x); j = n - 1
    for i in range(n):
        xi, yi, xj, yj = poly_x[i], poly_y[i], poly_x[j], poly_y[j]
        cross = ((yi > py) != (yj > py)) & (px < (xj - xi) * (py - yi) / ((yj - yi) or 1e-9) + xi)
        res ^= cross; j = i
    return res

def dist_to(points_x, points_y, reach, values=None):
    """Distance (m) from every grid sample to the nearest of the points, capped at reach.
    With values, also returns the value carried by that nearest point."""
    d = np.full(GX.shape, reach, float); r = int(math.ceil(reach / SPACING))
    near = np.zeros(GX.shape, float); vals = values if values is not None else np.zeros(len(points_x))
    ci = np.rint((points_x - x0) / SPACING).astype(int); ri = np.rint((points_y - y0) / SPACING).astype(int)
    for px, py, c, rr, val in zip(points_x, points_y, ci, ri, vals):
        a0, a1, b0, b1 = max(rr - r, 0), min(rr + r + 1, GX.shape[0]), max(c - r, 0), min(c + r + 1, GX.shape[1])
        if a0 >= a1 or b0 >= b1: continue
        sub = np.hypot(GX[a0:a1, b0:b1] - px, GY[a0:a1, b0:b1] - py)
        closer = sub < d[a0:a1, b0:b1]
        d[a0:a1, b0:b1][closer] = sub[closer]; near[a0:a1, b0:b1][closer] = val
    return (d, near) if values is not None else d

def ell(cx, cy, rx, ry):                       # 0 at the centre, 1 on the edge (map units)
    return np.sqrt(((MX - cx) / rx) ** 2 + ((MY - cy) / ry) ** 2)
smooth = lambda t: (lambda c: c * c * (3 - 2 * c))(np.clip(t, 0, 1))

def value_noise(scale, seed):
    """Smooth value noise, scale in metres, -1..1."""
    rng = np.random.default_rng(seed)
    gx = (GX - x0) / scale; gy = (GY - y0) / scale
    lat = rng.uniform(-1, 1, (int(gy.max()) + 3, int(gx.max()) + 3))
    ix, iy = gx.astype(int), gy.astype(int); fx, fy = smooth(gx - ix), smooth(gy - iy)
    a, b, c, d = lat[iy, ix], lat[iy, ix + 1], lat[iy + 1, ix], lat[iy + 1, ix + 1]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy

# ---------------------------------------------------------------- land, coast distance
in_air = inside(air[0][:, 0], air[0][:, 1], GX, GY) | inside(air[1][:, 0], air[1][:, 1], GX, GY)
land = inside(cwx, cwy, GX, GY) | in_air
edge = np.zeros_like(land)
edge[1:, :] |= land[1:, :] != land[:-1, :]; edge[:, 1:] |= land[:, 1:] != land[:, :-1]
dco = dist_to(GX[edge], GY[edge], 240.0)
s = np.where(land, dco, -dco)                  # signed distance to the waterline: + on land

# ---------------------------------------------------------------- shape
flat = np.maximum.reduce([smooth((1.08 - ell(770, 190, 360, 120)) / .15),   # the 312 grid
                          smooth((1.05 - ell(760, 700, 380, 115)) / .15),   # the 1017 towers
                          smooth((1.15 - ell(*WEST_TOWERS)) / .2),           # the west towers
                          in_air.astype(float)])
swell = (value_noise(220, 1) * 2.2 + value_noise(70, 2) * .8) * (1 - flat)  # farm country rolls a little
mr = ell(MOUNTAIN[0], MOUNTAIN[1], 210, 135)
ang = np.arctan2(MY - MOUNTAIN[1], MX - MOUNTAIN[0])
mountain = 320 * np.clip(1 - mr, 0, 1) ** 1.45 * (1 + .12 * np.sin(ang * 7 + mr * 5)) * (1 + .08 * value_noise(60, 3))
west = 70 * np.clip(1 - ell(250, 470, 190, 215) ** 2, 0, 1) ** 2 * (1 + .25 * value_noise(90, 4))
east = 32 * np.clip(1 - ell(1360, 560, 90, 150) ** 2, 0, 1) ** 2
hills = (mountain + (west + east) * (1 - flat)) * smooth(s / 150)           # hills never reach the beach

h = Z0 - ROAD_SINK + swell + hills
beach = smooth(s / BEACH)
h = np.where(s >= 0, 1.0 + (h - 1.0) * beach, 1.0 - 9 * smooth(-s / 90) - 12 * smooth((-s - 90) / 140))
h = np.where(in_air, Z0 - ROAD_SINK, h)        # the airport is a built-up pad with a sea wall

# ---------------------------------------------------------------- roads: climb the hills, then flatten every corridor
# The hills (not the farm swells) are handed to tools/gen-road-ymaps.js, which lifts each
# road onto them with a capped grade; then the ground is cut or filled to each road's height.
OUT.mkdir(exist_ok=True)
road_guide = np.where(s >= 0, Z0 + hills * beach, Z0)
(OUT / "road-guide.f32").write_bytes(road_guide.astype("<f4").tobytes())
(OUT / "road-guide.json").write_text(json.dumps({"x0": x0, "y0": y0, "spacing": SPACING,
                                                 "cols": int(h.shape[1]), "rows": int(h.shape[0])}) + "\n")
subprocess.run(["node", str(REPO / "tools/gen-road-ymaps.js")], check=True)
rx, ry, rz = [], [], []
for f in sorted((REPO / "island-roads/xml").glob("*.ymap.xml")):
    for it in ET.parse(f).getroot().find("entities"):
        p = it.find("position"); rx.append(float(p.get("x"))); ry.append(float(p.get("y"))); rz.append(float(p.get("z")))
rx, ry, rz = np.array(rx), np.array(ry), np.array(rz)
dr, road_z = dist_to(rx, ry, FLAT_R + BLEND_R + 8, rz)
k = smooth((dr - FLAT_R) / BLEND_R)
on_ground = s > -30                            # past that a road is a bridge: the sea stays
h = np.where(on_ground, (road_z - ROAD_SINK) * (1 - k) + h * k, h)

# ---------------------------------------------------------------- material per cell
gy_, gx_ = np.gradient(h, SPACING)
slope = np.hypot(gx_, gy_)
mat = np.full(h.shape, "grass", object)
mat[(s < BEACH + 5) & (h < Z0 + 1)] = "sand"
mat[s < 0] = "sand"
mat[(slope > .75) | (h > Z0 + 190)] = "rock"
mat[(flat > .5) & land] = "pavement"
mat[(dr < FLAT_R) & on_ground] = "pavement"

# ---------------------------------------------------------------- tiles
OUT.mkdir(exist_ok=True)
for sub in ("obj", "xml"):
    (OUT / sub).mkdir(exist_ok=True)
    for f in (OUT / sub).glob("*"): f.unlink()
n = int(TILE / SPACING)
mtl = "".join(f"newmtl island_{k}\nKd {c[0]} {c[1]} {c[2]}\nKa 0 0 0\nKs 0 0 0\nd 1\n# collision material: {g}\n\n"
              for k, (g, c) in MTL.items())
(OUT / "obj/island_terrain.mtl").write_text("# GENERATED by tools/gen-island-terrain.py\n" + mtl)
tiles = []
for r0 in range(0, h.shape[0] - 1, n):
    for c0 in range(0, h.shape[1] - 1, n):
        H = h[r0:r0 + n + 1, c0:c0 + n + 1]
        if H.max() < -6: continue              # deep water only: the ocean covers it
        X = GX[r0:r0 + n + 1, c0:c0 + n + 1]; Y = GY[r0:r0 + n + 1, c0:c0 + n + 1]
        tcx, tcy = X[0, 0] + TILE / 2, Y[0, 0] + TILE / 2
        col, row = int(round((tcx - x0) // TILE)), int(round((tcy - y0) // TILE))
        name = f"island_terrain_{col:02d}_{row:02d}"
        ny_, nx_ = np.gradient(H, SPACING)
        N = np.dstack([-nx_, -ny_, np.ones_like(H)]); N /= np.linalg.norm(N, axis=2, keepdims=True)
        lines = [f"# GENERATED by tools/gen-island-terrain.py — tile {name}, centre world ({tcx:.1f}, {tcy:.1f}); x/y local to it, z absolute",
                 "mtllib island_terrain.mtl", f"o {name}"]
        R, C = H.shape
        for i in range(R):
            for j in range(C):
                lines.append(f"v {X[i,j]-tcx:.2f} {Y[i,j]-tcy:.2f} {H[i,j]:.3f}")
        for i in range(R):
            for j in range(C):
                lines.append(f"vt {X[i,j]/16:.4f} {Y[i,j]/16:.4f}")
        for i in range(R):
            for j in range(C):
                lines.append(f"vn {N[i,j,0]:.4f} {N[i,j,1]:.4f} {N[i,j,2]:.4f}")
        cells = mat[r0:r0 + n, c0:c0 + n]
        for m in MTL:
            idx = np.argwhere(cells[:R - 1, :C - 1] == m)
            if not len(idx): continue
            lines.append(f"usemtl island_{m}")
            for i, j in idx:
                a, b, c, d = i * C + j + 1, i * C + j + 2, (i + 1) * C + j + 2, (i + 1) * C + j + 1   # counter-clockwise seen from above
                lines.append(f"f {a}/{a}/{a} {b}/{b}/{b} {c}/{c}/{c}")
                lines.append(f"f {a}/{a}/{a} {c}/{c}/{c} {d}/{d}/{d}")
        (OUT / "obj" / f"{name}.obj").write_text("\n".join(lines) + "\n")
        tiles.append({"name": name, "centre": [round(tcx, 2), round(tcy, 2)], "zmin": round(float(H.min()), 2),
                      "zmax": round(float(H.max()), 2), "materials": sorted(set(cells.ravel()))})

# ---------------------------------------------------------------- ytyp + ymap (CodeWalker XML)
half = TILE / 2; LOD = 1500
def v(tag, x, y, z, ind="      "): return f'{ind}<{tag} x="{x:.6f}" y="{y:.6f}" z="{z:.6f}" />'
arch = []
for t in tiles:
    zc = (t["zmin"] + t["zmax"]) / 2; rad = math.sqrt(2 * half * half + ((t["zmax"] - t["zmin"]) / 2) ** 2)
    arch.append(f"""    <Item type="CBaseArchetypeDef">
      <lodDist value="{LOD}" />
      <flags value="0" />
      <specialAttribute value="0" />
{v("bbMin", -half, -half, t["zmin"])}
{v("bbMax", half, half, t["zmax"])}
{v("bsCentre", 0, 0, zc)}
      <bsRadius value="{rad:.6f}" />
      <hdTextureDist value="{LOD/2:.0f}" />
      <name>{t["name"]}</name>
      <textureDictionary>island_terrain</textureDictionary>
      <clipDictionary />
      <drawableDictionary />
      <physicsDictionary />
      <assetType>ASSET_TYPE_DRAWABLE</assetType>
      <assetName>{t["name"]}</assetName>
      <extensions />
    </Item>""")
(OUT / "xml/island_terrain.ytyp.xml").write_text(f"""<?xml version="1.0" encoding="UTF-8"?>
<!-- GENERATED by tools/gen-island-terrain.py — {len(tiles)} terrain tiles -->
<CMapTypes>
  <extensions />
  <archetypes>
{chr(10).join(arch)}
  </archetypes>
  <name>island_terrain</name>
  <dependencies />
  <compositeEntityTypes />
</CMapTypes>
""")
ents = []
for t in tiles:
    ents.append(f"""    <Item type="CEntityDef">
      <archetypeName>{t["name"]}</archetypeName>
      <flags value="32" />
      <guid value="0" />
{v("position", t["centre"][0], t["centre"][1], 0)}
      <rotation x="0" y="0" z="0" w="1" />
      <scaleXY value="1" />
      <scaleZ value="1" />
      <parentIndex value="-1" />
      <lodDist value="{LOD}" />
      <childLodDist value="0" />
      <lodLevel>LODTYPES_DEPTH_ORPHANHD</lodLevel>
      <numChildren value="0" />
      <priorityLevel>PRI_REQUIRED</priorityLevel>
      <extensions />
      <ambientOcclusionMultiplier value="255" />
      <artificialAmbientOcclusion value="255" />
      <tintValue value="0" />
    </Item>""")
zmin, zmax = min(t["zmin"] for t in tiles), max(t["zmax"] for t in tiles)
ex_min = (min(t["centre"][0] for t in tiles) - half, min(t["centre"][1] for t in tiles) - half, zmin)
ex_max = (max(t["centre"][0] for t in tiles) + half, max(t["centre"][1] for t in tiles) + half, zmax)
(OUT / "xml/island_terrain.ymap.xml").write_text(f"""<?xml version="1.0" encoding="UTF-8"?>
<!-- GENERATED by tools/gen-island-terrain.py — {len(tiles)} terrain tiles -->
<CMapData>
  <name>island_terrain</name>
  <parent />
  <flags value="0" />
  <contentFlags value="1" />
{v("streamingExtentsMin", ex_min[0] - LOD, ex_min[1] - LOD, ex_min[2] - LOD, "  ")}
{v("streamingExtentsMax", ex_max[0] + LOD, ex_max[1] + LOD, ex_max[2] + LOD, "  ")}
{v("entitiesExtentsMin", *ex_min, "  ")}
{v("entitiesExtentsMax", *ex_max, "  ")}
  <entities>
{chr(10).join(ents)}
  </entities>
  <containerLods />
  <boxOccluders />
  <occludeModels />
  <physicsDictionaries />
  <instancedData>
    <ImapLink />
    <PropInstanceList />
    <GrassInstanceList />
  </instancedData>
  <timeCycleModifiers />
  <carGenerators />
  <block>
    <version value="0" />
    <flags value="0" />
    <name>island_terrain</name>
    <exportedBy>tools/gen-island-terrain.py</exportedBy>
    <owner />
    <time />
  </block>
</CMapData>
""")

# ---------------------------------------------------------------- heightmap + preview
def png(path, arr, mode):
    """Minimal PNG writer (no Pillow needed): mode 'I16' grey 16-bit, 'RGB' 8-bit."""
    hgt, wid = arr.shape[:2]
    if mode == "I16": raw = b"".join(b"\0" + arr[i].astype(">u2").tobytes() for i in range(hgt)); ct, bd = 0, 16
    else: raw = b"".join(b"\0" + arr[i].astype(np.uint8).tobytes() for i in range(hgt)); ct, bd = 2, 8
    chunk = lambda t, d: struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    path.write_bytes(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", wid, hgt, bd, ct, 0, 0, 0))
                     + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))
HMIN = float(h.min())
png(OUT / "heightmap.png", np.flipud(np.clip((h - HMIN) * 100, 0, 65535)), "I16")   # 1 step = 1 cm, north up
col = np.zeros(h.shape + (3,))
for m, (_, c) in MTL.items(): col[mat == m] = c
water = h < 0
col[water] = np.array([.16, .43, .6]) * (1 + np.clip(h[water], -20, 0)[:, None] / 40)
light = np.array([-.5, .5, .7]); light /= np.linalg.norm(light)
shade = (-gx_ * light[0] - gy_ * light[1] + light[2]) / np.sqrt(gx_ ** 2 + gy_ ** 2 + 1)
col[~water] *= np.clip(.35 + .9 * shade[~water], 0, 1.3)[:, None]
col[(dr < FLAT_R) & on_ground] = (.85, .84, .8)          # the roads, on top
pv = np.flipud(np.clip(col * 255, 0, 255)).repeat(2, 0).repeat(2, 1)
png(OUT / "preview.png", pv, "RGB")

(OUT / "terrain-index.json").write_text(json.dumps({
    "spacing": SPACING, "tile": TILE, "origin": [x0, y0], "grid": list(h.shape), "heightmapMinZ": HMIN,
    "roadLevel": Z0, "groundUnderRoads": Z0 - ROAD_SINK, "peak": round(float(h.max()), 1),
    "collisionMaterials": {f"island_{k}": g for k, (g, _) in MTL.items()}, "tiles": tiles}, indent=1) + "\n")
print(f"{len(tiles)} tiles, grid {h.shape[1]}x{h.shape[0]} @ {SPACING} m, z {HMIN:.1f}..{h.max():.1f}, "
      f"peak at road level {Z0}+{h.max()-Z0:.0f} m -> island-terrain/")
