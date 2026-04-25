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

// Find a Logic window by name match. Returns window_id or null.
export function findWindowId(pid, namePart) {
  const out = call("list_windows", {});
  for (const line of out.split("\n")) {
    if (line.includes(`pid ${pid}`) && line.includes(namePart)) {
      const m = line.match(/window_id: (\d+)/);
      if (m) return parseInt(m[1]);
    }
  }
  return null;
}

export function waitForWindow(pid, namePart, timeoutMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const id = findWindowId(pid, namePart);
    if (id) return id;
    execFileSync("sleep", ["0.2"]);
  }
  throw new Error(`Window matching "${namePart}" did not appear within ${timeoutMs}ms`);
}

export function hotkey(pid, keys) {
  return call("hotkey", { pid, keys });
}

export function snapshot(pid, window_id, mode = "ax") {
  return call("get_window_state", { pid, window_id, capture_mode: mode });
}

export function clickIndex(pid, window_id, element_index, action) {
  const args = { pid, window_id, element_index };
  if (action) args.action = action;
  return call("click", args);
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

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sleepSec(s) {
  execFileSync("sleep", [String(s)]);
}

export function cuaSwap(pid, window_id, trackHint, patchName) {
  // Pure Cua path. Works with Logic behind any other app. Does NOT use the
  // Library search box — Cua doesn't index AXTable rows, so search results
  // can't be double-clicked by index. Instead, relies on the category
  // browser Logic shows for the selected track, whose patch rows ARE
  // indexed as AXStaticText. Clear any existing search first, then match
  // the patch label directly.

  let tree = snapshot(pid, window_id);
  const trackRe = new RegExp(
    `\\[(\\d+)\\] AXLayoutItem \\(Track \\d+ [“"][^”"]*${escapeRegex(trackHint)}[^”"]*[”"]\\)`
  );
  const trackMatch = tree.match(trackRe);
  if (!trackMatch) throw new Error(`track not found matching: ${trackHint}`);
  call("double_click", { pid, window_id, element_index: parseInt(trackMatch[1]) });
  sleepSec(0.5);

  // Ensure Library open and search cleared so we're in category-browser mode.
  tree = snapshot(pid, window_id);
  const searchRe = /\[(\d+)\] AXTextField[^\n]*help="Search field/;
  let searchMatch = tree.match(searchRe);
  if (!searchMatch) {
    pressKey(pid, "y");
    sleepSec(0.4);
    tree = snapshot(pid, window_id);
    searchMatch = tree.match(searchRe);
  }
  if (searchMatch) {
    setValue(pid, window_id, parseInt(searchMatch[1]), "");
    sleepSec(0.3);
    tree = snapshot(pid, window_id);
  }

  // Match the patch row. Logic may prefix "downloadable " on un-downloaded
  // patches — accept either bare or prefixed variant.
  const rowRe = new RegExp(
    `\\[(\\d+)\\] AXStaticText = "(?:downloadable )?${escapeRegex(patchName)}"`
  );
  const rowMatch = tree.match(rowRe);
  if (!rowMatch) throw new Error(`no Library entry for ${patchName} in this track's category`);
  call("double_click", { pid, window_id, element_index: parseInt(rowMatch[1]) });
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
