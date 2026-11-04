-- ============================================================
-- MapBuilder — builds the whole island from MapData.luau:
--   terrain   sea, beach, grass, the mountain, the airport apron
--   roads     108 named roads as asphalt parts, with centre lines
--   junctions 276 junction pads
--   signs     345 street signs (a blade per road at every junction,
--             plus a sign every ~900 studs on long stretches)
--   labels    floating road / district names (easy to switch off)
--   spawns    one per city (312, 770, 1017)
--
-- Two ways to run it:
--   1. Press Play. If workspace.Map doesn't exist, Main builds it
--      (Config.BUILD_MAP_IF_MISSING). Fine for testing; not saved.
--   2. Build it ONCE into the place, so it's saved and editable.
--      In Edit mode (not Play), paste in the command bar:
--        require(game.ServerScriptService.Server.Map.MapBuilder).Build()
--      then File > Save. From then on the map loads with the place.
--
-- Everything goes in workspace.Map, so Build() can wipe and redo it.
-- ============================================================

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage:WaitForChild("Shared").Config)
local MapData = require(script.Parent.MapData)

local MapBuilder = {}

local THICK = 2 -- road slab thickness, studs
local MAX_PIECE = 1000 -- parts can't be longer than 2048; split long straights

local STYLE = {
	highway = { color = Color3.fromRGB(52, 54, 58), material = Enum.Material.Asphalt, line = true },
	arterial = { color = Color3.fromRGB(60, 62, 66), material = Enum.Material.Asphalt, line = true },
	street = { color = Color3.fromRGB(72, 74, 78), material = Enum.Material.Asphalt },
	street312 = { color = Color3.fromRGB(72, 74, 78), material = Enum.Material.Asphalt },
	backroad = { color = Color3.fromRGB(96, 92, 84), material = Enum.Material.Asphalt },
	track = { color = Color3.fromRGB(124, 104, 74), material = Enum.Material.Ground },
}
local LINE_COLOR = Color3.fromRGB(226, 185, 59)
local SIGN_COLOR = Color3.fromRGB(0, 104, 56)
local POST_COLOR = Color3.fromRGB(140, 144, 150)

-- ------------------------------------------------------------
-- Helpers
-- ------------------------------------------------------------

-- Building thousands of parts in one go freezes Studio; give it air.
local lastYield = os.clock()
local function breathe()
	if os.clock() - lastYield > 0.15 then
		task.wait()
		lastYield = os.clock()
	end
end

local function folder(name: string, parent: Instance): Folder
	local f = Instance.new("Folder")
	f.Name = name
	f.Parent = parent
	return f
end

local function part(parent: Instance, name: string, size: Vector3, cframe: CFrame, color: Color3, material: Enum.Material)
	local p = Instance.new("Part")
	p.Name = name
	p.Anchored = true
	p.Size = size
	p.CFrame = cframe
	p.Color = color
	p.Material = material
	p.TopSurface = Enum.SurfaceType.Smooth
	p.BottomSurface = Enum.SurfaceType.Smooth
	p.Parent = parent
	breathe()
	return p
end

-- A flat slab from a to b ({x, z} each), top surface at `top`.
local function slab(parent, name, a, b, width, thick, top, color, material)
	local dx, dz = b[1] - a[1], b[2] - a[2]
	local len = math.sqrt(dx * dx + dz * dz)
	if len < 0.05 then
		return
	end
	local y = top - thick / 2
	local pieces = math.ceil(len / MAX_PIECE)
	for i = 1, pieces do
		local t0, t1 = (i - 1) / pieces, i / pieces
		local p0 = Vector3.new(a[1] + dx * t0, y, a[2] + dz * t0)
		local p1 = Vector3.new(a[1] + dx * t1, y, a[2] + dz * t1)
		local mid = (p0 + p1) / 2
		local p = part(parent, name, Vector3.new(width, thick, (p1 - p0).Magnitude), CFrame.lookAt(mid, p1), color, material)
		p.CastShadow = false
	end
end

-- A round pad (fills the gap where a road bends, and junctions).
local function disc(parent, name, x, z, diameter, thick, top, color, material)
	local p = part(
		parent,
		name,
		Vector3.new(thick, diameter, diameter),
		CFrame.new(x, top - thick / 2, z) * CFrame.Angles(0, 0, math.pi / 2),
		color,
		material
	)
	p.Shape = Enum.PartType.Cylinder
	p.CastShadow = false
	return p
end

-- An invisible anchor for floating text.
local function anchor(parent, name, pos: Vector3)
	local p = Instance.new("Part")
	p.Name = name
	p.Anchored = true
	p.CanCollide = false
	p.CanQuery = false
	p.CanTouch = false
	p.Transparency = 1
	p.Size = Vector3.one
	p.Position = pos
	p.Parent = parent
	return p
end

