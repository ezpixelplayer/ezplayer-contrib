#!/usr/bin/env bash
# ShowPlay: starts the bridge in this terminal (Ctrl-C to stop it). Linux / Raspberry Pi.
cd "$(dirname "$(readlink -f "$0")")" || exit 1
if ! command -v python3 >/dev/null 2>&1; then
  echo "Python 3 was not found. On Raspberry Pi OS: sudo apt install python3"
  exit 1
fi
exec python3 showplay_bridge.py
