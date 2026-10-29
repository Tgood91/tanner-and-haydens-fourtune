-- Drop this folder into resources/ as "world" and add `ensure world` to server.cfg.
fx_version 'cerulean'
game 'gta5'

description 'Fourtune world layer: cities, districts, parks, roads and spawns'

-- chat: every reply goes out through chat:addMessage.
-- Nothing else: data.lua and main.lua are self-contained, and the
-- coordinates are generated rather than fetched.
dependencies {
    'chat',
}

-- data.lua must load first: it sets the FourtuneWorldData global main.lua reads.
server_scripts {
    'data.lua',
    'main.lua',
}
