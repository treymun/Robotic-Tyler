$ErrorActionPreference='Stop'
Set-Location -LiteralPath $PSScriptRoot
if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) { throw 'Install Node.js LTS from nodejs.org' }
if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) { throw 'Install the .NET 8 SDK from dotnet.microsoft.com/download' }
Write-Host 'Building Windows audio bridge (NAudio / WASAPI)...'
& dotnet publish 'windows-audio-bridge/RoboticTylerAudio.csproj' -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -o 'windows-audio-bridge/publish'
if ($LASTEXITCODE -ne 0) { throw 'Audio bridge publish failed' }
& npm.cmd install --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw 'npm install failed' }
& npm.cmd run build:both
if ($LASTEXITCODE -ne 0) { throw 'Electron packaging failed' }
Write-Host 'App installers: dist/control-center and dist/native-steam-companion'
# The one-download setup is a small native program; it needs MinGW-w64 (gcc + windres).
if (Get-Command gcc -ErrorAction SilentlyContinue) {
  & npm.cmd run build:setup
  if ($LASTEXITCODE -ne 0) { throw 'Building the setup failed' }
  Write-Host 'Setup: dist/setup/ROBOTIC-TYLER-Setup-<version>.exe'
} else {
  Write-Host 'Skipped the setup: install MinGW-w64 first (winget install BrechtSanders.WinLibs.POSIX.UCRT), open a new window and run this again.' -ForegroundColor Yellow
}
Start-Process explorer.exe -ArgumentList (Join-Path $PSScriptRoot 'dist')
