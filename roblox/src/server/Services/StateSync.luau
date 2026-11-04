-- ============================================================
-- StateSync — after ANY change to a player's data, call Push(player).
-- It sends the client a fresh copy and updates the leaderboard.
-- The client only ever displays this; it never sends it back.
-- ============================================================

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared.Config)
local Inventory = require(Shared.Inventory)
local DataService = require(script.Parent.DataService)
local Network = require(script.Parent.Network)

local StateSync = {}

function StateSync.Build(data)
	return {
		cash = data.cash,
		bank = data.bank,
		gold = data.gold,
		items = Inventory.list(data.inventory),
		weight = Inventory.getWeight(data.inventory),
		maxWeight = Config.MAX_WEIGHT,
	}
end

-- The "Cash" column on the player list.
function StateSync.CreateLeaderstats(player: Player)
	local stats = Instance.new("Folder")
	stats.Name = "leaderstats"
	local cash = Instance.new("IntValue")
	cash.Name = "Cash"
	cash.Parent = stats
	stats.Parent = player
end

function StateSync.Push(player: Player)
	local data = DataService.Get(player)
	if not data then
		return
	end
	local stats = player:FindFirstChild("leaderstats")
	local cash = stats and stats:FindFirstChild("Cash")
	if cash then
		cash.Value = data.cash
	end
	Network.PushState(player, StateSync.Build(data))
end

return StateSync
