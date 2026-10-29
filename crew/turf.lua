-- ============================================================
-- crew/turf.lua — claiming districts, and getting paid to hold them
--
-- The ten districts in world/ are the board. A crew claims one by
-- STANDING IN IT, together: it takes MIN_CLAIMERS members inside the
-- zone for CLAIM_MS, and if any of them leaves or logs off the claim
-- dies. Turf is meant to cost you an evening, not a keypress.
--
-- Taking someone else's turf warns them the moment you start, with
-- the district named. That warning is the whole point — a claim you
-- cannot contest is just a timer.
--
-- Holding pays gold to every online member on each payout tick, so a
-- big crew holding nothing earns nothing and three people holding the
-- Knot earn every few minutes.
--
-- Gold goes through an optional economy export. With no economy
-- running, turf still works and simply pays nothing.
--
-- Nothing persists yet: saving is blocked on the API, so turf resets
-- when the server restarts. All the numbers are placeholders.
-- ============================================================

local MIN_CLAIMERS = 2          -- crew members who must be standing in the zone
local CLAIM_MS = 120 * 1000     -- how long they have to hold their ground
local FLIP_COOLDOWN_MS = 15 * 60 * 1000
local PAYOUT_EVERY_MS = 10 * 60 * 1000
local PAYOUT_GOLD = 15          -- per online member, per tick, per district held
local SWEEP_MS = 5000

local held = {}     -- district name -> { tag, since }
local claims = {}   -- district name -> { tag, startedAt, by = { [license] = true } }
local cooldown = {} -- district name -> time it can be flipped again

local Crew = exports['crew']
local World = exports['world']

local function tell(src, msg)
    if src == 0 then return print(msg) end
    TriggerClientEvent('chat:addMessage', src, { args = { 'Turf', msg } })
end

local function posOf(src)
    local coords = GetEntityCoords(GetPlayerPed(src))
    return { x = coords.x, y = coords.y, z = coords.z }
end

