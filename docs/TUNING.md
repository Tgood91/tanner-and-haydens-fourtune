# Punch list

Everything still open, pulled out of the code. There is a nicer version of this page at
`docs/tuning.html` — open it in a browser.

## Only you can decide

1. ~~**Lua or JavaScript, per system.**~~ **Settled 29 Oct 2026: JavaScript.** `fourtune` is what
   ships. `world/` and `crew/` are Lua leftovers — keep them as reference or delete them, but
   don't ensure them beside `fourtune`.
2. **Your name in `LICENSE`.** Still `Copyright (c) [year] [fullname]`.
3. **Whether the cars get renamed.** Guns, shops and streets moved off Rockstar's names; vehicles
   didn't, because GTA draws its own name on screen and chat would disagree with it.

## The one blocker

**The API isn't in the repo, so nothing saves.** `fivem-server.js` has `TODO`s where loading and
saving go. `node tools/join-server.js <path>` on your PC unblocks it.

## 56 coordinates, 5 of them real

Five came from your smoke test. The other 51 were placed by number and never stood on.

| What | How many | Where |
|---|---|---|
| Districts, parks, roads | 25 | `places.js` |
| Shops and Gunworks counters | 8 | `shops.js` |
| Spawn points | 7 | `spawns.js` |
| Hospitals | 6 | `medical.js` |
| Gas stations | 5 | `fuel.js` |
| Job stations | 4 | `jobs.js` |
| Jail cell | 1 | `police.js` |
| City borders | 2 | `cities.js` |

Change them in the JS, then `node tools/gen-world-data.js > world/data.lua` so the Lua follows.

## Numbers that only playing will settle

**Money** — start 500 cash / 5,000 bank / 0 gold (`character.js`) · paycheck every 30 min
(`game.js`) · 35–45 gold per on-duty paycheck (`jobs.js`) · guns 444–1,500 gold (`shops.js`) ·
licence $2,500, revoke ban 24 h (`licenses.js`) · crew $25,000 (`gangs.js`)

**Staying alive** — hunger 0.5/min, thirst 0.8/min, 2 damage/min when empty (`needs.js`) ·
bleedout 5 min, revive/respawn at 50 health, EMS gets $150 + 25 gold, hospital bill $500
(`medical.js`) · carry 30 kg (`inventory.js`)

**Crime and the law** — 90 s at the till, $400–1,200 payout, 1 officer minimum, 30/15 min
cooldowns (`robbery.js`) · fines to $5,000, jail to 30 min (`police.js`) · ammo 20–50 a box, load
caps 60–500 (`ammo.js`)

**The world** — 30 world-minutes per tick so a day runs about 48 real minutes, weather rolls every
2 world-hours, night is 21:00–06:00, robbing at night pays 1.25x (`environment.js`, `robbery.js`)

**Property** — seven houses from $65,000 on the Backroads to $240,000 on the Shoreline, 40–75 kg
of storage, 60% back when you sell, six keys per door (`houses.js`)

**The trade** — Green Pack $140 and White Pack $320 before demand, 1.4x on your own turf,
1.6x heat in daylight, spots go bare 10 min, districts cold 20 min (`drugs.js`)

**Turf** — 2 crew to claim, 120 s to hold it, 15 min settle after a flip, pays 15 gold per
online member every 10 min (`crew/turf.lua`)

**Getting around** — taxi $30 + $8 per 100 units (`taxi.js`) · fuel $3/L, 1.0–1.5 L per km,
repairs $600 + 10 gold (`fuel.js`) · trunks 15–60 kg, crew stash 120 kg (`trunks.js`, `gangs.js`) ·
dropped items vanish after 10 min (`pickups.js`)

**On shift** — 12 callsigns each for the Sheriff's Office (`S-1`…) and EMS (`M-1`…), a break
nudge every 60 min on shift (`shifts.js`)

**The impound** — $2,500 when police tow it, $1,200 wrecked, $600 for logging out on the
street; released repaired, never refuelled (`impound.js`)

**Clothes** — $180 a top, $160 shoes, $140 legs, $120 a mask, $90 a hat, $70 glasses; taking
something off is free; five saved outfits (`appearance.js`)

## Check on the first boot

- **Walk the clothing shops.** The variant counts in `appearance.js` are guesses. A number the
  model doesn't have is refused by the client, put back and refunded, so nothing breaks — but
  that slot is dead until the count comes down. `TOP_ARMS` in `fivem-client.js` is the other
  one: empty until you find a jacket whose sleeves look wrong.

- **`files{}` ships server logic to players.** `fourtune` lists its server modules there so
  `require()` can reach them, which also sends them to every client. If `require()` works without
  those entries, drop them.
- **Does `world` load without `lua54`?** It uses nothing version-specific, so it should run either
  way. If it throws on load, try that first.

---

131 JavaScript checks and 84 Lua checks pass headlessly. None of it has run inside FXServer.
