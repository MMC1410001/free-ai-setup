#Requires -Version 5.1
<#
  OmniRoute for Claude Code - installer for Windows.

  One line (PowerShell):
    irm https://raw.githubusercontent.com/MMC1410001/free-ai-setup/main/install.ps1 | iex

  From a downloaded copy: double-click Install-Windows.cmd, or
    powershell -ExecutionPolicy Bypass -File install.ps1 [--kiro|--no-kiro] [--no-autostart] [--uninstall]
#>
$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
$ProgressPreference = "SilentlyContinue"

$Repo   = "MMC1410001/free-ai-setup"
$Branch = if ($env:OMNI_BRANCH) { $env:OMNI_BRANCH } else { "main" }
$Dest   = if ($env:FREE_AI_SETUP_DIR) { $env:FREE_AI_SETUP_DIR } else { Join-Path $env:USERPROFILE ".free-ai-setup" }
$PassArgs = @($args)

function Say ($m) { Write-Host "`n$m" -ForegroundColor White }
function Die ($m) { Write-Host "  [x] $m" -ForegroundColor Red; throw $m }

function Update-PathFromRegistry {
  $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
}

function Test-NodeOk {
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) { return $false }
  $v = (& node -v).TrimStart("v").Split(".")
  return ([int]$v[0] -gt 22) -or (([int]$v[0] -eq 22) -and ([int]$v[1] -ge 22))
}

# ---- Node.js 22.22+ --------------------------------------------
if (-not (Test-NodeOk)) {
  Say "Installing Node.js 24 LTS"
  if (Get-Command winget -ErrorAction SilentlyContinue) {
    winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
  } else {
    $base = "https://nodejs.org/dist/latest-v24.x"
    $arch = if ($env:PROCESSOR_ARCHITECTURE -eq "ARM64") { "arm64" } else { "x64" }
    $msi = ((Invoke-WebRequest "$base/SHASUMS256.txt" -UseBasicParsing).Content -split "`n" |
            Select-String -Pattern "node-v24[0-9.]*-$arch\.msi" | Select-Object -First 1).Matches[0].Value
    if (-not $msi) { Die "could not find the Node.js installer. Install it from https://nodejs.org" }
    $file = Join-Path $env:TEMP $msi
    Invoke-WebRequest "$base/$msi" -OutFile $file -UseBasicParsing
    Write-Host "  Windows asks for permission to install Node.js."
    Start-Process msiexec.exe -Wait -ArgumentList "/i `"$file`" /qb"
  }
  Update-PathFromRegistry
  if (-not (Test-NodeOk)) { Die "Node.js is still not available. Close this window, open a new PowerShell and run the installer again." }
}
Write-Host "  [ok] Node $(node -v)" -ForegroundColor Green

# ---- Get the setup files ----------------------------------------
function Copy-IntoDest ($src) {
  New-Item -ItemType Directory -Force -Path $Dest | Out-Null
  robocopy $src $Dest /E /NFL /NDL /NJH /NJS /NP /XD runtime state .git /XF .env | Out-Null
  if ($LASTEXITCODE -ge 8) { Die "copy to $Dest failed" }
  $global:LASTEXITCODE = 0
}

$SelfDir = $PSScriptRoot
if ($SelfDir -and (Test-Path (Join-Path $SelfDir "scripts\install.mjs"))) {
  if (Test-Path (Join-Path $SelfDir ".git")) { $Root = $SelfDir }
  else {
    Say "Copying setup files to $Dest"
    if ($SelfDir -ne $Dest) { Copy-IntoDest $SelfDir }
    $Root = $Dest
  }
} else {
  Say "Downloading setup files to $Dest"
  $tmp = Join-Path $env:TEMP ("free-ai-setup-" + [guid]::NewGuid().ToString("N"))
  New-Item -ItemType Directory -Force -Path $tmp | Out-Null
  $zip = Join-Path $tmp "src.zip"
  Invoke-WebRequest "https://codeload.github.com/$Repo/zip/refs/heads/$Branch" -OutFile $zip -UseBasicParsing
  Expand-Archive -Path $zip -DestinationPath $tmp -Force
  $src = Get-ChildItem $tmp -Directory | Select-Object -First 1
  Copy-IntoDest $src.FullName
  Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
  $Root = $Dest
}

$Script = if ($PassArgs -contains "--uninstall") { "uninstall.mjs" } else { "install.mjs" }
& node (Join-Path $Root "scripts\$Script") @PassArgs
if ($LASTEXITCODE -ne 0) { Write-Host "`n  Setup stopped with an error (see above)." -ForegroundColor Red }
