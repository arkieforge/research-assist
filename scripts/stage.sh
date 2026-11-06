#!/bin/sh
# Prints an Alchemy stage named after this checkout, so parallel worktrees never share cloud resources.
# Usage: scripts/stage.sh <dev|live|test>  ->  dev_siam_arkie
set -eu
checkout=$(basename "$(git rev-parse --show-toplevel)" | tr 'A-Z' 'a-z' | tr -c 'a-z0-9_\n-' '-')
printf '%s_%s_%s\n' "$1" "$(printf '%s' "${USER:-unknown}" | tr 'A-Z' 'a-z')" "$checkout"
