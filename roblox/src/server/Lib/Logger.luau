-- ============================================================
-- Logger — tagged output so the Server log is readable:
--   [Data] Loaded Tanner (1234)
-- ============================================================

local Logger = {}
Logger.__index = Logger

function Logger.new(tag: string)
	return setmetatable({ tag = "[" .. tag .. "] " }, Logger)
end

function Logger:info(fmt: string, ...)
	print(self.tag .. string.format(fmt, ...))
end

function Logger:warn(fmt: string, ...)
	warn(self.tag .. string.format(fmt, ...))
end

-- Not error(): that would stop the calling thread. This only reports.
function Logger:error(fmt: string, ...)
	warn(self.tag .. "ERROR " .. string.format(fmt, ...))
end

return Logger
