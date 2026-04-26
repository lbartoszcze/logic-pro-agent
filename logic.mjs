#!/usr/bin/env node
// logic.mjs - Logic Pro X automation CLI. Two backends:
//   AX + cliclick  (raises Logic): tracks, select, play, stop, rewind, swap,
//                  mute, solo, search, undo, redo, save-as, open
//   cua-driver     (Logic stays backgrounded):
//                  cua-init, cua-snapshot, cua-click <idx>, cua-play,
//                  cua-stop, cua-press <key>, cua-type <text>, cua-find <label>,
//                  cua-swap <track> <patch>, cua-master, cua-mute <track>,
//                  cua-solo <track>, cua-save [name], cua-bounce [name]

import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import {
  activate, listTracks, selectTrack, keystroke, keyCode,
  setLibrarySearch, listLibraryRows, findLibraryRow, doubleClick, osa, sleep,
} from "./lib/logic-ax.mjs";
import { ensureDaemon, getLogic, makePixelClicker } from "./lib/logic-cua.mjs";
import {
  cuaInit, cuaSnapshotCmd, cuaClickCmd, cuaPlayCmd, cuaStopCmd,
  cuaPressCmd, cuaTypeCmd, cuaFindCmd, cuaSwapCmd, cuaMaster,
  cuaMute, cuaSolo, cuaSave, cuaBounce, cuaTempo, cuaCycle, cuaMetronome,
  cuaUndo, cuaRedo, cuaTracks, cuaZoomFit,
} from "./lib/logic-cua-cmds.mjs";

const CMD = {
  tracks() { console.log(JSON.stringify(listTracks(), null, 2)); },
  select([h]) { if (!h) throw new Error("select <hint>"); console.log(JSON.stringify(selectTrack(h), null, 2)); },
  play() { keyCode(49); },
  stop() { keyCode(49); },
  rewind() { keyCode(36); },

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

  mute([h]) { if (!h) throw new Error("mute <track-hint>"); selectTrack(h); keystroke("m"); },
  solo([h]) { if (!h) throw new Error("solo <track-hint>"); selectTrack(h); keystroke("s"); },
  search([q]) { if (!q) throw new Error("search <query>"); activate(); setLibrarySearch(q); console.log(listLibraryRows()); },
  undo() { keystroke("z", ["command"]); },
  redo() { keystroke("z", ["command", "shift"]); },

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

  // Cua-backed (background-safe) commands — implementations in lib/logic-cua-cmds.mjs.
  "cua-init":     cuaInit,
  "cua-snapshot": cuaSnapshotCmd,
  "cua-click":    cuaClickCmd,
  "cua-play":     cuaPlayCmd,
  "cua-stop":     cuaStopCmd,
  "cua-press":    cuaPressCmd,
  "cua-type":     cuaTypeCmd,
  "cua-find":     cuaFindCmd,
  "cua-swap":     cuaSwapCmd,
  "cua-master":   cuaMaster,
  "cua-mute":     cuaMute,
  "cua-solo":     cuaSolo,
  "cua-save":     cuaSave,
  "cua-bounce":     cuaBounce,
  "cua-tempo":      cuaTempo,
  "cua-cycle":      cuaCycle,
  "cua-metronome":  cuaMetronome,
  "cua-undo":       cuaUndo,
  "cua-redo":       cuaRedo,
  "cua-tracks":     cuaTracks,
  "cua-zoom-fit":   cuaZoomFit,
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
