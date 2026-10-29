-- ============================================================
-- crew/main.lua — crews and ranks, in Lua
--
-- The core of js-snippets/gangs.js, ported. Founding costs money so
-- tags are not spam, nobody joins without agreeing, and ranks are
-- Member (0), Officer (1), Leader (2) — you can only act on someone
-- below you.
--
-- ONE REAL IMPROVEMENT OVER THE JS: the roster is keyed by the
-- player's license identifier, not their character name. The JS
-- version warned that two players with one name would share a rank.
-- They cannot here.
--
-- NOT PORTED YET, still JavaScript only: the crew stash, the base and
-- the /g radio. All three lean on the inventory, which is still JS.
--
-- Money: this asks the economy for a balance through an export so it
-- does not care which language the economy ends up in. With no
-- economy resource running, founding is free and says so.
--
-- Nothing persists yet. Saving is blocked on the API — see
-- docs/TUNING.md — so crews live until the server restarts.
-- ============================================================

local CREATE_COST = 25000
local MAX_MEMBERS = 12
local INVITE_EXPIRY_MS = 5 * 60 * 1000

local MEMBER, OFFICER, LEADER = 0, 1, 2
local RANK_LABEL = { [0] = 'Member', [1] = 'Officer', [2] = 'Leader' }

local crews = {}    -- TAG -> { tag, name, founder, roster = { [license] = { rank, name } } }
local invites = {}  -- license -> { tag, from, at }
local byPlayer = {} -- license -> TAG

-- ============================================================
-- WHO IS WHO
-- ============================================================

local function licenseOf(src)
    for i = 0, GetNumPlayerIdentifiers(src) - 1 do
        local id = GetPlayerIdentifier(src, i)
        if id and id:sub(1, 8) == 'license:' then return id end
    end
    return nil
end

local function tell(src, msg)
    if src == 0 then return print(msg) end
    TriggerClientEvent('chat:addMessage', src, { args = { 'Crew', msg } })
end

