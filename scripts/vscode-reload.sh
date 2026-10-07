#!/usr/bin/env bash
# Reload the VS Code window so the Claude panel picks up the new mode.
# VS Code has no default shortcut for "Reload Window", so drive the Command Palette.
# macOS only (needs Accessibility permission for VS Code); elsewhere, reload by hand.
[ "$(uname)" = "Darwin" ] || { echo "Reload the window: Ctrl+Shift+P → Developer: Reload Window"; exit 0; }
sleep 0.5
osascript <<'OSA' || echo "Auto-reload failed. Reload by hand: Cmd+Shift+P → Developer: Reload Window"
tell application "System Events"
  keystroke "p" using {command down, shift down}
  delay 0.4
  keystroke "Developer: Reload Window"
  delay 0.4
  key code 36
end tell
OSA
