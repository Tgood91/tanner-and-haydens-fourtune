-- ============================================================
-- Client — a basic display: money bar, bank box, inventory panel.
-- It only SHOWS what the server pushes and SENDS requests. It never
-- decides anything: every button is just a question to the server.
--
-- Keys: I = inventory, B = bank.
-- ============================================================

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local UserInputService = game:GetService("UserInputService")

local player = Players.LocalPlayer
local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared.Config)
local Economy = require(Shared.Economy)

local Remotes = ReplicatedStorage:WaitForChild("Remotes")
local Request = Remotes:WaitForChild("Request") :: RemoteFunction
local StateEvent = Remotes:WaitForChild("State") :: RemoteEvent
local NotifyEvent = Remotes:WaitForChild("Notify") :: RemoteEvent

-- ------------------------------------------------------------
-- Tiny UI helper
-- ------------------------------------------------------------

local function make(className: string, props, children)
	local inst = Instance.new(className)
	for k, v in props or {} do
		if k ~= "Parent" then
			inst[k] = v
		end
	end
	for _, child in children or {} do
		child.Parent = inst
	end
	if props and props.Parent then
		inst.Parent = props.Parent
	end
	return inst
end

local DARK = Color3.fromRGB(24, 24, 28)
local MID = Color3.fromRGB(44, 44, 52)
local TEXT = Color3.fromRGB(235, 235, 240)
local ACCENT = Color3.fromRGB(80, 170, 110)

local function corner(parent)
	make("UICorner", { CornerRadius = UDim.new(0, 6), Parent = parent })
end

local function label(props)
	props.BackgroundTransparency = 1
	props.TextColor3 = props.TextColor3 or TEXT
	props.Font = props.Font or Enum.Font.GothamMedium
	props.TextSize = props.TextSize or 14
	props.TextXAlignment = props.TextXAlignment or Enum.TextXAlignment.Left
	return make("TextLabel", props)
end

local function button(text: string, props)
	props.Text = text
	props.BackgroundColor3 = props.BackgroundColor3 or MID
	props.TextColor3 = TEXT
	props.Font = Enum.Font.GothamBold
	props.TextSize = 13
	props.AutoButtonColor = true
	local b = make("TextButton", props)
	corner(b)
	return b
end

local gui = make("ScreenGui", {
	Name = "CoreHud",
	ResetOnSpawn = false,
	IgnoreGuiInset = false,
	Parent = player:WaitForChild("PlayerGui"),
})

-- ------------------------------------------------------------
-- Money bar (always visible)
-- ------------------------------------------------------------

local moneyBar = make("Frame", {
	BackgroundColor3 = DARK,
	BackgroundTransparency = 0.15,
	Position = UDim2.new(0, 12, 0, 12),
	Size = UDim2.new(0, 330, 0, 34),
	Parent = gui,
})
corner(moneyBar)
local moneyText = label({
	Text = "Loading…",
	Position = UDim2.new(0, 10, 0, 0),
	Size = UDim2.new(1, -20, 1, 0),
	Parent = moneyBar,
})

-- ------------------------------------------------------------
-- Notifications
-- ------------------------------------------------------------

local toast = label({
	Text = "",
	TextXAlignment = Enum.TextXAlignment.Center,
	TextWrapped = true,
	BackgroundTransparency = 0.2,
	BackgroundColor3 = DARK,
	AnchorPoint = Vector2.new(0.5, 1),
	Position = UDim2.new(0.5, 0, 1, -90),
	Size = UDim2.new(0, 420, 0, 36),
	Visible = false,
	Parent = gui,
})
toast.BackgroundTransparency = 0.2
corner(toast)

local toastToken = 0
local function notify(msg: string)
	if msg == nil or msg == "" then
		return
	end
	toastToken += 1
	local mine = toastToken
	toast.Text = msg
	toast.Visible = true
	task.delay(3.5, function()
		if toastToken == mine then
			toast.Visible = false
		end
	end)
end

-- Every server call goes through here.
local function request(action: string, ...)
	local ok, res = pcall(Request.InvokeServer, Request, action, ...)
	if not ok then
		notify("Connection problem, try again")
		return nil
	end
	if type(res) == "table" and type(res.msg) == "string" then
		notify(res.msg)
	end
	return res
end

-- ------------------------------------------------------------
-- Panels
-- ------------------------------------------------------------

local function panel(title: string, height: number)
	local frame = make("Frame", {
		BackgroundColor3 = DARK,
		BackgroundTransparency = 0.05,
		AnchorPoint = Vector2.new(1, 0.5),
		Position = UDim2.new(1, -12, 0.5, 0),
		Size = UDim2.new(0, 320, 0, height),
		Visible = false,
		Parent = gui,
	})
	corner(frame)
	label({
		Text = title,
		Font = Enum.Font.GothamBold,
		TextSize = 16,
		Position = UDim2.new(0, 12, 0, 8),
		Size = UDim2.new(1, -24, 0, 22),
		Parent = frame,
	})
	return frame
end

-- Bank
local bankPanel = panel("Bank", 130)
-- top-right, so it doesn't sit on top of the inventory panel
bankPanel.AnchorPoint = Vector2.new(1, 0)
bankPanel.Position = UDim2.new(1, -12, 0, 12)
local amountBox = make("TextBox", {
	PlaceholderText = "Amount",
	Text = "",
	ClearTextOnFocus = false,
	BackgroundColor3 = MID,
	TextColor3 = TEXT,
	Font = Enum.Font.GothamMedium,
	TextSize = 14,
	Position = UDim2.new(0, 12, 0, 40),
	Size = UDim2.new(1, -24, 0, 32),
	Parent = bankPanel,
})
corner(amountBox)

