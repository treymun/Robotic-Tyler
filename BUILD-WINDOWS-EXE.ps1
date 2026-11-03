# Builds the Windows downloads: the desktop app installer and ROBOTIC-TYLER-Setup-<version>.exe.
# Requires Node.js LTS, the .NET 8 SDK (for the audio helper) and an internet connection; the
# setup also needs MinGW-w64 (winget install BrechtSanders.WinLibs.POSIX.UCRT).
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) { Write-Host 'Install Node.js LTS from https://nodejs.org and rerun.' -ForegroundColor Yellow; Read-Host 'Press Enter to exit'; exit 1 }
if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) { Write-Host 'Install the .NET 8 SDK from https://dotnet.microsoft.com/download and rerun.' -ForegroundColor Yellow; Read-Host 'Press Enter to exit'; exit 1 }
Write-Host 'Building the Windows audio helper (NAudio / WASAPI)...' -ForegroundColor Cyan
& dotnet publish 'windows-audio-bridge/RoboticTylerAudio.csproj' -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:EnableCompressionInSingleFile=true -o 'windows-audio-bridge/publish'
if ($LASTEXITCODE -ne 0) { Read-Host 'Audio helper build failed. Press Enter'; exit 1 }
& npm.cmd install --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { Read-Host 'Installation failed. Press Enter'; exit 1 }
& npm.cmd run build:desktop
if ($LASTEXITCODE -ne 0) { Read-Host 'Build failed. Press Enter'; exit 1 }
if (Get-Command gcc -ErrorAction SilentlyContinue) {
  & npm.cmd run build:setup
  if ($LASTEXITCODE -ne 0) { Read-Host 'Building the setup failed. Press Enter'; exit 1 }
  Write-Host 'Success! dist/setup has ROBOTIC-TYLER-Setup-<version>.exe; dist/desktop has the desktop installer it uses.' -ForegroundColor Green
} else {
  Write-Host 'Built dist/desktop. Skipped the setup: install MinGW-w64 first, open a new window and run this again.' -ForegroundColor Yellow
}
Start-Process explorer.exe -ArgumentList (Join-Path $PSScriptRoot 'dist')
Read-Host 'Press Enter to exit'
