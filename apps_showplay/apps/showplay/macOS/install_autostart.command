#!/bin/bash
# ShowPlay: makes the bridge start by itself (no window) when you log in to this Mac, and starts it now.
# It installs a LaunchAgent for your user only: no administrator password is needed.
cd "$(dirname "$0")" || exit 1
DIR="$(pwd)"
LABEL="com.showplay.bridge"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOGDIR="$HOME/Library/Logs/ShowPlay"
if ! /usr/bin/env python3 -c 'import sys' >/dev/null 2>&1; then
  echo "Python 3 is not installed yet. Install it from https://www.python.org, then open this file again."
  read -r -p "Press Return to close."
  exit 1
fi
PY="$(/usr/bin/env python3 -c 'import sys; print(sys.executable)')"
mkdir -p "$HOME/Library/LaunchAgents" "$LOGDIR"
# an older copy of the agent is stopped first, so only one bridge runs
launchctl bootout "gui/$(id -u)" "$PLIST" >/dev/null 2>&1 || true
# the start file is written by Python, so any folder name (spaces, &, accents) is stored correctly
"$PY" - "$PLIST" "$LABEL" "$PY" "$DIR" "$LOGDIR/bridge.log" <<'PYEOF'
import plistlib, sys
plist, label, py, folder, log = sys.argv[1:6]
with open(plist, "wb") as f:
    plistlib.dump({"Label": label, "ProgramArguments": [py, folder + "/showplay_bridge.py"], "WorkingDirectory": folder,
                   "RunAtLoad": True, "KeepAlive": True, "ThrottleInterval": 5,
                   "StandardOutPath": log, "StandardErrorPath": log}, f)
PYEOF
plutil -lint "$PLIST" >/dev/null || { echo "The start file could not be written correctly: $PLIST"; read -r -p "Press Return to close."; exit 1; }
if ! launchctl bootstrap "gui/$(id -u)" "$PLIST" 2>/dev/null; then
  launchctl load -w "$PLIST"
fi
IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null)"
echo
echo "Done: the bridge is running and will start by itself when you log in."
echo "Control page:  http://localhost:8099   (from a phone on the home network: http://${IP:-THIS-MAC-IP}:8099)"
echo "Its log:       $LOGDIR/bridge.log"
read -r -p "Press Return to close."
