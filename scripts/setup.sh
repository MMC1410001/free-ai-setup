#!/usr/bin/env bash
# Kept for older docs. The installer now lives in scripts/install.mjs.
exec bash "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/install.sh" "$@"
