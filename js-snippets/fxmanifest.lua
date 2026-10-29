-- fxmanifest.lua — drop the js-snippets folder into resources/ as "fourtune"
-- and add `ensure fourtune` to server.cfg (OneSync must be on).
fx_version 'cerulean'
game 'gta5'

description 'Fourtune game core (JavaScript)'

-- chat:         every command reply goes out through chat:addMessage
-- spawnmanager: the client turns auto-spawn off and only spawns on the
--               server's word, so revive and jail can decide where you land
--
-- NOT a dependency on `world`: that resource is the Lua twin of cities.js,
-- places.js and spawns.js, and this one still uses its own. Pick one per
-- system before enabling both, or every command registers twice.
dependencies {
    'chat',
    'spawnmanager',
}

server_script 'fivem-server.js'
client_script 'fivem-client.js'

-- Required by fivem-server.js at runtime
files {
    'game.js', 'inventory.js', 'vehicles.js', 'economy.js', 'jobs.js',
    'needs.js', 'cities.js', 'shops.js', 'pickups.js', 'trunks.js', 'character.js', 'medical.js', 'ammo.js', 'police.js', 'spawns.js', 'fuel.js', 'licenses.js', 'taxi.js', 'robbery.js', 'phone.js', 'gangs.js', 'places.js', 'turf.js', 'environment.js',
}
