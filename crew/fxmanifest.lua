-- Drop this folder into resources/ as "crew" and add `ensure crew` to server.cfg.
fx_version 'cerulean'
game 'gta5'

description 'Fourtune crews: membership, ranks and turf'

-- chat:  every reply goes out through chat:addMessage
-- world: turf claims districts, which world owns (Districts, DistrictAt)
--
-- The economy is NOT a dependency on purpose: founding fees and turf
-- payouts go through an optional export, so this resource still loads
-- and plays with no economy running. It says so when it skips a charge.
dependencies {
    'chat',
    'world',
}

-- main.lua first: turf.lua asks it who is in which crew.
server_scripts {
    'main.lua',
    'turf.lua',
}
