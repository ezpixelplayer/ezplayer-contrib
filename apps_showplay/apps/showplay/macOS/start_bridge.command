#!/bin/bash
# ShowPlay: starts the bridge in this Terminal window (close the window or press Ctrl-C to stop it). macOS.
cd "$(dirname "$0")" || exit 1
if ! /usr/bin/env python3 -c 'import sys' >/dev/null 2>&1; then
  echo "Python 3 is not installed yet."
  echo "Install it from https://www.python.org (macOS installer), or run:  xcode-select --install"
  echo "Then open this file again."
  read -r -p "Press Return to close."
  exit 1
fi
exec /usr/bin/env python3 showplay_bridge.py
