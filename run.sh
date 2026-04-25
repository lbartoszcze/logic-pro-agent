#!/usr/bin/env bash
# Generate beat.mid with optional style/key/bpm flags, open it in Logic,
# poll until import finishes, then apply style-appropriate patch swaps
# fully in the background (Logic never needs to be frontmost).
#
# Usage:
#   ./run.sh                                  # trap Fm 140 16 bars
#   ./run.sh --style=lo-fi --key=Am
#   ./run.sh --style=drill --key=Gm --bpm=148
#   ./run.sh --style=boom-bap --key=Cm
set -euo pipefail
cd "$(dirname "$0")"

STYLE="trap"
for arg in "$@"; do
  case "$arg" in
    --style=*) STYLE="${arg#--style=}" ;;
  esac
done

node make-beat.mjs "$@"
node logic.mjs open beat.mid

# Poll until Logic has imported the 4 tracks.
for i in $(seq 1 30); do
  n=$(node logic.mjs tracks 2>/dev/null | grep -c '"number":' || true)
  [ "$n" -ge 4 ] && break
  sleep 0.5
done
[ "$n" -ge 4 ] || { echo "Logic did not finish importing (only $n tracks)"; exit 1; }

# Prime the Cua daemon + element cache. Safe to run every time.
node logic.mjs cua-init >/dev/null

# Background patch swaps via Cua. Other apps can stay frontmost.
case "$STYLE" in
  trap)
    node logic.mjs cua-swap "SoCal" "Electro Trap Combo" || true
    node logic.mjs cua-swap "Pulse Bass" "Tough 808 Bass" || true
    node logic.mjs cua-swap "80s FM Piano" "Watery Rhodes" || true
    ;;
  drill)
    node logic.mjs cua-swap "SoCal" "Electro Trap Combo" || true
    node logic.mjs cua-swap "Pulse Bass" "Heavy 808 Bass" || true
    node logic.mjs cua-swap "80s FM Piano" "Watery Rhodes" || true
    ;;
  lo-fi)
    node logic.mjs cua-swap "Pulse Bass" "Soft Acoustic Bass" || true
    node logic.mjs cua-swap "80s FM Piano" "Watery Rhodes" || true
    ;;
  boom-bap)
    ;;
esac

# Drop Logic 11 Mastering Assistant on the stereo out — auto EQ + compression
# + adaptive limiter, tuned to the project.
node logic.mjs cua-master || true
sleep 1.5

# Render the mastered project to audio. File lands in Logic's default Bounces
# folder (usually ~/Music/Logic/Bounces/). Tagged with style + key + bpm.
BOUNCE_NAME="beat-${STYLE}-${RANDOM}"
node logic.mjs cua-bounce "$BOUNCE_NAME" || true

BOUNCE_FILE="$HOME/Music/Logic/Bounces/${BOUNCE_NAME}.aif"
echo "Beat ready in Logic. 'node logic.mjs cua-play' to play (no focus steal)."
echo "Audio rendered: $BOUNCE_FILE"

# Wait for the bounce file to actually appear, then play it through the
# system speakers via afplay so you hear the result without opening Logic.
for i in $(seq 1 30); do
  if [ -f "$BOUNCE_FILE" ] && [ "$(stat -f %z "$BOUNCE_FILE" 2>/dev/null || echo 0)" -gt 100000 ]; then
    echo "Playing $BOUNCE_FILE (Ctrl+C to stop)..."
    afplay "$BOUNCE_FILE"
    break
  fi
  sleep 0.5
done
