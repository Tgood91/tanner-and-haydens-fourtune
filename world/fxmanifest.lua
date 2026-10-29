-- Drop this folder into resources/ as "world" and add `ensure world` to server.cfg.
fx_version 'cerulean'
game 'gta5'

description 'Fourtune world layer: cities, districts, parks, roads and spawns'

-- data.lua must load first: it sets the FourtuneWorldData global main.lua reads.
server_scripts {
    'data.lua',
    'main.lua',
}
