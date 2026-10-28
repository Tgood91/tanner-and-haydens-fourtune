# Next time on the PC

## 1. Join the server into this repo

From inside this repo:

```
git pull
node tools/join-server.js "<path to your gta-rp-server folder>" --dry-run
node tools/join-server.js "<path to your gta-rp-server folder>"
git push
```

The dry run shows what will be copied and what's left out, and changes nothing. The second run copies the folder into
`server/` and commits it. It leaves out `.env`, `node_modules`, the FXServer cache, logs, and the Cfx key / rcon /
MySQL values in `.cfg` files. If it finds anything else that looks like a password or key, it stops and tells you the
file and line. Move that value into `.env` and run it again.

Run it again any time the server changes. `server/` is replaced with a fresh copy each time.

This unblocks: **saving and loading through the API** (`TODO`s in `js-snippets/fivem-server.js`).

## 2. Test revive in-game

From the server console, with your player id:

```
setjob <id> ems 0
giveitem <id> medkit 2
```

Then in-game: `/duty`, have a friend go down, walk over, `/revive <theirId>`.
Also check: with no EMS on duty, the downed player gets told, and `/respawn` works after 5 minutes.

## 3. Pick Lua or JS for each system

Inventory, jobs, vehicles and money exist in both your Lua resources and `js-snippets/`. Running both registers every
command twice. Pick one per system before enabling `fourtune`.

## Optional: let Claude work in the real server

Claude desktop app → Settings → Claude Code → Remote Control → add the `gta-rp-server` folder (it must be a git repo).
