-- ============================================================
-- Tests — logic checks that run in the Server output every time you
-- press Play in Studio (Config.RUN_TESTS_IN_STUDIO). They drive the
-- real modules, no mocks, same idea as js-snippets/game.test.js.
--
-- Output ends with e.g. "[Tests] 48/48 passed". Any failure is
-- printed with its name.
-- ============================================================

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared.Config)
local Items = require(Shared.Items)
local Economy = require(Shared.Economy)
local Inventory = require(Shared.Inventory)
local RateLimiter = require(script.Parent.Lib.RateLimiter)
local DataService = require(script.Parent.Services.DataService)

local Tests = {}

function Tests.run()
	local passed, failed = 0, 0

	local function check(name: string, condition: any)
		if condition then
			passed += 1
		else
			failed += 1
			warn("[Tests] FAIL: " .. name)
		end
	end

	local function person(cash, bank, gold)
		return { cash = cash, bank = bank, gold = gold or 0 }
	end

	-- ---------------- Economy ----------------
	check("money formats commas", Economy.money(1234567) == "$1,234,567")
	check("money formats small", Economy.money(500) == "$500")
	check("money formats 3 digits", Economy.money(100) == "$100")
	check("money formats 0", Economy.money(0) == "$0")

	check("isAmount accepts 1", Economy.isAmount(1))
	check("isAmount refuses 0", not Economy.isAmount(0))
	check("isAmount refuses negative", not Economy.isAmount(-5000))
	check("isAmount refuses fraction", not Economy.isAmount(1.5))
	check("isAmount refuses NaN", not Economy.isAmount(0 / 0))
	check("isAmount refuses infinity", not Economy.isAmount(math.huge))
	check("isAmount refuses string", not Economy.isAmount("100"))
	check("isAmount refuses over max", not Economy.isAmount(Config.MAX_AMOUNT + 1))

	do
		local c = person(500, 5000)
		local r = Economy.deposit(c, 200)
		check("deposit ok", r.ok and c.cash == 300 and c.bank == 5200)
		r = Economy.deposit(c, 301)
		check("deposit refuses more than cash, unchanged", not r.ok and c.cash == 300 and c.bank == 5200)
		r = Economy.withdraw(c, 5200)
		check("withdraw whole bank", r.ok and c.bank == 0 and c.cash == 5500)
		r = Economy.withdraw(c, -100)
		check("withdraw negative refused", not r.ok and c.cash == 5500)
	end

	do
		local a, b = person(0, 1000), person(0, 0)
		local r = Economy.transfer(a, b, 250, "B")
		check("transfer ok", r.ok and a.bank == 750 and b.bank == 250)
		check("transfer to self refused", not Economy.transfer(a, a, 10).ok and a.bank == 750)
		check("transfer to nobody refused", not Economy.transfer(a, nil, 10).ok)
		check("transfer over balance refused", not Economy.transfer(a, b, 751).ok and a.bank == 750)
	end

	do
		local c = person(0, 0, 0)
		check("addMoney bad account refused", not Economy.addMoney(c, "gold", 5).ok and c.gold == 0)
		check("addGold ok", Economy.addGold(c, 3).ok and c.gold == 3)
		check("removeGold over refused", not Economy.removeGold(c, 4).ok and c.gold == 3)
	end

	-- ---------------- Inventory ----------------
	do
		local inv = Inventory.load(nil)
		check("starter kit on first load", inv.water == 2 and inv.sandwich == 1 and inv.phone == 1)
		check("starter kit is a copy", Items.STARTER.water == 2 and inv ~= Items.STARTER)
		check("starter weight", Inventory.getWeight(inv) == 1.5)

		local empty = Inventory.load({})
		check("emptied inventory stays empty", next(empty) == nil)

		local cleaned = Inventory.load({ water = 3, ghostitem = 5, medkit = -2, coffee = 0 / 0, donut = 2.7 })
		check("load drops unknown/bad items", cleaned.water == 3 and cleaned.ghostitem == nil and cleaned.medkit == nil and cleaned.coffee == nil)
		check("load floors fractional counts", cleaned.donut == 2)
		check("load of non-table is empty", next(Inventory.load("junk")) == nil)
	end

	do
		-- Exactly the limit is allowed; anything over is refused.
		local inv = {}
		check("add 7 toolboxes (28kg)", Inventory.add(inv, "toolbox", 7).ok)
		check("add 4 water (to exactly 30kg)", Inventory.add(inv, "water", 4).ok)
		check("weight is exactly 30", Inventory.getWeight(inv) == Config.MAX_WEIGHT)
		local r = Inventory.add(inv, "bandage", 1)
		check("30.1kg refused", not r.ok and inv.bandage == nil)
	end

	do
		-- Float noise: 0.1 * 3 must not read as 0.30000000000000004
		local inv = {}
		Inventory.add(inv, "bandage", 3)
		check("weight rounding", Inventory.getWeight(inv) == 0.3)
	end

	do
		local inv = { water = 1 }
		check("add unknown refused", not Inventory.add(inv, "rocketlauncher", 1).ok)
		check("add zero refused", not Inventory.add(inv, "water", 0).ok)
		check("add fraction refused", not Inventory.add(inv, "water", 0.5).ok)
		check("add string count refused", not Inventory.add(inv, "water", "1").ok)
		check("add huge count refused", not Inventory.add(inv, "water", math.huge).ok)
		check("add non-string item refused", not Inventory.add(inv, 42, 1).ok)
		check("nothing changed", inv.water == 1)

		check("remove more than held refused", not Inventory.remove(inv, "water", 2).ok and inv.water == 1)
		check("remove last clears key", Inventory.remove(inv, "water", 1).ok and inv.water == nil)
	end

	do
		local inv = { bandage = 2, phone = 1, water = 1 }
		local full = { health = 100, maxHealth = 100 }
		local hurt = { health = 40, maxHealth = 100 }

		local r = Inventory.use(inv, "bandage", full)
		check("bandage at full health refused AND kept", not r.ok and inv.bandage == 2)
		r = Inventory.use(inv, "bandage", hurt)
		check("bandage when hurt consumes exactly 1", r.ok and inv.bandage == 1 and r.def.heal == 15)
		check("phone not usable, kept", not Inventory.use(inv, "phone", hurt).ok and inv.phone == 1)
		check("use unheld refused", not Inventory.use(inv, "medkit", hurt).ok)
		check("water usable at full health", Inventory.use(inv, "water", full).ok and inv.water == nil)
	end

	do
		local inv = { sandwich = 2 }
		check("drop ok", Inventory.drop(inv, "sandwich", 2).ok and inv.sandwich == nil)
		check("drop unheld refused", not Inventory.drop(inv, "sandwich", 1).ok)
	end

	do
		local rows = Inventory.list({ water = 2, phone = 1, ghost = 9 })
		check("list sorted and skips unknown", #rows == 2 and rows[1].label == "Phone" and rows[2].label == "Water")
	end

	-- ---------------- Data sanitizing ----------------
	do
		local sanitize = DataService._sanitize
		local fresh = sanitize(nil)
		check("new player gets start money", fresh.cash == Config.START_CASH and fresh.bank == Config.START_BANK and fresh.gold == 0)
		check("new player gets starter kit", fresh.inventory.water == 2)

		local bad = sanitize({ cash = -50, bank = 0 / 0, gold = "lots", inventory = {} })
		check("bad numbers reset", bad.cash == Config.START_CASH and bad.bank == Config.START_BANK and bad.gold == 0)
		check("saved empty inventory stays empty", next(bad.inventory) == nil)

		local kept = sanitize({ cash = 12, bank = 34, gold = 5, inventory = { medkit = 1 } })
		check("good data kept", kept.cash == 12 and kept.bank == 34 and kept.gold == 5 and kept.inventory.medkit == 1)
	end

	-- ---------------- Rate limiter ----------------
	do
		local now = 0
		local limiter = RateLimiter.new(3, 1, function()
			return now
		end)
		check("burst 1", limiter:allow("p"))
		check("burst 2", limiter:allow("p"))
		check("burst 3", limiter:allow("p"))
		check("4th refused", not limiter:allow("p"))
		check("other key unaffected", limiter:allow("q"))
		now = 1
		check("refilled 1 after 1s", limiter:allow("p"))
		check("then refused again", not limiter:allow("p"))
		now = 100
		limiter:allow("p")
		limiter:allow("p")
		limiter:allow("p")
		check("refill caps at capacity", not limiter:allow("p"))
	end

	local total = passed + failed
	if failed == 0 then
		print(string.format("[Tests] %d/%d passed", passed, total))
	else
		warn(string.format("[Tests] %d/%d passed, %d FAILED", passed, total, failed))
	end
	return passed, failed
end

return Tests
