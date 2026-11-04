-- ============================================================
-- Admin — grants, from the SERVER side only. Same rule as the GTA
-- server: there's no in-game admin command for a client to abuse.
--
-- It's a BindableFunction in ServerStorage, which clients can't see.
-- Use it from the Studio command bar while testing (switch the view to
-- "Server" first), or call it from your own server scripts:
--
--   local admin = game.ServerStorage.AdminCommand
--   admin:Invoke("giveitem",  12345678, "medkit", 2)
--   admin:Invoke("takeitem",  12345678, "medkit", 1)
--   admin:Invoke("givemoney", 12345678, "bank", 1000)
--   admin:Invoke("takemoney", 12345678, "cash", 50)
--   admin:Invoke("givegold",  12345678, 5)
--   admin:Invoke("inspect",   12345678)
--   admin:Invoke("save",      12345678)
--
-- The number is the player's UserId; they must be in this server.
-- ============================================================

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ServerStorage = game:GetService("ServerStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Economy = require(Shared.Economy)
local Inventory = require(Shared.Inventory)
local DataService = require(script.Parent.DataService)
local Network = require(script.Parent.Network)
local StateSync = require(script.Parent.StateSync)
local Logger = require(script.Parent.Parent.Lib.Logger)

local log = Logger.new("Admin")

local Admin = {}

local commands = {}

function commands.giveitem(player, data, item, count)
	return Inventory.add(data.inventory, item, count or 1)
end

function commands.takeitem(player, data, item, count)
	return Inventory.remove(data.inventory, item, count or 1)
end

function commands.givemoney(player, data, account, amount)
	return Economy.addMoney(data, account, amount)
end

function commands.takemoney(player, data, account, amount)
	return Economy.removeMoney(data, account, amount)
end

function commands.givegold(player, data, amount)
	return Economy.addGold(data, amount)
end

function commands.inspect(player, data)
	local lines = { Economy.balance(data) }
	for _, row in Inventory.list(data.inventory) do
		table.insert(lines, string.format("  %s x%d (%.2f kg)", row.label, row.count, row.weight))
	end
	table.insert(lines, string.format("  Weight: %.2f kg", Inventory.getWeight(data.inventory)))
	return { ok = true, msg = table.concat(lines, "\n"), readOnly = true }
end

function commands.save(player)
	local ok = DataService.Save(player)
	return { ok = ok, msg = if ok then "Saved" else "Save failed (see output)", readOnly = true }
end

local function run(name: any, userId: any, ...)
	local command = type(name) == "string" and commands[string.lower(name)]
	if not command then
		return { ok = false, msg = "Unknown command: " .. tostring(name) }
	end
	local player = type(userId) == "number" and Players:GetPlayerByUserId(userId)
	if not player then
		return { ok = false, msg = "No player with UserId " .. tostring(userId) .. " in this server" }
	end
	local data = DataService.Get(player)
	if not data then
		return { ok = false, msg = player.Name .. "'s data isn't loaded" }
	end

	local r = command(player, data, ...)
	if r.ok and not r.readOnly then
		StateSync.Push(player)
		Network.Notify(player, r.msg)
		log:info("%s on %s (%d): %s", string.lower(name), player.Name, userId, r.msg)
	end
	print(r.msg)
	return r
end

function Admin.Init()
	local fn = Instance.new("BindableFunction")
	fn.Name = "AdminCommand"
	fn.OnInvoke = run
	fn.Parent = ServerStorage
end

return Admin
