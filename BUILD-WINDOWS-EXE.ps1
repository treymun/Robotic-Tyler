# Requires Node.js LTS and an internet connection for the initial build.
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
  Write-Host 'Node.js is not installed. Install the LTS release from https://nodejs.org and rerun.' -ForegroundColor Yellow
  Read-Host 'Press Enter to exit'; exit 1
}
Write-Host 'Installing Electron and Windows packaging dependencies...' -ForegroundColor Cyan
& npm.cmd install --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { Read-Host 'Installation failed. Press Enter'; exit 1 }
Write-Host 'Building the app installers and the Windows setup (needs MinGW-w64 for the setup)...' -ForegroundColor Cyan
& npm.cmd run build:win
if ($LASTEXITCODE -ne 0) { Read-Host 'Build failed. Press Enter'; exit 1 }
Write-Host 'Success! dist/setup has ROBOTIC-TYLER-Setup-<version>.exe; the app installers it uses are in dist/control-center and dist/native-steam-companion.' -ForegroundColor Green
Start-Process explorer.exe -ArgumentList (Join-Path $PSScriptRoot 'dist')
Read-Host 'Press Enter to exit'
