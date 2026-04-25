// Background-safe Cua-driven command implementations. Each export maps
// to one CLI subcommand registered in logic.mjs.

import {
  ensureDaemon,
  getLogic,
  snapshot,
  clickIndex,
  setValue,
  pressKey,
  typeText,
  parseIndexedTree,
  cuaSwap,
  hotkey,
  waitForWindow,
  findWindowId,
} from "./logic-cua.mjs";

import { execFileSync } from "node:child_process";
function sleep(s) { execFileSync("sleep", [String(s)]); }

const TRACK_RE = (hint) => new RegExp(
  `\\[(\\d+)\\] AXLayoutItem \\(Track \\d+ [“"][^”"]*${hint.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^”"]*[”"]\\)`
);

export function cuaInit() {
  const state = ensureDaemon();
  const { pid, window_id } = getLogic();
  console.log(JSON.stringify({ daemon: state, pid, window_id }, null, 2));
}

export function cuaSnapshotCmd() {
  ensureDaemon();
  const { pid, window_id } = getLogic();
  console.log(snapshot(pid, window_id));
}

export function cuaClickCmd([idx]) {
  if (!idx) throw new Error("cua-click <element_index>");
  ensureDaemon();
  const { pid, window_id } = getLogic();
  console.log(clickIndex(pid, window_id, parseInt(idx)));
}

export function cuaPlayCmd() {
  ensureDaemon();
  const { pid, window_id } = getLogic();
  const items = parseIndexedTree(snapshot(pid, window_id));
  const play = items.find((i) => i.role === "AXCheckBox" && i.label === "Play");
  if (!play) throw new Error("Play button not found in AX tree");
  console.log(clickIndex(pid, window_id, play.index));
}

export function cuaStopCmd() {
  ensureDaemon();
  const { pid } = getLogic();
  console.log(pressKey(pid, "space"));
}

export function cuaPressCmd([key]) {
  if (!key) throw new Error("cua-press <key>");
  ensureDaemon();
  const { pid } = getLogic();
  console.log(pressKey(pid, key));
}

export function cuaTypeCmd(args) {
  const text = args.join(" ");
  if (!text) throw new Error("cua-type <text>");
  ensureDaemon();
  const { pid } = getLogic();
  console.log(typeText(pid, text));
}

export function cuaFindCmd(args) {
  const label = args.join(" ");
  if (!label) throw new Error("cua-find <label>");
  ensureDaemon();
  const { pid, window_id } = getLogic();
  const items = parseIndexedTree(snapshot(pid, window_id));
  const hits = items.filter((i) => i.label.toLowerCase().includes(label.toLowerCase()));
  console.log(JSON.stringify(hits, null, 2));
}

export function cuaSwapCmd([trackHint, patchName]) {
  if (!trackHint || !patchName) throw new Error("cua-swap <track-hint> <patch>");
  ensureDaemon();
  const { pid, window_id } = getLogic();
  console.log(cuaSwap(pid, window_id, trackHint, patchName));
}

export function cuaMaster() {
  ensureDaemon();
  const { pid, window_id } = getLogic();
  const tree = snapshot(pid, window_id);
  const mixIdx = tree.match(/\[(\d+)\] AXMenuBarItem "Mix"/);
  if (!mixIdx) throw new Error("Mix menu bar item not found");
  clickIndex(pid, window_id, parseInt(mixIdx[1]), "pick");
  sleep(0.3);
  const tree2 = snapshot(pid, window_id);
  const maIdx = tree2.match(/\[(\d+)\] AXMenuItem "Mastering Assistant…"/);
  if (!maIdx) throw new Error("Mastering Assistant menu item not found");
  clickIndex(pid, window_id, parseInt(maIdx[1]), "pick");
  sleep(1.0);
  console.log("Mastering Assistant inserted on Stereo Out");
}

function _selectTrack(pid, window_id, hint) {
  const tree = snapshot(pid, window_id);
  const m = tree.match(TRACK_RE(hint));
  if (!m) throw new Error(`track not found: ${hint}`);
  clickIndex(pid, window_id, parseInt(m[1]));
  sleep(0.2);
}

export function cuaMute([trackHint]) {
  if (!trackHint) throw new Error("cua-mute <track-hint>");
  ensureDaemon();
  const { pid, window_id } = getLogic();
  _selectTrack(pid, window_id, trackHint);
  pressKey(pid, "m");
  console.log(`muted ${trackHint}`);
}

