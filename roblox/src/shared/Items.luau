--!strict
-- ============================================================
-- Items — the item list, ported from js-snippets/inventory.js.
--
-- usable:             can be used from the inventory
-- heal:               health restored on use (server applies it)
-- hunger / thirst:    kept for when needs are ported (not applied yet)
-- refuseAtFullHealth: using it at full health is refused and NOT consumed
--
-- Left out on purpose:
--   - weapons + ammo: no weapon system on Roblox yet
--   - the drug items: Roblox's Community Standards don't allow
--     illegal drug content, so they can't come across as-is
-- ============================================================

export type ItemDef = {
	label: string,
	weight: number,
	usable: boolean,
	heal: number?,
	hunger: number?,
	thirst: number?,
	refuseAtFullHealth: boolean?,
}

local ALL: { [string]: ItemDef } = {
	water = { label = "Water", weight = 0.5, usable = true, thirst = 40 },
	sandwich = { label = "Sandwich", weight = 0.3, usable = true, hunger = 40 },
	coffee = { label = "Coffee", weight = 0.3, usable = true, thirst = 20 },
	donut = { label = "Donut", weight = 0.2, usable = true, hunger = 20 },
	halfhalf = { label = "Half & Half", weight = 0.5, usable = true, thirst = 30 },
	bandage = { label = "Bandage", weight = 0.1, usable = true, heal = 15, refuseAtFullHealth = true },
	medkit = { label = "Medkit", weight = 1.0, usable = true, heal = 60, refuseAtFullHealth = true },
	phone = { label = "Phone", weight = 0.2, usable = false },
	radio = { label = "Radio", weight = 0.4, usable = false },
	repairkit = { label = "Repair Kit", weight = 2.5, usable = true },
	toolbox = { label = "Toolbox", weight = 4.0, usable = false },
	lockpick = { label = "Lockpick", weight = 0.1, usable = true },
	fuelcan = { label = "Fuel Can", weight = 5.0, usable = true },
}

for _, def in ALL do
	table.freeze(def)
end

local Items = {
	ALL = table.freeze(ALL),
	-- New characters only — an emptied inventory stays empty.
	STARTER = table.freeze({ water = 2, sandwich = 1, phone = 1 }),
}

return table.freeze(Items)
