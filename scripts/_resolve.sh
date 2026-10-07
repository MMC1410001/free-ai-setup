# Sourced by the other bash scripts. Sets $OMNI to a command prefix that
# runs the OmniRoute CLI, honouring OMNIROUTE_SOURCE_DIR.
#
# Usage after sourcing:   $OMNI providers list
resolve_omni() {
  if [ -n "${OMNIROUTE_SOURCE_DIR:-}" ]; then
    if [ ! -f "$OMNIROUTE_SOURCE_DIR/bin/omniroute.mjs" ]; then
      echo "  ✖ OMNIROUTE_SOURCE_DIR=$OMNIROUTE_SOURCE_DIR has no bin/omniroute.mjs" >&2
      return 1
    fi
    OMNI="node $OMNIROUTE_SOURCE_DIR/bin/omniroute.mjs"
    OMNI_MODE="source ($OMNIROUTE_SOURCE_DIR)"
  elif command -v omniroute >/dev/null 2>&1; then
    OMNI="omniroute"
    OMNI_MODE="global npm"
  else
    OMNI=""
    OMNI_MODE="none"
  fi
  export OMNI OMNI_MODE
}
