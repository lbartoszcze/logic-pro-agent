-- swap-patch.applescript
-- Usage: osascript swap-patch.applescript "<track-hint>" "<patch-name>"
--   track-hint : substring that matches AXLayoutItem description
--                (e.g. "Track 1", "Pulse Bass", "Classic Electric Piano")
--   patch-name : exact visible patch name in the Library list (e.g. "Tough 808 Bass")
--
-- Requires:
--   - Logic Pro X running with a project open
--   - Terminal.app has Accessibility + Screen Recording permissions
--   - cliclick installed (brew install cliclick)
--
-- Flow mirrors Puppeteer: activate -> raise -> select track via AXPress ->
-- type into Library search AXTextField -> find result row in AX tree ->
-- double-click its centre via cliclick (AXPress on patch rows does not fire
-- Logic internal load handler).

on run argv
  if (count of argv) < 2 then
    error "usage: osascript swap-patch.applescript <track-hint> <patch-name>"
  end if
  set trackHint to item 1 of argv
  set patchName to item 2 of argv

  tell application "Logic Pro X" to activate
  delay 0.3
  tell application "System Events"
    tell process "Logic Pro X"
      perform action "AXRaise" of window 1
      delay 0.2

      set trackElem to missing value
      set searchElem to missing value
      set allElems to entire contents of window 1
      repeat with e in allElems
        try
          set r to role of e
          if r is "AXLayoutItem" then
            if description of e contains trackHint then set trackElem to e
          else if r is "AXTextField" then
            set p to position of e
            if (item 1 of p) = 1737 and (item 2 of p) = 359 then set searchElem to e
          end if
        end try
      end repeat
      if trackElem is missing value then error "track not found: " & trackHint
      if searchElem is missing value then error "Library search field not found (is Library open? press Y)"

      perform action "AXPress" of trackElem
      delay 0.4

      set focused of searchElem to true
      delay 0.1
      set value of searchElem to ""
      delay 0.1
      set value of searchElem to patchName
      delay 0.7

      set rowX to missing value
      set rowY to missing value
      set allElems to entire contents of window 1
      repeat with e in allElems
        try
          if role of e is "AXRow" then
            set p to position of e
            if (item 1 of p) >= 1728 and (item 1 of p) < 2138 then
              set label to ""
              repeat with c in UI elements of e
                try
                  repeat with cc in UI elements of c
                    try
                      set v to value of cc
                      if v is not missing value then set label to label & v & " "
                    end try
                  end repeat
                end try
              end repeat
              if label contains patchName then
                set s to size of e
                set rowX to (item 1 of p) + (item 1 of s) / 2
                set rowY to (item 2 of p) + (item 2 of s) / 2
                exit repeat
              end if
            end if
          end if
        end try
      end repeat
      if rowX is missing value then error "patch row not found in Library: " & patchName
    end tell
  end tell

  -- Hand off to cliclick for a real double-click that Logic recognises.
  set cmd to "/opt/homebrew/bin/cliclick dc:" & (rowX as integer) & "," & (rowY as integer)
  do shell script cmd
  delay 0.8
  return "loaded " & patchName & " on " & trackHint
end run
