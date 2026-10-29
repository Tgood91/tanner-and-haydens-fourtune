-- Drop this folder into resources/ as "crew" and add `ensure crew` to server.cfg.
fx_version 'cerulean'
game 'gta5'

description 'Fourtune crews: membership, ranks and turf'

-- chat: every reply goes out through chat:addMessage.
--
-- `world` is no longer needed: turf moved to JavaScript on 29 Oct 2026
-- and crew/turf.lua was deleted, so nothing here asks for districts.
--
-- The economy is NOT a dependency on purpose: the founding fee goes
-- through an optional export, so this still loads and plays with no
-- economy running. It says so when it skips a charge.
dependencies {
    'chat',
}

server_scripts {
    'main.lua',
}