-- Every online player in this crew. extra = a license to leave out.
local function onlineMembers(tag, except)
    local out = {}
    for _, id in ipairs(GetPlayers()) do
        local src = tonumber(id)
        local license = licenseOf(src)
        if license and byPlayer[license] == tag and license ~= except then
            out[#out + 1] = { src = src, license = license }
        end
    end
    return out
end

local function announce(tag, msg, except)
    for _, m in ipairs(onlineMembers(tag, except)) do tell(m.src, msg) end
end

-- ============================================================
-- MONEY — asked for through an export so this does not care what
-- language the economy is written in. No economy, no charge.
-- ============================================================

local function charge(src, amount)
    local economy = exports['economy']
    if not economy then
        return true, 'No economy resource running, so founding was free.'
    end

    local ok = pcall(function() return economy:RemoveMoney(src, 'bank', amount) end)
    if not ok then
        return false, 'Could not reach the economy to take the fee.'
    end
    return true, nil
end

-- ============================================================
-- READING
-- ============================================================

local function crewOf(src)
    local license = licenseOf(src)
    if not license then return nil, nil end
    local tag = byPlayer[license]
    if not tag then return nil, license end
    return crews[tag], license
end

local function rosterLines(crew)
    local lines = {}
    for _, entry in pairs(crew.roster) do
        lines[#lines + 1] = { rank = entry.rank, text = RANK_LABEL[entry.rank] .. ': ' .. entry.name }
    end
    table.sort(lines, function(a, b)
        if a.rank ~= b.rank then return a.rank > b.rank end
        return a.text < b.text
    end)

    local out = {}
    for _, l in ipairs(lines) do out[#out + 1] = l.text end
    return out
end

local function countRoster(crew)
    local n = 0
    for _ in pairs(crew.roster) do n = n + 1 end
    return n
end

local function Info(src)
    local crew, license = crewOf(src)
    if not crew then return "You're not in a crew. /crews to see who's out there" end

    local lines = { '[' .. crew.tag .. '] ' .. crew.name, 'You: ' .. RANK_LABEL[crew.roster[license].rank] }
    for _, l in ipairs(rosterLines(crew)) do lines[#lines + 1] = l end
    return table.concat(lines, '\n')
end

local function List()
    local lines = {}
    for tag, crew in pairs(crews) do
        lines[#lines + 1] = '[' .. tag .. '] ' .. crew.name .. ' — ' .. countRoster(crew) .. ' member(s)'
    end
    if #lines == 0 then return 'No crews yet. /crewcreate <tag> <name>' end
    table.sort(lines)
    table.insert(lines, 1, '--- Crews ---')
    return table.concat(lines, '\n')
end

-- ============================================================
-- MEMBERSHIP
-- ============================================================

local function Create(src, tag, name)
    local crew, license = crewOf(src)
    if not license then return false, 'No license on your account yet — reconnect and try again' end
    if crew then return false, 'Leave your crew first' end
    -- 2 to 5, not 1 to 5: %w%w then three optional
    if not tag or not tag:match('^%w%w%w?%w?%w?$') then return false, 'Tag is 2-5 letters or numbers, e.g. KAOS' end

    name = (name or ''):gsub('^%s+', ''):gsub('%s+$', ''):gsub('%s+', ' ')
    if #name < 3 or #name > 24 then return false, 'Name it something 3-24 characters long' end

    local TAG = tag:upper()
    if crews[TAG] then return false, '[' .. TAG .. '] is taken' end

    local paid, note = charge(src, CREATE_COST)
    if not paid then return false, note end

    crews[TAG] = {
        tag = TAG, name = name, founder = license,
        roster = { [license] = { rank = LEADER, name = GetPlayerName(src) } },
    }
    byPlayer[license] = TAG

    local msg = '[' .. TAG .. '] ' .. name .. ' founded.'
    if note then msg = msg .. ' ' .. note end
    return true, msg
end

local function Invite(src, targetSrc)
    local crew, license = crewOf(src)
    if not crew then return false, "You're not in a crew" end
    if crew.roster[license].rank < OFFICER then return false, 'Only Officers and above can invite' end

    local targetLicense = targetSrc and licenseOf(targetSrc)
    if not targetLicense then return false, 'No player with that id' end
    if targetLicense == license then return false, "You're already in it" end
    if byPlayer[targetLicense] then return false, GetPlayerName(targetSrc) .. ' is already in a crew' end
    if countRoster(crew) >= MAX_MEMBERS then return false, '[' .. crew.tag .. '] is full (' .. MAX_MEMBERS .. ')' end

    invites[targetLicense] = { tag = crew.tag, from = GetPlayerName(src), at = GetGameTimer() }
    tell(targetSrc, GetPlayerName(src) .. ' invited you to [' .. crew.tag .. '] ' .. crew.name .. ' — /crewaccept')
    return true, 'Invited ' .. GetPlayerName(targetSrc) .. ' to [' .. crew.tag .. ']'
end

local function Accept(src)
    local crew, license = crewOf(src)
    if not license then return false, 'No license on your account yet' end
    if crew then return false, "You're already in a crew" end

    local pending = invites[license]
    if not pending then return false, "Nobody's invited you" end
    if GetGameTimer() - pending.at >= INVITE_EXPIRY_MS then
        invites[license] = nil
        return false, 'That invite expired'
    end

    local into = crews[pending.tag]
    invites[license] = nil
    if not into then return false, "That crew doesn't exist any more" end
    if countRoster(into) >= MAX_MEMBERS then return false, '[' .. into.tag .. '] filled up' end

    into.roster[license] = { rank = MEMBER, name = GetPlayerName(src) }
    byPlayer[license] = into.tag
    announce(into.tag, GetPlayerName(src) .. ' joined [' .. into.tag .. ']', license)
    return true, "You're in [" .. into.tag .. '] ' .. into.name .. '.'
end

local function Leave(src)
    local crew, license = crewOf(src)
    if not crew then return false, "You're not in a crew" end
    if crew.roster[license].rank == LEADER then
        return false, "A leader can't walk away — promote someone or /crewdisband"
    end

    crew.roster[license] = nil
    byPlayer[license] = nil
    announce(crew.tag, GetPlayerName(src) .. ' left [' .. crew.tag .. ']')
    return true, 'You left [' .. crew.tag .. ']'
end

-- Works on members who are offline too: the roster keeps them.
local function findInRoster(crew, name)
    local wanted = (name or ''):lower()
    for license, entry in pairs(crew.roster) do
        if entry.name:lower() == wanted then return license, entry end
    end
    return nil, nil
end

local function Kick(src, name)
    local crew, license = crewOf(src)
    if not crew then return false, "You're not in a crew" end
    if crew.roster[license].rank < OFFICER then return false, 'Only Officers and above can kick' end

    local theirLicense, entry = findInRoster(crew, name)
    if not entry then return false, (name or 'That name') .. " isn't on the roster" end
    if theirLicense == license then return false, 'Use /crewleave' end
    if entry.rank >= crew.roster[license].rank then return false, entry.name .. ' outranks you, or matches you' end

    crew.roster[theirLicense] = nil
    byPlayer[theirLicense] = nil
    announce(crew.tag, 'Kicked ' .. entry.name .. ' out of [' .. crew.tag .. ']')
    return true, 'Kicked ' .. entry.name .. ' out of [' .. crew.tag .. ']'
end

local function SetRank(src, name, up)
    local crew, license = crewOf(src)
    if not crew then return false, "You're not in a crew" end
    if crew.roster[license].rank ~= LEADER then return false, 'Only Leaders can change ranks' end

    local theirLicense, entry = findInRoster(crew, name)
    if not entry then return false, (name or 'That name') .. " isn't on the roster" end
    if theirLicense == license then return false, 'Not on yourself' end

    local next_ = entry.rank + (up and 1 or -1)
    if next_ > OFFICER then return false, 'Officer is as high as it goes' end
    if next_ < MEMBER then return false, entry.name .. ' is already a Member' end

    entry.rank = next_
    announce(crew.tag, entry.name .. ' is now ' .. RANK_LABEL[next_])
    return true, entry.name .. ' is now ' .. RANK_LABEL[next_]
end

local function Disband(src)
    local crew, license = crewOf(src)
    if not crew then return false, "You're not in a crew" end
    if crew.roster[license].rank ~= LEADER then return false, 'Only Leaders can disband' end

    local tag, name = crew.tag, crew.name
    announce(tag, '[' .. tag .. '] ' .. name .. ' is gone.', license)
    for theirLicense in pairs(crew.roster) do byPlayer[theirLicense] = nil end
    for who, pending in pairs(invites) do
        if pending.tag == tag then invites[who] = nil end
    end
    crews[tag] = nil
    return true, '[' .. tag .. '] ' .. name .. ' is gone.'
end

-- ============================================================
-- EXPORTS — turf.lua and anything else ask through these
-- ============================================================

exports('TagOf', function(src)
    local _, license = crewOf(src)
    return license and byPlayer[license] or nil
end)
exports('RankOf', function(src)
    local crew, license = crewOf(src)
    if not crew then return nil end
    return crew.roster[license].rank
end)
exports('NameOf', function(tag)
    local crew = crews[tag]
    return crew and crew.name or nil
end)
exports('OnlineMembers', onlineMembers)
exports('Announce', announce)
exports('Exists', function(tag) return crews[tag] ~= nil end)
exports('Ranks', function() return { member = MEMBER, officer = OFFICER, leader = LEADER } end)

-- The operations themselves, so the commands below are thin wrappers and
-- another resource (or a test) can drive them directly.
exports('Create', Create)
exports('Invite', Invite)
exports('Accept', Accept)
exports('Leave', Leave)
exports('Kick', Kick)
exports('SetRank', SetRank)
exports('Disband', Disband)
exports('Info', Info)
exports('List', List)

-- Handed to the test harness and, later, to whatever saves state
exports('_state', function() return crews, byPlayer, invites end)

-- ============================================================
-- COMMANDS
-- ============================================================

local function reply(src, ok, msg) tell(src, msg) end

RegisterCommand('crews', function(src) tell(src, List()) end, false)
RegisterCommand('crew', function(src) tell(src, Info(src)) end, false)

RegisterCommand('crewcreate', function(src, args)
    if src == 0 then return print('Players only.') end
    reply(src, Create(src, args[1], table.concat(args, ' ', math.min(2, #args + 1))))
end, false)

RegisterCommand('crewinvite', function(src, args)
    if src == 0 then return print('Players only.') end
    reply(src, Invite(src, tonumber(args[1])))
end, false)

RegisterCommand('crewaccept', function(src) reply(src, Accept(src)) end, false)
RegisterCommand('crewleave', function(src) reply(src, Leave(src)) end, false)
RegisterCommand('crewkick', function(src, args) reply(src, Kick(src, table.concat(args, ' '))) end, false)
RegisterCommand('crewpromote', function(src, args) reply(src, SetRank(src, table.concat(args, ' '), true)) end, false)
RegisterCommand('crewdemote', function(src, args) reply(src, SetRank(src, table.concat(args, ' '), false)) end, false)
RegisterCommand('crewdisband', function(src) reply(src, Disband(src)) end, false)

-- Invites rot rather than hang around for ever
CreateThread(function()
    while true do
        Wait(60000)
        local now = GetGameTimer()
        for license, pending in pairs(invites) do
            if now - pending.at >= INVITE_EXPIRY_MS then invites[license] = nil end
        end
    end
end)
