#Requires -Version 5.1
# Kept for older docs. The installer now lives in scripts\install.mjs.
& (Join-Path (Split-Path -Parent $PSScriptRoot) "install.ps1") @args
