#!/usr/bin/env node
// logic.mjs - Logic Pro automation CLI. Logic stays in the background: the
// Logic commands go through golem (lib/golem.mjs), the mixer and transport
// controls through MIDI (lib/logic/midi-control.mjs).
//   open <file>, doctor, tracks, select, play, stop, rewind, cycle, metronome,
//   zoom-fit, mute, solo, tempo, master, search, swap <track> <patch>,
//   save [name], bounce [name], bounce-in-place <scope>, key, type, menu,
//   golem <command> [arguments] (any golem command against Logic),
//   wrappers (named menu commands), and the MIDI commands below.

import * as L from "./lib/logic/control.mjs";
import { WRAPPERS, WRAPPERS_HELP } from "./lib/logic/wrappers.mjs";
import * as M from "./lib/logic/midi-control.mjs";

const CMD = {
  ...WRAPPERS,
  open: L.open,
  doctor: L.doctor,
  tracks: L.tracks,
  select: L.select,
  play: L.play,
  stop: L.stop,
  rewind: L.rewind,
  cycle: L.cycle,
  metronome: L.metronome,
  "zoom-fit": L.zoomFit,
  mute: L.mute,
  solo: L.solo,
  tempo: L.tempo,
  master: L.master,
  search: L.search,
  swap: L.swap,
  save: L.save,
  bounce: L.bounce,
  "bounce-in-place": L.bounceInPlace,
  key: L.key,
  type: L.type,
  menu: L.menu,
  golem: L.passthrough,

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
  "midi-note"([ch, p, v, ms]) { if (ch == null || p == null) throw new Error("midi-note <ch> <pitch> [vel] [ms]"); M.note(+ch, +p, v ? +v : undefined, ms ? +ms : undefined); console.log(`note ch${ch} ${p}`); },
  pc([ch, prog]) { if (ch == null || prog == null) throw new Error("pc <ch> <program>"); M.programChange(+ch, +prog); console.log(`PC ch${ch} ${prog}`); },
  assign([m]) { if (!m) throw new Error("assign <track|send|pan|plugin|eq|instrument>"); M.assign(m); console.log(`vpot assign = ${m}`); },
  nav([w]) { if (!w) throw new Error("nav <bank-left|bank-right|chan-left|chan-right|flip|global-view|name-value>"); M.nav(w); console.log(`nav ${w}`); },

  // Zero-install transport. Logic Pro Virtual In follows MIDI System
  // Realtime + MMC with NO control surface and NO manual setup, so this
  // is the default fully-automated transport path.
  rtplay()  { M.transportRT("play");     console.log("transport: play (RT+MMC)"); },
  rtstop()  { M.transportRT("stop");     console.log("transport: stop (RT+MMC)"); },
  rtcont()  { M.transportRT("continue"); console.log("transport: continue (RT+MMC)"); },
};

const [, , cmd, ...rest] = process.argv;
if (!cmd || !CMD[cmd]) {
  console.error("Usage: node logic.mjs <command> [args...]");
  console.error("Commands: " + Object.keys(CMD).join(", "));
  process.exit(1 /* https://pubs.opengroup.org/onlinepubs/9799919799/basedefs/stdlib.h.html */);
}
// A golem failure exits with golem's own status (3 not found, 4 ambiguous, 5 not
// confirmed, 6 permission, 7 Logic not running: golem README), anything else with 1.
const fail = (e) => {
  console.error(e.message);
  process.exit(e.status ?? 1 /* https://pubs.opengroup.org/onlinepubs/9799919799/basedefs/stdlib.h.html */);
};
try {
  const r = CMD[cmd](rest);
  if (r && typeof r.then === "function") r.catch(fail);
} catch (e) {
  fail(e);
}
