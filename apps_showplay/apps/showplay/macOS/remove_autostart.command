#!/bin/bash
# ShowPlay: stops the bridge and stops it starting by itself when you log in. Your settings are kept.
LABEL="com.showplay.bridge"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
launchctl bootout "gui/$(id -u)" "$PLIST" >/dev/null 2>&1 || launchctl unload -w "$PLIST" >/dev/null 2>&1 || true
rm -f "$PLIST"
echo "The bridge is stopped and no longer starts by itself. Your settings (showplay_config.json) are kept."
read -r -p "Press Return to close."
