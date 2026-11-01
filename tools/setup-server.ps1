<#
.SYNOPSIS
  Sets up a whole FiveM server for Fourtune on Windows, from nothing.

.DESCRIPTION
  1. Downloads FXServer (the Recommended build) into <Root>\server
  2. Gets cfx-server-data (chat, spawnmanager, basic-gamemode, ...) into <Root>\server-data
  3. Gets this repo and copies world, crew and world-map into resources\
     (or fourtune, with -Engine JS)
  4. Writes server.cfg, a separate secrets.cfg holding your license key, and start.bat
  5. Opens port 30120 in Windows Firewall (when run as Administrator)

  Safe to run again: it updates the code and resources, and keeps your
  server.cfg and secrets.cfg unless you pass -Force.

.PARAMETER Root
  Where everything goes. Default C:\FXServer

.PARAMETER Engine
  Lua (default): world + crew + basic-gamemode. JS: fourtune, which spawns players itself.

.PARAMETER AdminFivemId
  Your FiveM account number, for in-game admin (the number in identifier.fivem:XXXX).

.PARAMETER MaxClients
  Player slots. Default 8.

.PARAMETER Force
  Rewrite server.cfg / secrets.cfg even if they exist (the old ones are backed up).

.PARAMETER Start
  Start the server when setup is done.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\setup-server.ps1
  powershell -ExecutionPolicy Bypass -File .\setup-server.ps1 -AdminFivemId 1234567 -Start
