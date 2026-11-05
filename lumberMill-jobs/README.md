# lumberMill-jobs — Hollow Creek Lumber Yard, in the world

The lumber yard sits in the island's West Woods, just south of the West Reach
Parkway and east of Pine Hollow. Millyard Road runs into it off the parkway,
and Timber Yard Lane comes in from Pine Hollow Road. The logging is in the
**Copper Hills** woods to the south, so the hunting grounds keep their trees.

The rules live in the game core, in `js-snippets/lumbermill.js` (`/apply lumbermill`).
This client resource helps players find the work:

- **Markers** on the saw (mill shed), the yard office and all 8 felling spots, drawn within 40 m
- **Press E** when you're close: runs `/fell`, `/mill` or `/sellplanks`. The server checks it like a typed command.
- **Pause-map blips** for the yard and the logging woods

```
ensure fourtune          # the game core (js-snippets)
ensure lumberMill-jobs
```

## The job

| Step | Where | What |
|---|---|---|
| `/apply lumbermill`, `/duty` | anywhere | Open hire. Grades are Logger, Sawyer and Yard Boss. On duty pays $180 / $260 / $380 per paycheck plus 13 gold an hour. |
| `/fell` | a Copper Hills felling spot | 1 log (12 kg). Two fill a bag, so `/trunkput log` into a truck to haul more. A cut spot regrows in 8 min, for everyone. Each player can fell 12 logs an hour, and relogging doesn't reset it. |
| `/mill` | the saw, the mill shed's east door | Every log you carry becomes 4 planks, plus piece pay of $25 / $30 / $40 a log by grade |
| `/sellplanks` | the yard office | $30 a plank, cash. Anyone can sell; only on-duty workers can make them. |
| `/lumber` | anywhere | Your shift, felling spots ready, and the pay |

A Logger makes **$145 a log** in all ($25 to mill plus 4 planks × $30), on top of the paycheck.

`config.lua` holds the same spots as `lumbermill.js`. A test in
`js-snippets/game.test.js` fails if the two drift apart.

## Tested

Run headless (fengari, with the natives stubbed), these checks all passed (8/8):

- markers appear only nearby
- E runs the right command at the saw, a tree and the office
- a double press is ignored
- both blips are created

The rules have 5 tests in `game.test.js`. **None of it has run inside FXServer yet.** Walk the saw, office and felling spots once and adjust them in both files.
