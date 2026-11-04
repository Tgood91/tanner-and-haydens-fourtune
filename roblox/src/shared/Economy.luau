-- ============================================================
-- Economy — cash, bank and gold, ported from js-snippets/economy.js.
-- Pure logic: no Roblox calls. Same recipe as Inventory: check
-- first, then move, then report.
--
-- Amounts are always whole numbers above 0, so a modded client
-- can't send -5000 (or NaN, or a string) to "pay" itself.
--
-- GOLD is a separate balance, earned only by playing. It can't be
-- deposited, withdrawn or sent to another player, which is why it
-- isn't in ACCOUNTS.
--
-- `c` is a player's data table: { cash, bank, gold, ... }.
-- ============================================================

local Config = require(script.Parent.Config)

local Economy = {}

Economy.ACCOUNTS = table.freeze({ cash = true, bank = true })

local function result(ok: boolean, msg: string)
	return { ok = ok, msg = msg }
end

function Economy.isAmount(amount: any): boolean
	return type(amount) == "number"
		and amount == amount -- not NaN
		and amount > 0
		and amount <= Config.MAX_AMOUNT
		and math.floor(amount) == amount
end

-- 1234567 -> "$1,234,567"
function Economy.money(amount: number): string
	local digits = tostring(math.floor(math.abs(amount)))
	local withCommas = digits:reverse():gsub("(%d%d%d)", "%1,"):reverse()
	if withCommas:sub(1, 1) == "," then
		withCommas = withCommas:sub(2)
	end
	return (amount < 0 and "-$" or "$") .. withCommas
end

function Economy.balance(c): string
	return string.format("Cash: %s | Bank: %s | Gold: %d", Economy.money(c.cash), Economy.money(c.bank), c.gold)
end

function Economy.addMoney(c, account: any, amount: any)
	if not Economy.ACCOUNTS[account] then
		return result(false, "No account called " .. tostring(account))
	end
	if not Economy.isAmount(amount) then
		return result(false, "Amount must be a whole number above 0")
	end
	c[account] += amount
	return result(true, string.format("+%s %s", Economy.money(amount), account))
end

function Economy.removeMoney(c, account: any, amount: any)
	if not Economy.ACCOUNTS[account] then
		return result(false, "No account called " .. tostring(account))
	end
	if not Economy.isAmount(amount) then
		return result(false, "Amount must be a whole number above 0")
	end
	if c[account] < amount then
		return result(
			false,
			string.format("Not enough %s — need %s, have %s", account, Economy.money(amount), Economy.money(c[account]))
		)
	end
	c[account] -= amount
	return result(true, string.format("-%s %s", Economy.money(amount), account))
end

function Economy.addGold(c, amount: any)
	if not Economy.isAmount(amount) then
		return result(false, "Gold must be a whole number above 0")
	end
	c.gold += amount
	return result(true, string.format("+%d gold (now %d)", amount, c.gold))
end

function Economy.removeGold(c, amount: any)
	if not Economy.isAmount(amount) then
		return result(false, "Gold must be a whole number above 0")
	end
	if c.gold < amount then
		return result(false, string.format("Not enough gold — need %d, have %d", amount, c.gold))
	end
	c.gold -= amount
	return result(true, string.format("-%d gold", amount))
end

function Economy.deposit(c, amount: any)
	local taken = Economy.removeMoney(c, "cash", amount)
	if not taken.ok then
		return taken
	end
	c.bank += amount
	return result(true, string.format("Deposited %s. %s", Economy.money(amount), Economy.balance(c)))
end

function Economy.withdraw(c, amount: any)
	local taken = Economy.removeMoney(c, "bank", amount)
	if not taken.ok then
		return taken
	end
	c.cash += amount
	return result(true, string.format("Withdrew %s. %s", Economy.money(amount), Economy.balance(c)))
end

-- Bank to bank, player to player. toName is only used in the message.
function Economy.transfer(from, to, amount: any, toName: string?)
	if not to then
		return result(false, "No player with that id")
	end
	if from == to then
		return result(false, "You can't pay yourself")
	end
	local taken = Economy.removeMoney(from, "bank", amount)
	if not taken.ok then
		return taken
	end
	to.bank += amount
	return result(
		true,
		string.format("Sent %s to %s. Bank: %s", Economy.money(amount), toName or "them", Economy.money(from.bank))
	)
end

return table.freeze(Economy)
