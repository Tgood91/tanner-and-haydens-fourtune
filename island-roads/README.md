# island-roads — the island's streets as ymaps

`tools/gen-road-ymaps.js` reads every named road on `island-map.html` and lays road-piece props
end to end along each one: one row for a street, two for an arterial, three for a highway.
That is **9,267 pieces in 22 ymaps**, one per 512 m grid cell, in `xml/` as CodeWalker XML.
`xml/roads-index.json` lists which roads are in which ymap and how many pieces each road has.

```
python3 tools/gen-island-terrain.py   # rebuilds the ground AND these roads (it runs the road script)
node tools/gen-road-ymaps.js          # roads only, on the last terrain's hills
```

Roads climb the island's hills (from `island-terrain/`) at no more than 12%, each piece tilted to its slope.

## 1. Check the piece model first (once)

The road prop and its size are settings at the top of `tools/gen-road-ymaps.js` (`CONFIG`).
**They are not verified yet:**

| setting | default | what to check in CodeWalker |
|---|---|---|
| `pieceModel` | `stt_prop_track_straight_s` | Search the name in the model browser. If it isn't there, pick any flat, drivable prop. |
| `pieceLength` / `pieceWidth` | 10 m / 8 m | The model's bounding box. Its length must run along the model's own +Y axis. |
| `centre`, `z` | X -5500, Y -6500, Z 10 | Where the island sits: open sea south-west of Los Santos. Move it if it clashes with anything. |
| `metresPerUnit` | 2 | 1500 map units → a 3 km wide island. |

Change them, rerun the script, and every ymap is rebuilt.

## 2. XML → binary ymap (CodeWalker)

1. Open CodeWalker → **Tools → RPF Explorer** (or the project window).
2. For each `xml/island_roads_*.ymap.xml`: **File → Import XML**. CodeWalker writes `island_roads_*.ymap`.
3. Put the 22 `.ymap` files in `island-roads/stream/`.
4. Optional check: open one in the **Project window** to see the pieces sitting on the island's road lines.

## 3. In the server

```
ensure island-roads
```

Then teleport to the island's centre, X -5500, Y -6500, Z 15.

## What this is and isn't

- **It is:** a drivable road surface along every street, at the right place, length and heading.
- **It isn't:**
  - Ground: that's `island-terrain/`.
  - Traffic paths: AI cars and peds need paths built for these roads, which this doesn't include.
  - Lane markings: the pieces look like whatever model you choose.
  - Joins: at junctions the pieces just overlap.
- The island itself (land, buildings, the mountain) needs custom models. These roads are the layout to build them around.
