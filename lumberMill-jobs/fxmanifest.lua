-- fxmanifest.lua — Hollow Creek Lumber Yard, in the world. Drop this folder into
-- resources/ as "lumberMill-jobs" and add `ensure lumberMill-jobs` to server.cfg,
-- after the game core (the js-snippets resource) that owns the rules.
fx_version 'cerulean'
game 'gta5'

description 'Lumber yard jobs: markers, press-E prompts and blips for /fell, /mill, /sellplanks'

client_scripts {
    'config.lua',   -- sets LUMBER (must load first)
    'client.lua',
}
