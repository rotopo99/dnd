#!/usr/bin/env bash
# usage: tools/blender/run.sh script.py [args...]   (needs bpy venv: BPY_VENV, default tools/blender/.venv; xvfb only for renders)
HERE="$(cd "$(dirname "$0")" && pwd)"
PY="${BPY_VENV:-$HERE/.venv}/bin/python"
S="$1"; shift
if [ "${NEED_GL:-0}" = 1 ]; then exec xvfb-run -a "$PY" "$HERE/$S" "$@"; else exec "$PY" "$HERE/$S" "$@"; fi
