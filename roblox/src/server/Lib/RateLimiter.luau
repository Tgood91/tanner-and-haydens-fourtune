-- ============================================================
-- RateLimiter — a token bucket per key (per player).
-- Each request costs 1 token. A player can burst `capacity`
-- requests, then gets `refillPerSecond` back every second.
-- Spamming a remote just gets "Slow down" instead of load.
--
-- `clock` is injectable so the tests can fake time.
-- ============================================================

local RateLimiter = {}
RateLimiter.__index = RateLimiter

function RateLimiter.new(capacity: number, refillPerSecond: number, clock: (() -> number)?)
	return setmetatable({
		capacity = capacity,
		refill = refillPerSecond,
		clock = clock or os.clock,
		buckets = {},
	}, RateLimiter)
end

function RateLimiter:allow(key: any, cost: number?): boolean
	local price = cost or 1
	local now = self.clock()
	local bucket = self.buckets[key]
	if not bucket then
		bucket = { tokens = self.capacity, at = now }
		self.buckets[key] = bucket
	end

	bucket.tokens = math.min(self.capacity, bucket.tokens + (now - bucket.at) * self.refill)
	bucket.at = now

	if bucket.tokens >= price then
		bucket.tokens -= price
		return true
	end
	return false
end

function RateLimiter:forget(key: any)
	self.buckets[key] = nil
end

return RateLimiter