-- Crew members of `tag` standing inside this district right now
local function claimersPresent(tag, district)
    local inside = {}
    for _, m in ipairs(Crew:OnlineMembers(tag)) do
        local here = World:DistrictAt(posOf(m.src))
        if here and here.name == district then inside[#inside + 1] = m end
    end
    return inside
end

local function minutesLeft(until_, now)
    if not until_ or until_ <= now then return 0 end
    return math.ceil((until_ - now) / 60000)
end

-- ============================================================
-- READING
-- ============================================================

local function Board()
    local lines = { '--- Turf ---' }
    for _, d in ipairs(World:Districts()) do
        local owner = held[d.name]
        local who = owner and ('[' .. owner.tag .. '] ' .. (Crew:NameOf(owner.tag) or owner.tag)) or 'unclaimed'
        local taking = claims[d.name]
        if taking then who = who .. ' — [' .. taking.tag .. '] is taking it' end
        lines[#lines + 1] = d.name .. ': ' .. who
    end
    return table.concat(lines, '\n')
end

-- ============================================================
-- CLAIMING
-- ============================================================

local function Claim(src)
    local tag = Crew:TagOf(src)
    if not tag then return false, "You're not in a crew" end

    local district = World:DistrictAt(posOf(src))
    if not district then return false, "You're not standing in a district. /turf lists them" end

    local name = district.name
    if claims[name] then
        return false, claims[name].tag == tag and 'Your crew is already taking this' or 'Someone else is taking this right now'
    end

    local owner = held[name]
    if owner and owner.tag == tag then return false, 'Your crew already holds ' .. name end

    local wait = minutesLeft(cooldown[name], GetGameTimer())
    if wait > 0 then return false, name .. ' just changed hands — it settles in ' .. wait .. ' min' end

    local present = claimersPresent(tag, name)
    if #present < MIN_CLAIMERS then
        return false, ('You need %d crew in %s to take it — %d here'):format(MIN_CLAIMERS, name, #present)
    end

    local by = {}
    for _, m in ipairs(present) do by[m.license] = true end
    claims[name] = { tag = tag, startedAt = GetGameTimer(), by = by }

    local seconds = math.floor(CLAIM_MS / 1000)
    for _, m in ipairs(present) do
        tell(m.src, 'Taking ' .. name .. '. Hold it for ' .. seconds .. 's — everyone has to stay.')
    end

    -- the crew losing it finds out immediately, by name
    if owner then
        Crew:Announce(owner.tag, 'WARNING: [' .. tag .. '] is taking ' .. name .. ' from you. ' .. seconds .. 's.')
    end
    return true, nil
end

local function Abandon(src)
    local tag = Crew:TagOf(src)
    if not tag then return false, "You're not in a crew" end
    if Crew:RankOf(src) ~= Crew:Ranks().leader then return false, 'Only Leaders can give up turf' end

    local district = World:DistrictAt(posOf(src))
    if not district or not held[district.name] or held[district.name].tag ~= tag then
        return false, "You're not standing in turf your crew holds"
    end

    held[district.name] = nil
    Crew:Announce(tag, 'Gave up ' .. district.name .. '.')
    return true, 'Gave up ' .. district.name .. '.'
end

-- ============================================================
-- THE CLOCK — claims only land if the ground is still held
-- ============================================================

local function progress(now)
    for name, claim in pairs(claims) do
        local present = claimersPresent(claim.tag, name)

        if #present < MIN_CLAIMERS then
            claims[name] = nil
            for _, m in ipairs(present) do tell(m.src, 'Lost the hold on ' .. name .. '. Nothing taken.') end

        elseif now - claim.startedAt >= CLAIM_MS then
            local loser = held[name]
            claims[name] = nil
            held[name] = { tag = claim.tag, since = now }
            cooldown[name] = now + FLIP_COOLDOWN_MS

            Crew:Announce(claim.tag, '[' .. claim.tag .. '] now holds ' .. name .. '.')
            if loser then Crew:Announce(loser.tag, 'You lost ' .. name .. ' to [' .. claim.tag .. '].') end
        end
    end
end

-- ============================================================
-- PAYOUT — gold per online member, per district held
-- ============================================================

local function payout()
    local economy = exports['economy']
    local earners = {}

    for name, owner in pairs(held) do
        for _, m in ipairs(Crew:OnlineMembers(owner.tag)) do
            earners[m.src] = (earners[m.src] or 0) + PAYOUT_GOLD
        end
        _ = name
    end

    for src, gold in pairs(earners) do
        local paid = false
        if economy then
            paid = pcall(function() return economy:AddGold(src, gold) end)
        end
        tell(src, paid and ('Turf pays +' .. gold .. ' gold.')
                       or ('Turf would pay +' .. gold .. ' gold, but no economy is running.'))
    end
end

-- ============================================================
-- EXPORTS
-- ============================================================

exports('HeldBy', function(tag)
    local out = {}
    for name, owner in pairs(held) do
        if owner.tag == tag then out[#out + 1] = name end
    end
    return out
end)
exports('HolderOf', function(district)
    local owner = held[district]
    return owner and owner.tag or nil
end)
exports('Board', Board)
exports('Claim', Claim)
exports('Abandon', Abandon)
-- the two clocks, so a test (or an admin tool) can run them on demand
exports('Progress', progress)
exports('Payout', payout)
exports('_turfState', function() return held, claims, cooldown end)

-- ============================================================
-- COMMANDS AND LOOPS
-- ============================================================

RegisterCommand('turf', function(src) tell(src, Board()) end, false)

RegisterCommand('claim', function(src)
    if src == 0 then return print('Players only.') end
    local ok, msg = Claim(src)
    if msg then tell(src, msg) end
    _ = ok
end, false)

RegisterCommand('abandon', function(src)
    if src == 0 then return print('Players only.') end
    local _, msg = Abandon(src)
    if msg then tell(src, msg) end
end, false)

CreateThread(function()
    while true do
        Wait(SWEEP_MS)
        progress(GetGameTimer())
    end
end)

CreateThread(function()
    while true do
        Wait(PAYOUT_EVERY_MS)
        payout()
    end
end)
