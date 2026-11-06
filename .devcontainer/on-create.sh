#!/usr/bin/env bash
# One-time container setup: the Vite+ CLI (vp), which runs everything in this repo.
# Downloads to a file first: a curl failure inside $( ) would yield an empty script and a false
# success. Node comes from the image, so the installer skips its Node shims. The VP_*_DIR group
# pins the install location so the check below doesn't depend on the installer's defaults.
set -euo pipefail
export VP_BIN_DIR="$HOME/.local/share/vite-plus/bin"
export VP_DATA_DIR="$HOME/.local/share/vite-plus"
export VP_CACHE_DIR="$HOME/.cache/vite-plus"
installer=$(mktemp)
curl -fsSL https://vite.plus -o "$installer"
VP_NODE_MANAGER=no bash "$installer"
rm -f "$installer"
# Lifecycle shells don't source the profile the installer edits, so put vp on the default PATH.
test -x "$VP_BIN_DIR/vp"
sudo ln -sf "$VP_BIN_DIR/vp" /usr/local/bin/vp
vp install --frozen-lockfile
