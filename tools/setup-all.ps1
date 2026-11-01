<#
.SYNOPSIS
  One script for everything: the FiveM server AND the Lua + FiveM dev environment.

.DESCRIPTION
  1. Installs Git if it's missing, and gets the repo on the dev branch
  2. Makes sure the editor settings and the Lua test command are in the repo
  3. Runs tools\setup-server.ps1: FXServer, base resources, server.cfg, your key, start.bat
  4. Runs tools\setup-dev.ps1: Node, VS Code, Lua, extensions, links the server to
     the repo, runs the tests, opens VS Code

  Safe to run again: each step skips what's already done.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\setup-all.ps1
  powershell -ExecutionPolicy Bypass -File .\setup-all.ps1 -AdminFivemId 1234567 -Start
#>
param(
    [string] $Root = 'C:\FXServer',
    [string] $RepoPath = (Join-Path $HOME 'tanner-and-haydens-fourtune'),
    [string] $Branch = 'claude/knowledge-base-nodejs-qe6jfx',
    [ValidateSet('Lua', 'JS')] [string] $Engine = 'Lua',
    [string] $AdminFivemId = '',
    [int] $MaxClients = 48,
    [switch] $Start
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$RepoUrl = 'https://github.com/Tgood91/tanner-and-haydens-fourtune.git'

function Step($msg) { Write-Host ''; Write-Host "######## $msg" -ForegroundColor Magenta }
function Ok($msg)   { Write-Host "    $msg" -ForegroundColor Green }
function Has($cmd)  { [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }
function RefreshPath {
    $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
}

# ---------------------------------------------------------------- 1. git and the repo
Step '1/4  Git and the repo'
if (-not (Has 'git')) {
    if (-not (Has 'winget')) { throw 'winget is missing. Install "App Installer" from the Microsoft Store, then run this again.' }
    winget install --id Git.Git -e --silent --accept-package-agreements --accept-source-agreements | Out-Null
    RefreshPath
    if (-not (Has 'git')) { throw 'Git installed. Close this window, open a new one, and run this script again.' }
}
Ok "git $((git --version) -replace 'git version ', '')"

if (Test-Path (Join-Path $RepoPath '.git')) {
    git -C $RepoPath fetch origin --prune | Out-Null
    if (-not (git -C $RepoPath status --porcelain)) {
        git -C $RepoPath checkout $Branch 2>&1 | Out-Null
        git -C $RepoPath pull --ff-only origin $Branch 2>&1 | Out-Null
    }
    Ok "repo ready at $RepoPath"
} else {
    git clone $RepoUrl $RepoPath
    if ($LASTEXITCODE -ne 0) { throw 'git clone failed. If the repo is private, sign in when Git asks, then run this again.' }
    git -C $RepoPath checkout $Branch 2>&1 | Out-Null
    Ok "cloned to $RepoPath"
}

# ---------------------------------------------------------------- 2. editor settings and the Lua test command
Step '2/4  Editor settings'
$vs = Join-Path $RepoPath '.vscode'
New-Item -ItemType Directory -Force -Path $vs | Out-Null
$ext = Join-Path $vs 'extensions.json'
if (-not (Test-Path $ext)) {
    Set-Content -Path $ext -Encoding UTF8 -Value @'
{
  "recommendations": [
    "sumneko.lua",
    "overextended.cfxlua-vscode",
    "dbaeumer.vscode-eslint",
    "eamodio.gitlens"
  ]
}
'@
    Ok 'wrote .vscode\extensions.json'
} else { Ok '.vscode\extensions.json already there' }

$set = Join-Path $vs 'settings.json'
if (-not (Test-Path $set)) {
    Set-Content -Path $set -Encoding UTF8 -Value @'
{
  // FiveM runs Lua 5.4 (fxmanifest: lua54 'yes')
  "Lua.runtime.version": "Lua 5.4",
  // FiveM globals, so the editor doesn't flag them as undefined.
  // The CfxLua extension adds every native (GetEntityCoords, ...) on top of these.
  "Lua.diagnostics.globals": [
    "Citizen", "CreateThread", "Wait", "SetTimeout",
    "RegisterCommand", "RegisterNetEvent", "AddEventHandler", "TriggerEvent",
    "TriggerServerEvent", "TriggerClientEvent", "RegisterNUICallback", "SendNUIMessage",
    "exports", "source", "GetPlayerName", "GetPlayers", "GetCurrentResourceName",
    "json", "vector3", "vec3", "lib",
    "fx_version", "game", "description", "dependencies", "server_script", "server_scripts",
    "client_script", "client_scripts", "shared_script", "files", "ui_page", "lua54",
    "FourtuneWorldData"
  ],
  "Lua.workspace.ignoreDir": ["node_modules", "island-roads", "island-terrain", "island-buildings"],
  "files.associations": { "fxmanifest.lua": "lua", "*.cfg": "properties" },
  "editor.formatOnSave": false
}
'@
    Ok 'wrote .vscode\settings.json'
} else { Ok '.vscode\settings.json already there' }

$pkgPath = Join-Path $RepoPath 'package.json'
if (Test-Path $pkgPath) {
    $pkg = Get-Content $pkgPath -Raw | ConvertFrom-Json
    if (-not $pkg.scripts.'test:lua') {
        $pkg.scripts | Add-Member -NotePropertyName 'test:lua' -NotePropertyValue 'lua world/test.lua && lua crew/test.lua && lua world-map/test.lua'
        $pkg | ConvertTo-Json -Depth 10 | Set-Content -Path $pkgPath -Encoding UTF8
        Ok 'added npm run test:lua to package.json'
    } else { Ok 'npm run test:lua already there' }
}

$serverScript = Join-Path $RepoPath 'tools\setup-server.ps1'
$devScript = Join-Path $RepoPath 'tools\setup-dev.ps1'
foreach ($s in $serverScript, $devScript) {
    if (-not (Test-Path $s)) { throw "$s is missing. Check that $RepoPath is on the branch $Branch." }
}

# ---------------------------------------------------------------- 3. the server
Step '3/4  The FiveM server (tools\setup-server.ps1)'
$serverArgs = @{ Root = $Root; Engine = $Engine; MaxClients = $MaxClients }
if ($AdminFivemId) { $serverArgs.AdminFivemId = $AdminFivemId }
& $serverScript @serverArgs

# ---------------------------------------------------------------- 4. the dev environment
Step '4/4  The dev environment (tools\setup-dev.ps1)'
& $devScript -RepoPath $RepoPath -Branch $Branch -ServerData (Join-Path $Root 'server-data')

# ---------------------------------------------------------------- done
Step 'All set'
$bat = Join-Path $Root 'server-data\start.bat'
Write-Host "    Server:   $bat"
Write-Host "    Code:     $RepoPath  (open in VS Code)"
Write-Host '    Join:     FiveM -> F8 ->  connect localhost:30120'
Write-Host '    Loop:     edit -> npm test -> server console: refresh, ensure world -> git commit, git push'
if ($Start -and (Test-Path $bat)) { Start-Process -FilePath $bat -WorkingDirectory (Join-Path $Root 'server-data') }
