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

export function doubleClickIndex(pid, window_id, element_index) {
  return call("double_click", { pid, window_id, element_index });
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
