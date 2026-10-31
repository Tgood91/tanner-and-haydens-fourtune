-- fxmanifest.lua — the in-game world map. Drop this folder into resources/
-- as "world-map" and add `ensure world-map` to server.cfg.
-- M or /map opens it; M or Esc closes it. Client-only, no dependencies.
fx_version 'cerulean'
game 'gta5'

description 'Fourtune world map (NUI): the whole island, 312 to 1017'

client_script 'client.lua'

ui_page 'html/index.html'
files { 'html/index.html' }
