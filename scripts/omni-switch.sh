#!/usr/bin/env bash
# Kept for older docs and the VS Code tasks. Logic lives in omni-switch.mjs.
# Usage: omni-switch.sh [status|free|paid|toggle|usage] [project-dir]
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec node "$ROOT/omni-switch.mjs" "${1:-status}" --dir "${2:-$PWD}"
