-- ============================================================
-- PlayerActions — what a client is allowed to ask for.
--
--   getState                    -> current money + inventory
--   deposit(amount)             cash -> bank
--   withdraw(amount)            bank -> cash
--   pay(targetUserId, amount)   bank -> another player's bank
--   useItem(item)               consumes exactly 1, applies its effect
--   dropItem(item, count?)      removes it (nothing spawns in the world yet)
--
-- Economy / Inventory validate every argument, so a string, NaN or
-- negative number from a modded client is refused, never applied.
-- ============================================================

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared.Config)
local Economy = require(Shared.Economy)
local Inventory = require(Shared.Inventory)
local DataService = require(script.Parent.DataService)
local Network = require(script.Parent.Network)
local StateSync = require(script.Parent.StateSync)

local PlayerActions = {}

local NOT_READY = table.freeze({ ok = false, msg = "Your data is still loading" })

local lastPay: { [Player]: number } = {}

-- Runs fn(data) only if this player's data is loaded; pushes state on success.
local function withData(player: Player, fn: (any) -> any)
	local data = DataService.Get(player)
	if not data then
		return NOT_READY
	end
	local r = fn(data)
	if r.ok then
		StateSync.Push(player)
	end
	return r
end

function PlayerActions.Init()
	Network.Handle("getState", function(player)
		local data = DataService.Get(player)
		if not data then
			return NOT_READY
		end
		return { ok = true, msg = "", state = StateSync.Build(data) }
	end)

	Network.Handle("deposit", function(player, amount)
		return withData(player, function(data)
			return Economy.deposit(data, amount)
		end)
	end)

	Network.Handle("withdraw", function(player, amount)
		return withData(player, function(data)
			return Economy.withdraw(data, amount)
		end)
	end)

	Network.Handle("pay", function(player, targetUserId, amount)
		local now = os.clock()
		if lastPay[player] and now - lastPay[player] < Config.PAY_COOLDOWN then
			return { ok = false, msg = "Wait a moment before paying again" }
		end
		if type(targetUserId) ~= "number" then
			return { ok = false, msg = "No player with that id" }
		end
		local target = Players:GetPlayerByUserId(targetUserId)
		local targetData = target and DataService.Get(target)

		return withData(player, function(data)
			local r = Economy.transfer(data, targetData, amount, target and target.DisplayName)
			if r.ok then
				lastPay[player] = now
				StateSync.Push(target)
				Network.Notify(
					target,
					string.format("%s sent you %s", player.DisplayName, Economy.money(amount))
				)
			end
			return r
		end)
	end)

	Network.Handle("useItem", function(player, item)
		return withData(player, function(data)
			local character = player.Character
			local humanoid = character and character:FindFirstChildOfClass("Humanoid")
			if not humanoid or humanoid.Health <= 0 then
				return { ok = false, msg = "You can't do that right now" }
			end

			local r = Inventory.use(data.inventory, item, {
				health = humanoid.Health,
				maxHealth = humanoid.MaxHealth,
			})
			if r.ok and r.def.heal then
				humanoid.Health = math.min(humanoid.MaxHealth, humanoid.Health + r.def.heal)
			end
			-- Hunger / thirst arrive when needs.js is ported; for now food just consumes.
			r.def = nil -- don't send the item definition back to the client
			return r
		end)
	end)

	Network.Handle("dropItem", function(player, item, count)
		return withData(player, function(data)
			return Inventory.drop(data.inventory, item, if count == nil then 1 else count)
		end)
	end)
end

function PlayerActions.Forget(player: Player)
	lastPay[player] = nil
end

return PlayerActions
