@echo off
rem ShowPlay: starts the bridge in this window (close the window to stop it).
cd /d "%~dp0"
where py >nul 2>nul && (py -3 showplay_bridge.py & goto end)
where python >nul 2>nul && (python showplay_bridge.py & goto end)
echo Python was not found. Install Python 3 from https://www.python.org (tick "Add python.exe to PATH").
:end
pause
