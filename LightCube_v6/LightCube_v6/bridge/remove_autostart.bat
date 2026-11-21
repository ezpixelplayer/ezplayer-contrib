@echo off
rem Light Cube: stops starting the bridge with Windows.
del "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Light Cube bridge.bat" 2>nul
echo The bridge no longer starts with Windows.
echo If it is running now, end "pythonw" in Task Manager or restart the PC.
pause
