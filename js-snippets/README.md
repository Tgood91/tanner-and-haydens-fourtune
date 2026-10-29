# js-snippets — the game core in JavaScript

All the game rules live in plain JavaScript files that don't depend on GTA. They run and get tested with plain Node.
`fivem-server.js` / `fivem-client.js` connect those rules to GTA 5 through FiveM. When GTA 6 can be modded, it gets its own pair of
adapter files, and the rules stay the same.

## Run it

```
node js-snippets/01-lessons.js        # Lua lessons 3–5, in JS
node js-snippets/02-demo.js           # inventory + cars walkthrough
node --test js-snippets/game.test.js  # 131 checks across every system
```

## What's in here

| File | What it does |
|---|---|
| `game.js` | Connects every system below and handles all commands, the per-minute tick, and save/load |
| `character.js` | One character: money, job, health/hunger/thirst, inventory, garage. Starter-kit rule on first load |
| `inventory.js` | Items, weights, 30 kg limit, use/drop. Food and drink values live here |
| `economy.js` | Cash/bank, deposit, withdraw, pay another player. **Gold**: earned only by working (on-duty paychecks, EMS revives), never bought or traded |
| `houses.js` | Seven places to buy, priced by district. A door you lock, keys you hand out by id and take back by name, and storage that isn't on your back. Selling gives 60% back, and only once it's empty |
| `shifts.js` | Sheriff and EMS go **on shift**, not just on duty: `/duty` hands out a callsign from the department's pool (`S-1`…`S-12`, `M-1`…`M-12`) and takes it back when you clock off. Radio traffic uses the callsign, `/roster` shows who's out, and an hour in you're told to take a break |
| `impound.js` | Where cars go when they're taken off you: police `/towveh`, a wrecked engine, or logging out with it on the street. `/releaseveh` at the lot charges the fee and hands it back repaired — **not refuelled** |
| `appearance.js` | Six clothing slots and five saved outfits. Change at one of the four shops, put a saved outfit back on there or at a door you hold a key to. A mask means the robbery call goes out as "masked suspect". The client adapter turns the six numbers into ped components and props, checks each against the model before drawing it, and re-draws them whenever the ped changes. A slot the model refuses goes back to the default and the paid change is refunded |
| `drugs.js` | Pick it at a supply spot, cook it at your crew base, move it in a district. Price follows demand, pays a bonus on your own turf, and the district goes cold after you work it. Every deal risks a tip-off — riskier in daylight — and the tip names the place, never the dealer |
| `turf.js` | The ten districts are the board. Two crew standing in one for 120s takes it; anyone wandering off kills the claim. The crew losing it is warned the moment it starts. Holding pays gold per online member every 10 min |
| `gangs.js` | Crews with Member/Officer/Leader ranks. Founding costs $25,000 and plants a base where you stand. Invite-and-accept only, `/g` radio chat that needs a **radio** in your bag, and a 120 kg shared stash that only opens at the base |
| `phone.js` | A number per character, area code from the city you started in (7101 / 770 / 312). `/text` by number or player id, `/texts`, `/contacts`, `/save`. The phone **item** is required: no phone means no texts, no `/911` and no cab |
| `taxi.js` | `/taxi` calls a cab, on-duty drivers get the ping, `/accept` claims it, `/startfare` starts the meter next to the passenger, `/endfare` bills them. The fare is $30 plus $8 per 100 units **actually driven**, teleports not counted |
| `jobs.js` | Sheriff, EMS, Beeker's mechanic, taxi. Grades, duty, paychecks every 30 min |
| `medical.js` | At 0 health you're down and on-duty EMS get the call. EMS `/revive` (uses their medkit, earns a bonus), or `/respawn` after 5 min for a bill at whichever of the city's two hospitals is closer to where you dropped |
| `ammo.js` | Five ammo types, which gun takes which, `/loadammo` boxes into rounds (capped), `/unloadammo` full boxes back, `/equip` / `/holster`. Client ammo reports can only lower the count |
| `robbery.js` | `/rob` a shop counter: needs a loaded gun in your hands and at least one officer on duty. Every cop gets the call, you must stand at the till 90s, and walking off, getting cuffed or going down ends it with nothing. Pays out as cash, with a cooldown on the shop and on you |
| `police.js` | Sheriff's Office tools: `/cuff`, `/search`, `/seize`, `/fine`, `/jail`. Seized items are destroyed and fines go to the city, so cops can't farm them. Jail time is saved, so logging out doesn't skip it |
| `licenses.js` | Weapon license: $2,500 at Ammu-Nation, required before Ammu-Nation sells a gun for gold. Police `/checklicense` on a stop (no cuffs; also shows a gun that's out) and `/revokelicense` (24h before a new one can be bought) |
| `needs.js` | Hunger and thirst drain over time. Running empty costs health |
| `places.js` | Named ground: 10 districts, 5 parks and 10 roads as real coordinates. The most specific name wins (road, then park, then district, then city), so dispatch reads "Lakeshore Drive, The Shoreline, Chicago". Walking into a park announces it; teleports stay quiet |
| `hud.js` + `hud.html` | The overlay: health, food and water bars, cash/bank/gold, job, where you are, the time and sky, your crew and its turf, and a fuel panel when you're driving. `hud.js` builds the payload server-side so nothing is trusted from the client; `hud.html` only draws it |
| `environment.js` | The server owns the clock and the weather, so every player sees the same sky. A day takes about 48 real minutes, weather walks a transition table instead of jumping, and `isNight()` / `isWet()` are what other systems ask |
| `cities.js` | Atlanta → GeePee → Chicago by how far north you are, with "Welcome to…" announcements |
| `spawns.js` | 2–3 spawn points per city. New players start in Atlanta, returning players where they logged out, jailed players in the cell. **Released in a different city from the arrest**: Atlanta → Chicago, GeePee → Atlanta, Chicago → GeePee (`RELEASE_CITY`) |
| `shops.js` | 24/7s and hardware stores. Every check runs before money is taken, so you can't pay and get nothing |
| `pickups.js` | Dropped items anyone nearby can grab. They disappear after 10 min |
| `trunks.js` | Trunk storage per plate, with its own weight limit. Owner or unlocked only |
| `vehicles.js` | Catalog, buying, garage with plates |
| `fuel.js` | Fuel burns by distance driven, empty tank kills the engine. `/refuel` at gas stations ($3/L), fuel can +20 L, repair kit patches your own engine to 650, mechanics `/repair` fully for $600 from the owner (+10 gold). Damage reports from the game can only lower health |
| `fivem-server.js` / `fivem-client.js` / `fxmanifest.lua` | The FiveM (GTA 5) adapter |

## Commands

Players: `/help /inventory /useitem /dropitem /pickup /balance /deposit /withdraw /pay /job /duty /time /weather /places /status /ammo /loadammo /unloadammo /equip /holster /revive /respawn /911 /cuff /search /seize /fine /jail /jailtime /houses /home /buyhouse /sellhouse /lockhome /givekey /takekey /wardrobe /storehome /takehome /harvest /process /deal /turf /claim /abandon /gangs /gang /gangcreate /ganginvite /gangaccept /gangleave /gangkick /gangpromote /gangdemote /gangdisband /gangbase /g /stash /stashput /stashtake /phone /text /texts /contacts /save /rob /taxi /cancelcab /calls /accept /startfare /endfare /fare /licenses /buylicense /checklicense /revokelicense /cities /whereami /shop /buy /cars /garage /buyveh /spawnveh /storeveh /lock /carstatus /refuel /repair /trunk /trunkput /trunktake /roster /callsign /impound /releaseveh /towveh /clothes /look /dress /outfits /saveoutfit /outfit /dropoutfit`

Server console only: `giveitem <id> <item> [count]`, `givemoney <id> <cash|bank> <amount>`, `setjob <id> <job> [grade]`, `forcerevive <id>`, `givegold <id> <amount>`, `unjail <id>`, `givelicense <id> [weapon]`, `settime <hour> [min]`, `setweather <kind>`, `freeze <time|weather> <on|off>`

## Placeholders — tune these

- Item weights, food/drink values (`inventory.js`)
- Shifts: 12 callsigns per department, the 60-min break nudge (`shifts.js`)
- Impound: $2,500 police / $1,200 wrecked / $600 abandoned, and both lot coords (`impound.js`)
- Clothes: slot prices ($70-$180), variant counts, 5 saved outfits, all four shop coords (`appearance.js`)
- **Sleeves**: `TOP_ARMS` in `fivem-client.js` is empty. Any top whose arms look wrong needs its arms number written in there
- Every car price except the Sultan's $120,000 (`vehicles.js`); trunk sizes (`trunks.js`)
- Tank sizes, litres per km, fuel price, repair bill, repair gold, gas station spots (`fuel.js`)
- Houses: $65,000-$240,000 by district, 40-75 kg storage, 60% back on a sale, 6 keys (`houses.js`)
- Drugs: prices and demand per district, 10-min spot cooldown, 20-min district cooldown, 1.4x on your turf, 1.6x heat in daylight (`drugs.js`)
- Turf: 2 to claim, 120s to hold, 15-min settle after a flip, 15 gold per member every 10 min (`turf.js`)
- Crew cost ($25,000), 12-member cap, 120 kg stash, 10-unit base range, 24h base move cooldown (`gangs.js`)
- GeePee's area code (770 is a guess) and the 20-text history (`phone.js`)
- HUD: pushed every 2s, bars read low under 25 and critical under 10 (`hud.js`)
- World clock: 30 world-minutes a tick (a day in ~48 real min), weather rolls every 2 world-hours, night is 21:00-06:00 (`environment.js`)
- Robbery: 90s at the till, $400-$1,200 payout, 1 officer minimum, 30-min shop and 15-min robber cooldowns (`robbery.js`)
- Taxi flag drop ($30), $8 per 100 units, $5 driver gold, 5-min call timeout (`taxi.js`)
- Weapon license price ($2,500) and revoke ban (24h) (`licenses.js`)
- Police: $5,000 max fine, 30-min max jail, jail cell coords (`police.js`)
- Gold: per-paycheck gold by job (`jobs.js`), revive gold (`medical.js`), gun prices in gold (`shops.js`)
- Ammo: rounds per box and caps (`ammo.js`), box weights (`inventory.js`), box prices and Ammu-Nation spots (`shops.js`)
- Revive/respawn health, 5-min bleedout, $150 EMS bonus, $500 hospital bill, and every hospital coord except Lakeshore General (`medical.js`)
- Starting money (`character.js`), job pay (`jobs.js`), hunger/thirst rates (`needs.js`)
- **Every district, park and road coordinate** (`places.js`) — placed by number near existing pins, never stood on
- All spawn points except Chicago Main, the default city, and the release route (`spawns.js`); **both city borders** (`cities.js`); all shop locations and prices (`shops.js`)
- The Chicago job spots are the approximate coords from your smoke test. Walk them

## Not done yet

1. **Saving to your API.** `fivem-server.js` has `TODO`s where it should load from and save to your Node API on :4000.
   Your API's routes and format aren't in this repo, so it's not wired up.
2. **Not tested in-game.** The FiveM files pass a syntax check, but they've never run inside FXServer. They need OneSync.
3. **Crew rosters are keyed by character name.** That is the only stable handle this code has until the API gives
   out character ids. Two players with the same name would share a rank, so swap it when saving is wired up.
4. **This doesn't replace your Lua resources.** Your real server is Lua. These JS files are a parallel version, and running
   both at once would give you two of every command. Pick one per system before enabling it.
5. **Gold is never for sale.** FiveM's license bans selling in-game currency for real money, so a Tebex package must
   never grant gold or guns. Keep Tebex for cosmetics only.
