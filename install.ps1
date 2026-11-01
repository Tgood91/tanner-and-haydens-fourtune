<#
.SYNOPSIS
  Installs the Fourtune resources into a FiveM (FXServer) server on Windows.

.DESCRIPTION
  Gets this repo (git clone / pull, or the GitHub zip if git isn't installed), copies each
  resource into <ServerPath>\resources under its resource name, and adds the missing
  `ensure` lines to server.cfg (never twice; server.cfg is backed up first).

    world       <- world\         Lua: cities, districts, roads, /whereami /places /streets
    crew        <- crew\          Lua: crews and ranks
    world-map   <- world-map\     the in-game map (M or /map)
    fourtune    <- js-snippets\   the JavaScript game core (copied; only ensured with -Engine JS)

  `world` and `fourtune` overlap (see docs\RESOURCES.md), so only one is ensured:
  Lua by default, as decided on 29 Oct 2026.

.PARAMETER ServerPath
  Your server-data folder: the one holding server.cfg and resources\.

.PARAMETER Engine
  Lua (default) ensures world + crew. JS ensures fourtune instead.

.PARAMETER Source
  Where to keep the downloaded repo. Default: $HOME\fourtune-src

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\install.ps1 -ServerPath C:\FXServer\server-data
#>
param(
    [Parameter(Mandatory = $true)] [string] $ServerPath,
    [ValidateSet('Lua', 'JS')] [string] $Engine = 'Lua',
    [string] $Source = (Join-Path $HOME 'fourtune-src')
)
$ErrorActionPreference = 'Stop'
$Repo = 'https://github.com/Tgood91/tanner-and-haydens-fourtune'

# ---- 1. the server -----------------------------------------------------------
$Cfg = Join-Path $ServerPath 'server.cfg'
if (-not (Test-Path $Cfg)) {
    throw "No server.cfg in $ServerPath. Point -ServerPath at your server-data folder."
}
$Resources = Join-Path $ServerPath 'resources'
New-Item -ItemType Directory -Force -Path $Resources | Out-Null

# ---- 2. the code: git if it's there, otherwise the zip -----------------------
if (Get-Command git -ErrorAction SilentlyContinue) {
    if (Test-Path (Join-Path $Source '.git')) {
        Write-Host "Updating $Source"
        git -C $Source pull --ff-only
    } else {
        Write-Host "Cloning into $Source"
        git clone --depth 1 "$Repo.git" $Source
    }
    if ($LASTEXITCODE -ne 0) { throw "git failed (exit $LASTEXITCODE)." }
} else {
    Write-Host "git not found: downloading the zip instead"
    $zip = Join-Path $env:TEMP 'fourtune-main.zip'
    Invoke-WebRequest "$Repo/archive/refs/heads/main.zip" -OutFile $zip -UseBasicParsing
    $unz = Join-Path $env:TEMP 'fourtune-main'
    if (Test-Path $unz) { Remove-Item $unz -Recurse -Force }
    Expand-Archive $zip -DestinationPath $unz
    if (Test-Path $Source) { Remove-Item $Source -Recurse -Force }
    Move-Item (Join-Path $unz 'tanner-and-haydens-fourtune-main') $Source
}

# ---- 3. copy each resource in under its own name -----------------------------
$Map = [ordered]@{ 'world' = 'world'; 'crew' = 'crew'; 'world-map' = 'world-map'; 'fourtune' = 'js-snippets' }
foreach ($name in $Map.Keys) {
    $from = Join-Path $Source $Map[$name]
    $to = Join-Path $Resources $name
    if (-not (Test-Path (Join-Path $from 'fxmanifest.lua'))) { throw "$from has no fxmanifest.lua; the download looks incomplete." }
    # /MIR keeps the server copy identical to the repo; tests and previews stay behind
    robocopy $from $to /MIR /NFL /NDL /NJH /NJS /NP /XF test.lua *.test.js preview*.png | Out-Null
    if ($LASTEXITCODE -ge 8) { throw "Copying $name failed (robocopy exit $LASTEXITCODE)." }
    Write-Host ("  {0,-10} <- {1}" -f $name, $Map[$name])
}

# ---- 4. server.cfg: add what's missing, never a duplicate --------------------
$want = @('chat', 'spawnmanager', 'sessionmanager')
$want += if ($Engine -eq 'Lua') { @('world', 'crew') } else { @('fourtune') }
$want += 'world-map'

$lines = Get-Content $Cfg
$has = @{}
foreach ($l in $lines) { if ($l -match '^\s*(ensure|start)\s+(\S+)') { $has[$Matches[2]] = $true } }
$add = @($want | Where-Object { -not $has[$_] })

$other = if ($Engine -eq 'Lua') { 'fourtune' } else { 'world' }
if ($has[$other]) {
    Write-Warning "server.cfg already ensures '$other'. It overlaps '$(if ($Engine -eq 'Lua') {'world'} else {'fourtune'})' (docs\RESOURCES.md): comment one out."
}

if ($add.Count -gt 0) {
    Copy-Item $Cfg "$Cfg.bak-$(Get-Date -Format yyyyMMdd-HHmmss)"
    $block = @('', "# ---- Fourtune ($Engine), added by install.ps1 ----") + ($add | ForEach-Object { "ensure $_" })
    Add-Content -Path $Cfg -Value $block
    Write-Host "server.cfg: added $($add -join ', ') (backup saved next to it)"
} else {
    Write-Host 'server.cfg: every ensure line was already there'
}

Write-Host ''
Write-Host "Done. Start the server and type /streets or press M in game."
Write-Host "Update later by running this script again."
