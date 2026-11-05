# island-streets — the island's road names in game

GTA only knows the names of its own roads, so on the island the game
would show "Pacific Ocean". This client resource names all **159 island
roads** itself:

| What | How |
|---|---|
| **Street name on the HUD** | Replaces GTA's street name by the minimap with the road you're on and the nearest crossing, for example `Palisade Boulevard / 5th Street`. Underneath it shows the area and its code, for example `Foundry Flats · 312`. |
| **Street signs at junctions** | A green name sign floats over every junction within 90 m, at the ground's real height. There are 304 junctions. `/streetsigns` turns them off and on, and the choice is remembered. |
| **Pause map** | A named blip for each of the 28 districts and parks (pause map only, so the minimap stays clean). The West Woods Hunting Grounds get an orange area plus GTA's hunting icon, and so does Antler Lodge. |
| **World map (M)** | `world-map` already names every road once you zoom in, and now shows "you are here" on the island too. |

Off the island nothing changes, and GTA's own street names come back.

```
ensure island-streets
```

## Rebuilding the data

`data.lua` is generated. Never edit it by hand. Rebuild it after any change to the island:

```
python3 tools/gen-island-map.py > island-map.html
node tools/render-streets.js          # street-renders/streets.json, world/streets_geo.lua
python3 tools/gen-island-terrain.py   # ground + road ymaps (junction heights come from the ground)
python3 tools/gen-island-streets.py   # -> island-streets/data.lua
```

## Tested

These were run headless (fengari, with the natives stubbed):

- standing on Palisade Boulevard by 5th Street
- standing on Foundry Road by Anvil Lane
- standing at Antler Lodge
- turning the signs off and back on
- standing in Los Santos
- a check that every junction and street is valid

15/15 checks passed. **It has not run inside FXServer yet.** On the first
in-game run, check the HUD text position next to your minimap; it's set in
`client.lua` (`0.172, 0.905`).
