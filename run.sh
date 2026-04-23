#!/usr/bin/env bash
# Generate beat.mid, open in Logic, wait for import, then apply patch swaps.
set -euo pipefail
cd "$(dirname "$0")"

node make-beat.mjs
node logic.mjs open beat.mid

# Poll until Logic has finished importing the 4 tracks.
for i in $(seq 1 30); do
  n=$(node logic.mjs tracks 2>/dev/null | grep -c '"number":' || true)
  [ "$n" -ge 4 ] && break
  sleep 0.5
done
[ "$n" -ge 4 ] || { echo "Logic did not finish importing (only $n tracks)"; exit 1; }

node logic.mjs swap "SoCal" "Electro Trap Combo" || true
node logic.mjs swap "Pulse Bass" "Tough 808 Bass" || true

echo "Beat ready in Logic. Run 'node logic.mjs play' to hear it."
