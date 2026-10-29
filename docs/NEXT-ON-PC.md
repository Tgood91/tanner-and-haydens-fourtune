# Next time on the PC

Everything below is built, tested headless and pushed to `ccr-5d4c3135-x60ejw`.
**Nothing has ever run inside FXServer.** That is the whole of what's left.

## State of play

89 tests pass: `node --test js-snippets/game.test.js`

Built: inventory, money + gold, jobs, hunger/thirst, cities, spawns, shops, dropped items,
trunks, vehicles with fuel + repairs, ammo, weapon licences, police + jail, revive, taxi fares,
robbery, phone, crews, and named districts/parks/roads.

Docs: `js-snippets/README.md` (how it fits together, every placeholder to tune),
`docs/COMPLIANCE.md` (FiveM rules audit), `docs/city-map.html` (world map, opens in a browser),
`docs/CAPACITY-PLAN.md` (gates by player count).

## 1. Push the API — this is the blocker

Saving is not wired up because your API isn't in the repo. From inside the repo:

```
git pull
node tools/join-server.js "<path to gta-rp-server>" --dry-run
node tools/join-server.js "<path to gta-rp-server>"
git push
```

The dry run changes nothing. The real run copies into `server/`, leaves out `.env`,
`node_modules`, cache and logs, blanks the Cfx key / rcon / MySQL values in `.cfg`, and
stops if anything else looks like a secret.

Once that's in, the `TODO`s in `js-snippets/fivem-server.js` can be filled in and characters
will actually persist.

## 2. First in-game test

Drop `js-snippets/` into `resources/` as `fourtune`, add `ensure fourtune` to `server.cfg`,
make sure OneSync is on, then:

```
setjob <id> ems 0
giveitem <id> medkit 2
```

In-game: `/duty`, have someone go down, walk over, `/revive <theirId>`.
Then try `/rob` at a shop with a loaded gun, and `/taxi` from another character.

## 2b. The Lua world layer

`world/` is a standalone FiveM resource (`ensure world`) covering cities, districts, parks,
roads and spawns in Lua. Its coordinates are GENERATED from the JS, so edit the JS and re-run
`node tools/gen-world-data.js > world/data.lua` rather than editing `world/data.lua` by hand.
Other resources should use its exports (`exports.world:Describe(coords)`), never copy the tables.
Checks: `lua world/test.lua`.

## 2c. Install order

`docs/RESOURCES.md` lists both resources, what they depend on, the copy steps and the
`server.cfg` block. The short version: `js-snippets/` has to be installed as a folder named
`fourtune`, and `chat` + `spawnmanager` must be ensured before either of ours.

## 3. DECIDED: Lua

Tanner chose Lua on 29 Oct 2026. New systems are written in Lua from here, and the JavaScript in
`js-snippets/` becomes the reference to port from rather than the thing that ships.

Ported so far: `world` (cities, places, spawns), `crew` (crews, ranks, turf).
Still JavaScript only: inventory, money and gold, jobs, needs, shops, vehicles, fuel, ammo,
licences, police, medical, taxi, robbery, phone, pickups, trunks, and the crew stash, base
and radio.

Do not ensure `fourtune` alongside the Lua resources: every command would register twice.

## Still yours to do

- `LICENSE` has `[year]` and `[fullname]` placeholders.
- `givegold` is console-only by design — keep it for events, never wire it to a payment.
- Every coordinate in `places.js`, `shops.js`, `fuel.js`, `medical.js` and `spawns.js` is a
  placeholder placed by number. Walk them.

## Ideas not started

Turf (claimable zones per crew), drugs, housing, a HUD, hunger/thirst UI.

## Letting Claude into the real server

Claude desktop app -> Settings -> Claude Code -> Remote Control -> add the `gta-rp-server`
folder (it has to be a git repo). Then a session can work in it directly.
