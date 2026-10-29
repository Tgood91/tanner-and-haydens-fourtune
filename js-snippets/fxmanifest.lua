-- fxmanifest.lua — drop the js-snippets folder into resources/ as "fourtune"
-- and add `ensure fourtune` to server.cfg (OneSync must be on).
fx_version 'cerulean'
game 'gta5'

description 'Fourtune game core (JavaScript)'

server_script 'fivem-server.js'
client_script 'fivem-client.js'

-- Required by fivem-server.js at runtime
files {
    'game.js', 'inventory.js', 'vehicles.js', 'economy.js', 'jobs.js',
    'needs.js', 'cities.js', 'shops.js', 'pickups.js', 'trunks.js', 'character.js', 'medical.js', 'ammo.js', 'police.js', 'spawns.js', 'fuel.js', 'licenses.js',
}