-- Floating name. Size is in studs, so it shrinks with distance like a real object.
local function floatingText(parent, text: string, pos: Vector3, heightStuds: number, color: Color3, maxDistance: number)
	local holder = anchor(parent, text, pos)
	local gui = Instance.new("BillboardGui")
	gui.Size = UDim2.fromScale(math.max(4, #text * heightStuds * 0.55), heightStuds)
	gui.LightInfluence = 0
	gui.MaxDistance = maxDistance
	gui.Parent = holder
	local label = Instance.new("TextLabel")
	label.Size = UDim2.fromScale(1, 1)
	label.BackgroundTransparency = 1
	label.Text = text
	label.TextScaled = true
	label.Font = Enum.Font.GothamBlack
	label.TextColor3 = color
	label.TextStrokeTransparency = 0.2
	label.Parent = gui
end

local function signText(blade: BasePart, face: Enum.NormalId, text: string)
	local gui = Instance.new("SurfaceGui")
	gui.Face = face
	gui.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
	gui.PixelsPerStud = 40
	gui.LightInfluence = 0.3
	gui.Parent = blade
	local label = Instance.new("TextLabel")
	label.Size = UDim2.new(1, -16, 1, -8)
	label.Position = UDim2.fromOffset(8, 4)
	label.BackgroundTransparency = 1
	label.Text = text
	label.TextScaled = true
	label.Font = Enum.Font.GothamBold
	label.TextColor3 = Color3.new(1, 1, 1)
	label.Parent = gui
end

-- ------------------------------------------------------------
-- Pieces
-- ------------------------------------------------------------

local function buildTerrain()
	local terrain = workspace.Terrain
	local t = MapData.terrain
	local rowH = t.rowHeight

	-- Sea: 12 studs of water over a sand seabed, in 1024-stud tiles
	local w = t.water
	for x = w.x0, w.x1, 1024 do
		for z = w.z0, w.z1, 1024 do
			local sx, sz = math.min(1024, w.x1 - x), math.min(1024, w.z1 - z)
			if sx < 4 or sz < 4 then
				continue
			end
			terrain:FillBlock(CFrame.new(x + sx / 2, -20, z + sz / 2), Vector3.new(sx, 8, sz), Enum.Material.Sand)
			terrain:FillBlock(CFrame.new(x + sx / 2, -10, z + sz / 2), Vector3.new(sx, 12, sz), Enum.Material.Water)
			breathe()
		end
	end

	-- Land: the whole island as sand, then grass inside the beach; top at Y = 0
	local function rows(list, material)
		for _, row in list do
			local z, x0, x1 = row[1], row[2], row[3]
			terrain:FillBlock(CFrame.new((x0 + x1) / 2, -12, z), Vector3.new(x1 - x0, 24, rowH), material)
			breathe()
		end
	end
	rows(t.sand, Enum.Material.Sand)
	rows(t.grass, Enum.Material.Grass)
	rows(t.concrete, Enum.Material.Concrete)

	-- The mountain: one column per cell, rock above rockAbove, snow cap above snowAbove
	local m = MapData.mountain
	for iz, row in m.rows do
		local z = m.z0 + (iz - 0.5) * m.cell
		for ix, h in row do
			if h > 0 then
				local x = m.x0 + (ix - 0.5) * m.cell
				local material = if h > m.rockAbove then Enum.Material.Rock else Enum.Material.Grass
				terrain:FillBlock(CFrame.new(x, h / 2, z), Vector3.new(m.cell, h, m.cell), material)
				if h > m.snowAbove then
					terrain:FillBlock(CFrame.new(x, h - 4, z), Vector3.new(m.cell, 8, m.cell), Enum.Material.Snow)
				end
				breathe()
			end
		end
	end
end

local function buildRoads(root)
	local roadsFolder = folder("Roads", root)
	for _, r in MapData.roads do
		local style = STYLE[r.kind] or STYLE.street
		local model = Instance.new("Model")
		model.Name = r.code .. " " .. r.name
		model:SetAttribute("Name", r.name)
		model:SetAttribute("Code", r.code)
		model:SetAttribute("Kind", r.kind)
		model:SetAttribute("City", r.city)
		model.Parent = roadsFolder

		local pts = r.points
		for i = 1, #pts - 1 do
			slab(model, "Road", pts[i], pts[i + 1], r.width, THICK, r.top, style.color, style.material)
			if style.line and Config.MAP_CENTRE_LINES then
				slab(model, "Line", pts[i], pts[i + 1], 0.8, 0.2, r.top + 0.02, LINE_COLOR, Enum.Material.SmoothPlastic)
			end
		end
		-- round off every bend (and the seam of a loop) so there are no gaps
		local last = if r.closed then #pts else #pts - 1
		for i = 2, last do
			local p = pts[i]
			disc(model, "Bend", p[1], p[2], r.width, THICK, r.top - 0.02, style.color, style.material)
		end
	end
end

local function buildJunctions(root)
	local f = folder("Junctions", root)
	for _, j in MapData.junctions do
		local width, top = 0, 0
		local names = {}
		for _, k in j.roads do
			local r = MapData.roads[k]
			width = math.max(width, r.width)
			top = math.max(top, r.top)
			table.insert(names, r.name)
		end
		local pad = disc(f, table.concat(names, " & "), j.pos[1], j.pos[2], width, THICK, top + 0.03,
			STYLE.highway.color, Enum.Material.Asphalt)
		pad:SetAttribute("Roads", table.concat(names, " & "))
	end
end

local function buildSigns(root)
	local f = folder("Signs", root)
	for _, s in MapData.signs do
		local x, z = s.pos[1], s.pos[2]
		local model = Instance.new("Model")
		local names = {}
		for _, b in s.blades do
			table.insert(names, MapData.roads[b.road].name)
		end
		model.Name = table.concat(names, " / ")
		model.Parent = f

		part(model, "Post", Vector3.new(0.6, 14, 0.6), CFrame.new(x, 7, z), POST_COLOR, Enum.Material.Metal)
		for i, b in s.blades do
			local r = MapData.roads[b.road]
			local len = math.max(8, #r.name * 0.75 + 3)
			local dir = Vector3.new(b.dir[1], 0, b.dir[2])
			local blade = part(
				model,
				"Blade",
				Vector3.new(len, 2.2, 0.25),
				CFrame.fromMatrix(Vector3.new(x, 13.2 - (i - 1) * 2.6, z), dir, Vector3.yAxis),
				SIGN_COLOR,
				Enum.Material.SmoothPlastic
			)
			blade:SetAttribute("Road", r.name)
			blade:SetAttribute("Code", r.code)
			signText(blade, Enum.NormalId.Front, r.name)
			signText(blade, Enum.NormalId.Back, r.name)
		end
	end
end

local function buildLabels(root)
	local f = folder("Labels", root)
	if Config.MAP_FLOATING_ROAD_NAMES then
		for _, r in MapData.roads do
			floatingText(f, r.name, Vector3.new(r.label[1], 45, r.label[2]), 10, Color3.new(1, 1, 1), 2500)
		end
	end
	for _, c in MapData.cities do
		floatingText(f, c.code, Vector3.new(c.centre[1], 450, c.centre[2]), 120, Color3.fromRGB(255, 247, 214), 1e6)
	end
	for _, m in MapData.landmarks do
		local y = if m.kind == "mountain" then 800 else 160
		floatingText(f, m.name, Vector3.new((m.x0 + m.x1) / 2, y, (m.z0 + m.z1) / 2), 30, Color3.fromRGB(255, 247, 214), 1e6)
	end
end

local function buildAirport(root)
	local f = folder("Airport", root)
	local r = MapData.runway
	local a = { r.x0, (r.z0 + r.z1) / 2 }
	local b = { r.x1, (r.z0 + r.z1) / 2 }
	slab(f, "Runway", a, b, r.z1 - r.z0, THICK, 1.0, Color3.fromRGB(50, 52, 55), Enum.Material.Asphalt)
	slab(f, "Centreline", a, b, 2, 0.2, 1.02, Color3.new(1, 1, 1), Enum.Material.SmoothPlastic)
end

local function buildSpawns(root)
	local f = folder("Spawns", root)
	for _, c in MapData.cities do
		local spawn = Instance.new("SpawnLocation")
		spawn.Name = "Spawn " .. c.code .. " (" .. c.spawnName .. ")"
		spawn.Anchored = true
		spawn.Neutral = true
		spawn.Duration = 0
		spawn.Size = Vector3.new(12, 1, 12)
		spawn.Position = Vector3.new(c.spawn[1], c.spawnTop + 0.55, c.spawn[2])
		spawn.Color = Color3.fromRGB(61, 220, 132)
		spawn.Material = Enum.Material.SmoothPlastic
		spawn.Transparency = 0.4
		spawn.TopSurface = Enum.SurfaceType.Smooth
		spawn.Parent = f
	end
end

-- ------------------------------------------------------------
-- Public
-- ------------------------------------------------------------

function MapBuilder.Build()
	local started = os.clock()
	print("[Map] Building the island…")

	local old = workspace:FindFirstChild("Map")
	if old then
		old:Destroy()
		workspace.Terrain:Clear()
	end
	-- The Baseplate template's floor and spawn sit in the middle of the island.
	if Config.MAP_REMOVE_TEMPLATE_BASEPLATE then
		for _, name in { "Baseplate", "SpawnLocation" } do
			local thing = workspace:FindFirstChild(name)
			if thing then
				thing:Destroy()
			end
		end
	end
	-- Big maps should stream (only nearby parts load on phones). Only settable in Edit mode.
	pcall(function()
		workspace.StreamingEnabled = true
	end)

	local root = Instance.new("Folder")
	root.Name = "Map"
	root.Parent = workspace

	buildSpawns(root) -- first, so anyone joining mid-build has somewhere to stand
	print("[Map] terrain…")
	buildTerrain()
	print("[Map] roads…")
	buildRoads(root)
	buildJunctions(root)
	buildAirport(root)
	print("[Map] signs and labels…")
	buildSigns(root)
	buildLabels(root)

	local parts = 0
	for _, d in root:GetDescendants() do
		if d:IsA("BasePart") then
			parts += 1
		end
	end
	print(string.format(
		"[Map] Done in %.1fs: %d roads, %d junctions, %d signs, %d parts",
		os.clock() - started,
		#MapData.roads,
		#MapData.junctions,
		#MapData.signs,
		parts
	))
	return root
end

return MapBuilder
