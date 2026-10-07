#!/bin/bash
# Double-click to install OmniRoute for Claude Code on macOS.
cd "$(dirname "$0")" || exit 1
bash ./install.sh "$@"
echo
read -n 1 -r -p "Press any key to close this window..."
