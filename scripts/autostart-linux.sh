#!/usr/bin/env bash
# Linux autostart via a systemd --user service.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UNIT="$HOME/.config/systemd/user/omniroute.service"
ACTION="${1:-install}"

[ -f "$ROOT/.env" ] && { set -a; . "$ROOT/.env"; set +a; }
HOST="${OMNIROUTE_HOST:-127.0.0.1}"; PORT="${OMNIROUTE_PORT:-20128}"

case "$ACTION" in
  uninstall|remove|disable)
    systemctl --user disable --now omniroute.service 2>/dev/null || true
    rm -f "$UNIT"; systemctl --user daemon-reload 2>/dev/null || true
    echo "  ✓ autostart removed"; exit 0 ;;
  status)
    systemctl --user status omniroute.service --no-pager 2>/dev/null | head -8 || echo "  not installed"
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

mkdir -p "$(dirname "$UNIT")"
cat > "$UNIT" <<UNIT_EOF
[Unit]
Description=OmniRoute AI gateway
After=network-online.target

[Service]
Type=simple
Environment=PATH=$NODE_BIN:/usr/local/bin:/usr/bin:/bin
Environment=OMNIROUTE_SERVER_HOST=$HOST
Environment=PORT=$PORT
ExecStart=${OMNI_NODE:-$NODE_BIN/node} $CLI serve --no-tray --no-open
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
UNIT_EOF

systemctl --user daemon-reload
systemctl --user enable --now omniroute.service
echo "  ✓ autostart installed ($UNIT)"
