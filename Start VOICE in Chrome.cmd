@echo off
setlocal EnableExtensions DisableDelayedExpansion
set "chrome=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%chrome%" set "chrome=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not exist "%chrome%" set "chrome=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
if not exist "%chrome%" goto missing
set "profile=%LOCALAPPDATA%\RoboticTylerGameHub\ChromeVoice"
if not exist "%profile%\Default\Preferences" (
 echo One-time setup: enable Developer mode, click Load unpacked and select the browser-extension folder beside this launcher.
 start "" "%chrome%" --user-data-dir="%profile%" "chrome://extensions"
 explorer.exe "%~dp0browser-extension"
 echo After loading the extension, press any key to open the voice window.
 pause >nul
)
start "" "%chrome%" --user-data-dir="%profile%" --app=https://steamcommunity.com/chat/
exit /b 0
:missing
echo Install Google Chrome from https://www.google.com/chrome/ and run this launcher again.
pause
