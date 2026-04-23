#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
node make-beat.mjs
open -a "Logic Pro X" beat.mid
