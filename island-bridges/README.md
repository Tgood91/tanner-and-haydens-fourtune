# island-bridges — the bridge from the island to Los Santos

`tools/gen-road-ymaps.js` builds **The Island Bridge**: two rows of road pieces, about 3.9 km,
from the north-east end of Lakeshore Drive straight to the mainland. It climbs from the island
(Z 25) at 5% to a deck 40 m above the sea, holds it, and comes down at 5% to the landing point.
The settings are `CONFIG.mainlandBridge` (and `bridgeDeck`, `bridgeGrade`) in that script.
`xml/bridges-index.json` lists where it starts and ends and which ymap holds what.

```
python3 tools/gen-island-terrain.py   # rebuilds the ground, the island roads AND this bridge
node tools/gen-road-ymaps.js          # roads and bridge only
```

## 1. Set the landing point (it's a guess until you do)

The mainland end, X −1600, Y −3300, Z 6 (south-west of the airport), is **not verified**. Nobody
has checked that it's on a road, or even on land.

1. In game, stand on the mainland road where the bridge should land, facing the island.
2. Type `/coords` (from the `world` resource). It prints X, Y, Z and your heading.
3. Put X, Y and Z in `mainlandBridge.to` in `tools/gen-road-ymaps.js`, then rerun one of the
   commands above. The bridge re-aims itself.

## 2. XML → binary ymap (CodeWalker)

The same as `island-roads/README.md`: **File → Import XML** on each `xml/island_bridge_*.ymap.xml`,
then put the `.ymap` files in `island-bridges/stream/`. It uses the same road piece, so check
that piece's size first (`island-roads/README.md`, step 1).

## 3. In the server

```
ensure island-bridges
```

`tools/deploy-to-server.js` installs it once `stream/` holds the `.ymap` files.

## What this is and isn't

- **It is:** a drivable deck on the right line, length and height, with ramps at both ends.
- **It isn't:**
  - Supports: there are no piers or cables. It's a deck in the air.
  - Railings: whatever the piece model has, nothing more.
  - Traffic paths: AI cars won't use it.
  - Checked against the ocean: whether GTA's sea reaches this far out is still untested
    (see `island-terrain/README.md`).
