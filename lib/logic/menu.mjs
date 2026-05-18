// Non-capturing AX driver core for Logic Pro — analog of the
// final-cut-pro-agent lib/fcp-ax + lib/fcp-ax-generic modules.
//
// Contract: osascript Accessibility actions on the "Logic Pro X" process
// only. No cliclick (cursor warp), no keystroke-to-frontmost, no
// screencapture, no activate / AXRaise (focus steal). Logic can stay
// backgrounded. Every osascript string contains the literal "Logic Pro"
// so the shared pre_bash hook (osascript permitted only for FCP / Logic
// Pro) lets it through.

import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const PROC = "Logic Pro X";

export function osaLogic(script) {
  if (!/Logic Pro/.test(script)) {
    throw new Error("osaLogic(): script must reference Logic Pro (hook scoping).");
  }
  return execFileSync("osascript", [], { encoding: "utf8", input: script }).trim();
}

export function isRunning() {
  return osaLogic(`tell application "System Events" to return (name of processes) contains "Logic Pro X"`) === "true";
}

// Background launch — does NOT bring Logic to the foreground.
export function launchBackground() {
  execFileSync("open", ["-g", "-a", "Logic Pro X"]);
}

// Open a project / file in Logic without stealing focus.
export function openFile(file) {
  execFileSync("open", ["-g", "-a", "Logic Pro X", resolve(file)]);
}

// Click a menu item: clickMenu(["File","Save"]) or nested
// clickMenu(["Track","New Tracks…"]) / 4-level paths. `click menu item`
// synthesizes the invocation into Logic's AX tree — no menu UI appears,
// no cursor moves, Logic need not be frontmost.
export function clickMenu(path) {
  if (!Array.isArray(path) || path.length < 2) throw new Error("clickMenu([top, ...nested, leaf])");
  const top = path[0];
  let chain = `menu "${top}" of menu bar item "${top}" of menu bar 1`;
  for (let i = 1; i < path.length - 1; i++) {
    chain = `menu "${path[i]}" of menu item "${path[i]}" of ${chain}`;
  }
  const target = `menu item "${path[path.length - 1]}" of ${chain}`;
  osaLogic(`
    tell application "System Events"
      tell process "Logic Pro X"
        click ${target}
      end tell
    end tell
  `);
}

// Enumerate every menu-bar-reachable command, up to four levels deep.
// One line per item: "Top > Sub > Leaf". Pure read.
export function listMenus() {
  return osaLogic(`
    tell application "System Events"
      tell process "Logic Pro X"
        set acc to ""
        repeat with mb in menu bar items of menu bar 1
          set tn to ""
          try
            set tn to name of mb
          end try
          if tn is not "" then
            try
              repeat with mi in menu items of menu 1 of mb
                try
                  set n1 to name of mi
                  if n1 is not "" and n1 is not missing value then
                    set acc to acc & tn & " > " & n1 & linefeed
                    try
                      repeat with mi2 in menu items of menu 1 of mi
                        try
                          set n2 to name of mi2
                          if n2 is not "" and n2 is not missing value then
                            set acc to acc & tn & " > " & n1 & " > " & n2 & linefeed
                            try
                              repeat with mi3 in menu items of menu 1 of mi2
                                try
                                  set n3 to name of mi3
                                  if n3 is not "" and n3 is not missing value then
                                    set acc to acc & tn & " > " & n1 & " > " & n2 & " > " & n3 & linefeed
                                  end if
                                end try
                              end repeat
                            end try
                          end if
                        end try
                      end repeat
                    end try
                  end if
                end try
              end repeat
            end try
          end if
        end repeat
        return acc
      end tell
    end tell
  `);
}

