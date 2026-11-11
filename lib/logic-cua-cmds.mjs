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

// The element index `pattern` captures in the accessibility tree read from
// window `windowId`, or an Error naming the element, the window, how many
// elements were read and the pattern none of them matched: Logic Pro shows
// another window, has not drawn the control yet, or labels it differently.
function axIndex(tree, pattern, what, windowId) {
  const match = tree.match(pattern);
  if (match) return parseInt(match[1]);
  const read = tree.split("\n").filter((line) => /^\s*\[\d+\]/.test(line)).length;
  throw new Error(
    `${what} is not in the accessibility tree of Logic Pro window ${windowId}: ${read} elements were read and none matches ${pattern}`,
  );
}

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
  if (!play) throw new Error(`no AXCheckBox labelled "Play" in the AX tree of Logic window ${window_id} (pid ${pid}); it holds ${items.length} elements, so the transport bar may be hidden`);
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
  clickIndex(pid, window_id, axIndex(tree, /\[(\d+)\] AXMenuBarItem "Mix"/, "the Mix menu bar item", window_id), "pick");
  sleep(0.3);
  const tree2 = snapshot(pid, window_id);
  clickIndex(pid, window_id, axIndex(tree2, /\[(\d+)\] AXMenuItem "Mastering Assistant…"/, "the Mix menu's Mastering Assistant… item", window_id), "pick");
  sleep(1.0);
  console.log("Mastering Assistant inserted on Stereo Out");
}

function _selectTrack(pid, window_id, hint) {
  const tree = snapshot(pid, window_id);
  clickIndex(pid, window_id, axIndex(tree, TRACK_RE(hint), `a track whose name contains "${hint}"`, window_id));
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
  const saveBtnIdx = axIndex(tree, /\[(\d+)\] AXButton "Save"/, "the Save dialog's Save button", saveWin);
  if (nameIdx) setValue(pid, saveWin, parseInt(nameIdx[1]), name);
  sleep(0.2);
  clickIndex(pid, saveWin, saveBtnIdx);
  sleep(0.6);
  console.log(`Project saved as ${name}`);
}

export function cuaZoomFit() {
  ensureDaemon();
  const { pid } = getLogic();
  pressKey(pid, "z");
  console.log("zoom-to-fit");
}

export function cuaTracks() {
  ensureDaemon();
  const { pid, window_id } = getLogic();
  const tree = snapshot(pid, window_id);
  const re = /\[(\d+)\] AXLayoutItem \(Track (\d+) [“"]([^”"]+)[”"]\)/g;
  const out = [];
  let m;
  while ((m = re.exec(tree)) !== null) {
    out.push({ index: parseInt(m[1]), number: parseInt(m[2]), patch: m[3] });
  }
  console.log(JSON.stringify(out, null, 2));
}

export function cuaUndo() {
  ensureDaemon();
  const { pid } = getLogic();
  hotkey(pid, ["cmd", "z"]);
  console.log("undo");
}

export function cuaRedo() {
  ensureDaemon();
  const { pid } = getLogic();
  hotkey(pid, ["cmd", "shift", "z"]);
  console.log("redo");
}

export function cuaCycle() {
  ensureDaemon();
  const { pid, window_id } = getLogic();
  const tree = snapshot(pid, window_id);
  clickIndex(pid, window_id, axIndex(tree, /\[(\d+)\] AXCheckBox "Cycle"/, "the Cycle button", window_id));
  console.log("toggled Cycle");
}

export function cuaMetronome() {
  ensureDaemon();
  const { pid, window_id } = getLogic();
  const tree = snapshot(pid, window_id);
  clickIndex(pid, window_id, axIndex(tree, /\[(\d+)\] AXCheckBox "Metronome Click"/, "the Metronome Click button", window_id));
  console.log("toggled Metronome");
}

export function cuaTempo([bpm]) {
  if (!bpm) throw new Error("cua-tempo <bpm>");
  const target = parseInt(bpm);
  if (!Number.isFinite(target) || target < 30 || target > 300) {
    throw new Error(`bpm out of range: ${bpm}`);
  }
  ensureDaemon();
  const { pid, window_id } = getLogic();
  const tree = snapshot(pid, window_id);
  setValue(pid, window_id, axIndex(tree, /\[(\d+)\] AXSlider \(Tempo\)/, "the Tempo slider", window_id), String(target));
  console.log(`set tempo to ${target} BPM`);
}

export function cuaBounce([filename]) {
  const name = filename || "logic-pro-agent-beat";
  ensureDaemon();
  const { pid } = getLogic();
  hotkey(pid, ["cmd", "b"]);
  const cfgWin = waitForWindow(pid, "Bounce ");
  let tree = snapshot(pid, cfgWin);
  clickIndex(pid, cfgWin, axIndex(tree, /\[(\d+)\] AXButton "OK"/, "the Bounce dialog's OK button", cfgWin));
  const saveWin = waitForWindow(pid, "Bounce ");
  sleep(0.4);
  tree = snapshot(pid, saveWin);
  const nameIdx = axIndex(tree, /\[(\d+)\] AXTextField[^\n]*saveAsNameTextField/, "the Bounce save dialog's name field", saveWin);
  const bounceIdx = axIndex(tree, /\[(\d+)\] AXButton "Bounce"/, "the Bounce save dialog's Bounce button", saveWin);
  setValue(pid, saveWin, nameIdx, name);
  sleep(0.2);
  clickIndex(pid, saveWin, bounceIdx);
  sleep(2);
  console.log(`Bounce started: ${name}.aif (usually ~/Music/Logic/Bounces/)`);
}

// Per-track plugin insertion path (notes for future iteration):
//   1. Each `(audioPlugIn)` AXButton in Logic's Inspector / Mixer has TWO
//      actions: standard AXPress (fails when slot reports DISABLED) and a
//      custom action whose name string is exactly:
//        `Open plug-in menu with legacy plug-ins`
//      Cua's `click` currently only routes AXPress — it doesn't surface
//      arbitrary custom actions by name.
//   2. Workaround: invoke the action through osascript via `perform (item 2
//      of (actions of e))`. Verified live this session that this opens a
//      plug-in window, but Logic's selection state must be the target track
//      first (otherwise the Inspector's currently-shown channel is Stereo
//      Out / Master and the action fires there).
//   3. Once the plugin chooser opens, navigate to e.g. Dynamics > Compressor
//      via menu pick on the floating chooser, then the loaded Compressor
//      window appears and its Side-Chain dropdown is settable to "Drums".
// Each plugin window is its own top-level Logic window with its own AX tree
// so the chain is multi-step but tractable. Not wired here yet to avoid
// shipping a half-working command.
