#!/usr/bin/env bash
# Generate beat.mid with optional style/key/bpm flags, open it in Logic,
# poll until import finishes, then apply style-appropriate patch swaps.
#
# Usage:
#   ./run.sh                                  # trap Fm 140
#   ./run.sh --style=lo-fi --key=Am
#   ./run.sh --style=drill --key=Gm --bpm=148
#   ./run.sh --style=boom-bap --key=Cm
set -euo pipefail
cd "$(dirname "$0")"

# Parse style so we know which patch swaps to queue.
STYLE="trap"
for arg in "$@"; do
  case "$arg" in
    --style=*) STYLE="${arg#--style=}" ;;
  esac
done

node make-beat.mjs "$@"
node logic.mjs open beat.mid

# Poll until Logic has the 4 tracks.
for i in $(seq 1 30); do
  n=$(node logic.mjs tracks 2>/dev/null | grep -c '"number":' || true)
  [ "$n" -ge 4 ] && break
  sleep 0.5
done
[ "$n" -ge 4 ] || { echo "Logic did not finish importing (only $n tracks)"; exit 1; }

# Per-style patch swaps. Other styles keep Logic's GM-default patches, which
# are already reasonable (Pulse Bass, Classic Electric Piano, 80s FM Piano).
case "$STYLE" in
  trap)
    node logic.mjs swap "SoCal" "Electro Trap Combo" || true
    node logic.mjs swap "Pulse Bass" "Tough 808 Bass" || true
    ;;
  drill)
    node logic.mjs swap "SoCal" "Electro Trap Combo" || true
    node logic.mjs swap "Pulse Bass" "Heavy 808 Bass" || true
    ;;
  lo-fi|boom-bap)
    # Defaults sound right for these styles.
    ;;
esac

echo "Beat ready in Logic. Run 'node logic.mjs play' to hear it."
