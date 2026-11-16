#!/usr/bin/env bash
# Generate beat.mid with optional style/key/bpm flags, open it in Logic,
# wait until the import finishes, then apply style-appropriate patch swaps
# fully in the background through golem (Logic never needs to be frontmost).
# Nothing here waits for a set time: each wait ends when what it waits for
# shows, and says meanwhile on standard error what it waits for and sees.
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

# Everything a beat needs (golem, Accessibility, Logic and its first launch),
# each missing piece with its fix, before anything is changed in Logic.
node logic.mjs doctor
node make-beat.mjs "$@"
node logic.mjs open beat.mid

# The import is done once Logic shows the beat's 4 tracks.
node logic.mjs wait-tracks 4

# Background patch swaps through golem. Other apps can stay frontmost. A swap
# or the mastering that fails leaves Logic's default and is named at the end;
# its own words are on stderr above.
skipped=""
swap() {
  node logic.mjs swap "$1" "$2" || skipped="$skipped; swapping $1 for $2 exited $?"
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

# Logic's Mastering Assistant on the stereo out — auto EQ + compression +
# adaptive limiter, tuned to the project; master returns once its window shows.
node logic.mjs master || skipped="$skipped; the Mastering Assistant exited $?"
if [ -n "$skipped" ]; then
  echo "Kept Logic's defaults where a step failed: ${skipped#; }" >&2
fi

# Render the mastered project to audio. File lands in Logic's default Bounces
# folder (usually ~/Music/Logic/Bounces/). Tagged with style + key + bpm.
# A bounce that fails leaves nothing to play, so it ends the run.
BOUNCE_NAME="beat-${STYLE}-${RANDOM}"
node logic.mjs bounce "$BOUNCE_NAME" \
  || { status=$?; echo "Logic did not bounce $BOUNCE_NAME (exit $status); the beat is in Logic, unrendered" >&2; exit 1; }

BOUNCE_FILE="$HOME/Music/Logic/Bounces/${BOUNCE_NAME}.aif"
echo "Beat ready in Logic. 'node logic.mjs play' to play (no focus steal)."

# The file appears when Logic starts writing it and is whole once Logic's
# bounce window has gone; then it plays through the system speakers.
node logic.mjs wait-file "$BOUNCE_FILE"
node logic.mjs golem wait --gone "window[title^=\"Bounce\"]"
echo "Audio rendered: $BOUNCE_FILE"
echo "Playing $BOUNCE_FILE (Ctrl+C to stop)..."
afplay "$BOUNCE_FILE"
