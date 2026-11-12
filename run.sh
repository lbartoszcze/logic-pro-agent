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
# A listing Logic refuses while it imports is retried; the last refusal is
# said if the tracks never arrive, instead of being thrown away.
n=0
tracks_error=""
for i in $(seq 1 30); do
  if listing="$(node logic.mjs tracks 2>&1)"; then
    n=$(printf '%s\n' "$listing" | grep -c '"number":' || [ $? -eq 1 ])
    tracks_error=""
  else
    tracks_error=$listing
  fi
  [ "$n" -ge 4 ] && break
  sleep 0.5
done
[ "$n" -ge 4 ] || { echo "Logic did not finish importing (only $n tracks)${tracks_error:+; the last listing failed: $tracks_error}" >&2; exit 1; }

# Prime the Cua daemon + element cache. Safe to run every time.
node logic.mjs cua-init >/dev/null

# Background patch swaps via Cua. Other apps can stay frontmost. A swap or
# the mastering that fails leaves Logic's default and is named at the end;
# its own words are on stderr above.
skipped=""
swap() {
  node logic.mjs cua-swap "$1" "$2" || skipped="$skipped; swapping $1 for $2 exited $?"
}
case "$STYLE" in
  trap)
    swap "SoCal" "Electro Trap Combo"
    swap "Pulse Bass" "Tough 808 Bass"
    swap "80s FM Piano" "Watery Rhodes"
    ;;
  drill)
    swap "SoCal" "Electro Trap Combo"
    swap "Pulse Bass" "Heavy 808 Bass"
    swap "80s FM Piano" "Watery Rhodes"
    ;;
  lo-fi)
    swap "Pulse Bass" "Soft Acoustic Bass"
    swap "80s FM Piano" "Watery Rhodes"
    ;;
  boom-bap)
    ;;
esac

# Drop Logic 11 Mastering Assistant on the stereo out — auto EQ + compression
# + adaptive limiter, tuned to the project.
node logic.mjs cua-master || skipped="$skipped; the Mastering Assistant exited $?"
sleep 1.5
[ -z "$skipped" ] || echo "Kept Logic's defaults where a step failed: ${skipped#; }" >&2

# Render the mastered project to audio. File lands in Logic's default Bounces
# folder (usually ~/Music/Logic/Bounces/). Tagged with style + key + bpm.
# A bounce that fails leaves nothing to play, so it ends the run.
BOUNCE_NAME="beat-${STYLE}-${RANDOM}"
node logic.mjs cua-bounce "$BOUNCE_NAME" \
  || { status=$?; echo "Logic did not bounce $BOUNCE_NAME (exit $status); the beat is in Logic, unrendered" >&2; exit 1; }

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
