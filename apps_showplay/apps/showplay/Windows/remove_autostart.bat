@echo off
rem ShowPlay: stops starting the bridge with Windows (also removes the old Light Cube entry, if any).
del "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\ShowPlay bridge.bat" 2>nul
del "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Light Cube bridge.bat" 2>nul
echo The bridge no longer starts with Windows.
echo If it is running now, end "pythonw" in Task Manager or restart the PC.
pause
