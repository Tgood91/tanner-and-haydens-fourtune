# js-snippets — the game core in JavaScript

All the game rules live in plain JavaScript files that don't depend on GTA. They run and get tested with plain Node.
`fivem-server.js` / `fivem-client.js` connect those rules to GTA 5 through FiveM. When GTA 6 can be modded, it gets its own pair of
adapter files, and the rules stay the same.

## Run it

```
node js-snippets/01-lessons.js        # Lua lessons 3–5, in JS
node js-snippets/02-demo.js           # inventory + cars walkthrough
node --test js-snippets/game.test.js  # 30 checks across every system
```

## What's in here

| File | What it does |
|---|---|
| `game.js` | Connects every system below and handles all commands, the per-minute tick, and save/load |
| `character.js` | One character: money, job, health/hunger/thirst, inventory, garage. Starter-kit rule on first load |
| `inventory.js` | Items, weights, 30 kg limit, use/drop. Food and drink values live here |
| `economy.js` | Cash/bank, deposit, withdraw, pay another player. **Gold**: earned only by working (on-duty paychecks, EMS revives), never bought or traded |
| `jobs.js` | Sheriff, EMS, Beeker's mechanic, taxi. Grades, duty, paychecks every 30 min |
| `medical.js` | At 0 health you're down and on-duty EMS get the call. EMS `/revive` (uses their medkit, earns a bonus), or `/respawn` at the hospital after 5 min for a bill |
| `ammo.js` | Five ammo types, which gun takes which, `/loadammo` boxes into rounds (capped), `/unloadammo` full boxes back, `/equip` / `/holster`. Client ammo reports can only lower the count |
| `needs.js` | Hunger and thirst drain over time. Running empty costs health |
| `cities.js` | Atlanta → GeePee → Chicago by how far north you are, with "Welcome to…" announcements |
| `shops.js` | 24/7s and hardware stores. Every check runs before money is taken, so you can't pay and get nothing |
| `pickups.js` | Dropped items anyone nearby can grab. They disappear after 10 min |
| `trunks.js` | Trunk storage per plate, with its own weight limit. Owner or unlocked only |
| `vehicles.js` | Catalog, buying, garage with plates |
| `fivem-server.js` / `fivem-client.js` / `fxmanifest.lua` | The FiveM (GTA 5) adapter |

## Commands

Players: `/help /inventory /useitem /dropitem /pickup /balance /deposit /withdraw /pay /job /duty /status /ammo /loadammo /unloadammo /equip /holster /revive /respawn /911 /cities /whereami /shop /buy /cars /garage /buyveh /spawnveh /storeveh /lock /trunk /trunkput /trunktake`

Server console only: `giveitem <id> <item> [count]`, `givemoney <id> <cash|bank> <amount>`, `setjob <id> <job> [grade]`, `forcerevive <id>`, `givegold <id> <amount>`

## Placeholders — tune these

- Item weights, food/drink values (`inventory.js`)
- Every car price except the Sultan's $120,000 (`vehicles.js`); trunk sizes (`trunks.js`)
- Gold: per-paycheck gold by job (`jobs.js`), revive gold (`medical.js`), gun prices in gold (`shops.js`)
- Ammo: rounds per box and caps (`ammo.js`), box weights (`inventory.js`), box prices and Ammu-Nation spots (`shops.js`)
- Revive/respawn health, 5-min bleedout, $150 EMS bonus, $500 hospital bill, Atlanta and GeePee hospital coords (`medical.js`)
- Starting money (`character.js`), job pay (`jobs.js`), hunger/thirst rates (`needs.js`)
- Atlanta and GeePee spawns and **both city borders** (`cities.js`); all shop locations and prices (`shops.js`)
- The Chicago job spots are the approximate coords from your smoke test. Walk them

## Not done yet

1. **Saving to your API.** `fivem-server.js` has `TODO`s where it should load from and save to your Node API on :4000.
   Your API's routes and format aren't in this repo, so it's not wired up.
2. **Not tested in-game.** The FiveM files pass a syntax check, but they've never run inside FXServer. They need OneSync.
3. **This doesn't replace your Lua resources.** Your real server is Lua. These JS files are a parallel version, and running
   both at once would give you two of every command. Pick one per system before enabling it.
4. **Gold is never for sale.** FiveM's license bans selling in-game currency for real money, so a Tebex package must
   never grant gold or guns. Keep Tebex for cosmetics only.
