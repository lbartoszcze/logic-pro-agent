#!/usr/bin/env node
// logic.mjs - Logic Pro X automation CLI. Two backends:
//   AX + cliclick  (default, raises Logic): tracks, select, play, stop, rewind,
//                  swap, mute, solo, search, undo, redo, save-as, open
//   cua-driver     (keeps Logic in the background):
//                  cua-init, cua-snapshot, cua-click <idx>, cua-play, cua-stop,
//                  cua-press <key>, cua-type <text>, cua-find <label>

import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import {
  activate,
  listTracks,
  selectTrack,
  keystroke,
  keyCode,
  setLibrarySearch,
  listLibraryRows,
  findLibraryRow,
  doubleClick,
  osa,
  sleep,
} from "./lib/logic-ax.mjs";
import {
  ensureDaemon,
  getLogic,
  snapshot,
  clickIndex,
  setValue,
  pressKey,
  typeText,
  parseIndexedTree,
  makePixelClicker,
  cuaSwap,
  hotkey,
  waitForWindow,
  findWindowId,
} from "./lib/logic-cua.mjs";

const CMD = {
  tracks() {
    console.log(JSON.stringify(listTracks(), null, 2));
  },

  select([hint]) {
    if (!hint) throw new Error("select <hint>");
    console.log(JSON.stringify(selectTrack(hint), null, 2));
  },

  play() {
    keyCode(49);
  },

  stop() {
    keyCode(49);
  },

  rewind() {
    keyCode(36);
  },

  swap([hint, patch]) {
    if (!hint || !patch) throw new Error("swap <track-hint> <patch>");
    selectTrack(hint);
    setLibrarySearch(patch);
    const coord = findLibraryRow(patch);
    if (coord === "none") throw new Error(`patch not found in Library: ${patch}`);
    const [x, y] = coord.split(",").map(Number);
    ensureDaemon();
    const { pid, window_id } = getLogic();
    makePixelClicker(pid, window_id).click(x, y, { count: 2 });
    sleep(0.8);
    console.log(`loaded ${patch} on ${hint}`);
  },

  mute([hint]) {
    if (!hint) throw new Error("mute <track-hint>");
    selectTrack(hint);
    keystroke("m");
  },

  solo([hint]) {
    if (!hint) throw new Error("solo <track-hint>");
    selectTrack(hint);
    keystroke("s");
  },

  search([query]) {
    if (!query) throw new Error("search <query>");
    activate();
    setLibrarySearch(query);
    console.log(listLibraryRows());
  },

  undo() {
    keystroke("z", ["command"]);
  },

  redo() {
    keystroke("z", ["command", "shift"]);
  },

  "save-as"([path]) {
    if (!path) throw new Error("save-as <absolute-path>");
    const abs = resolve(path);
    activate();
    keystroke("s", ["command", "shift"]);
    sleep(0.8);
    keystroke("g", ["command", "shift"]);
    sleep(0.4);
    osa(`tell application "System Events" to keystroke "${abs.replace(/"/g, '\\"')}"`);
    sleep(0.3);
    keyCode(36);
    sleep(0.4);
    keyCode(36);
  },

  open([file]) {
    if (!file) throw new Error("open <path>");
    execFileSync("open", ["-a", "Logic Pro X", resolve(file)]);
  },

  "cua-init"() {
    const state = ensureDaemon();
    const { pid, window_id } = getLogic();
    console.log(JSON.stringify({ daemon: state, pid, window_id }, null, 2));
  },

  "cua-snapshot"() {
    ensureDaemon();
    const { pid, window_id } = getLogic();
    console.log(snapshot(pid, window_id));
  },

  "cua-click"([idx]) {
    if (!idx) throw new Error("cua-click <element_index>");
    ensureDaemon();
    const { pid, window_id } = getLogic();
    console.log(clickIndex(pid, window_id, parseInt(idx)));
  },

  "cua-play"() {
    ensureDaemon();
    const { pid, window_id } = getLogic();
    const tree = snapshot(pid, window_id);
    const items = parseIndexedTree(tree);
    const play = items.find((i) => i.role === "AXCheckBox" && i.label === "Play");
    if (!play) throw new Error("Play button not found in AX tree");
    console.log(clickIndex(pid, window_id, play.index));
  },

  "cua-stop"() {
    ensureDaemon();
    const { pid } = getLogic();
    // Spacebar toggles transport in Logic; direct key_post is reliable even
    // when the main window is occluded or the Stop button is outside the AX
    // snapshot due to focus state.
    console.log(pressKey(pid, "space"));
  },

  "cua-press"([key]) {
    if (!key) throw new Error("cua-press <key>");
    ensureDaemon();
    const { pid } = getLogic();
    console.log(pressKey(pid, key));
  },

  "cua-type"(args) {
    const text = args.join(" ");
    if (!text) throw new Error("cua-type <text>");
    ensureDaemon();
    const { pid } = getLogic();
    console.log(typeText(pid, text));
  },

  "cua-find"(args) {
    const label = args.join(" ");
    if (!label) throw new Error("cua-find <label>");
    ensureDaemon();
    const { pid, window_id } = getLogic();
    const tree = snapshot(pid, window_id);
    const items = parseIndexedTree(tree);
    const hits = items.filter((i) => i.label.toLowerCase().includes(label.toLowerCase()));
    console.log(JSON.stringify(hits, null, 2));
  },

  "cua-swap"([trackHint, patchName]) {
    if (!trackHint || !patchName) throw new Error("cua-swap <track-hint> <patch>");
    ensureDaemon();
    const { pid, window_id } = getLogic();
    console.log(cuaSwap(pid, window_id, trackHint, patchName));
  },

  "cua-master"() {
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
  },

  "cua-mute"([trackHint]) {
    if (!trackHint) throw new Error("cua-mute <track-hint>");
    ensureDaemon();
    const { pid, window_id } = getLogic();
    const tree = snapshot(pid, window_id);
    const m = tree.match(new RegExp(
      `\\[(\\d+)\\] AXLayoutItem \\(Track \\d+ [“"][^”"]*${trackHint.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^”"]*[”"]\\)`));
    if (!m) throw new Error(`track not found: ${trackHint}`);
    clickIndex(pid, window_id, parseInt(m[1])); // selects the track (background)
    sleep(0.2);
    pressKey(pid, "m"); // M = mute selected track
    console.log(`muted ${trackHint}`);
  },

  "cua-solo"([trackHint]) {
    if (!trackHint) throw new Error("cua-solo <track-hint>");
    ensureDaemon();
    const { pid, window_id } = getLogic();
    const tree = snapshot(pid, window_id);
    const m = tree.match(new RegExp(
      `\\[(\\d+)\\] AXLayoutItem \\(Track \\d+ [“"][^”"]*${trackHint.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^”"]*[”"]\\)`));
    if (!m) throw new Error(`track not found: ${trackHint}`);
    clickIndex(pid, window_id, parseInt(m[1]));
    sleep(0.2);
    pressKey(pid, "s"); // S = solo selected track
    console.log(`soloed ${trackHint}`);
  },

  "cua-save"([filename]) {
    // Cmd+S — opens Save dialog if untitled, no-op if already saved.
    // If untitled, sets the filename and clicks Save in the dialog.
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
  },

  "cua-bounce"([filename]) {
    // File > Bounce > Project (Cmd+B) → confirm format dialog → save dialog.
    // Output lands in ~/Music/Audio Music Apps/Bounces/<filename>.aif.
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
    console.log(`Bounce started: ${name}.aif (Logic's default Bounces folder, usually ~/Music/Logic/Bounces/)`);
  },
};

const [cmd, ...rest] = process.argv.slice(2);
if (!cmd || !CMD[cmd]) {
  console.error("Usage: node logic.mjs <command> [args...]");
  console.error("Commands: " + Object.keys(CMD).join(", "));
  process.exit(1);
}
try {
  CMD[cmd](rest);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