local function readAmount(): number?
	local n = tonumber(amountBox.Text)
	if not n then
		notify("Type a whole number")
		return nil
	end
	return n -- the server still checks it
end

button("Deposit", {
	BackgroundColor3 = ACCENT,
	Position = UDim2.new(0, 12, 0, 82),
	Size = UDim2.new(0.5, -18, 0, 32),
	Parent = bankPanel,
}).Activated:Connect(function()
	local n = readAmount()
	if n then
		request("deposit", n)
	end
end)

button("Withdraw", {
	Position = UDim2.new(0.5, 6, 0, 82),
	Size = UDim2.new(0.5, -18, 0, 32),
	Parent = bankPanel,
}).Activated:Connect(function()
	local n = readAmount()
	if n then
		request("withdraw", n)
	end
end)

-- Inventory
local invPanel = panel("Inventory", 380)
local weightText = label({
	Text = "",
	TextXAlignment = Enum.TextXAlignment.Right,
	Position = UDim2.new(0, 12, 0, 8),
	Size = UDim2.new(1, -24, 0, 22),
	Parent = invPanel,
})
local list = make("ScrollingFrame", {
	BackgroundTransparency = 1,
	BorderSizePixel = 0,
	Position = UDim2.new(0, 8, 0, 40),
	Size = UDim2.new(1, -16, 1, -48),
	CanvasSize = UDim2.new(0, 0, 0, 0),
	AutomaticCanvasSize = Enum.AutomaticSize.Y,
	ScrollBarThickness = 4,
	Parent = invPanel,
}, {
	make("UIListLayout", { Padding = UDim.new(0, 6), SortOrder = Enum.SortOrder.LayoutOrder }),
})

local function renderItems(items)
	for _, child in list:GetChildren() do
		if child:IsA("Frame") then
			child:Destroy()
		end
	end
	if #items == 0 then
		local row = make("Frame", { BackgroundTransparency = 1, Size = UDim2.new(1, -6, 0, 30), Parent = list })
		label({ Text = "Empty", Size = UDim2.new(1, 0, 1, 0), Parent = row })
		return
	end
	for i, item in items do
		local row = make("Frame", {
			BackgroundColor3 = MID,
			Size = UDim2.new(1, -6, 0, 36),
			LayoutOrder = i,
			Parent = list,
		})
		corner(row)
		label({
			Text = string.format("%s x%d  (%.1f kg)", item.label, item.count, item.weight),
			Position = UDim2.new(0, 10, 0, 0),
			Size = UDim2.new(1, -140, 1, 0),
			TextTruncate = Enum.TextTruncate.AtEnd,
			Parent = row,
		})
		if item.usable then
			button("Use", {
				BackgroundColor3 = ACCENT,
				Position = UDim2.new(1, -126, 0.5, -13),
				Size = UDim2.new(0, 56, 0, 26),
				Parent = row,
			}).Activated:Connect(function()
				request("useItem", item.id)
			end)
		end
		button("Drop", {
			Position = UDim2.new(1, -64, 0.5, -13),
			Size = UDim2.new(0, 56, 0, 26),
			Parent = row,
		}).Activated:Connect(function()
			request("dropItem", item.id, 1)
		end)
	end
end

-- ------------------------------------------------------------
-- State from the server
-- ------------------------------------------------------------

local function render(state)
	if type(state) ~= "table" then
		return
	end
	moneyText.Text = string.format(
		"%s   Cash %s   Bank %s   Gold %d",
		Config.GAME_NAME,
		Economy.money(state.cash),
		Economy.money(state.bank),
		state.gold
	)
	weightText.Text = string.format("%.1f / %g kg", state.weight, state.maxWeight)
	renderItems(state.items)
end

StateEvent.OnClientEvent:Connect(render)
NotifyEvent.OnClientEvent:Connect(notify)

-- If the first push arrived before this script was listening.
task.spawn(function()
	local ok, res = pcall(Request.InvokeServer, Request, "getState")
	if ok and type(res) == "table" and res.ok then
		render(res.state)
	end
end)

-- ------------------------------------------------------------
-- Keys + toggle buttons
-- ------------------------------------------------------------

local function toggle(frame: Frame)
	frame.Visible = not frame.Visible
end

UserInputService.InputBegan:Connect(function(input, processed)
	if processed then
		return -- typing in chat or a text box
	end
	if input.KeyCode == Enum.KeyCode.I then
		toggle(invPanel)
	elseif input.KeyCode == Enum.KeyCode.B then
		toggle(bankPanel)
	end
end)

-- Buttons too, for touch and controller players.
button("Inventory (I)", {
	Position = UDim2.new(0, 12, 0, 52),
	Size = UDim2.new(0, 120, 0, 28),
	Parent = gui,
}).Activated:Connect(function()
	toggle(invPanel)
end)
button("Bank (B)", {
	Position = UDim2.new(0, 138, 0, 52),
	Size = UDim2.new(0, 90, 0, 28),
	Parent = gui,
}).Activated:Connect(function()
	toggle(bankPanel)
end)
