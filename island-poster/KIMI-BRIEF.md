# Brief for Kimi: render the island's environment

Paste this brief into Kimi along with the images in this folder. The road
layout is final, so build the environment **around** the roads. Never move,
remove or add a road, and never put anything on one.

## Images

| File | Use |
|---|---|
| `overview.png` | The whole island, with main roads, districts and area names |
| `overview-clean.png` | The same island with no text, as a base to paint over |
| `renders/lumber-yard.png`, `lumber-yard-top.png` | A 3D render of Hollow Creek Lumber Yard built from the game's own terrain, buildings and roads (`node tools/render-lumber-yard.js`). Use it as the layout to match when restyling the yard. |
| `regions/01` … `08` | Close-ups where every street's name and number is readable. Use these for street-level detail. |

Road numbers read like `312-A11`: area code · **H** highway / **A** avenue / **S** street / **B** back road · number.

## The world

- **Size:** about **6.6 km east to west and 2.3 km north to south**, in open sea
  south-west of a big mainland city. North is up on every image.
- **Roads:** 159 named roads and 304 junctions, from 6-lane highways down to dirt tracks.
- **Buildings already placed:** 970, including towers, houses, shops,
  warehouses, terminals and barns. Keep their footprints where the images
  show them.

## Areas, west to east

1. **West Woods.** Dense pine and oak forest on rolling ground.
   - **The West Woods Hunting Grounds** sit inside the dashed orange line, between
     Timberline Road and the West Reach Parkway. Inside are wooden hunting
     stands, deer and boar, and **Antler Lodge**, a timber hunting lodge at the
     end of Antler Lodge Track.
   - **Pine Hollow** is a small village of wooden houses on a grid.
   - **The Copper Hills** to the south are wooded and quarried.
   - **Sundown Beach** runs along the west shore.
2. **The 312 (north).** A port city.
   - A dense downtown of glass high-rises sits on a numbered grid (5th to 14th
     Street, A to D Avenue).
   - Container ports have piers, cranes and ships on the north coast.
3. **The 770 (middle).** Farm country with fields, barns and silos.
   - A rock mountain about 300 m high, with a snow cap, sits in the centre.
   - The West tower district is a cluster of very tall towers, up to 95 floors.
4. **The 1017 (south).** Two tower clusters inside the Inner Loop, with
   houses to the east and west and a harbour on the east side.
5. **The airport.** Reclaimed land along the south shore, with one long
   runway, terminals and a control tower. A small marina sits just west of it.
6. **Grande P (the whole east land).** It joins on east of the 312 port.
   - **The middle:** open farmland around **Kestrel Park**, a large oval park
     with a ring road. The Grande P Expressway crosses it.
   - **Foundry Flats:** an industrial grid of warehouses, yards and freight sidings.
   - **Bayfront:** the north shore, with offices along Bayfront Drive.
   - **Harrow Heights:** forested hills about 90 m high, with winding roads.
     **Lighthouse Point** is at the east tip.
   - **Eastgate:** a suburb of houses with yards on a tree-named grid (Aspen to
     Sycamore Street, Maple to Hawthorn Avenue).
   - **Saltwater Strand:** a beach resort along Strand Boulevard, with beach
     streets (Coral, Gull, Pelican, Tidewater), a boardwalk and a marina.

## Style

- Keep it **original**. This is its own island, not a copy of any existing
  game's map, landmarks, buildings or logos.
- Bright, clean, slightly stylized realism.
- Sidewalks, street trees, lamp posts and traffic lights in the cities and
  suburbs. Fences, hay bales and dirt in the farmland. Thick forest in the
  West Woods and Harrow Heights.
- **Keep every road clear and keep the coastline as drawn.**

## Views to ask for

1. A top-down render of the whole island, matching `overview-clean.png`.
2. Street level in 312 downtown, on Palisade Boulevard at 5th Street.
3. The West Woods Hunting Grounds at dawn: a hunting stand and Antler Lodge.
4. Grande P: Kestrel Park from above, with the farms around it.
5. Saltwater Strand at sunset, looking along the beach.
6. Foundry Flats: warehouses and freight sidings.
