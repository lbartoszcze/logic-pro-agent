#!/usr/bin/env node
// logic.mjs - Logic Pro automation CLI. Logic stays in the background: the
// Logic commands go through golem (lib/golem.mjs), the mixer and transport
// controls through MIDI (lib/logic/midi-control.mjs).
//   beat [--style=…] [--key=…] [--bpm=…] [--bars=…] (a whole beat: doctor,
//   make-beat, open, swaps, mastering, bounce, playback; lib/beat.mjs),
//   open <file>, doctor, tracks, wait-tracks <n>, select, play, stop, rewind,
//   cycle, metronome, zoom-fit, mute, solo, tempo, master, search,
//   swap <track> <patch>, save [name], bounce [name], bounce-in-place <scope>,
//   wait-file <path>, key, type, menu,
//   golem <command> [arguments] (any golem command against Logic),
//   wrappers (named menu commands), wrappers-check (each wrapper's menu path
//   against Logic's menus now), selectors-check (each selector control.mjs
//   relies on against the open project), and the MIDI commands below.
// Nothing waits for a set time: a wait ends when what it waits for shows,
// when Logic quits, or when you interrupt it, and says meanwhile what it sees.

import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { beat, fileAppears } from "./lib/beat.mjs";
import * as L from "./lib/logic/control.mjs";
import { checkSelectors, doctor } from "./lib/logic/doctor.mjs";
import { checkWrappers, WRAPPERS, WRAPPERS_HELP } from "./lib/logic/wrappers.mjs";
import * as M from "./lib/logic/midi-control.mjs";
import { nearest } from "./lib/nearest.mjs";

// Mackie Control drives a bank of eight channel strips, 0-7 here; nav moves
// the bank (Logic Pro Control Surfaces Support, Mackie Control). midi-control
// keeps only a strip's low three bits, so 9 would act on strip 1: refused here.
const STRIP = { low: 0, high: 7 };
// MIDI channels are 1-16 and data bytes seven bits, 0-127: https://midi.org/summary-of-midi-1-0-messages
const CHANNEL = { low: 1, high: 16 };
const DATA = { low: 0, high: 127 };
// A Mackie V-Pot message turns at most 0x3f ticks either way (midi-control.mjs vpot).
const TICKS = { low: -0x3f, high: 0x3f };
// A note lasts at least a millisecond and at most 2^31-1 of them, the longest wait a Node timer takes: https://nodejs.org/api/timers.html
const LENGTH = { low: 1, high: 2 ** 31 - 1 };

/** How a command's argument was given, for its error: quoted, or "nothing". */
const given = (text) => text === undefined ? "nothing" : JSON.stringify(text);

/** Argument `text` named `what`, present, or the usage error saying it is missing. */
function need(usage, what, text) {
  if (text !== undefined && text.trim() !== "") return text;
  throw new Error(`usage: ${usage}\n${what} is missing`);
}

/** Argument `text` as a whole number in `range`, or the usage error saying what was given. */
function whole(usage, what, text, { low, high }) {
  const value = Number(need(usage, what, text));
  if (Number.isInteger(value) && value >= low && value <= high) return value;
  throw new Error(`usage: ${usage}\n${what} must be a whole number from ${low} to ${high}; got ${given(text)}`);
}

/** A fader level from 0 (bottom) to 1 (top), or the usage error saying what was given. */
function level(usage, text) {
  const value = Number(need(usage, "level", text));
  if (value >= 0 && value <= 1) return value;
  throw new Error(`usage: ${usage}\nlevel must be a number from 0 (bottom) to 1 (top), such as 0.75; got ${given(text)}`);
}

