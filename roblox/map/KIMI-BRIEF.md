# Brief for Kimi: render the island's environment

Paste this brief into Kimi along with the images. The road layout is final, so
build the environment **around** the roads and never move one.

## Files to give Kimi

| File | Use |
|---|---|
| `layout-labeled.png` | The master map: every road named, with its code, plus junction dots, districts, the stud grid, a scale bar and north |
| `layout-clean.png` | The same map with no text, as a base to paint over |
| `layout.json` | Exact coordinates of every road, junction, district and the coastline, in Roblox studs |

## The world

- **Size:** an island about **8,300 x 4,700 studs** (about 2.8 x 1.6 km), plus an
  airport on reclaimed land along the south shore. North is up on the images,
  which is **-Z** in Roblox.
- **Scale:** 1,000 studs is about 333 m. A Roblox character is about 5 studs
  tall, and a car is about 8 studs wide.
- **Ground:** the grass top is at Y = 0. Roads sit about 1 stud above it. The
  sea is at Y = -4, with a 45 m sand beach all the way round.
- **Roads:** 108 named roads, 276 junctions and 345 street signs, already built
  in Roblox. Widths: highway 56 studs, arterial 40, street 28, back road 20, dirt
  track 14.

## Districts, north to south

1. **312: the port city (north).** A dense grid of numbered streets (5th to
   14th Street, A to D Avenue) inside Palisade Boulevard, with a downtown of
   glass towers. A big container port in the north-east has piers, cranes and
   ships along The Causeway and Lakeshore Drive. A smaller port is in the
   north-west.
2. **770: farm country and the mountain (the middle).** A rock mountain about
   700 studs high, with a snow cap, sits inside the County Line Road loop.
   Around it are farm fields, orchards, barns and dirt tracks (Orchard Track,
   Millpond Lane, Windmill Lane and others). The West tower district is a
   separate cluster of high-rises on the west side, on FAFO, FOMO and FUD
   streets.
3. **1017: the south city.** North and South tower clusters sit on either side
   of the Inner Loop, with neighbourhood streets (Ridgeview Drive, Alder Avenue,
   Mill Creek Road) and suburbs to the south-east (Groveland, Southline
   Boulevard).
4. **The airport (south shore).** One long east-west runway, terminals, a
   control tower and an east apron, reached by Airport Road and The Connector.

**Ring roads:** The Perimeter circles the whole island, and The Connector runs
north to south through the middle, from 312 to 1017.

## What to render

- Keep it **original**. This is its own town, not a copy of any existing game's
  look, buildings or logos.
- Bright, clean, slightly stylized realism that reads well on phones.
- Sidewalks and curbs along every street in 312 and 1017. Street trees, lamp
  posts and traffic lights at the major junctions, which are the dots on the
  labeled map.
- Building types by district: towers downtown, shops and diners along the
  arterials, houses with yards in 1017's suburbs, farms in 770, warehouses at
  the ports.
- **Keep every road clear.** Nothing may sit on a road surface, including
  buildings, trees and props.

## Useful views to ask for

1. A top-down render of the whole island, matching `layout-clean.png`.
2. A street-level view in 312 downtown at C Avenue & Midway Avenue (the 312 spawn).
3. A view of the 770 farm country with the mountain behind it.
4. A street-level view at The Connector & The Flyover in 1017 (the 1017 spawn).
5. The 312 container port at sunset.
