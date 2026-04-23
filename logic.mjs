#!/usr/bin/env node
// logic.mjs - Logic Pro X automation CLI.
// Usage: node logic.mjs <command> [args...]
//   tracks | select <hint> | play | stop | rewind |
//   swap <track> <patch> | mute <track> | solo <track> |
//   search <query> | undo | redo | save-as <path> | open <file>

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
    doubleClick(coord);
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
