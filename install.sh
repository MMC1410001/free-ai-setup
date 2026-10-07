#!/usr/bin/env bash
# OmniRoute for Claude Code — installer for macOS and Linux.
#
# One line (Terminal):
#   curl -fsSL https://raw.githubusercontent.com/MMC1410001/free-ai-setup/main/install.sh | bash
# Options go after "bash -s --", for example:
#   curl -fsSL .../install.sh | bash -s -- --kiro
#   --kiro / --no-kiro   connect Kiro too, or skip the question
#   --no-autostart       do not start OmniRoute at login
#   --uninstall          remove the setup
set -euo pipefail

REPO="MMC1410001/free-ai-setup"
BRANCH="${OMNI_BRANCH:-main}"
DEST="${FREE_AI_SETUP_DIR:-$HOME/.free-ai-setup}"

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
die() { printf '  \033[31m✖\033[0m %s\n' "$*" >&2; exit 1; }

# ── Node.js 22.22+ ─────────────────────────────────────────────
node_ok() {
  command -v node >/dev/null 2>&1 || return 1
  node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=22)?0:1)'
}

install_node() {
  say "Installing Node.js 24 LTS"
  if [ "$(uname -s)" = "Darwin" ]; then
    if command -v brew >/dev/null 2>&1; then
      brew install node || brew upgrade node
    else
      local base="https://nodejs.org/dist/latest-v24.x" pkg
      pkg="$(curl -fsSL "$base/SHASUMS256.txt" | grep -o 'node-v24[0-9.]*\.pkg' | head -1)"
      [ -n "$pkg" ] || die "could not find the Node.js installer. Install it from https://nodejs.org"
      curl -fL# -o "/tmp/$pkg" "$base/$pkg"
      echo "  macOS asks for your login password to install Node.js."
      sudo installer -pkg "/tmp/$pkg" -target / </dev/tty
      export PATH="/usr/local/bin:$PATH"
    fi
  else
    die "Node.js 22.22+ is required. Install Node 24 LTS (https://nodejs.org/en/download) and run this again."
  fi
}

node_ok || install_node
node_ok || die "Node.js 22.22 or newer is still not available. Open a new Terminal and run this again."

# ── Get the setup files ────────────────────────────────────────
SELF_DIR=""
if [ -n "${BASH_SOURCE[0]:-}" ] && [ -f "$(dirname "${BASH_SOURCE[0]}")/scripts/install.mjs" ]; then
  SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fi

copy_into_dest() { # $1 = source folder; keeps .env, runtime/ and state/ in DEST
  mkdir -p "$DEST"
  tar -C "$1" --exclude=./.env --exclude=./runtime --exclude=./state --exclude=./.git -cf - . | tar -C "$DEST" -xf -
}

if [ -n "$SELF_DIR" ] && [ -d "$SELF_DIR/.git" ]; then
  ROOT="$SELF_DIR"                      # developer checkout: use it in place
elif [ -n "$SELF_DIR" ]; then
  say "Copying setup files to $DEST"
  [ "$SELF_DIR" = "$DEST" ] || copy_into_dest "$SELF_DIR"
  ROOT="$DEST"
else
  say "Downloading setup files to $DEST"
  TMP="$(mktemp -d)"
  curl -fsSL "https://codeload.github.com/$REPO/tar.gz/refs/heads/$BRANCH" | tar -xz -C "$TMP"
  copy_into_dest "$TMP"/*/
  rm -rf "$TMP"
  ROOT="$DEST"
fi

SCRIPT="install.mjs"
for a in "$@"; do [ "$a" = "--uninstall" ] && SCRIPT="uninstall.mjs"; done

# Questions need the keyboard even when this script arrives through a pipe.
if (exec </dev/tty) 2>/dev/null; then
  node "$ROOT/scripts/$SCRIPT" "$@" </dev/tty
else
  node "$ROOT/scripts/$SCRIPT" "$@"
fi
