-- Map client: /map or the M key toggles the NUI world map. All of the drawing
-- lives in html/index.html (SVG, no image files; built by tools/gen-world-map-nui.py).
-- This side owns focus and visibility, feeds the map your position and the GPS
-- waypoint, and sets or clears the waypoint when you click the map.
local open = false
local ready = false   -- set when the page says it has loaded; until then never take focus

local function notify(text)
  BeginTextCommandThefeedPost('STRING')
  AddTextComponentSubstringPlayerName(text)
  EndTextCommandThefeedPostTicker(false, false)
end

local function sendPlayer()
  local ped = PlayerPedId()
  local pos = GetEntityCoords(ped)
  SendNUIMessage({ type = 'map:player', payload = { x = pos.x, y = pos.y, heading = GetEntityHeading(ped) } })
end

local function sendWaypoint()
  local blip = GetFirstBlipInfoId(8)   -- 8: the player's waypoint
  if DoesBlipExist(blip) then
    local pos = GetBlipInfoIdCoord(blip)
    SendNUIMessage({ type = 'map:waypoint', payload = { x = pos.x, y = pos.y } })
  else
    SendNUIMessage({ type = 'map:waypoint', payload = false })
  end
end

local function setOpen(state)
  if state then
    -- A page that never loaded can't send 'close', and chat is blocked while it has
    -- focus, so opening it then would leave the player stuck with a cursor.
    if not ready then return notify('The map is still loading. Try again in a moment.') end
    if IsPauseMenuActive() then return end
  end
  open = state
  SetNuiFocus(state, state)
  if state then
    sendPlayer()
    sendWaypoint()
    -- Keep "you are here" moving while the map is up (it's open while you drive).
    CreateThread(function()
      while open do
        Wait(500)
        if open then sendPlayer() end
      end
    end)
  end
  SendNUIMessage({ type = 'map:visibility', payload = { visible = state } })
end

RegisterCommand('map', function() setOpen(not open) end, false)
RegisterKeyMapping('map', 'Open the world map', 'keyboard', 'M')

RegisterNUICallback('ready', function(_, cb)
  ready = true
  cb({ ok = true })
end)

RegisterNUICallback('close', function(_, cb)
  setOpen(false)
  cb({ ok = true })
end)

-- The page only sends a point on a city's drawn streets, but check it anyway:
-- whatever arrives here came from the browser side.
RegisterNUICallback('waypoint', function(data, cb)
  local x, y = tonumber(data and data.x), tonumber(data and data.y)
  if not x or not y or x ~= x or y ~= y or math.abs(x) > 10000 or math.abs(y) > 10000 then
    return cb({ ok = false })
  end
  SetNewWaypoint(x + 0.0, y + 0.0)
  cb({ ok = true })
end)

RegisterNUICallback('clearWaypoint', function(_, cb)
  SetWaypointOff()
  cb({ ok = true })
end)

-- Never leave NUI focus grabbed if this resource stops while the map is up.
AddEventHandler('onResourceStop', function(resource)
  if resource == GetCurrentResourceName() and open then SetNuiFocus(false, false) end
end)
