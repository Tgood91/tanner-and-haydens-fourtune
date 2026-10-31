-- Map client: /map or the M key toggles the NUI solid map. All of the
-- drawing lives in html/index.html (pure CSS, no image files); this side
-- only owns focus and visibility.
local open = false

local function setOpen(state)
  open = state
  SetNuiFocus(state, state)
  SendNUIMessage({ type = 'map:visibility', payload = { visible = state } })
end

RegisterCommand('map', function() setOpen(not open) end, false)
RegisterKeyMapping('map', 'Open the world map', 'keyboard', 'M')

RegisterNUICallback('close', function(_, cb)
  setOpen(false)
  cb({ ok = true })
end)

-- Never leave NUI focus grabbed if this resource stops while the map is up.
AddEventHandler('onResourceStop', function(resource)
  if resource == GetCurrentResourceName() and open then SetNuiFocus(false, false) end
end)
