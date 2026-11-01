<#
.SYNOPSIS
  Sets up a Lua + FiveM dev environment on Windows: tools, repo, editor, server links, tests.

.DESCRIPTION
  1. Installs Git, Node.js LTS and VS Code (winget), and Lua 5.4 (Scoop), if missing
  2. Sets your git name and email if they aren't set
  3. Clones the repo (or updates it) and checks out the dev branch
  4. Installs the VS Code extensions: Lua, CfxLua (every FiveM native), ESLint, GitLens
  5. Links the server's resources to the repo, so an edit shows up after `ensure world`
     (junctions: no Administrator needed). Old copies are moved to resource-backups\
  6. Runs npm ci, the JavaScript tests and the Lua tests, then opens VS Code

  Safe to run again: everything already done is skipped.

.PARAMETER RepoPath
  Where the repo lives. Default: $HOME\tanner-and-haydens-fourtune

.PARAMETER Branch
  Branch to work on. Default: claude/knowledge-base-nodejs-qe6jfx

.PARAMETER ServerData
  Your FXServer server-data folder (holds server.cfg). Default: C:\FXServer\server-data
  Skipped if it doesn't exist yet: run setup-server.ps1 first, then this again.

.PARAMETER NoServerLinks
  Don't touch the server's resources folder.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\setup-dev.ps1
