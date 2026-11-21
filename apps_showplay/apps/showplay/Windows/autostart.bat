@echo off
rem ShowPlay: makes the bridge start by itself (no window) when Windows starts, and starts it now.
cd /d "%~dp0"
set "PYW="
where pyw >nul 2>nul && set "PYW=pyw -3"
if not defined PYW (where pythonw >nul 2>nul && set "PYW=pythonw")
if not defined PYW (
  echo Python was not found. Install Python 3 from https://www.python.org ^(tick "Add python.exe to PATH"^).
  pause
  exit /b 1
)
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
rem the bridge was called Light Cube up to v9: its old start entry is removed so only one bridge starts
del "%STARTUP%\Light Cube bridge.bat" 2>nul
> "%STARTUP%\ShowPlay bridge.bat" (
  echo @echo off
  echo cd /d "%~dp0"
  echo start "" %PYW% "%~dp0showplay_bridge.py"
)
start "" %PYW% "%~dp0showplay_bridge.py"
echo.
echo Done: the bridge is running and will start by itself with Windows.
echo Open the control page: http://localhost:8099
echo (on a phone on the home network: http://THIS-PC-IP:8099)
echo.
pause
