#Requires -Version 5.1
<#
  Windows autostart via Scheduled Task (runs at logon).
  Usage:
      powershell -ExecutionPolicy Bypass -File scripts\autostart-windows.ps1 install [-Node <node.exe>] [-Cli <omniroute.mjs>]
      ... status | uninstall
  A Scheduled Task is used rather than a Startup-folder shortcut so the job
  is inspectable, has a stable name, and runs hidden.
#>
param(
  [ValidateSet("install","uninstall","remove","disable","status")][string]$Action = "install",
  [string]$Node = "",
  [string]$Cli = ""
)
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$TaskName = "OmniRoute Autostart"

if (Test-Path "$Root\.env") {
  Get-Content "$Root\.env" | ForEach-Object {
    if ($_ -match '^\s*(OMNIROUTE_HOST|OMNIROUTE_PORT|OMNIROUTE_SOURCE_DIR)\s*=\s*(.*)$') {
      $v = $Matches[2].Trim().Trim('"').Trim("'")
      if ($v) { Set-Item -Path "Env:$($Matches[1])" -Value $v }
    }
  }
}
$OrHost = if ($env:OMNIROUTE_HOST) { $env:OMNIROUTE_HOST } else { "127.0.0.1" }
$Port   = if ($env:OMNIROUTE_PORT) { $env:OMNIROUTE_PORT } else { "20128" }

switch ($Action) {
  { $_ -in "uninstall","remove","disable" } {
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
    Write-Host "  [ok] autostart removed" -ForegroundColor Green
    exit 0
  }
  "status" {
    $t = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if ($t) {
      $i = Get-ScheduledTaskInfo -TaskName $TaskName
      Write-Host "  state       : $($t.State)"
      Write-Host "  last run    : $($i.LastRunTime)"
      Write-Host "  last result : $($i.LastTaskResult)  (0 = ok)"
    } else { Write-Host "  not installed" }
    exit 0
  }
}

if (-not $Node) { $Node = (Get-Command node -ErrorAction SilentlyContinue).Source }
if (-not $Cli) {
  $Cli = if ($env:OMNIROUTE_SOURCE_DIR) { Join-Path $env:OMNIROUTE_SOURCE_DIR "bin\omniroute.mjs" }
         else { Join-Path $Root "runtime\node_modules\omniroute\bin\omniroute.mjs" }
}
if (-not $Node -or -not (Test-Path $Node)) { Write-Host "  [x] node.exe not found" -ForegroundColor Red; exit 1 }
if (-not (Test-Path $Cli)) { Write-Host "  [x] $Cli not found - run the installer" -ForegroundColor Red; exit 1 }

$LogDir = Join-Path $env:USERPROFILE ".omniroute\logs"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$cmdLine = "/c set OMNIROUTE_SERVER_HOST=$OrHost&& set PORT=$Port&& `"$Node`" `"$Cli`" serve --no-tray --no-open >> `"$LogDir\autostart.log`" 2>&1"
$action    = New-ScheduledTaskAction -Execute "cmd.exe" -Argument $cmdLine
$trigger   = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings  = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
               -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero) -Hidden
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited

Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `
  -Settings $settings -Principal $principal `
  -Description "Starts the OmniRoute AI gateway at logon (loopback only)." | Out-Null
Start-ScheduledTask -TaskName $TaskName

Write-Host "  [ok] autostart installed and started (scheduled task '$TaskName')" -ForegroundColor Green
