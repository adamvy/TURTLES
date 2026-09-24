#!/bin/zsh
# Double-click in Finder to build both modes and boot raw T0 in Terminal.
# From a terminal, use ./boot.command --mode js for the JS-like frontend.
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
cd -- "$(dirname -- "$0")" || exit 1
node tools/build.mjs || exit 1
exec node tools/run.mjs "$@"
