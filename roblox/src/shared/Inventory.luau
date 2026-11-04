-- ============================================================
-- Inventory — server-authoritative item rules, ported from
-- js-snippets/inventory.js. Pure logic: no Roblox calls, so the
-- tests can drive it directly.
--
-- Same rules as the GTA server:
--   - every add / remove / use / drop is checked HERE first
--   - clients only send requests; a modded client can't conjure items
--   - using consumes exactly 1, and only after every check passes
--   - new characters get the starter kit only if they've NEVER saved
--
-- Every acting function returns { ok = boolean, msg = string }.
-- An inventory is a plain table: { [itemId] = count }.
-- ============================================================

local Config = require(script.Parent.Config)
local Items = require(script.Parent.Items)

local DEFS = Items.ALL

local Inventory = {}

local function round2(x: number): number
	-- avoids 29.999999 float noise, same as the JS version
	return math.round(x * 100) / 100
end

local function result(ok: boolean, msg: string)
	return { ok = ok, msg = msg }
end

-- ------------------------------------------------------------
-- Reading — never changes anything
-- ------------------------------------------------------------

function Inventory.isItem(item: any): boolean
	return type(item) == "string" and DEFS[item] ~= nil
end

-- Whole number, above 0, not NaN / infinity, not absurdly large.
function Inventory.isValidCount(count: any): boolean
	return type(count) == "number"
		and count == count
		and count > 0
		and count <= Config.MAX_STACK_ACTION
		and math.floor(count) == count
end

function Inventory.getWeight(inv): number
	local total = 0
	for item, count in inv do
		local def = DEFS[item]
		if def then
			total += def.weight * count
		end
	end
	return round2(total)
end

function Inventory.count(inv, item: string): number
	return inv[item] or 0
end

-- A sorted list the client can draw. Holds no references to `inv`.
function Inventory.list(inv)
	local rows = {}
	for item, count in inv do
		local def = DEFS[item]
		if def and count > 0 then
			table.insert(rows, {
				id = item,
				label = def.label,
				count = count,
				weight = round2(def.weight * count),
				usable = def.usable,
			})
		end
	end
	table.sort(rows, function(a, b)
		return a.label < b.label
	end)
	return rows
end

-- ------------------------------------------------------------
-- Acting — every function checks first, then changes, then reports
-- ------------------------------------------------------------

-- Check-only: would this fit? maxWeight lets trunks/stashes reuse it later.
function Inventory.canAdd(inv, item: any, count: any, maxWeight: number?)
	local limit = maxWeight or Config.MAX_WEIGHT
	if not Inventory.isItem(item) then
		return result(false, "Unknown item: " .. tostring(item))
	end
	if not Inventory.isValidCount(count) then
		return result(false, "Count must be a whole number above 0")
	end
	local newWeight = round2(Inventory.getWeight(inv) + DEFS[item].weight * count)
	-- exactly the limit is allowed, anything over is refused
	if newWeight > limit then
		return result(false, string.format("Too heavy — that would be %.2f / %g kg", newWeight, limit))
	end
	return result(true, "")
end

function Inventory.add(inv, item: any, count: any, maxWeight: number?)
	local check = Inventory.canAdd(inv, item, count, maxWeight)
	if not check.ok then
		return check
	end
	inv[item] = (inv[item] or 0) + count
	return result(true, string.format("Received %dx %s", count, DEFS[item].label))
end

function Inventory.remove(inv, item: any, count: any)
	if not Inventory.isItem(item) then
		return result(false, "Unknown item: " .. tostring(item))
	end
	if not Inventory.isValidCount(count) then
		return result(false, "Count must be a whole number above 0")
	end
	local label = DEFS[item].label
	if (inv[item] or 0) < count then
		return result(false, string.format("You don't have %dx %s", count, label))
	end
	inv[item] -= count
	if inv[item] == 0 then
		inv[item] = nil
	end
	return result(true, string.format("Removed %dx %s", count, label))
end

-- who = { health = number, maxHealth = number } for the item checks.
-- On success the result also carries `def` so the server can apply
-- the effect (healing etc.).
function Inventory.use(inv, item: any, who)
	if not Inventory.isItem(item) then
		return result(false, "Unknown item: " .. tostring(item))
	end
	local def = DEFS[item]
	if (inv[item] or 0) < 1 then
		return result(false, "You don't have a " .. def.label)
	end
	if not def.usable then
		return result(false, def.label .. " can't be used")
	end
	-- Item-specific check BEFORE consuming: a bandage at full health is refused and kept
	if def.refuseAtFullHealth and who and who.health >= who.maxHealth then
		return result(false, "You're already at full health")
	end

	Inventory.remove(inv, item, 1) -- exactly 1
	local r = result(true, "Used a " .. def.label)
	r.def = def
	return r
end

-- Removed server-side first; anything shown on the ground is visual only.
function Inventory.drop(inv, item: any, count: any)
	local r = Inventory.remove(inv, item, count)
	if not r.ok then
		return r
	end
	return result(true, string.format("Dropped %dx %s", count, DEFS[item].label))
end

-- ------------------------------------------------------------
-- Loading. `saved` is what came back from the DataStore:
--   nil -> never saved -> starter kit
--   {}  -> emptied     -> stays empty
-- Unknown items and bad counts are dropped, so removing an item from
-- Items.luau later can't break anyone's save.
-- ------------------------------------------------------------
function Inventory.load(saved: any)
	local inv = {}
	if saved == nil then
		for item, count in Items.STARTER do
			inv[item] = count
		end
		return inv
	end
	if type(saved) ~= "table" then
		return inv
	end
	for item, count in saved do
		if Inventory.isItem(item) and type(count) == "number" and count == count and count >= 1 and count < math.huge then
			inv[item] = math.floor(count)
		end
	end
	return inv
end

return table.freeze(Inventory)
