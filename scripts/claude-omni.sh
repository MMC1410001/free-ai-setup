#!/usr/bin/env bash
# Launch Claude Code against OmniRoute instead of your normal subscription.
# Your default `claude` and ~/.claude are untouched.
set -euo pipefail
# Resolve symlinks so this works when linked onto PATH as `claude-omni`.
SELF="${BASH_SOURCE[0]}"
while [ -L "$SELF" ]; do
  LINK="$(readlink "$SELF")"
  case "$LINK" in /*) SELF="$LINK" ;; *) SELF="$(dirname "$SELF")/$LINK" ;; esac
done
ROOT="$(cd "$(dirname "$SELF")/.." && pwd)"
[ -f "$ROOT/.env" ] || { echo "✖ .env not found — cp .env.example .env" >&2; exit 1; }
set -a; . "$ROOT/.env"; set +a
[ -n "${OMNIROUTE_API_KEY:-}" ] || { echo "✖ OMNIROUTE_API_KEY not set in .env" >&2; exit 1; }
PROFILE="${CLAUDE_PROFILE_DIR:-$HOME/.claude/profiles/omniroute}"
[ -d "$PROFILE" ] || { echo "✖ profile missing — run scripts/setup.sh first" >&2; exit 1; }
HOST="${OMNIROUTE_HOST:-127.0.0.1}"; PORT="${OMNIROUTE_PORT:-20128}"
curl -s -o /dev/null --max-time 3 "http://$HOST:$PORT/" || {
  echo "✖ OmniRoute is not running at http://$HOST:$PORT" >&2
  echo "  start it:  omniroute serve --no-tray --no-open --daemon" >&2; exit 1; }
exec env ANTHROPIC_AUTH_TOKEN="$OMNIROUTE_API_KEY" CLAUDE_CONFIG_DIR="$PROFILE" claude "$@"
