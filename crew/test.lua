-- ============================================================
-- crew/test.lua — headless checks for crews
--
-- Stubs the natives so the crew rules can be driven directly. No economy
-- is registered, which is half the point: this has to work without one.
--
-- Turf used to live here too. It moved to JavaScript on 29 Oct 2026.
--
--   lua crew/test.lua        (from the repo root)
-- ============================================================

local passed, failed = 0, 0
local function ok(cond, what)
    if cond then passed = passed + 1 else failed = failed + 1; print('  NOT OK: ' .. what) end
end
local function same(got, want, what)
    if got == want then passed = passed + 1
    else failed = failed + 1; print(string.format('  NOT OK: %s\n    got:  %s\n    want: %s', what, tostring(got), tostring(want))) end
end

-- ---------- the fake server ----------
local NOW = 0
local players = {}
local chat = {}

local REG, current = { crew = {} }, nil
_G.exports = setmetatable({}, {
    __call = function(_, name, fn) REG[current][name] = fn end,
    __index = function(_, res)
        if not REG[res] then return nil end -- no economy registered: that path must still work
        return setmetatable({}, { __index = function(_, fname)
            return function(_self, ...) return REG[res][fname](...) end
        end })
    end,
})

_G.CreateThread = function() end
_G.Wait = function() end
_G.AddEventHandler = function() end
_G.RegisterCommand = function() end
_G.GetGameTimer = function() return NOW end
_G.GetPlayers = function()
    local out = {}
    for src in pairs(players) do out[#out + 1] = tostring(src) end
    table.sort(out)
    return out
end
_G.GetPlayerPed = function(src) return src end
_G.GetEntityCoords = function(ped) return players[ped].pos end
_G.GetPlayerName = function(src) return players[src] and players[src].name or nil end
_G.GetNumPlayerIdentifiers = function() return 1 end
_G.GetPlayerIdentifier = function(src) return players[src] and players[src].license or nil end
_G.TriggerClientEvent = function(_, src, payload) chat[#chat + 1] = { src = src, msg = payload.args[2] } end

local function heard(src, needle)
    for i = #chat, 1, -1 do
        if chat[i].src == src and chat[i].msg:find(needle, 1, true) then return true end
    end
    return false
end

current = 'crew';  dofile('crew/main.lua')
local C = REG.crew

local KNOT = { x = -430.0, y = 6020.0, z = 30.0 }
local NOWHERE = { x = 0.0, y = 4000.0, z = 30.0 }

local function join(src, name, pos)
    players[src] = { name = name, license = 'license:' .. name:lower(), pos = pos or KNOT }
end

join(1, 'Tanner'); join(2, 'Hayden'); join(3, 'Kaos')

-- ---------- founding ----------
same(C.TagOf(1), nil, 'nobody starts in a crew')
local made, msg = C.Create(1, 'K', 'Too Short Tag')
same(made, false, 'a one-character tag is refused')
same(select(2, C.Create(1, 'KAOS', 'no')), 'Name it something 3-24 characters long', 'a two-character name is refused')

made, msg = C.Create(1, 'kaos', 'Kaos Crew')
same(made, true, 'founding works')
ok(msg:find('No economy resource running', 1, true) ~= nil, 'and says so when it cannot charge a fee')
same(C.TagOf(1), 'KAOS', 'the tag is upper-cased')
same(C.RankOf(1), 2, 'the founder is Leader')
same(select(2, C.Create(2, 'KAOS', 'Another Crew')), '[KAOS] is taken', 'the tag is reserved')

-- ---------- joining is consent, not assignment ----------
same(select(2, C.Accept(2)), "Nobody's invited you", 'you cannot join uninvited')
same(select(2, C.Invite(2, 3)), "You're not in a crew", 'outsiders cannot invite')

ok(C.Invite(1, 2), 'the leader invites Hayden')
same(C.TagOf(2), nil, 'invited is not joined')
ok(heard(2, '/crewaccept'), 'Hayden is told how to accept')
ok(C.Accept(2), 'Hayden accepts')
same(C.RankOf(2), 0, 'and starts as a Member')

-- an invite left too long goes stale
C.Invite(1, 3)
NOW = NOW + 6 * 60 * 1000
same(select(2, C.Accept(3)), 'That invite expired', 'a stale invite is refused')
ok(C.Invite(1, 3) and C.Accept(3), 'a fresh invite works')

-- ---------- rank decides who can act ----------
same(select(2, C.Kick(2, 'Kaos')), 'Only Officers and above can kick', 'members cannot kick')
same(select(2, C.SetRank(2, 'Kaos', true)), 'Only Leaders can change ranks', 'members cannot promote')
ok(C.SetRank(1, 'Hayden', true), 'the leader promotes Hayden')
same(C.RankOf(2), 1, 'Hayden is an Officer')
same(select(2, C.Kick(2, 'Tanner')), 'Tanner outranks you, or matches you', 'an officer cannot kick the leader')
same(select(2, C.Leave(1)), "A leader can't walk away — promote someone or /crewdisband", 'the leader cannot just leave')

-- ---------- the licence fix: same name, separate ranks ----------
join(4, 'Tanner', KNOT)
players[4].license = 'license:tanner2'
ok(C.Invite(1, 4) and C.Accept(4), 'a second player calling himself Tanner joins')
same(C.RankOf(1), 2, 'the original Tanner is still Leader')
same(C.RankOf(4), 0, 'the newcomer is only a Member')
ok(C.Kick(1, 'Tanner') ~= nil, 'kicking by name resolves to one of them, not both')
players[4] = nil

-- ---------- disband clears everyone ----------
ok(C.Disband(1), 'the leader disbands')
same(C.TagOf(1), nil, 'the leader is out')
same(C.TagOf(2), nil, 'and so is everyone else')

print(string.format('# pass %d\n# fail %d', passed, failed))
os.exit(failed == 0 and 0 or 1)
