#!/usr/bin/env bash
# ShowPlay: installs the bridge as a service that starts by itself when this Linux computer (with
# systemd) starts, and starts it now.   Run:  sudo ./install_service.sh
set -euo pipefail
DIR="$(dirname "$(readlink -f "$0")")"
UNIT="/etc/systemd/system/showplay.service"
OLD_UNIT="/etc/systemd/system/light-cube.service"   # the bridge was called Light Cube up to v9
if [ "$(id -u)" -ne 0 ]; then
  echo "Run it with sudo:  sudo $0"
  exit 1
fi
RUN_AS="${SUDO_USER:-}"
if [ -z "$RUN_AS" ] || [ "$RUN_AS" = "root" ]; then
  echo "Run it with sudo from your normal user (for example pi), not as root: the bridge should not run as root."
  exit 1
fi
PY="$(command -v python3 || true)"
if [ -z "$PY" ]; then
  echo "Python 3 was not found. Install it first:  sudo apt install python3"
  exit 1
fi
if [ -f "$OLD_UNIT" ]; then
  echo "Removing the old light-cube service (the bridge is now called ShowPlay)."
  systemctl disable --now light-cube.service 2>/dev/null || true
  rm -f "$OLD_UNIT"
fi
cat > "$UNIT" <<UNITEOF
[Unit]
Description=ShowPlay bridge
Wants=network-online.target
After=network-online.target

[Service]
User=$RUN_AS
WorkingDirectory=$DIR
ExecStart="$PY" "$DIR/showplay_bridge.py"
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNITEOF
systemctl daemon-reload
systemctl enable --now showplay.service
IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
echo
echo "Done: the bridge is running and will start by itself with this computer."
echo "Control page:  http://${IP:-THIS-PI-IP}:8099   (or http://localhost:8099 on this computer)"
echo "See its log:   journalctl -u showplay -f"