function asEsc(s) {
  return String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

// Read an AX attribute (AXValue, AXSize, AXEnabled, ...) of the first
// element whose description / value / name matches needle. Pure read.
export function getAttr(needle, attr) {
  const n = asEsc(needle), a = asEsc(attr);
  return osaLogic(`
    tell application "System Events"
      tell process "Logic Pro X"
        repeat with w in windows
          try
            repeat with e in (entire contents of w)
              try
                if (description of e is "${n}") or (value of e is "${n}") or (name of e is "${n}") then
                  return (get value of attribute "${a}" of e) as text
                end if
              end try
            end repeat
          end try
        end repeat
        error "getAttr: no element matching: ${n}"
      end tell
    end tell
  `);
}

// Write an AX attribute on the first matching element (sliders / faders /
// knobs / popups in the Logic mixer + Inspector are AXDescription-addressable).
export function setAttr(needle, attr, value) {
  const n = asEsc(needle), a = asEsc(attr), v = asEsc(value);
  osaLogic(`
    tell application "System Events"
      tell process "Logic Pro X"
        set done to false
        repeat with w in windows
          try
            repeat with e in (entire contents of w)
              try
                if (description of e is "${n}") or (value of e is "${n}") or (name of e is "${n}") then
                  set value of attribute "${a}" of e to "${v}"
                  set done to true
                  exit repeat
                end if
              end try
            end repeat
          end try
          if done then exit repeat
        end repeat
        if not done then error "setAttr: no element matching: ${n}"
      end tell
    end tell
  `);
}

// Perform any AX action (AXPress, AXIncrement, AXShowMenu, AXConfirm).
export function performAction(needle, action) {
  const n = asEsc(needle), a = asEsc(action);
  osaLogic(`
    tell application "System Events"
      tell process "Logic Pro X"
        set done to false
        repeat with w in windows
          try
            repeat with e in (entire contents of w)
              try
                if (description of e is "${n}") or (value of e is "${n}") or (name of e is "${n}") then
                  perform action "${a}" of e
                  set done to true
                  exit repeat
                end if
              end try
            end repeat
          end try
          if done then exit repeat
        end repeat
        if not done then error "performAction: no element matching: ${n}"
      end tell
    end tell
  `);
}

// `select` the first matching selectable element (track row, region,
// list item) — no mouse click.
export function selectElement(needle) {
  const n = asEsc(needle);
  osaLogic(`
    tell application "System Events"
      tell process "Logic Pro X"
        set done to false
        repeat with w in windows
          try
            repeat with e in (entire contents of w)
              try
                if (description of e is "${n}") or (value of e is "${n}") or (name of e is "${n}") then
                  select e
                  set done to true
                  exit repeat
                end if
              end try
            end repeat
          end try
          if done then exit repeat
        end repeat
        if not done then error "selectElement: no element matching: ${n}"
      end tell
    end tell
  `);
}

// Press a button by name in the topmost modal sheet (Bounce, Save As,
// alerts attach as sheet 1 of window 1). Falls through to the window.
export function dialogPress(label) {
  const n = asEsc(label);
  osaLogic(`
    tell application "System Events"
      tell process "Logic Pro X"
        set done to false
        repeat with w in windows
          try
            if (count of sheets of w) > 0 then
              try
                click button "${n}" of sheet 1 of w
                set done to true
                exit repeat
              end try
            end if
          end try
          if done then exit repeat
          try
            click button "${n}" of w
            set done to true
            exit repeat
          end try
        end repeat
        if not done then error "dialogPress: no button matching: ${n}"
      end tell
    end tell
  `);
}

// Enumerate window 1's AX tree: "role | description | value" per line.
export function dumpTree() {
  return osaLogic(`
    tell application "System Events"
      tell process "Logic Pro X"
        set acc to ""
        if (count of windows) is 0 then return ""
        try
          repeat with e in (entire contents of window 1)
            try
              set r to role of e
              set d to ""
              try
                set d to description of e
              end try
              set v to ""
              try
                set v to (value of e) as text
              end try
              set acc to acc & r & " | " & d & " | " & v & linefeed
            end try
          end repeat
        end try
        return acc
      end tell
    end tell
  `);
}
