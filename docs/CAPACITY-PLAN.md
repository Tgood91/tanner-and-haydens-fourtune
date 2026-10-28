# Capacity Plan: Fourtune server framework, before max capacity

**Period:** Nov 2 – Dec 13, 2026 (6 weeks) | **Team size:** 2 (Tanner, Hayden) + Claude sessions

> **Assumed, please correct:** weekly hours per person and the 48-slot target. Nothing in the repo says either.
> Change the hours in the first table and the weeks at the bottom shift with them.

"Max capacity" here means the server's player-slot limit (`sv_maxclients`). The goal: by the time real players fill
the slots, the framework already handles them. The work is split into gates by player count. Don't open more slots
until the gate before is done.

## Current utilization

| Person / role | Capacity | Allocated | Available | Utilization |
|---|---|---|---|---|
| Tanner — lead, in-game testing, all PC/FXServer steps | 10 hrs/wk *(assumed)* | 10 | 0 | 100% ⚠️ |
| Hayden — playtesting, coord walking, tuning | 5 hrs/wk *(assumed)* | 2 | 3 | 40% |
| Claude sessions — code, tests, docs | on demand | — | — | not a limit |

Tanner is at 100% because **every in-game step needs Tanner's PC**: the Cfx key, FXServer, the API on :4000, MySQL.
Hayden can take the walking and tuning, which frees roughly 3 hrs/wk.

## Capacity summary

- **Total capacity:** 15 hrs/week
- **Target (80%, leaving room for broken builds and life):** 12 hrs/week, about 72 hrs over the 6 weeks
- **Planned demand below:** 47 hrs → fits, with about 25 hrs of buffer
- **Overallocated:** Tanner, until the PC-only work is shared out (see Recommendations)

## Load test: is the code the limit?

I ran `game.js` headless with simulated players: everyone owns a car and has dropped an item, then everyone buys,
picks up, and moves.

| Players | 1-min tick | `/buy` | `/pickup` | City check (all players) | Autosave | Memory |
|---|---|---|---|---|---|---|
| 48 | 0.28 ms | 0.03 ms | 0.01 ms | 0.01 ms | 0.3 ms / 11 KB | 5 MB |
| 256 | 0.05 ms | 0.01 ms | 0.02 ms | 0.08 ms | 0.4 ms / 57 KB | 7 MB |
| 2048 | 0.11 ms | 0.003 ms | 0.03 ms | 0.17 ms | 3.1 ms / 458 KB | 10 MB |

**The game rules aren't a limit at any slot count.** A server frame is about 16 ms, and the worst number above is 3 ms,
once every 5 minutes. The real limits are FiveM-side, and those can only be measured on Tanner's PC:

1. `nearestVehiclePlate` loops over **every vehicle on the map** on every command. Fine at 48 players, wasteful at 256+.
2. Every 5 seconds the server reads every player's position, and every minute their health, through game calls.
3. The autosave HTTP POST to the API. At 48 players it's small (11 KB); the API/MySQL side hasn't been measured.
4. The slot license. Default FiveM servers are capped at 48 slots, and more need a paid Cfx.re tier. Check
   the current limits on the Cfx.re site before planning past 48.

## Upcoming demand

| Gate | Work | Hrs | Who | Week | Status |
|---|---|---|---|---|---|
| **0 — private (≤5)** | Pick Lua or JS for each system (no double commands) | 2 | Tanner + Hayden | 1 | Open |
| | In-game smoke test of the JS adapter (OneSync on) | 3 | Tanner (PC) | 1 | Open |
| | Wire save/load to the API on :4000 | 6 | Claude, Tanner tests | 1–2 | **Blocked:** API routes aren't in the repo |
| | Walk & tune placeholders (city borders, shops, job spots, prices) | 6 | Hayden | 1–3 | Open |
| **1 — friends (≤32)** | **Death/revive flow** — today a downed player is stuck with no `/revive` | 5 | Claude + Tanner | 2 | **Gap** |
| | Admin tools: kick/ban, action logs (txAdmin covers part) | 5 | Claude + Tanner | 3 | Open |
| | Command rate limit (spam protection) | 2 | Claude | 3 | Open |
| | Crash-safe saving: only save changed characters, save on shutdown | 3 | Claude | 3 | Open |
| **2 — full (48)** | Adapter fixes: nearest vehicle from our own cars only, one chat message per reply | 2 | Claude | 4 | Open |
| | 48-slot stress night: real players, measure server frame time and API response times | 4 | Tanner + Hayden | 5 | Open |
| | Fix what the stress night finds | 6 | Claude + Tanner | 5–6 | Buffer |
| **3 — past 48** | Paid slot tier, hosting box, MySQL indexes — **decide after Gate 2 data** | 3 to decide | Tanner | 6+ | Not planned yet |
| | **Total (Gates 0–2)** | **47** | | | |

## Bottlenecks

- **Tanner's PC.** Every in-game test, the API, and the Cfx key are there. That's the critical path, and it's 100% booked.
- **The API is invisible.** Save/load can't be finished until its routes are in the repo or the PC folder is shared
  with a Claude session through Remote Control.
- **Week 1 crunch:** three Gate 0 items all need the PC at once.
- **The setup script** for this cloud environment still fails at line 4, so every new Claude session starts without it.

## Recommendations

1. **Unblock the API first.** Push the `gta-rp-server` API folder (minus `.env`) to the repo, or share it via Remote
   Control. That alone unblocks 6 hours of Gate 0.
2. **Give Hayden the tuning and walking.** That moves about 6 hrs off Tanner and brings Tanner to roughly 80%.
3. **Build revive before anyone else joins.** Right now, starving or getting shot to 0 health leaves you stuck.
   Friends will hit this on day one.
4. **Hold at 48 slots.** The code can handle far more, but don't pay for a bigger tier until the Gate 2 stress
   night shows real numbers.
5. **Fix the setup script line** in the environment settings so cloud sessions start clean.

## Scenarios

| Scenario | Outcome |
|---|---|
| Do nothing (Tanner does it all) | Tanner at ~130% → Gate 2 slips to about week 9; tuning is the first thing skipped |
| Hayden takes tuning + playtests | Tanner at ~80%, Gate 2 lands week 5–6 as planned |
| Skip Gate 1 and open at 48 now | Fastest, but players hit the stuck-at-0-health bug and there are no admin tools — risky |
| Push the API to the repo this week | Removes the only hard blocker; save/load lands week 1 instead of "unknown" |

*Review this plan at each gate, or monthly. It goes stale fast.*
