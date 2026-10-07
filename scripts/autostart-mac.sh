#!/usr/bin/env bash
# macOS autostart via launchd LaunchAgent.
#
# Why this exists instead of `omniroute autostart enable`: the built-in
# command generates a plist that fails on a source/fnm install for two
# reasons, both verified:
#   1. it passes --tray, and the tray worker never becomes ready without a
#      GUI context, so the job exits 1;
#   2. the daemon spawns its websocket child with a bare `node`, but launchd
#      hands the job a minimal PATH (/usr/bin:/bin:/usr/sbin:/sbin), so a
#      version-managed Node (fnm/nvm/volta) is not found -> spawn ENOENT.
# This script uses --no-tray and pins PATH to the Node actually in use.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LABEL="com.omniroute.setup"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
ACTION="${1:-install}"

[ -f "$ROOT/.env" ] && { set -a; . "$ROOT/.env"; set +a; }
HOST="${OMNIROUTE_HOST:-127.0.0.1}"
PORT="${OMNIROUTE_PORT:-20128}"

uninstall() {
  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
  rm -f "$PLIST"
  echo "  ✓ autostart removed"
}

case "$ACTION" in
  uninstall|remove|disable) uninstall; exit 0 ;;
  status)
    launchctl print "gui/$(id -u)/$LABEL" 2>/dev/null | grep -E 'state =|last exit' || echo "  not installed"
    exit 0 ;;
esac

NODE_BIN="$(dirname "${OMNI_NODE:-$(command -v node)}")"
if [ -n "${OMNI_CLI:-}" ]; then
  CLI="$OMNI_CLI"
elif [ -n "${OMNIROUTE_SOURCE_DIR:-}" ]; then
  CLI="$OMNIROUTE_SOURCE_DIR/bin/omniroute.mjs"
  [ -f "$CLI" ] || { echo "  ✖ $CLI not found" >&2; exit 1; }
else
  CLI="$ROOT/runtime/node_modules/omniroute/bin/omniroute.mjs"
  [ -f "$CLI" ] || { echo "  ✖ $CLI not found — run the installer" >&2; exit 1; }
fi

mkdir -p "$HOME/Library/LaunchAgents" "$HOME/.omniroute/logs"
cat > "$PLIST" <<PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array>
    <string>${OMNI_NODE:-$NODE_BIN/node}</string>
    <string>$CLI</string>
    <string>serve</string>
    <string>--no-tray</string>
    <string>--no-open</string>
  </array>
  <key>EnvironmentVariables</key><dict>
    <key>PATH</key><string>$NODE_BIN:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    <key>OMNIROUTE_SERVER_HOST</key><string>$HOST</string>
    <key>PORT</key><string>$PORT</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><false/>
  <key>StandardOutPath</key><string>$HOME/.omniroute/logs/autostart.out.log</string>
  <key>StandardErrorPath</key><string>$HOME/.omniroute/logs/autostart.err.log</string>
</dict></plist>
PLIST_EOF

plutil -lint "$PLIST" >/dev/null || { echo "  ✖ generated plist is invalid" >&2; exit 1; }
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "  ✓ autostart installed ($PLIST)"
echo "    status:  bash \"$ROOT/scripts/autostart-mac.sh\" status"
echo "    remove:  bash \"$ROOT/scripts/autostart-mac.sh\" uninstall"
