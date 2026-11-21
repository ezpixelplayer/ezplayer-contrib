#!/usr/bin/env bash
# ShowPlay (optional): runs EZPlayer with no screen (headless) as a service that starts by itself with the
# computer. Only needed if EZPlayer runs on this computer and you want it to start on its own with no screen.
# Run:  sudo ./install_ezplayer_service.sh /path/to/EZPlayer /path/to/show-folder
set -euo pipefail
UNIT="/etc/systemd/system/ezplayer.service"
if [ "$(id -u)" -ne 0 ]; then
  echo "Run it with sudo:  sudo $0 /path/to/EZPlayer /path/to/show-folder"
  exit 1
fi
if [ $# -ne 2 ]; then
  echo "Usage: sudo $0 /path/to/EZPlayer /path/to/show-folder"
  exit 1
fi
APP="$(readlink -f "$1")"
SHOW="$(readlink -f "$2")"
RUN_AS="${SUDO_USER:-}"
if [ -z "$RUN_AS" ] || [ "$RUN_AS" = "root" ]; then
  echo "Run it with sudo from your normal user (for example pi), not as root."
  exit 1
fi
case "$APP" in
  *.AppImage)
    if ! ldconfig -p 2>/dev/null | grep -q "libfuse.so.2"; then
      echo "Note: an AppImage needs FUSE 2. If EZPlayer does not start, install it:"
      echo "  Ubuntu 24.04 and newer: sudo apt install libfuse2t64     older Ubuntu / Debian: sudo apt install libfuse2"
    fi ;;
esac
if [ ! -x "$APP" ]; then
  echo "EZPlayer was not found or is not executable: $APP"
  exit 1
fi
if [ ! -f "$SHOW/xlights_rgbeffects.xml" ] || [ ! -f "$SHOW/xlights_networks.xml" ]; then
  echo "That is not an xLights show folder (xlights_rgbeffects.xml and xlights_networks.xml are missing): $SHOW"
  exit 1
fi
cat > "$UNIT" <<UNITEOF
[Unit]
Description=EZPlayer (headless)
Wants=network-online.target sound.target
After=network-online.target sound.target

[Service]
User=$RUN_AS
WorkingDirectory=$(dirname "$APP")
ExecStart="$APP" --ozone-platform=headless headless "--show-folder=$SHOW" --web-port=3000 --local-audio
Restart=on-failure
RestartSec=10
KillSignal=SIGTERM
TimeoutStopSec=20

[Install]
WantedBy=multi-user.target
UNITEOF
systemctl daemon-reload
systemctl enable --now ezplayer.service
echo
echo "Done: EZPlayer runs with no screen and starts by itself with this computer."
echo "Its web interface:  http://$(hostname -I 2>/dev/null | awk '{print $1}'):3000"
echo "See its log:        journalctl -u ezplayer -f"
echo "To remove it:       sudo systemctl disable --now ezplayer && sudo rm $UNIT && sudo systemctl daemon-reload"
