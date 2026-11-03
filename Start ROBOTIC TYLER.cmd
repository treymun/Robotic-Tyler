@echo off
setlocal EnableExtensions DisableDelayedExpansion
cd /d "%~dp0"
set "version=45.2.1"
set "arch=x64"
if /i "%PROCESSOR_ARCHITECTURE%"=="ARM64" set "arch=arm64"
if /i "%PROCESSOR_ARCHITEW6432%"=="ARM64" set "arch=arm64"
set "cache=%LOCALAPPDATA%\RoboticTylerGameHub\Runtime"
set "runtime=%cache%\%version%-%arch%"
if exist "%runtime%\electron.exe" goto launch
echo Setting up ROBOTIC TYLER for this Windows account...
set "asset=electron-v%version%-win32-%arch%.zip"
set "release=https://github.com/electron/electron/releases/download/v%version%"
set "stage=%cache%\setup-%RANDOM%-%RANDOM%"
mkdir "%stage%\runtime" || goto fail
curl.exe --fail --location --retry 2 "%release%/SHASUMS256.txt" --output "%stage%\checksums.txt" || goto fail
curl.exe --fail --location --retry 2 "%release%/%asset%" --output "%stage%\runtime.zip" || goto fail
powershell.exe -NoProfile -Command "$rows=@(Get-Content -LiteralPath (Join-Path $env:stage 'checksums.txt') | Where-Object { ($_ -split '\s+')[-1].TrimStart('*') -ceq $env:asset }); if ($rows.Count -ne 1) {exit 1}; $expected=($rows[0] -split '\s+')[0]; if ((Get-FileHash -LiteralPath (Join-Path $env:stage 'runtime.zip') -Algorithm SHA256).Hash -ne $expected) {exit 1}" || goto fail
tar.exe -xf "%stage%\runtime.zip" -C "%stage%\runtime" || goto fail
if not exist "%stage%\runtime\electron.exe" goto fail
powershell.exe -NoProfile -Command "try {[IO.Directory]::Move((Join-Path $env:stage 'runtime'),$env:runtime)} catch {if (!(Test-Path -LiteralPath (Join-Path $env:runtime 'electron.exe'))) {exit 1}}" || goto fail
del "%stage%\runtime.zip"
del "%stage%\checksums.txt"
rd "%stage%" 2>nul
:launch
set "ELECTRON_RUN_AS_NODE="
start "ROBOTIC TYLER" "%runtime%\electron.exe" "%~dp0app"
exit /b 0
:fail
echo Setup could not finish. Check your connection to GitHub and open this launcher again.
pause
exit /b 1
