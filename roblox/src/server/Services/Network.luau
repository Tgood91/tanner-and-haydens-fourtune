-- ============================================================
-- Network — the ONLY door from clients into the server.
--
-- ReplicatedStorage.Remotes (made at runtime):
--   Request (RemoteFunction)  client -> server: Request:InvokeServer(action, ...)
--   State   (RemoteEvent)     server -> client: full money/inventory state
--   Notify  (RemoteEvent)     server -> client: a message to show
--
-- Every request is: a known action name, under the rate limit, and run
-- inside pcall, so one bad request can't break the server. Handlers
-- still validate their own arguments: never trust what a client sends.
-- ============================================================

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage:WaitForChild("Shared").Config)
local Logger = require(script.Parent.Parent.Lib.Logger)
local RateLimiter = require(script.Parent.Parent.Lib.RateLimiter)

local log = Logger.new("Net")

local Network = {}

local handlers: { [string]: (Player, ...any) -> any } = {}
local limiter = RateLimiter.new(Config.RATE_CAPACITY, Config.RATE_REFILL)
local stateEvent: RemoteEvent
local notifyEvent: RemoteEvent

local function reply(ok: boolean, msg: string)
	return { ok = ok, msg = msg }
end

function Network.Init()
	local folder = Instance.new("Folder")
	folder.Name = "Remotes"

	local request = Instance.new("RemoteFunction")
	request.Name = "Request"
	request.Parent = folder

	stateEvent = Instance.new("RemoteEvent")
	stateEvent.Name = "State"
	stateEvent.Parent = folder

	notifyEvent = Instance.new("RemoteEvent")
	notifyEvent.Name = "Notify"
	notifyEvent.Parent = folder

	request.OnServerInvoke = function(player: Player, action: any, ...)
		if type(action) ~= "string" or #action > 32 then
			return reply(false, "Bad request")
		end
		local handler = handlers[action]
		if not handler then
			return reply(false, "Unknown action")
		end
		if not limiter:allow(player.UserId) then
			return reply(false, "Slow down")
		end

		local ok, res = pcall(handler, player, ...)
		if not ok then
			log:error("%s by %s (%d) errored: %s", action, player.Name, player.UserId, tostring(res))
			return reply(false, "Something went wrong")
		end
		return res
	end

	-- Parent last, so clients never see a half-built folder.
	folder.Parent = ReplicatedStorage
end

-- handler(player, ...) -> { ok, msg, ... }
function Network.Handle(action: string, handler: (Player, ...any) -> any)
	assert(handlers[action] == nil, "Duplicate handler: " .. action)
	handlers[action] = handler
end

function Network.PushState(player: Player, state)
	stateEvent:FireClient(player, state)
end

function Network.Notify(player: Player, msg: string)
	notifyEvent:FireClient(player, msg)
end

function Network.Forget(player: Player)
	limiter:forget(player.UserId)
end

return Network