const CMD = {
  ...WRAPPERS,
  beat,
  open: L.open,
  doctor,
  tracks: L.tracks,
  "wait-tracks": L.waitTracks,
  async "wait-file"([path]) {
    if (!path) throw new Error("wait-file <path>");
    const target = resolve(path);
    if (!existsSync(target)) console.error(`waiting for ${target} to appear (interrupt to stop)`);
    await fileAppears(target);
    console.log(target);
  },
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
  "wrappers-check": checkWrappers,
  "selectors-check": checkSelectors,
  // ---- MIDI control plane (non-capturing: pure MIDI, no cursor/screen) ----
  "midi-dests"() { console.log(M.listDestinations()); },
  fader([s, v]) { const use = "fader <strip 0-7> <level 0..1>"; M.fader(whole(use, "strip", s, STRIP), level(use, v)); console.log(`fader ${s} = ${v}`); },
  "master-fader"([v]) { M.masterFader(level("master-fader <level 0..1>", v)); console.log(`master = ${v}`); },
  "mute-ch"([s]) { M.mute(whole("mute-ch <strip 0-7>", "strip", s, STRIP)); console.log(`mute strip ${s}`); },
  "solo-ch"([s]) { M.solo(whole("solo-ch <strip 0-7>", "strip", s, STRIP)); console.log(`solo strip ${s}`); },
  recarm([s]) { M.recArm(whole("recarm <strip 0-7>", "strip", s, STRIP)); console.log(`rec-arm strip ${s}`); },
  "track-select"([s]) { M.trackSelect(whole("track-select <strip 0-7>", "strip", s, STRIP)); console.log(`select strip ${s}`); },
  vpot([s, d]) { const use = "vpot <strip 0-7> <ticks -63..63>"; M.vpot(whole(use, "strip", s, STRIP), whole(use, "ticks", d, TICKS)); console.log(`vpot ${s} ${d}`); },
  mtransport([a]) { M.transport(need("mtransport <play|stop|record|rewind|ffwd|cycle>", "action", a)); console.log(`transport ${a}`); },
  cc([ch, n, v]) {
    const use = "cc <channel 1-16> <controller 0-127> <value 0-127>";
    M.cc(whole(use, "channel", ch, CHANNEL), whole(use, "controller", n, DATA), whole(use, "value", v, DATA));
    console.log(`CC ch${ch} ${n}=${v}`);
  },
  "midi-note"([ch, p, v, ms]) {
    const use = "midi-note <channel 1-16> <pitch 0-127, middle C is 60> [velocity 0-127] [milliseconds]";
    const velocity = v === undefined ? undefined : whole(use, "velocity", v, DATA);
    const length = ms === undefined ? undefined : whole(use, "milliseconds", ms, LENGTH);
    M.note(whole(use, "channel", ch, CHANNEL), whole(use, "pitch", p, DATA), velocity, length);
    console.log(`note ch${ch} ${p}`);
  },
  pc([ch, prog]) { const use = "pc <channel 1-16> <program 0-127>"; M.programChange(whole(use, "channel", ch, CHANNEL), whole(use, "program", prog, DATA)); console.log(`PC ch${ch} ${prog}`); },
  assign([m]) { M.assign(need("assign <track|send|pan|plugin|eq|instrument>", "mode", m)); console.log(`vpot assign = ${m}`); },
  nav([w]) { M.nav(need("nav <bank-left|bank-right|chan-left|chan-right|flip|global-view|name-value>", "direction", w)); console.log(`nav ${w}`); },

  // Zero-install transport. Logic Pro Virtual In follows MIDI System
  // Realtime + MMC with NO control surface and NO manual setup, so this
  // is the default fully-automated transport path.
  rtplay()  { M.transportRT("play");     console.log("transport: play (RT+MMC)"); },
  rtstop()  { M.transportRT("stop");     console.log("transport: stop (RT+MMC)"); },
  rtcont()  { M.transportRT("continue"); console.log("transport: continue (RT+MMC)"); },
};

const [, , cmd, ...rest] = process.argv;
if (!Object.hasOwn(CMD, cmd)) {
  const names = Object.keys(CMD);
  // The command a typo meant ("tempp"), and those sharing a word of it split at dashes ("new-track").
  const meant = nearest(cmd, names);
  const words = String(cmd).toLowerCase().split("-").filter((word) => word.length > 0);
  const alike = names.filter((name) => words.some((word) => name.split("-").includes(word)));
  console.error(cmd === undefined ? "Usage: node logic.mjs <command> [args...]: no command given" : `node logic.mjs knows no command ${JSON.stringify(cmd)}`);
  if (cmd !== undefined && meant.length > 0) console.error(`Nearest to it: ${meant[0]}`);
  if (alike.length > 0) console.error(`Commands sharing a word with it: ${alike.join(", ")}`);
  console.error("Commands: " + names.join(", "));
  console.error("Every menu wrapper by group: node logic.mjs wrappers");
  process.exit(1 /* https://pubs.opengroup.org/onlinepubs/9799919799/basedefs/stdlib.h.html */);
}
// A failure exits with the status of the program that failed: golem's own (3 not
// found, 4 ambiguous, 5 not as set, 6 permission, 7 Logic not running or quit:
// golem README) or midi-send's. One with no status of its own, such as a usage
// error, exits 1, EXIT_FAILURE: https://pubs.opengroup.org/onlinepubs/9799919799/basedefs/stdlib.h.html
try {
  await CMD[cmd](rest);
} catch (error) {
  console.error(error.message);
  process.exit(Number.isInteger(error.status) ? error.status : 1);
}
