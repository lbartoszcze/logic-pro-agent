// AX primitives for Logic Pro X. Used by logic.mjs.

import { execFileSync } from "node:child_process";

export const CLICLICK = "/opt/homebrew/bin/cliclick";

export function osa(script) {
  return execFileSync("osascript", [], { encoding: "utf8", input: script }).trim();
}

export function sleep(sec) {
  execFileSync("sleep", [String(sec)]);
}

export function activate() {
  osa(`
    tell application "Logic Pro X" to activate
    delay 0.2
    tell application "System Events"
      tell process "Logic Pro X"
        try
          perform action "AXRaise" of window 1
        end try
      end tell
    end tell
  `);
}

export function listTracks() {
  activate();
  const out = osa(`
    tell application "System Events"
      tell process "Logic Pro X"
        set tw to missing value
        repeat with w in windows
          try
            if name of w contains "Tracks" then
              set tw to w
              exit repeat
            end if
          end try
        end repeat
        if tw is missing value then return ""
        set allElems to entire contents of tw
        set acc to ""
        repeat with e in allElems
          try
            if role of e is "AXLayoutItem" then
              set d to description of e
              if d starts with "Track " then
                set p to position of e
                set s to size of e
                set acc to acc & d & "|" & (item 1 of p) & "|" & (item 2 of p) & "|" & (item 1 of s) & "|" & (item 2 of s) & linefeed
              end if
            end if
          end try
        end repeat
        return acc
      end tell
    end tell
  `);
  const tracks = [];
  for (const line of out.split("\n")) {
    if (!line.trim()) continue;
    const [desc, x, y, w, h] = line.split("|");
    const m = desc.match(/^Track (\d+) [“"](.+)[”"]$/);
    tracks.push({
      description: desc,
      number: m ? parseInt(m[1]) : null,
      patch: m ? m[2] : null,
      x: parseInt(x),
      y: parseInt(y),
      w: parseInt(w),
      h: parseInt(h),
    });
  }
  return tracks;
}

export function selectTrack(hint) {
  const tracks = listTracks();
  const match = tracks.find((t) =>
    hint.match(/^\d+$/)
      ? t.number === parseInt(hint)
      : t.description.includes(hint) || (t.patch && t.patch.includes(hint))
  );
  if (!match) throw new Error(`No track matching hint: ${hint}`);
  osa(`
    tell application "System Events"
      tell process "Logic Pro X"
        set tw to missing value
        repeat with w in windows
          try
            if name of w contains "Tracks" then
              set tw to w
              exit repeat
            end if
          end try
        end repeat
        if tw is missing value then return ""
        set allElems to entire contents of tw
        repeat with e in allElems
          try
            if role of e is "AXLayoutItem" and description of e is "${match.description.replace(/"/g, '\\"')}" then
              perform action "AXPress" of e
              exit repeat
            end if
          end try
        end repeat
      end tell
    end tell
  `);
  sleep(0.3);
  return match;
}

export function keystroke(key, modifiers = []) {
  activate();
  const mod = modifiers.length
    ? ` using {${modifiers.map((m) => `${m} down`).join(", ")}}`
    : "";
  osa(`tell application "System Events" to tell process "Logic Pro X" to keystroke "${key}"${mod}`);
}

export function keyCode(code, modifiers = []) {
  activate();
  const mod = modifiers.length
    ? ` using {${modifiers.map((m) => `${m} down`).join(", ")}}`
    : "";
  osa(`tell application "System Events" to tell process "Logic Pro X" to key code ${code}${mod}`);
}

export function setLibrarySearch(query) {
  osa(`
    tell application "System Events"
      tell process "Logic Pro X"
        set tw to missing value
        repeat with w in windows
          try
            if name of w contains "Tracks" then
              set tw to w
              exit repeat
            end if
          end try
        end repeat
        if tw is missing value then return ""
        set allElems to entire contents of tw
        repeat with e in allElems
          try
            if role of e is "AXTextField" then
              set d to ""
              try
                set d to description of e
              end try
              if d is "search text field" then
                set focused of e to true
                delay 0.1
                set value of e to ""
                delay 0.1
                set value of e to "${query.replace(/"/g, '\\"')}"
                delay 0.6
                exit repeat
              end if
            end if
          end try
        end repeat
      end tell
    end tell
  `);
}

export function listLibraryRows() {
  return osa(`
    tell application "System Events"
      tell process "Logic Pro X"
        set tw to missing value
        repeat with w in windows
          try
            if name of w contains "Tracks" then
              set tw to w
              exit repeat
            end if
          end try
        end repeat
        if tw is missing value then return ""
        set allElems to entire contents of tw
        set acc to ""
        repeat with e in allElems
          try
            if role of e is "AXRow" then
              set p to position of e
              if (item 1 of p) >= 1728 and (item 1 of p) < 2138 then
                set lbl to ""
                repeat with c in UI elements of e
                  try
                    repeat with cc in UI elements of c
                      try
                        set v to value of cc
                        if v is not missing value then set lbl to lbl & v & " | "
                      end try
                    end repeat
                  end try
                end repeat
                set acc to acc & lbl & linefeed
              end if
            end if
          end try
        end repeat
        return acc
      end tell
    end tell
  `);
}

export function findLibraryRow(label) {
  return osa(`
    tell application "System Events"
      tell process "Logic Pro X"
        set tw to missing value
        repeat with w in windows
          try
            if name of w contains "Tracks" then
              set tw to w
              exit repeat
            end if
          end try
        end repeat
        if tw is missing value then return ""
        set allElems to entire contents of tw
        set coord to "none"
        repeat with e in allElems
          try
            if role of e is "AXRow" then
              set p to position of e
              if (item 1 of p) >= 1 then
                set lbl to ""
                repeat with c in UI elements of e
                  try
                    repeat with cc in UI elements of c
                      try
                        set v to value of cc
                        if v is not missing value then set lbl to lbl & v & " "
                      end try
                    end repeat
                  end try
                end repeat
                if lbl contains "${label.replace(/"/g, '\\"')}" then
                  set s to size of e
                  set cx to (item 1 of p) + (item 1 of s) / 2
                  set cy to (item 2 of p) + (item 2 of s) / 2
                  set coord to (cx as integer) & "," & (cy as integer)
                  exit repeat
                end if
              end if
            end if
          end try
        end repeat
        return coord
      end tell
    end tell
  `);
}

export function doubleClick(coord) {
  execFileSync(CLICLICK, [`dc:${coord}`]);
}