#>
param(
    [string] $Root = 'C:\FXServer',
    [ValidateSet('Lua', 'JS')] [string] $Engine = 'Lua',
    [string] $AdminFivemId = '',
    [int] $MaxClients = 8,
    [switch] $Force,
    [switch] $Start
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'      # makes Invoke-WebRequest much faster
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Server     = Join-Path $Root 'server'
$Data       = Join-Path $Root 'server-data'
$Resources  = Join-Path $Data 'resources'
$Src        = Join-Path $Root 'fourtune-src'
$Tmp        = Join-Path $env:TEMP 'fourtune-setup'
$FourtuneGit = 'https://github.com/Tgood91/tanner-and-haydens-fourtune'
$CfxDataGit  = 'https://github.com/citizenfx/cfx-server-data'

function Step($msg) { Write-Host ''; Write-Host "==> $msg" -ForegroundColor Cyan }
function Ok($msg)   { Write-Host "    $msg" -ForegroundColor Green }
function HasGit     { [bool](Get-Command git -ErrorAction SilentlyContinue) }

# Clone or update a GitHub repo; without git, download its zip instead
function Get-Repo($url, $branch, $dest) {
    if (HasGit) {
        if (Test-Path (Join-Path $dest '.git')) {
            git -C $dest pull --ff-only | Out-Null
            if ($LASTEXITCODE -ne 0) { throw "git pull failed in $dest" }
            Ok "updated $dest"
        } else {
            if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
            git clone --depth 1 --branch $branch "$url.git" $dest | Out-Null
            if ($LASTEXITCODE -ne 0) { throw "git clone $url failed" }
            Ok "cloned into $dest"
        }
        return
    }
    $name = ($url -split '/')[-1]
    $zip = Join-Path $Tmp "$name.zip"
    Invoke-WebRequest "$url/archive/refs/heads/$branch.zip" -OutFile $zip -UseBasicParsing
    $unz = Join-Path $Tmp $name
    if (Test-Path $unz) { Remove-Item $unz -Recurse -Force }
    Expand-Archive $zip -DestinationPath $unz
    if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
    Move-Item (Join-Path $unz "$name-$branch") $dest
    Ok "downloaded into $dest (no git found, used the zip)"
}

New-Item -ItemType Directory -Force -Path $Root, $Server, $Tmp | Out-Null

# ---------------------------------------------------------------- 1. FXServer
Step 'FXServer (the server program)'
$exe = Join-Path $Server 'FXServer.exe'
if ((Test-Path $exe) -and -not $Force) {
    Ok "already installed at $exe (use -Force to re-download)"
} else {
    # The same feed txAdmin uses: tells us which build is Recommended and where it is
    $info = Invoke-RestMethod 'https://changelogs-live.fivem.net/api/changelog/versions/win32/server'
    $url = $info.recommended_download
    if (-not $url) { throw "Couldn't find the Recommended build. Download server.7z by hand from https://runtime.fivem.net/artifacts/fivem/build_server_windows/master/ and extract it into $Server" }
    Ok "Recommended build $($info.recommended)"
    $archive = Join-Path $Tmp 'server.7z'
    Invoke-WebRequest $url -OutFile $archive -UseBasicParsing

    # .7z: use 7-Zip if it's installed, otherwise Windows' own tar (Windows 11 reads .7z)
    $sevenZip = @("$env:ProgramFiles\7-Zip\7z.exe", "${env:ProgramFiles(x86)}\7-Zip\7z.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
    if ($sevenZip) {
        & $sevenZip x $archive "-o$Server" -y | Out-Null
    } else {
        tar -xf $archive -C $Server
    }
    if (-not (Test-Path $exe)) {
        throw "Couldn't unpack server.7z. Install 7-Zip (https://www.7-zip.org) and run this again, or extract $archive into $Server yourself."
    }
    Ok "installed $exe"
}

# ---------------------------------------------------------------- 2. base resources
Step 'cfx-server-data (chat, spawnmanager, basic-gamemode, ...)'
if (Test-Path (Join-Path $Data 'resources\[gamemodes]')) {
    if (Test-Path (Join-Path $Data '.git')) { Get-Repo $CfxDataGit 'master' $Data } else { Ok 'already there' }
} else {
    $keep = @()
    foreach ($f in 'server.cfg', 'secrets.cfg', 'start.bat') { if (Test-Path (Join-Path $Data $f)) { $keep += $f } }
    if ($keep.Count) { foreach ($f in $keep) { Copy-Item (Join-Path $Data $f) (Join-Path $Tmp $f) -Force } }
    Get-Repo $CfxDataGit 'master' $Data
    foreach ($f in $keep) { Copy-Item (Join-Path $Tmp $f) (Join-Path $Data $f) -Force }
}

# ---------------------------------------------------------------- 3. our resources
Step 'Fourtune resources'
Get-Repo $FourtuneGit 'main' $Src
$map = [ordered]@{ 'world' = 'world'; 'crew' = 'crew'; 'world-map' = 'world-map'; 'fourtune' = 'js-snippets' }
foreach ($name in $map.Keys) {
    $from = Join-Path $Src $map[$name]
    $to = Join-Path $Resources $name
    if (-not (Test-Path (Join-Path $from 'fxmanifest.lua'))) { Write-Warning "skipped ${name}: $from has no fxmanifest.lua"; continue }
    # /MIR keeps the server copy identical to the repo; tests and previews stay behind
    robocopy $from $to /MIR /NFL /NDL /NJH /NJS /NP /XF test.lua *.test.js preview*.png | Out-Null
    if ($LASTEXITCODE -ge 8) { throw "copying $name failed (robocopy exit $LASTEXITCODE)" }
    Ok ("{0,-10} <- {1}" -f $name, $map[$name])
}

# ---------------------------------------------------------------- 4. config files
Step 'server.cfg, secrets.cfg, start.bat'
$cfg = Join-Path $Data 'server.cfg'
$secrets = Join-Path $Data 'secrets.cfg'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'

if ((Test-Path $secrets) -and -not $Force) {
    Ok 'secrets.cfg kept (your key is already in it)'
} else {
    if (Test-Path $secrets) { Copy-Item $secrets "$secrets.bak-$stamp" }
    Write-Host '    Paste your license key from https://portal.cfx.re (it will not be shown):'
    $sec = Read-Host '    License key' -AsSecureString
    $key = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
    if (-not $key.Trim()) { throw 'No key entered. Get one at https://portal.cfx.re and run this again.' }
    Set-Content -Path $secrets -Encoding ASCII -Value @(
        '# secrets.cfg: your license key. Keep this file private: never commit it or share it.',
        "sv_licenseKey `"$($key.Trim())`""
    )
    Ok 'wrote secrets.cfg'
}

if ((Test-Path $cfg) -and -not $Force) {
    Ok 'server.cfg kept (use -Force to rewrite it; the old one is backed up)'
} else {
    if (Test-Path $cfg) { Copy-Item $cfg "$cfg.bak-$stamp"; Ok "backed up the old server.cfg" }
    if ($Engine -eq 'Lua') {
        $ours = @(
            'ensure basic-gamemode      # spawns players; the Lua resources do not do it themselves',
            '',
            '# ---- ours: Lua, as decided 29 Oct 2026 ----',
            'ensure world',
            'ensure crew',
            'ensure world-map           # press M or type /map in game',
            '',
            '# The JavaScript version overlaps world. Never run both:',
            '# ensure fourtune'
        )
    } else {
        $ours = @(
            '# basic-gamemode is left out: fourtune spawns players itself',
            '',
            '# ---- ours: JavaScript ----',
            'ensure fourtune',
            'ensure world-map           # press M or type /map in game',
            '',
            '# The Lua version overlaps fourtune. Never run both:',
            '# ensure world',
            '# ensure crew'
        )
    }
    $admin = if ($AdminFivemId) { "add_principal identifier.fivem:$AdminFivemId group.admin" } else { '# add_principal identifier.fivem:YOUR_ID group.admin   # run setup again with -AdminFivemId' }
    $lines = @(
        '# ============================================================',
        "# server.cfg: Tanner & Hayden's Fourtune ($Engine). Written by setup-server.ps1",
        '# ============================================================',
        '',
        '# ---- network: players connect on port 30120 ----',
        'endpoint_add_tcp "0.0.0.0:30120"',
        'endpoint_add_udp "0.0.0.0:30120"',
        '',
        '# ---- base resources (cfx-server-data) ----',
        'ensure mapmanager',
        'ensure chat',
        'ensure spawnmanager',
        'ensure sessionmanager',
        'ensure hardcap',
        'ensure rconlog'
    ) + $ours + @(
        '',
        '# ---- server info ----',
        "sv_hostname `"Tanner & Hayden's Fourtune`"",
        'sets sv_projectName "Fourtune"',
        'sets sv_projectDesc "1017 - 770 - 312"',
        'sets tags "roleplay"',
        'sets locale "en-US"',
        "sv_maxclients $MaxClients",
        '',
        'set onesync on             # needed by fourtune; harmless for the Lua resources',
        'sv_scriptHookAllowed 0',
        'set steam_webApiKey "none"',
        '',
        '# ---- admin ----',
        'add_ace group.admin command allow',
        'add_ace group.admin command.quit deny',
        $admin,
        '',
        '# ---- the license key lives in secrets.cfg, so this file is safe to share ----',
        'exec secrets.cfg'
    )
    Set-Content -Path $cfg -Encoding ASCII -Value $lines
    Ok 'wrote server.cfg'
}

$bat = Join-Path $Data 'start.bat'
Set-Content -Path $bat -Encoding ASCII -Value @(
    '@echo off',
    'title Fourtune server',
    "cd /d `"$Data`"",
    "`"$exe`" +exec server.cfg",
    'pause'
)
Ok 'wrote start.bat'

# ---------------------------------------------------------------- 5. firewall
Step 'Windows Firewall, port 30120'
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if ($isAdmin) {
    foreach ($proto in 'TCP', 'UDP') {
        $rule = "FiveM 30120 $proto"
        if (-not (Get-NetFirewallRule -DisplayName $rule -ErrorAction SilentlyContinue)) {
            New-NetFirewallRule -DisplayName $rule -Direction Inbound -Protocol $proto -LocalPort 30120 -Action Allow | Out-Null
        }
    }
    Ok 'opened TCP and UDP 30120'
} else {
    Write-Host '    Skipped: not running as Administrator. Only needed for friends on other networks.' -ForegroundColor Yellow
    Write-Host '    To open it later, run this in an Administrator PowerShell:'
    Write-Host '      New-NetFirewallRule -DisplayName "FiveM 30120 TCP" -Direction Inbound -Protocol TCP -LocalPort 30120 -Action Allow'
    Write-Host '      New-NetFirewallRule -DisplayName "FiveM 30120 UDP" -Direction Inbound -Protocol UDP -LocalPort 30120 -Action Allow'
}

# ---------------------------------------------------------------- done
Step 'Done'
Write-Host "    Start it:   double-click $bat"
Write-Host '    Join it:    open FiveM, press F8, type   connect localhost:30120'
Write-Host '    Try:        /streets  /whereami  /crews  and press M'
Write-Host '    Update:     run this script again'
if ($Start) { Start-Process -FilePath $bat -WorkingDirectory $Data }
