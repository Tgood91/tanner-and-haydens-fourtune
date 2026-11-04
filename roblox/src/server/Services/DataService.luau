-- ============================================================
-- DataService — loads and saves each player's data.
--
-- What makes it safe:
--   - SESSION LOCK: while a server holds a player's data it writes its
--     JobId into the save. Another server that sees a fresh lock waits
--     instead of loading old data, so fast server-hopping can't
--     duplicate money or items. A crashed server's lock runs out after
--     Config.SESSION_LOCK_EXPIRY.
--   - Every write goes through UpdateAsync and checks the lock is still
--     ours, so a stale server can never overwrite newer data.
--   - Retries with backoff and waits for DataStore request budget.
--   - Autosave every Config.AUTOSAVE_SECONDS, save on leave, and save
--     everyone on shutdown (BindToClose).
--   - Loaded data is sanitized: bad numbers reset, unknown items dropped.
--
-- Stored shape, one key per player ("player_<UserId>"):
--   { data = { version, cash, bank, gold, inventory, createdAt },
--     lock = { jobId, time } | nil }
--
-- In Studio without "Enable Studio Access to API Services" turned on,
-- it falls back to an in-memory store and warns: nothing persists.
-- ============================================================

local DataStoreService = game:GetService("DataStoreService")
local HttpService = game:GetService("HttpService")
local RunService = game:GetService("RunService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared.Config)
local Inventory = require(Shared.Inventory)
local Logger = require(script.Parent.Parent.Lib.Logger)

local log = Logger.new("Data")

local DataService = {}

-- [Player] = profile
local profiles = {}

-- Studio play sessions have an empty JobId; give them a unique one.
local JOB_ID = if game.JobId ~= "" then game.JobId else "studio-" .. HttpService:GenerateGUID(false)

-- ------------------------------------------------------------
-- Helpers
-- ------------------------------------------------------------

local function deepCopy(value)
	if type(value) ~= "table" then
		return value
	end
	local out = {}
	for k, v in value do
		out[k] = deepCopy(v)
	end
	return out
end

local function keyFor(userId: number): string
	return "player_" .. tostring(userId)
end

-- A whole number >= 0, or the fallback.
local function wholeOr(value: any, fallback: number): number
	if type(value) == "number" and value == value and value >= 0 and value < math.huge then
		return math.floor(value)
	end
	return fallback
end

-- Turns whatever was stored (or nil for a brand-new player) into
-- clean data. Inventory.load handles "never saved" vs "emptied".
local function sanitize(raw: any)
	if type(raw) ~= "table" then
		raw = {}
	end
	return {
		version = Config.DATA_VERSION,
		cash = wholeOr(raw.cash, Config.START_CASH),
		bank = wholeOr(raw.bank, Config.START_BANK),
		gold = wholeOr(raw.gold, Config.START_GOLD),
		inventory = Inventory.load(raw.inventory),
		createdAt = wholeOr(raw.createdAt, os.time()),
	}
end

-- Exposed for the tests only.
DataService._sanitize = sanitize

-- ------------------------------------------------------------
-- The store (real, or an in-memory stand-in for Studio)
-- ------------------------------------------------------------

local MockStore = {}
MockStore.__index = MockStore

function MockStore.new()
	return setmetatable({ data = {}, isMock = true }, MockStore)
end

function MockStore:UpdateAsync(key: string, transform)
	local new = transform(deepCopy(self.data[key]))
	if new ~= nil then
		self.data[key] = deepCopy(new)
	end
	return new
end

local store = nil

local function getStore()
	if store then
		return store
	end
	local ok, res = pcall(function()
		local s = DataStoreService:GetDataStore(Config.DATASTORE_NAME)
		if RunService:IsStudio() then
			-- Fails right away if Studio has no API access.
			s:GetAsync("__probe")
		end
		return s
	end)
	if ok then
		store = res
	elseif RunService:IsStudio() then
		log:warn("DataStores unavailable in Studio (%s). Using an in-memory store: NOTHING WILL SAVE.", tostring(res))
		log:warn("Turn on Game Settings > Security > Enable Studio Access to API Services to test real saving.")
		store = MockStore.new()
	else
		error("GetDataStore failed: " .. tostring(res))
	end
	return store
end

local function waitForBudget(s)
	if s.isMock then
		return
	end
	local started = os.clock()
	while
		DataStoreService:GetRequestBudgetForRequestType(Enum.DataStoreRequestType.UpdateAsync) < 1
		and os.clock() - started < 10
	do
		task.wait(0.5)
	end
end

-- ------------------------------------------------------------
-- Load: take the lock, read the data
-- ------------------------------------------------------------

-- Returns data, or nil + "locked" | "error" | "left"
local function loadData(player: Player)
	local key = keyFor(player.UserId)
	local lockedBy = nil

	for attempt = 1, Config.LOAD_RETRIES do
		local loaded = nil
		lockedBy = nil

		local ok, err = pcall(function()
			local s = getStore()
			waitForBudget(s)
			s:UpdateAsync(key, function(stored)
				-- UpdateAsync may call this more than once; reset every time.
				loaded = nil
				lockedBy = nil
				stored = if type(stored) == "table" then stored else {}

				local lock = stored.lock
				if
					type(lock) == "table"
					and lock.jobId ~= JOB_ID
					and os.time() - (tonumber(lock.time) or 0) < Config.SESSION_LOCK_EXPIRY
				then
					lockedBy = lock.jobId
					return nil -- cancel: another server still has this player
				end

				loaded = sanitize(stored.data)
				return { data = loaded, lock = { jobId = JOB_ID, time = os.time() } }
			end)
		end)

		if ok and loaded then
			return loaded
		end
		if not ok then
			log:warn("Load %s failed (attempt %d/%d): %s", key, attempt, Config.LOAD_RETRIES, tostring(err))
		elseif lockedBy then
			log:info("Load %s: locked by another server, waiting (attempt %d/%d)", key, attempt, Config.LOAD_RETRIES)
		end

		if player.Parent == nil then
			return nil, "left"
		end
		if attempt < Config.LOAD_RETRIES then
			task.wait(math.min(2 ^ attempt, 16))
		end
	end

	return nil, if lockedBy then "locked" else "error"
end

-- ------------------------------------------------------------
-- Save: only if the lock is still ours. release = drop the lock.
-- ------------------------------------------------------------

local function saveProfile(profile, release: boolean): boolean
	-- Snapshot BEFORE yielding, so the save is one consistent moment.
	local snapshot = deepCopy(profile.data)
	local stolen = false

	for attempt = 1, Config.SAVE_RETRIES do
		stolen = false
		local ok, err = pcall(function()
			local s = getStore()
			waitForBudget(s)
			s:UpdateAsync(profile.key, function(stored)
				stolen = false
				if type(stored) == "table" and type(stored.lock) == "table" and stored.lock.jobId ~= JOB_ID then
					stolen = true
					return nil -- another server owns this player now; never overwrite it
				end
				return {
					data = snapshot,
					lock = if release then nil else { jobId = JOB_ID, time = os.time() },
				}
			end)
		end)

		if ok then
			if stolen then
				profile.stolen = true
				log:error("Save %s refused: session lock was taken by another server", profile.key)
				return false
			end
			return true
		end
		log:warn("Save %s failed (attempt %d/%d): %s", profile.key, attempt, Config.SAVE_RETRIES, tostring(err))
		if attempt < Config.SAVE_RETRIES then
			task.wait(math.min(2 ^ attempt, 8))
		end
	end

	log:error("Save %s gave up after %d attempts", profile.key, Config.SAVE_RETRIES)
	return false
end

-- One save at a time per profile.
local function runSave(profile, release: boolean): boolean
	while profile.saving do
		task.wait()
	end
	profile.saving = true
	local ok = saveProfile(profile, release)
	profile.saving = false
	return ok
end

local function releaseProfile(profile)
	if profile.releasing then
		-- Someone else is already releasing it (leave + shutdown together): wait for them.
		while not profile.released do
			task.wait()
		end
		return
	end
	profile.releasing = true
	local ok = runSave(profile, true)
	profile.released = true
	profiles[profile.player] = nil
	log:info("Released %s (%s)", profile.key, if ok then "saved" else "NOT saved")
end

-- ------------------------------------------------------------
-- Public
-- ------------------------------------------------------------

-- Yields. Returns the profile, or nil + reason ("locked" | "error" | "left").
function DataService.Load(player: Player)
	-- Rejoined THIS server before their last session finished saving?
	-- Our own lock wouldn't stop us, so wait for that save first.
	local key = keyFor(player.UserId)
	for _, other in profiles do
		if other.key == key and other.player ~= player then
			while not other.released do
				task.wait()
			end
		end
	end

	local data, reason = loadData(player)
	if not data then
		return nil, reason
	end

	local profile = {
		player = player,
		key = keyFor(player.UserId),
		data = data,
		saving = false,
		releasing = false,
		released = false,
		stolen = false,
	}
	profiles[player] = profile

	-- They left while we were loading: give the lock straight back.
	if player.Parent == nil then
		task.spawn(releaseProfile, profile)
		return nil, "left"
	end

	log:info("Loaded %s (%s)", player.Name, profile.key)
	return profile
end

-- The live data table, or nil while loading / leaving.
-- Change it, then call StateSync.Push so the player sees it.
function DataService.Get(player: Player)
	local profile = profiles[player]
	if not profile or profile.releasing then
		return nil
	end
	return profile.data
end

function DataService.Save(player: Player): boolean
	local profile = profiles[player]
	if not profile or profile.releasing then
		return false
	end
	return runSave(profile, false)
end

-- Call on PlayerRemoving. Saves and drops the lock. Yields.
function DataService.Release(player: Player)
	local profile = profiles[player]
	if profile then
		releaseProfile(profile)
	end
end

function DataService.Start()
	-- Autosave
	task.spawn(function()
		while true do
			task.wait(Config.AUTOSAVE_SECONDS)
			for player, profile in profiles do
				if not profile.releasing and not profile.saving then
					task.spawn(function()
						runSave(profile, false)
						if profile.stolen and player.Parent then
							player:Kick("Your data was opened on another server. Please rejoin.")
						end
					end)
				end
			end
		end
	end)

	-- Shutdown: save everyone, in parallel. Roblox allows ~30 seconds.
	game:BindToClose(function()
		local pending = 0
		for _, profile in profiles do
			pending += 1
			task.spawn(function()
				releaseProfile(profile)
				pending -= 1
			end)
		end
		local started = os.clock()
		while pending > 0 and os.clock() - started < 25 do
			task.wait()
		end
		if pending > 0 then
			log:error("Shutdown: %d profile(s) did not finish saving", pending)
		end
	end)
end

return DataService
