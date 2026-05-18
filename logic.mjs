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
import { clickMenu, listMenus, getAttr, setAttr, performAction, dumpTree, dialogPress } from "./lib/logic/menu.mjs";
import { WRAPPERS, WRAPPERS_HELP } from "./lib/logic/wrappers.mjs";
import * as M from "./lib/logic/midi-control.mjs";

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

  // ---- Non-capturing AX surface (mirror of the FCP driver) ----
  menu(args) {
    if (args.length < 2) throw new Error('menu <Top> [<Sub>...] <Leaf>   e.g. menu File Save');
    clickMenu(args); console.log("menu: " + args.join(" → "));
  },
  menus() { process.stdout.write(listMenus()); },
  "ax-get"([attr, ...rest]) {
    if (!attr || !rest.length) throw new Error("ax-get <attr> <needle...>");
    process.stdout.write(getAttr(rest.join(" "), attr) + "\n");
  },
  "ax-set"([attr, needle, ...v]) {
    if (!attr || !needle || !v.length) throw new Error("ax-set <attr> <needle> <value>");
    setAttr(needle, attr, v.join(" ")); console.log(`ax-set ${attr} of "${needle}" = ${v.join(" ")}`);
  },
  "ax-press"([action, ...rest]) {
    if (!action || !rest.length) throw new Error("ax-press <action> <needle...>");
    performAction(rest.join(" "), action); console.log(`ax-press ${action} on "${rest.join(" ")}"`);
  },
  "dialog-button"([...rest]) {
    if (!rest.length) throw new Error("dialog-button <label...>");
    dialogPress(rest.join(" ")); console.log("dialog button: " + rest.join(" "));
  },
  dump() { process.stdout.write(dumpTree()); },
  wrappers() {
    console.log(`Named wrappers (${Object.keys(WRAPPERS).length}):`);
    for (const [g, ns] of WRAPPERS_HELP) { console.log("  " + g + ":"); console.log("    " + ns.join("  ")); }
  },
  // ---- MIDI control plane (non-capturing: pure MIDI, no cursor/screen) ----
  "midi-dests"() { console.log(M.listDestinations()); },
  fader([s, v]) { if (s == null || v == null) throw new Error("fader <strip 0-7> <0..1>"); M.fader(+s, +v); console.log(`fader ${s} = ${v}`); },
  "master-fader"([v]) { if (v == null) throw new Error("master-fader <0..1>"); M.masterFader(+v); console.log(`master = ${v}`); },
  "mute-ch"([s]) { if (s == null) throw new Error("mute-ch <strip 0-7>"); M.mute(+s); console.log(`mute strip ${s}`); },
  "solo-ch"([s]) { if (s == null) throw new Error("solo-ch <strip 0-7>"); M.solo(+s); console.log(`solo strip ${s}`); },
  recarm([s]) { if (s == null) throw new Error("recarm <strip 0-7>"); M.recArm(+s); console.log(`rec-arm strip ${s}`); },
  "track-select"([s]) { if (s == null) throw new Error("track-select <strip 0-7>"); M.trackSelect(+s); console.log(`select strip ${s}`); },
  vpot([s, d]) { if (s == null || d == null) throw new Error("vpot <strip 0-7> <delta>"); M.vpot(+s, +d); console.log(`vpot ${s} ${d}`); },
  mtransport([a]) { if (!a) throw new Error("mtransport <play|stop|record|rewind|ffwd|cycle>"); M.transport(a); console.log(`transport ${a}`); },
  cc([ch, n, v]) { if (ch == null || n == null || v == null) throw new Error("cc <ch> <num> <val>"); M.cc(+ch, +n, +v); console.log(`CC ch${ch} ${n}=${v}`); },
  "midi-note"([ch, p, v, ms]) { if (ch == null || p == null) throw new Error("midi-note <ch> <pitch> [vel] [ms]"); M.note(+ch, +p, v ? +v : 100, ms ? +ms : 250); console.log(`note ch${ch} ${p}`); },
  pc([ch, prog]) { if (ch == null || prog == null) throw new Error("pc <ch> <program>"); M.programChange(+ch, +prog); console.log(`PC ch${ch} ${prog}`); },
  assign([m]) { if (!m) throw new Error("assign <track|send|pan|plugin|eq|instrument>"); M.assign(m); console.log(`vpot assign = ${m}`); },
  nav([w]) { if (!w) throw new Error("nav <bank-left|bank-right|chan-left|chan-right|flip|global-view|name-value>"); M.nav(w); console.log(`nav ${w}`); },

  // Complete Bounce flow (analog of FCP complete-Share): open the Bounce
  // dialog via menu, then press the Bounce button on the settings sheet
  // and again on the Save sheet. `scope` = project (default) | regions |
  // tracks | replace.
  async bounce([scope = "project"]) {
    const leaf = { project: "Project or Section…", regions: "Regions in Place…",
      tracks: "Tracks in Place…", replace: "And Replace All Tracks…" }[scope];
    if (!leaf) throw new Error("bounce <project|regions|tracks|replace>");
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    clickMenu(["File", "Bounce", leaf]);
    await wait(1500);
    try { dialogPress("Bounce"); } catch (_) {}
    await wait(1500);
    try { dialogPress("Bounce"); } catch (_) { try { dialogPress("Save"); } catch (_) {} }
    console.log(`bounce: ${scope}`);
  },

  ...WRAPPERS,
};

const [cmd, ...rest] = process.argv.slice(2);
if (!cmd || !CMD[cmd]) {
  console.error("Usage: node logic.mjs <command> [args...]");
  console.error("Commands: " + Object.keys(CMD).join(", "));
  process.exit(1);
}
try {
  const r = CMD[cmd](rest);
  if (r && typeof r.then === "function") r.catch((e) => { console.error(e.message); process.exit(1); });
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
