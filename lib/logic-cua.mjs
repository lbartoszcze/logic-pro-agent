// cua-driver wrapper for Logic Pro X — background computer-use.
// Requires cua-driver binary at .cua/cua-driver and its daemon running.
// Start the daemon with: .cua/cua-driver serve &

import { execFileSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const CUA_BIN = join(HERE, "..", ".cua", "cua-driver");

function requireBinary() {
  if (!existsSync(CUA_BIN)) {
    throw new Error(`cua-driver not found at ${CUA_BIN}. Run: bash -c "$(curl -fsSL https://raw.githubusercontent.com/trycua/cua/main/libs/cua-driver/scripts/install.sh)"`);
  }
}

function call(tool, args = {}) {
  requireBinary();
  const out = execFileSync(CUA_BIN, ["call", tool, JSON.stringify(args)], {
    encoding: "utf8",
    maxBuffer: 50_000_000,
  });
  return out;
}

export function ensureDaemon() {
  requireBinary();
  try {
    execFileSync(CUA_BIN, ["status"], { encoding: "utf8" });
    return "running";
  } catch {
    spawn(CUA_BIN, ["serve"], { detached: true, stdio: "ignore" }).unref();
    execFileSync("sleep", ["1.5"]);
    return "started";
  }
}

export function getLogic() {
  const apps = call("list_apps", {});
  const appMatch = apps.match(/Logic Pro \(pid (\d+)\)/);
  if (!appMatch) throw new Error("Logic Pro is not running. Launch it first.");
  const pid = parseInt(appMatch[1]);

  const windows = call("list_windows", {});
  const lines = windows.split("\n");
  for (const line of lines) {
    if (line.includes(`pid ${pid}`) && line.includes("\"Untitled - Tracks\"")) {
      const m = line.match(/window_id: (\d+)/);
      if (m) return { pid, window_id: parseInt(m[1]) };
    }
  }
  for (const line of lines) {
    if (line.includes(`pid ${pid}`) && line.includes("Tracks")) {
      const m = line.match(/window_id: (\d+)/);
      if (m) return { pid, window_id: parseInt(m[1]) };
    }
  }
  throw new Error("No Logic 'Tracks' window found.");
}

export function snapshot(pid, window_id, mode = "ax") {
  return call("get_window_state", { pid, window_id, capture_mode: mode });
}

export function clickIndex(pid, window_id, element_index) {
  return call("click", { pid, window_id, element_index });
}

export function setValue(pid, window_id, element_index, value) {
  return call("set_value", { pid, window_id, element_index, value });
}

export function pressKey(pid, key) {
  return call("press_key", { pid, key });
}

export function typeText(pid, text) {
  return call("type_text", { pid, text });
}

export function getWindowBounds(pid, window_id) {
  // Find the named Tracks window (Logic has many windows; index 1 isn't
  // guaranteed to be the main arrange view).
  const raw = execFileSync("osascript", [], {
    encoding: "utf8",
    input: `
      tell application "System Events"
        tell process "Logic Pro X"
          set targetWin to missing value
          repeat with w in windows
            try
              if name of w contains "Tracks" then
                set targetWin to w
                exit repeat
              end if
            end try
          end repeat
          if targetWin is missing value then return "nowin"
          set p to position of targetWin
          set s to size of targetWin
          set x to item 1 of p
          set y to item 2 of p
          set w to item 1 of s
          set h to item 2 of s
          return (x as integer as string) & "|" & (y as integer as string) & "|" & (w as integer as string) & "|" & (h as integer as string)
        end tell
      end tell
    `,
  }).trim();
  if (raw === "nowin") throw new Error("No Logic 'Tracks' window found");
  const [x, y, w, h] = raw.split("|").map(Number);
  return { x, y, w, h };
}

function screenshotScale(pid, window_id) {
  // Trigger a vision snapshot and read the width line.
  const out = call("get_window_state", { pid, window_id, capture_mode: "vision" });
  const m = out.match(/Screenshot is (\d+)px wide/);
  if (!m) throw new Error("could not read screenshot width from Cua");
  const pngWidth = parseInt(m[1]);
  const wb = getWindowBounds(pid, window_id);
  return pngWidth / wb.w;
}

function osa(script) {
  return execFileSync("osascript", [], { encoding: "utf8", input: script }).trim();
}

function findTrackScreenPos(trackHint) {
  return osa(`
    tell application "System Events"
      tell process "Logic Pro X"
        set targetWin to missing value
        repeat with w in windows
          try
            if name of w contains "Tracks" then
              set targetWin to w
              exit repeat
            end if
          end try
        end repeat
        if targetWin is missing value then return "nowin"
        set allElems to entire contents of targetWin
        repeat with e in allElems
          try
            if role of e is "AXLayoutItem" and description of e contains "${trackHint.replace(/"/g, '\\"')}" then
              set p to position of e
              set s to size of e
              set cx to (item 1 of p) + (item 1 of s) / 2
              set cy to (item 2 of p) + (item 2 of s) / 2
              return (cx as integer as string) & "|" & (cy as integer as string)
            end if
          end try
        end repeat
        return "miss"
      end tell
    end tell
  `);
}

function findLibraryRowPos(labelSub) {
  return osa(`
    tell application "System Events"
      tell process "Logic Pro X"
        set targetWin to missing value
        repeat with w in windows
          try
            if name of w contains "Tracks" then
              set targetWin to w
              exit repeat
            end if
          end try
        end repeat
        if targetWin is missing value then return "nowin"
        set allElems to entire contents of targetWin
        repeat with e in allElems
          try
            if role of e is "AXRow" then
              set p to position of e
              if (item 1 of p) >= 1 then
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
                if label contains "${labelSub.replace(/"/g, '\\"')}" then
                  set s to size of e
                  set cx to (item 1 of p) + (item 1 of s) / 2
                  set cy to (item 2 of p) + (item 2 of s) / 2
                  return (cx as integer as string) & "|" & (cy as integer as string)
                end if
              end if
            end if
          end try
        end repeat
        return "miss"
      end tell
    end tell
  `);
}

function sleepSec(s) {
  execFileSync("sleep", [String(s)]);
}

export function cuaSwap(pid, window_id, trackHint, patchName) {
  // Position lookup via osascript needs Logic's Tracks window on this Space.
  // Bring it over; the actual clicks go through Cua (no cursor jump).
  osa(`tell application "Logic Pro X" to activate`);

  // Retry until System Events sees a Logic Tracks window (it takes a moment
  // for AX to populate after a Space switch / un-hide).
  let trackPos = "nowin";
  for (let i = 0; i < 10; i++) {
    sleepSec(0.3);
    snapshot(pid, window_id);
    trackPos = findTrackScreenPos(trackHint);
    if (trackPos !== "nowin") break;
  }
  if (trackPos === "miss") throw new Error(`track not found: ${trackHint}`);
  if (trackPos === "nowin") throw new Error("Logic Tracks window not on this Space");
  const [tcx, tcy] = trackPos.split("|").map(Number);
  if (!Number.isFinite(tcx)) throw new Error(`bad track pos: ${trackPos}`);

  const clicker = makePixelClicker(pid, window_id);
  clicker.click(tcx, tcy);
  sleepSec(0.4);

  let tree = snapshot(pid, window_id);
  const searchRe = /\[(\d+)\] AXTextField[^\n]*help="Search field/;
  let searchMatch = tree.match(searchRe);
  if (!searchMatch) {
    pressKey(pid, "y");
    sleepSec(0.4);
    tree = snapshot(pid, window_id);
    searchMatch = tree.match(searchRe);
  }
  if (!searchMatch) throw new Error("Library search field not visible");
  setValue(pid, window_id, parseInt(searchMatch[1]), patchName);
  sleepSec(0.7);

  const rowPos = findLibraryRowPos(patchName);
  if (rowPos === "miss") throw new Error(`no Library row matches: ${patchName}`);
  const [rcx, rcy] = rowPos.split("|").map(Number);

  clicker.click(rcx, rcy, { count: 2 });
  sleepSec(0.8);
  return `loaded ${patchName} on ${trackHint}`;
}

// Screen-point -> window-local PNG pixel. Cached scale per call site
// to avoid re-probing for every click in a swap sequence.
export function makePixelClicker(pid, window_id) {
  const wb = getWindowBounds(pid, window_id);
  const scale = screenshotScale(pid, window_id);
  return {
    /** click(screenX, screenY, {count = 1} = {}) — background-safe via cua */
    click(screenX, screenY, { count = 1 } = {}) {
      const x = Math.round((screenX - wb.x) * scale);
      const y = Math.round((screenY - wb.y) * scale);
      return call("click", { pid, window_id, x, y, count });
    },
    /** Returns {x, y} PNG pixels for a screen point (for debug/inspection). */
    toPng(screenX, screenY) {
      return { x: Math.round((screenX - wb.x) * scale), y: Math.round((screenY - wb.y) * scale) };
    },
    bounds: wb,
    scale,
  };
}

export function parseIndexedTree(treeText) {
  // Parse lines like: `- [15] AXCheckBox "Play" (Play) help=...`
  // Returns array of {index, role, label, help, actions}
  const re = /\[(\d+)\]\s+(\S+)\s+(?:"([^"]+)")?/g;
  const out = [];
  let m;
  while ((m = re.exec(treeText)) !== null) {
    out.push({
      index: parseInt(m[1]),
      role: m[2],
      label: m[3] || "",
    });
  }
  return out;
}

export function findIndex(treeText, predicate) {
  const items = parseIndexedTree(treeText);
  return items.find(predicate);
}
