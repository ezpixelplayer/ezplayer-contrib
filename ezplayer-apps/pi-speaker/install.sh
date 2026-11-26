#!/bin/sh
# ShowPlay speaker: installs it on a Raspberry Pi (Raspberry Pi OS) so it starts by itself when the Pi starts.
#   sh install.sh                      port 8765, no key, the default sound output
#   sh install.sh --key MYKEY --device hw:1,0 --volume 90
# Run it again to change the options. To remove it: sh install.sh --remove
set -e
DIR=/opt/showplay-speaker
SERVICE=/etc/systemd/system/showplay-speaker.service

if [ "$1" = "--remove" ]; then
    sudo systemctl disable --now showplay-speaker 2>/dev/null || true
    sudo rm -f "$SERVICE"
    sudo systemctl daemon-reload
    echo "ShowPlay speaker removed (its folder $DIR is left; delete it with: sudo rm -r $DIR)"
    exit 0
fi

command -v python3 >/dev/null || { echo "Python 3 is needed: sudo apt install python3"; exit 1; }
command -v aplay >/dev/null || { echo "Installing alsa-utils (aplay)..."; sudo apt-get install -y alsa-utils; }

sudo mkdir -p "$DIR"
sudo cp "$(dirname "$0")/showplay_speaker.py" "$(dirname "$0")/speaker_page.html" "$DIR/"
USER_NAME=$(id -un)
# started with sudo: the speaker still runs as the normal user, not as root
if [ "$USER_NAME" = "root" ] && [ -n "$SUDO_USER" ] && [ "$SUDO_USER" != "root" ]; then USER_NAME=$SUDO_USER; fi
if [ "$USER_NAME" = "root" ]; then echo "Run it as a normal user (sh install.sh), not as root: it asks for sudo itself."; exit 1; fi
sudo tee "$SERVICE" >/dev/null <<EOF
[Unit]
Description=ShowPlay speaker (plays the show's sounds sent over the network)
After=network-online.target sound.target
Wants=network-online.target

[Service]
User=$USER_NAME
SupplementaryGroups=audio
ExecStart=/usr/bin/python3 $DIR/showplay_speaker.py $*
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
sudo chmod 600 "$SERVICE"   # it may hold the key (--key): only root reads it
sudo systemctl daemon-reload
sudo systemctl enable --now showplay-speaker
sudo systemctl restart showplay-speaker
sleep 1
IP=$(hostname -I 2>/dev/null | awk '{print $1}')
echo
echo "ShowPlay speaker is running and starts by itself with the Pi."
echo "Its page, to set the volume, the sound output and a key: http://$IP:8765 (from any browser on the network)"
echo "In ShowPlay and the apps: Where it plays = A Raspberry Pi on the network, address $IP"
echo "Its log: journalctl -u showplay-speaker -f"
