-- ============================================================
-- Main — boots the server. The only Script in ServerScriptService;
-- everything else is a ModuleScript it requires.
--
-- Order matters: remotes exist before any player can call them, and
-- data saving is armed (autosave + shutdown) before anyone loads.
-- ============================================================

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local Config = require(ReplicatedStorage:WaitForChild("Shared").Config)
local Services = script.Parent.Services
local DataService = require(Services.DataService)
local Network = require(Services.Network)
local StateSync = require(Services.StateSync)
local PlayerActions = require(Services.PlayerActions)
local Admin = require(Services.Admin)
local Logger = require(script.Parent.Lib.Logger)

local log = Logger.new(Config.GAME_NAME)

if Config.RUN_TESTS_IN_STUDIO and RunService:IsStudio() then
	require(script.Parent.Tests).run()
end

Network.Init()
PlayerActions.Init()
Admin.Init()
DataService.Start()

local KICK_MESSAGES = {
	locked = "Your data is still saving from another server. Please rejoin in a minute.",
	error = "We couldn't load your data. Please rejoin.",
}

local function onPlayerAdded(player: Player)
	local profile, reason = DataService.Load(player)
	if not profile then
		if player.Parent and KICK_MESSAGES[reason] then
			player:Kick(KICK_MESSAGES[reason])
		end
		return
	end
	StateSync.CreateLeaderstats(player)
	StateSync.Push(player)
end

local function onPlayerRemoving(player: Player)
	Network.Forget(player)
	PlayerActions.Forget(player)
	DataService.Release(player)
end

Players.PlayerAdded:Connect(onPlayerAdded)
Players.PlayerRemoving:Connect(onPlayerRemoving)

-- Anyone who joined before this script finished starting.
for _, player in Players:GetPlayers() do
	task.spawn(onPlayerAdded, player)
end

log:info("Server ready")
