#!/usr/bin/env bash
# Regenerate beat.mid, open it in Logic Pro X, then swap the drum kit and bass
# to trap-flavoured patches via the swap-patch.applescript helper.
set -euo pipefail
cd "$(dirname "$0")"

node make-beat.mjs
open -a "Logic Pro X" beat.mid

# Poll until Logic has finished importing (4 tracks with "Track N" descriptions).
for i in $(seq 1 30); do
  count=$(osascript <<'EOF' 2>/dev/null || echo 0
tell application "System Events"
  tell process "Logic Pro X"
    try
      set allElems to entire contents of window 1
      set n to 0
      repeat with e in allElems
        try
          if role of e is "AXLayoutItem" and description of e starts with "Track " then set n to n + 1
        end try
      end repeat
      return n
    on error
      return 0
    end try
  end tell
end tell
EOF
)
  [ "$count" -ge 4 ] && break
  sleep 0.5
done

[ "$count" -ge 4 ] || { echo "Logic did not finish importing (only $count tracks)"; exit 1; }

# Swap patches. Target tracks by their default patch name so the script works
# regardless of track-number renumbering after Track Stack creation.
osascript swap-patch.applescript "SoCal" "Electro Trap Combo" || true
osascript swap-patch.applescript "Pulse Bass" "Tough 808 Bass" || true

echo "Beat loaded with Electro Trap Combo + Tough 808 Bass. Press space in Logic to play."
