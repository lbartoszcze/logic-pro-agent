// Mackie Control + MMC + raw-CC byte builders — the non-capturing Logic
// control plane (the MIDI analog of FCPXML for Final Cut). Constructs the
// exact sequences Logic consumes natively as a control surface and shells
// them to the compiled lib/bin/midi-send CoreMIDI virtual source.
//
// Mackie Control (faders / mute / solo / rec / select / transport / V-pots)
// requires a one-time Logic side install: Logic Pro > Settings > Control
// Surfaces > Install… > Mackie Control, input = "Logic Agent". After that
// every call here is deterministic with zero cursor / screen capture.
// Raw note()/cc() target "Logic Pro Virtual In" directly (no install) —
// notes play the selected instrument track.

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const BIN = join(dirname(fileURLToPath(import.meta.url)), "..", "bin", "midi-send");

function hx(n) { return (n & 0xff).toString(16).padStart(2, "0"); }

// Send one raw MIDI message (array of byte ints).
export function sendBytes(bytes) {
  execFileSync(BIN, bytes.map(hx));
}
// Send several messages in order via the binary's --burst mode.
export function sendBurst(messages) {
  execFileSync(BIN, ["--burst", ...messages.map((m) => m.map(hx).join(","))]);
}

export function listDestinations() {
  return execFileSync(BIN, ["--list"], { encoding: "utf8" }).trim();
}

// ---- Mackie Control: mixer strips 0-7 of the current bank ----

// Fader = 14-bit pitch-bend on channel = strip (0xE0+n). val 0..1.
export function fader(strip, val01) {
  const v = Math.max(0, Math.min(16383, Math.round(val01 * 16383)));
  sendBytes([0xe0 + (strip & 0x0f), v & 0x7f, (v >> 7) & 0x7f]);
}
export function masterFader(val01) {
  const v = Math.max(0, Math.min(16383, Math.round(val01 * 16383)));
  sendBytes([0xe8, v & 0x7f, (v >> 7) & 0x7f]);
}

// Button banks are Note-On 0x90; Logic toggles on velocity 0x7f.
function press(note) { sendBurst([[0x90, note, 0x7f], [0x90, note, 0x00]]); }

export function mute(strip)      { press(0x10 + (strip & 0x07)); }
export function solo(strip)      { press(0x08 + (strip & 0x07)); }
export function recArm(strip)    { press(0x00 + (strip & 0x07)); }
export function trackSelect(strip) { press(0x18 + (strip & 0x07)); }

// V-Pot (pan / focused plugin param): relative CC 0x10-0x17 on ch1.
// delta>0 = clockwise. Mackie relative: 0x01..0x3f = +, 0x41..0x7f = -.
export function vpot(strip, delta) {
  const d = delta >= 0 ? Math.min(0x3f, delta) : 0x40 + Math.min(0x3f, -delta);
  sendBytes([0xb0, 0x10 + (strip & 0x07), d & 0x7f]);
}

// Transport — Mackie transport notes (work once the control surface is
// installed) AND MMC SysEx (works on Logic Pro Virtual In if MMC sync is
// on). We emit both so at least one path lands.
const MACKIE_T = { rewind: 0x5b, ffwd: 0x5c, stop: 0x5d, play: 0x5e, record: 0x5f, cycle: 0x56 };
const MMC = { stop: 0x01, play: 0x02, ffwd: 0x04, rewind: 0x05, record: 0x06 };

export function transport(action) {
  const m = MACKIE_T[action];
  const msgs = [];
  if (m !== undefined) { msgs.push([0x90, m, 0x7f], [0x90, m, 0x00]); }
  if (MMC[action] !== undefined) { msgs.push([0xf0, 0x7f, 0x7f, 0x06, MMC[action], 0xf7]); }
  if (msgs.length === 0) throw new Error(`unknown transport action: ${action}`);
  sendBurst(msgs);
}

// ---- Mackie V-Pot assignment modes ----
// Re-points all 8 V-pots at a parameter class for the banked tracks, so
// vpot() then edits EQ bands / sends / the focused plug-in's params —
// the deep param surface, no per-param learn. Note-On press+release.
const ASSIGN = {
  track: 0x28, send: 0x29, pan: 0x2a, plugin: 0x2b, eq: 0x2c, instrument: 0x2d,
};
export function assign(mode) {
  const n = ASSIGN[mode];
  if (n === undefined) throw new Error(`assign mode: ${Object.keys(ASSIGN).join("|")}`);
  sendBurst([[0x90, n, 0x7f], [0x90, n, 0x00]]);
}

// ---- Bank / channel navigation + flip ----
// Mackie shows 8 strips at a time; bank/channel shifts the window so
// strips beyond 8 are reachable. flip swaps fader<->V-pot assignment.
const NAV = {
  "bank-left": 0x2e, "bank-right": 0x2f,
  "chan-left": 0x30, "chan-right": 0x31,
  flip: 0x32, "global-view": 0x33, "name-value": 0x34,
};
export function nav(which) {
  const n = NAV[which];
  if (n === undefined) throw new Error(`nav: ${Object.keys(NAV).join("|")}`);
  sendBurst([[0x90, n, 0x7f], [0x90, n, 0x00]]);
}

// ---- Zero-install transport: MIDI System Realtime + MMC ----
// Needs NO control surface. Logic Pro Virtual In responds to System
// Realtime Start (0xFA) / Continue (0xFB) / Stop (0xFC) and to MMC SysEx
// out of the box. transportRT() emits all three relevant encodings so at
// least one lands regardless of the project's sync mode — fully automated,
// no manual setup.
export function transportRT(action) {
  const RT = { play: 0xfa, continue: 0xfb, stop: 0xfc };
  const msgs = [];
  if (RT[action] !== undefined) msgs.push([RT[action]]);
  if (MMC[action] !== undefined) msgs.push([0xf0, 0x7f, 0x7f, 0x06, MMC[action], 0xf7]);
  const mk = MACKIE_T[action];
  if (mk !== undefined) msgs.push([0x90, mk, 0x7f], [0x90, mk, 0x00]);
  if (msgs.length === 0) throw new Error(`transportRT: ${Object.keys(RT).join("|")}|record|rewind|ffwd`);
  sendBurst(msgs);
}

// ---- Raw note / CC (target: Logic Pro Virtual In, instrument track) ----

export function note(channel, pitch, vel = 100, ms = 250) {
  const ch = (channel - 1) & 0x0f;
  sendBytes([0x90 | ch, pitch & 0x7f, vel & 0x7f]);
  // The caller has already returned when the note-off goes out: a failure is
  // said, since the note keeps sounding in Logic.
  setTimeout(() => {
    try {
      sendBytes([0x80 | ch, pitch & 0x7f, 0]);
    } catch (error) {
      console.error(`note-off for channel ${channel} pitch ${pitch} failed; the note may still sound: ${error.message}`);
    }
  }, ms);
}

export function cc(channel, num, value) {
  const ch = (channel - 1) & 0x0f;
  sendBytes([0xb0 | ch, num & 0x7f, value & 0x7f]);
}

export function programChange(channel, program) {
  const ch = (channel - 1) & 0x0f;
  sendBytes([0xc0 | ch, program & 0x7f]);
}