#>
param(
    [string] $RepoPath = (Join-Path $HOME 'tanner-and-haydens-fourtune'),
    [string] $Branch = 'claude/knowledge-base-nodejs-qe6jfx',
    [string] $ServerData = 'C:\FXServer\server-data',
    [switch] $NoServerLinks
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$RepoUrl = 'https://github.com/Tgood91/tanner-and-haydens-fourtune.git'

function Step($msg) { Write-Host ''; Write-Host "==> $msg" -ForegroundColor Cyan }
function Ok($msg)   { Write-Host "    $msg" -ForegroundColor Green }
function Warn($msg) { Write-Host "    $msg" -ForegroundColor Yellow }
function Has($cmd)  { [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }
function RefreshPath {
    $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
}
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

# ---------------------------------------------------------------- 1. tools
Step 'Tools: Git, Node.js, VS Code, Lua'
if (-not (Has 'winget')) {
    throw 'winget is missing. Install "App Installer" from the Microsoft Store, then run this again.'
}
$apps = @(
    @{ cmd = 'git';  id = 'Git.Git';                    name = 'Git' },
    @{ cmd = 'node'; id = 'OpenJS.NodeJS.LTS';          name = 'Node.js LTS' },
    @{ cmd = 'code'; id = 'Microsoft.VisualStudioCode'; name = 'VS Code' }
)
foreach ($a in $apps) {
    if (Has $a.cmd) { Ok "$($a.name) already installed"; continue }
    Write-Host "    installing $($a.name)..."
    winget install --id $a.id -e --silent --accept-package-agreements --accept-source-agreements | Out-Null
    RefreshPath
    if (Has $a.cmd) { Ok "installed $($a.name)" } else { Warn "$($a.name) installed, but '$($a.cmd)' isn't on PATH yet. Close this window and run the script again." }
}

if (Has 'lua') {
    Ok 'Lua already installed'
} else {
    if (-not (Has 'scoop')) {
        Write-Host '    installing Scoop (for Lua)...'
        Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser -Force
        if ($isAdmin) { Invoke-Expression "& {$(Invoke-RestMethod get.scoop.sh)} -RunAsAdmin" }
        else { Invoke-RestMethod get.scoop.sh | Invoke-Expression }
        RefreshPath
    }
    scoop install lua | Out-Null
    RefreshPath
    if (Has 'lua') { Ok "installed $(lua -v 2>&1)" } else { Warn "Lua didn't land on PATH. Try: scoop install lua" }
}
foreach ($c in 'git', 'node', 'npm') { if (-not (Has $c)) { throw "'$c' still isn't available. Close this window, open a new one, and run the script again." } }

# ---------------------------------------------------------------- 2. git identity
Step 'Git name and email (used on your commits)'
$gname = (git config --global user.name) 2>$null
$gmail = (git config --global user.email) 2>$null
if (-not $gname) { $gname = Read-Host '    Your name for commits'; git config --global user.name $gname }
if (-not $gmail) { $gmail = Read-Host '    Your email for commits'; git config --global user.email $gmail }
Ok "$gname <$gmail>"

# ---------------------------------------------------------------- 3. the repo
Step "Repo at $RepoPath ($Branch)"
if (Test-Path (Join-Path $RepoPath '.git')) {
    $dirty = git -C $RepoPath status --porcelain
    git -C $RepoPath fetch origin --prune | Out-Null
    if ($dirty) {
        Warn 'You have uncommitted changes, so the branch was left as it is. Commit them, then run this again to update.'
    } else {
        git -C $RepoPath checkout $Branch 2>&1 | Out-Null
        git -C $RepoPath pull --ff-only origin $Branch 2>&1 | Out-Null
        Ok "updated to the latest $Branch"
    }
} else {
    git clone $RepoUrl $RepoPath
    if ($LASTEXITCODE -ne 0) { throw 'git clone failed. If the repo is private, sign in when Git asks, then run this again.' }
    git -C $RepoPath checkout $Branch 2>&1 | Out-Null
    Ok "cloned and on $Branch"
}

# ---------------------------------------------------------------- 4. editor extensions
Step 'VS Code extensions'
if (Has 'code') {
    $have = code --list-extensions
    foreach ($ext in 'sumneko.lua', 'overextended.cfxlua-vscode', 'dbaeumer.vscode-eslint', 'eamodio.gitlens') {
        if ($have -contains $ext) { Ok "$ext already installed"; continue }
        code --install-extension $ext --force | Out-Null
        if ($LASTEXITCODE -eq 0) { Ok "installed $ext" } else { Warn "couldn't install $ext; add it from the Extensions panel" }
    }
} else {
    Warn "VS Code's 'code' command isn't on PATH yet. Open VS Code once, then run this again."
}

# ---------------------------------------------------------------- 5. link the server to the repo
Step 'Server resources linked to the repo'
$links = [ordered]@{ 'world' = 'world'; 'crew' = 'crew'; 'world-map' = 'world-map'; 'fourtune' = 'js-snippets' }
if ($NoServerLinks) {
    Ok 'skipped (-NoServerLinks)'
} elseif (-not (Test-Path (Join-Path $ServerData 'server.cfg'))) {
    Warn "No server at $ServerData yet. Run setup-server.ps1 first, then this again (or pass -ServerData <folder>)."
} else {
    $res = Join-Path $ServerData 'resources'
    $backups = Join-Path $ServerData 'resource-backups'   # outside resources\, so FiveM never loads a backup
    foreach ($name in $links.Keys) {
        $target = Join-Path $RepoPath $links[$name]
        $link = Join-Path $res $name
        $item = Get-Item $link -ErrorAction SilentlyContinue
        if ($item -and $item.LinkType -eq 'Junction' -and ((@($item.Target) -join '') -eq $target)) { Ok "$name already linked"; continue }
        if ($item) {
            New-Item -ItemType Directory -Force -Path $backups | Out-Null
            $dest = Join-Path $backups ("$name-" + (Get-Date -Format 'yyyyMMdd-HHmmss'))
            if ($item.LinkType) { $item.Delete() } else { Move-Item $link $dest }
            if (-not $item.LinkType) { Ok "moved the old copy of $name to $dest" }
        }
        New-Item -ItemType Junction -Path $link -Target $target | Out-Null
        Ok ("{0,-10} -> {1}" -f $name, $target)
    }
    Ok 'Edit in the repo, then in the server console:  refresh  then  ensure world'
}

# ---------------------------------------------------------------- 6. install and test
Step 'npm ci, then the tests'
Push-Location $RepoPath
try {
    npm ci --no-audit --no-fund | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'npm ci failed' }
    Ok 'npm ci done'

    $js = npm test 2>&1
    $sum = ($js | Select-String '^# (pass|fail)') -join ', '
    if ($LASTEXITCODE -eq 0) { Ok "JavaScript tests: $sum" } else { Warn "JavaScript tests FAILED: $sum. Run 'npm test' to see which." }

    if (Has 'lua') {
        npm run test:lua 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) { Ok 'Lua tests passed' } else { Warn "Lua tests FAILED. Run 'npm run test:lua' to see which." }
    } else {
        Warn 'Lua tests skipped (no lua yet)'
    }
} finally {
    Pop-Location
}

# ---------------------------------------------------------------- done
Step 'Done'
Write-Host "    Repo:        $RepoPath  (branch $Branch)"
Write-Host '    Every day:   edit -> npm test / npm run test:lua -> in the server console: refresh, ensure world -> git commit, git push'
Write-Host '    Find things: npm run kb -- search <words>'
if (Has 'code') { code $RepoPath }
