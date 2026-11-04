--!strict
-- ============================================================
-- Config — every number you might want to tune, in one place.
-- Shared: the client reads it too, so NOTHING secret goes here.
-- ============================================================

local Config = {
	-- Placeholder name. Change it here and nowhere else.
	GAME_NAME = "Fourtune Town",

	-- Saving. Bump DATASTORE_NAME (e.g. "_v2") only if you ever want a
	-- full wipe — every player starts fresh under a new name.
	DATASTORE_NAME = "PlayerData_v1",
	DATA_VERSION = 1,
	AUTOSAVE_SECONDS = 120,
	-- A server that crashed holds a player's lock until this runs out (seconds).
	SESSION_LOCK_EXPIRY = 30 * 60,
	LOAD_RETRIES = 5,
	SAVE_RETRIES = 3,

	-- Money — same starting values as js-snippets/character.js
	START_CASH = 500,
	START_BANK = 5000,
	START_GOLD = 0, -- gold is earned, never handed out at the start
	MAX_AMOUNT = 1000000000, -- biggest single amount any action accepts

	-- Inventory — same limit as js-snippets/inventory.js
	MAX_WEIGHT = 30.0, -- kg
	MAX_STACK_ACTION = 1000, -- biggest count a single add/remove/drop accepts

	-- Anti-spam for client requests (token bucket per player):
	-- a burst of RATE_CAPACITY requests, then RATE_REFILL per second.
	RATE_CAPACITY = 10,
	RATE_REFILL = 4,
	PAY_COOLDOWN = 3, -- seconds between /pay-style transfers

	-- Run the logic checks in Server output when you press Play in Studio.
	RUN_TESTS_IN_STUDIO = true,
}

return table.freeze(Config)
