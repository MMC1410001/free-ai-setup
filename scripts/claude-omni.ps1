#Requires -Version 5.1
# Launch Claude Code against OmniRoute. Your default profile is untouched.
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path "$Root\.env")) { Write-Host "[x] .env not found - Copy-Item .env.example .env" -ForegroundColor Red; exit 1 }
Get-Content "$Root\.env" | ForEach-Object {
  if ($_ -match '^\s*([A-Z0-9_]+)\s*=\s*(.*)$') {
    $v = $Matches[2].Trim().Trim('"').Trim("'")
    if ($v) { Set-Item -Path "Env:$($Matches[1])" -Value $v }
  }
}
if (-not $env:OMNIROUTE_API_KEY) { Write-Host "[x] OMNIROUTE_API_KEY not set in .env" -ForegroundColor Red; exit 1 }
$Profile = if ($env:CLAUDE_PROFILE_DIR) { $env:CLAUDE_PROFILE_DIR } else { Join-Path $env:USERPROFILE ".claude\profiles\omniroute" }
if (-not (Test-Path $Profile)) { Write-Host "[x] profile missing - run scripts\setup.ps1 first" -ForegroundColor Red; exit 1 }
$OrHost = if ($env:OMNIROUTE_HOST) { $env:OMNIROUTE_HOST } else { "127.0.0.1" }
$Port   = if ($env:OMNIROUTE_PORT) { $env:OMNIROUTE_PORT } else { "20128" }
try { Invoke-WebRequest -Uri "http://${OrHost}:${Port}/" -TimeoutSec 3 -UseBasicParsing -MaximumRedirection 0 -ErrorAction Stop | Out-Null }
catch { if (-not $_.Exception.Response) {
  Write-Host "[x] OmniRoute is not running at http://${OrHost}:${Port}" -ForegroundColor Red
  Write-Host "    start it:  omniroute serve --no-tray --no-open --daemon"; exit 1 } }
$env:ANTHROPIC_AUTH_TOKEN = $env:OMNIROUTE_API_KEY
$env:CLAUDE_CONFIG_DIR    = $Profile
& claude @args