export function cuaSolo([trackHint]) {
  if (!trackHint) throw new Error("cua-solo <track-hint>");
  ensureDaemon();
  const { pid, window_id } = getLogic();
  _selectTrack(pid, window_id, trackHint);
  pressKey(pid, "s");
  console.log(`soloed ${trackHint}`);
}

export function cuaSave([filename]) {
  const name = filename || "logic-pro-agent-project";
  ensureDaemon();
  const { pid } = getLogic();
  hotkey(pid, ["cmd", "s"]);
  sleep(0.7);
  const saveWin = findWindowId(pid, "Save");
  if (!saveWin) {
    console.log("Project saved (no dialog needed — already had a path)");
    return;
  }
  const tree = snapshot(pid, saveWin);
  const nameIdx = tree.match(/\[(\d+)\] AXTextField[^\n]*saveAsNameTextField/);
  const saveBtnIdx = tree.match(/\[(\d+)\] AXButton "Save"/);
  if (nameIdx) setValue(pid, saveWin, parseInt(nameIdx[1]), name);
  sleep(0.2);
  if (!saveBtnIdx) throw new Error("Save button not found in dialog");
  clickIndex(pid, saveWin, parseInt(saveBtnIdx[1]));
  sleep(0.6);
  console.log(`Project saved as ${name}`);
}

export function cuaBounce([filename]) {
  const name = filename || "logic-pro-agent-beat";
  ensureDaemon();
  const { pid } = getLogic();
  hotkey(pid, ["cmd", "b"]);
  const cfgWin = waitForWindow(pid, "Bounce ");
  let tree = snapshot(pid, cfgWin);
  const okIdx = tree.match(/\[(\d+)\] AXButton "OK"/);
  if (!okIdx) throw new Error("Bounce config dialog OK button not found");
  clickIndex(pid, cfgWin, parseInt(okIdx[1]));
  const saveWin = waitForWindow(pid, "Bounce ");
  sleep(0.4);
  tree = snapshot(pid, saveWin);
  const nameIdx = tree.match(/\[(\d+)\] AXTextField[^\n]*saveAsNameTextField/);
  const bounceIdx = tree.match(/\[(\d+)\] AXButton "Bounce"/);
  if (!nameIdx || !bounceIdx) throw new Error("Save dialog name or Bounce button not found");
  setValue(pid, saveWin, parseInt(nameIdx[1]), name);
  sleep(0.2);
  clickIndex(pid, saveWin, parseInt(bounceIdx[1]));
  sleep(2);
  console.log(`Bounce started: ${name}.aif (usually ~/Music/Logic/Bounces/)`);
}

// Inserts the default audio plug-in (Compressor on a software-instrument
// track) onto the named track's first free Inspector slot. Pure pixel-mode
// click via Cua — slot AXButtons report DISABLED but respond to a click.
export function cuaCompress([trackHint]) {
  if (!trackHint) throw new Error("cua-compress <track-hint>");
  ensureDaemon();
  const { pid, window_id } = getLogic();
  _selectTrack(pid, window_id, trackHint);
  const tree = snapshot(pid, window_id);
  if (!/\(audioPlugIn\)/.test(tree)) {
    pressKey(pid, "i");
    sleep(0.4);
  }
  const t2 = snapshot(pid, window_id);
  const slot = t2.match(/\[(\d+)\] AXButton \(audioPlugIn\)/);
  if (!slot) throw new Error("no audioPlugIn slot in inspector");
  // AXPress is unsupported on the disabled slot — Cua's double_click does an
  // OS-level pixel double-click at the element's resolved on-screen position,
  // which Logic accepts as "open plugin chooser then insert default plugin".
  call_dc(pid, window_id, parseInt(slot[1]));
  sleep(0.5);
  console.log(`Insert clicked on ${trackHint} (verify in Logic)`);
}

function call_dc(pid, window_id, element_index) {
  // Cua exposes double_click as a separate tool; importing it from logic-cua
  // would expand the surface area, so we shell out via the cua-driver binary
  // already in PATH for the daemon.
  execFileSync("/Users/lukaszbartoszcze/Desktop/logic-pro-agent/.cua/cua-driver", [
    "call", "double_click",
    JSON.stringify({ pid, window_id, element_index }),
  ], { encoding: "utf8" });
}
