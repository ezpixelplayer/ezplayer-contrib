#!/usr/bin/env bash
# ShowPlay: stops the bridge service and stops it starting by itself.   Run:  sudo ./uninstall_service.sh
set -euo pipefail
if [ "$(id -u)" -ne 0 ]; then
  echo "Run it with sudo:  sudo $0"
  exit 1
fi
for svc in showplay light-cube; do   # light-cube = the old name, up to v9
  systemctl disable --now "$svc.service" 2>/dev/null || true
  rm -f "/etc/systemd/system/$svc.service"
done
systemctl daemon-reload
echo "The bridge service is stopped and no longer starts by itself. Your settings (showplay_config.json) are kept."
