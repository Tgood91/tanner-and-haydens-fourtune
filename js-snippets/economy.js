// ============================================================
// economy.js — cash and bank, server-authoritative
// Same recipe as inventory: check first, then move, then report.
// Amounts are always whole dollars above 0, so a modded client
// can't send -5000 to "pay" itself.
//
// GOLD is a separate balance, earned only by playing (on-duty
// paychecks, EMS revives, console grants for events). It can't be
// bought, deposited, withdrawn or sent to another player:
//   - FiveM's license bans selling in-game currency for real money
//   - not tradeable = nobody can sell gold to each other off-server
// That's why gold isn't in ACCOUNTS — /pay, /deposit, givemoney and
// shop "cash|bank" choices can never touch it.
// ============================================================

const ACCOUNTS = ["cash", "bank"];

function isAmount(amount) {
    return Number.isInteger(amount) && amount > 0;
}

function money(amount) {
    return "$" + amount.toLocaleString("en-US");
}

function balance(c) {
    return `Cash: ${money(c.cash)} | Bank: ${money(c.bank)} | Gold: ${c.gold}`;
}

function addGold(c, amount) {
    if (!isAmount(amount)) return { ok: false, msg: "Gold must be a whole number above 0" };
    c.gold += amount;
    return { ok: true, msg: `+${amount} gold (now ${c.gold})` };
}

function removeGold(c, amount) {
    if (!isAmount(amount)) return { ok: false, msg: "Gold must be a whole number above 0" };
    if (c.gold < amount) return { ok: false, msg: `Not enough gold — need ${amount}, have ${c.gold}` };
    c.gold -= amount;
    return { ok: true, msg: `-${amount} gold` };
}

function addMoney(c, account, amount) {
    if (!ACCOUNTS.includes(account)) return { ok: false, msg: `No account called ${account}` };
    if (!isAmount(amount)) return { ok: false, msg: "Amount must be a whole number above 0" };

    c[account] += amount;
    return { ok: true, msg: `+${money(amount)} ${account}` };
}

function removeMoney(c, account, amount) {
    if (!ACCOUNTS.includes(account)) return { ok: false, msg: `No account called ${account}` };
    if (!isAmount(amount)) return { ok: false, msg: "Amount must be a whole number above 0" };
    if (c[account] < amount) return { ok: false, msg: `Not enough ${account} — need ${money(amount)}, have ${money(c[account])}` };

    c[account] -= amount;
    return { ok: true, msg: `-${money(amount)} ${account}` };
}

function deposit(c, amount) {
    const taken = removeMoney(c, "cash", amount);
    if (!taken.ok) return taken;
    c.bank += amount;
    return { ok: true, msg: `Deposited ${money(amount)}. ${balance(c)}` };
}

function withdraw(c, amount) {
    const taken = removeMoney(c, "bank", amount);
    if (!taken.ok) return taken;
    c.cash += amount;
    return { ok: true, msg: `Withdrew ${money(amount)}. ${balance(c)}` };
}

// Bank to bank, player to player.
function transfer(from, to, amount) {
    if (!to) return { ok: false, msg: "No player with that id" };
    if (from === to) return { ok: false, msg: "You can't pay yourself" };

    const taken = removeMoney(from, "bank", amount);
    if (!taken.ok) return taken;
    to.bank += amount;
    return { ok: true, msg: `Sent ${money(amount)} to ${to.name}. Bank: ${money(from.bank)}` };
}

module.exports = { ACCOUNTS, isAmount, money, balance, addMoney, removeMoney, addGold, removeGold, deposit, withdraw, transfer };
