# Resources and install order

Two resources come out of this repo, plus two that ship with FXServer. Nothing here is
fetched at runtime — the coordinates are generated into the files, so a server with no
outbound network still boots.

Source for both: **https://github.com/Tgood91/tanner-and-haydens-fourtune**

## What each one is

| Resource | Folder in this repo | Depends on | What it does |
|---|---|---|---|
| `world` | `world/` | `chat` | Cities, districts, parks, roads and spawns, in Lua. Other resources ask it where things are through its exports |
| `crew` | `crew/` | `chat` | Crews and ranks, in Lua. The economy is optional: with none running it still plays, and says when it skips a charge |
| `island-terrain` | `island-terrain/` | — | The island's ground: 99 tiles with collision. Only what's in `stream/` loads; build it from `obj/` and `xml/` in Blender + Sollumz and CodeWalker first (`island-terrain/README.md`). Ensure it before `island-roads` |
| `island-roads` | `island-roads/` | — | The island's road surface as map files. Only the binary `.ymap`s in `stream/` load; make them from `xml/` in CodeWalker first (`island-roads/README.md`) |
| `island-bridges` | `island-bridges/` | — | The bridge from the island to Los Santos, as map files. Built like `island-roads`; its landing point needs setting from `/coords` in game first (`island-bridges/README.md`) |
| `fourtune` | `js-snippets/` | `chat`, `spawnmanager` | The game core in JavaScript: inventory, money, jobs, police, medical, vehicles, crews and the rest |
| `chat` | ships with FXServer | — | Every reply both resources send goes through `chat:addMessage` |
| `spawnmanager` | ships with FXServer | — | `fourtune` turns auto-spawn **off** so revive, jail and login decide where you land |

## Install

The repo is not laid out as a resources folder, so clone it somewhere else and copy the two
folders in. **The folder name is the resource name** — `js-snippets` has to become `fourtune`.

```bash
git clone https://github.com/Tgood91/tanner-and-haydens-fourtune.git ~/fourtune-src

cp -r ~/fourtune-src/world       <server>/resources/world
cp -r ~/fourtune-src/crew        <server>/resources/crew
cp -r ~/fourtune-src/js-snippets <server>/resources/fourtune
```

**On Windows, one command does all of it** (from the folder you saved `install.ps1` in):

```powershell
Invoke-WebRequest https://raw.githubusercontent.com/Tgood91/tanner-and-haydens-fourtune/main/install.ps1 -OutFile install.ps1
powershell -ExecutionPolicy Bypass -File .\install.ps1 -ServerPath C:\FXServer\server-data
```

It downloads the repo (git, or the zip if git isn't installed) to `%USERPROFILE%\fourtune-src`, copies
`world`, `crew`, `world-map` and `fourtune` into `resources\`, and adds the missing `ensure` lines to
`server.cfg` (backed up first, never duplicated). Add `-Engine JS` to ensure `fourtune` instead of
`world` + `crew`. Run it again to update.

Or by hand: copy the folders in Explorer and rename `js-snippets` to `fourtune`.

Or let the script do it (it renames `js-snippets` for you and checks `server.cfg`):

```bash
node tools/deploy-to-server.js "<server>" --dry-run   # see what it would do
node tools/deploy-to-server.js "<server>"             # copy world + crew
node tools/deploy-to-server.js "<server>" --link      # once: after this, git pull is the deploy
```

Add `--with-fourtune` to include `fourtune`. `island-terrain`, `island-roads` and `island-bridges` go in automatically once
their `stream/` holds every built file (99 `.ydr` + 99 `.ybn` + `.ytd` + `.ytyp` + `.ymap` for the
terrain, the `.ymap`s for the roads and the bridge), and are skipped with a note saying what's missing until then.
Only `stream/`, `fxmanifest.lua` and `README.md` are copied; `obj/` and `xml/` stay in the repo. To update later, pull and run it again. A symlink works too and saves the
copy step, if your OS and FXServer are happy with one.

## server.cfg

Order matters: `chat` and `spawnmanager` have to be up before either of ours.

```cfg
ensure chat
ensure spawnmanager
ensure sessionmanager

ensure world
ensure crew

# Lua was chosen on 29 Oct 2026. `fourtune` is the JavaScript version and
# overlaps the Lua resources — do not ensure it alongside them.
# ensure fourtune
```

`dependencies` in each `fxmanifest.lua` makes FXServer refuse to start a resource whose
requirements are missing, so a wrong order fails loudly instead of half-working.

## Read this before you ensure fourtune

`world` and `fourtune` **overlap on purpose and are not meant to run together yet.**
`world` is the Lua twin of `cities.js`, `places.js` and `spawns.js`. Both register
`/whereami`, `/places`, `/streets` and `/cities`, so enabling both registers those commands twice and the
second one silently loses.

Pick one per system first:

- **Going Lua?** Ensure `world`, leave `fourtune` out, and port the rest across as you go.
- **Going JS?** Ensure `fourtune`, leave `world` out.
- **Both eventually?** Strip the overlapping commands and data out of `fourtune` and have it
  call `exports.world:Describe(coords)` instead. That is the clean end state, and nothing
  points that way yet.

That decision is still open in `docs/NEXT-ON-PC.md`.

## Things to check on the first boot

- **`fourtune` lists its server modules in `files{}`.** That is the usual trick to make them
  readable, but `files{}` also sends them to every connecting client, which ships server logic
  to players. If `require()` still works with those entries removed, remove them.
- **`world` uses plain Lua** with nothing version-specific, so it should run with or without
  `lua54 'yes'`. If it throws on load, that is the first thing to try.
- **Nothing here has run inside FXServer.** Expect the first boot to find things.
