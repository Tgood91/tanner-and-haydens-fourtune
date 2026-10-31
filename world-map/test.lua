-- ============================================================
-- world-map/test.lua — headless checks for the map client
--
-- Runs without FiveM: it stubs the natives client.lua uses, records
-- what the client asks for, then drives the command and NUI callbacks.
--
--   lua world-map/test.lua        (from the repo root)
-- ============================================================

local passed, failed = 0, 0

local function ok(cond, what)
    if cond then
        passed = passed + 1
    else
        failed = failed + 1
        print('  NOT OK: ' .. what)
    end
end

-- ---- the stubbed game ----------------------------------------------------
local commands, callbacks, handlers, threads = {}, {}, {}, {}
local sent, focus, feed = {}, { false, false }, {}
local game = { pause = false, waypoint = nil, ped = { x = 120.5, y = -1300.25, z = 30, heading = 90 } }

function RegisterCommand(name, fn) commands[name] = fn end
function RegisterKeyMapping() end
function RegisterNUICallback(name, fn) callbacks[name] = fn end
function AddEventHandler(name, fn) handlers[name] = fn end
function GetCurrentResourceName() return 'world-map' end
function SetNuiFocus(a, b) focus = { a, b } end
function SendNUIMessage(m) sent[#sent + 1] = m end
function IsPauseMenuActive() return game.pause end
function PlayerPedId() return 1 end
function GetEntityCoords() return { x = game.ped.x, y = game.ped.y, z = game.ped.z } end
function GetEntityHeading() return game.ped.heading end
function GetFirstBlipInfoId() return game.waypoint and 7 or 0 end
function DoesBlipExist(b) return b ~= 0 end
function GetBlipInfoIdCoord() return game.waypoint end
function SetNewWaypoint(x, y) game.waypoint = { x = x, y = y } end
function SetWaypointOff() game.waypoint = nil end
function BeginTextCommandThefeedPost() end
function AddTextComponentSubstringPlayerName(t) feed[#feed + 1] = t end
function EndTextCommandThefeedPostTicker() end
-- threads run as coroutines; Wait yields so the test can step them
function CreateThread(fn) threads[#threads + 1] = coroutine.create(fn) end
function Wait() coroutine.yield() end
local function stepThreads()
    for _, co in ipairs(threads) do
        if coroutine.status(co) ~= 'dead' then coroutine.resume(co) end
    end
end

local function last(kind)
    for i = #sent, 1, -1 do if sent[i].type == kind then return sent[i] end end
end
local function call(name, data)
    local reply
    callbacks[name](data, function(r) reply = r end)
    return reply
end

dofile('world-map/client.lua')

-- ---- before the page is ready: never take focus ---------------------------
commands.map()
ok(focus[1] == false, 'no focus before the page says ready')
ok(feed[#feed] and feed[#feed]:find('still loading'), 'tells the player the map is still loading')
ok(last('map:visibility') == nil, 'does not show the map before ready')

ok(call('ready').ok == true, 'ready callback answers ok')

-- ---- the pause menu blocks opening ----------------------------------------
game.pause = true
commands.map()
ok(focus[1] == false, 'no focus while the pause menu is up')
game.pause = false

-- ---- open: focus, position, waypoint, visible -----------------------------
commands.map()
ok(focus[1] == true and focus[2] == true, 'opening takes focus and cursor')
local p = last('map:player')
ok(p and p.payload.x == 120.5 and p.payload.y == -1300.25 and p.payload.heading == 90, 'sends your position and heading on open')
local w = last('map:waypoint')
ok(w and w.payload == false, 'sends "no waypoint" when none is set')
ok(last('map:visibility').payload.visible == true, 'shows the map')

-- position keeps updating while open
game.ped.x = 200
stepThreads(); stepThreads()
ok(last('map:player').payload.x == 200, 'keeps sending your position while the map is open')

-- ---- waypoints from the map -----------------------------------------------
ok(call('waypoint', { x = 262, y = -1240 }).ok == true, 'a clicked point sets the waypoint')
ok(game.waypoint and game.waypoint.x == 262 and game.waypoint.y == -1240, 'SetNewWaypoint got the clicked game position')
ok(call('waypoint', { x = 'abc', y = 5 }).ok == false, 'refuses a non-number')
ok(call('waypoint', { x = 0/0, y = 5 }).ok == false, 'refuses NaN')
ok(call('waypoint', { x = 1e9, y = 5 }).ok == false, 'refuses a point far off the map')
ok(call('waypoint', nil).ok == false, 'refuses an empty request')
ok(game.waypoint.x == 262, 'a refused request leaves the waypoint alone')
ok(call('clearWaypoint').ok == true and game.waypoint == nil, 'right-click clears the waypoint')

-- ---- close: focus released, updates stop -----------------------------------
ok(call('close').ok == true, 'close callback answers ok')
ok(focus[1] == false and focus[2] == false, 'closing releases focus')
ok(last('map:visibility').payload.visible == false, 'hides the map')
local before = #sent
stepThreads(); stepThreads()
ok(#sent == before, 'stops sending your position once closed')

-- reopening shows an existing waypoint
game.waypoint = { x = 10, y = 20 }
commands.map()
w = last('map:waypoint')
ok(w and w.payload.x == 10 and w.payload.y == 20, 'reopening shows the current waypoint')

-- ---- resource stop while open releases focus --------------------------------
handlers.onResourceStop('world-map')
ok(focus[1] == false, 'resource stop while open releases focus')

print(string.format('# pass %d\n# fail %d', passed, failed))
if failed > 0 then os.exit(1) end
