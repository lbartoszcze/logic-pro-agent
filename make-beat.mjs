// Beat generator for Logic Pro.
// Usage:
//   node make-beat.mjs                                    # trap, F minor, 140 bpm
//   node make-beat.mjs --style=lo-fi --key=Am             # swap style and key
//   node make-beat.mjs --bpm=96 --style=boom-bap
//   node make-beat.mjs --style=drill --key=Em --bpm=140
// Styles: trap, lo-fi, boom-bap, drill. Keys: minor only (e.g. Fm, Am, Ebm).

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  TPB,
  tempoMeta,
  trackName,
  TIME_SIG,
  END_OF_TRACK,
  programChange,
  buildTrack,
  buildSMF,
  scheduleToEvents,
} from "./lib/midi.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

// --- styles ---------------------------------------------------------------

const STYLES = {
  trap: {
    bpm: 140,
    drums: { kick: "x..x..x...x..x..", snare: "....x.......x...", chat: "x.x.x.x.x.x.x.x.", ohat: "..........x....." },
    chords: ["i7", "VI7", "III7", "VII7"],
    instruments: { chords: 4, bass: 38, melody: 5 },
  },
  "lo-fi": {
    bpm: 85,
    drums: { kick: "x.......x...x...", snare: "....x.......x...", chat: "x.x.x.x.x.x.x.x.", ohat: "................" },
    chords: ["i7", "VI7", "iv7", "III7"],
    instruments: { chords: 4, bass: 33, melody: 5 },
  },
  "boom-bap": {
    bpm: 92,
    drums: { kick: "x.......x.......", snare: "....x.......x...", chat: "x.x.x.x.x.x.x.x.", ohat: "................" },
    chords: ["i", "iv", "VII", "III"],
    instruments: { chords: 1, bass: 33, melody: 26 },
  },
  drill: {
    bpm: 140,
    drums: { kick: "x...x...x...x...", snare: "....x.......x...", chat: "x.x.x.xxx.x.x.xx", ohat: "................" },
    chords: ["i", "v", "VI", "VII"],
    instruments: { chords: 4, bass: 38, melody: 5 },
  },
};

// Scale-degree → semitone offsets from the key root, in natural minor.
// "i" = minor triad, "i7" = minor 7, etc. Capitalised degrees are major
// chords built from that scale step.
const DEGREES = {
  i:     [0, 3, 7],
  i7:    [0, 3, 7, 10],
  iv:    [5, 8, 12],
  iv7:   [5, 8, 12, 15],
  v:     [7, 10, 14],
  V:     [7, 11, 14],
  VI:    [8, 12, 15],
  VI7:   [8, 12, 15, 19],
  III:   [3, 7, 10],
  III7:  [3, 7, 10, 14],
  VII:   [10, 14, 17],
  VII7:  [10, 14, 17, 21],
};

// --- key parsing ----------------------------------------------------------

const NOTE_TO_SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

function parseKey(str) {
  const m = str.match(/^([A-G])([#b]?)m?$/);
  if (!m) throw new Error(`unparseable key: ${str}`);
  const base = NOTE_TO_SEMI[m[1]];
  const acc = m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0;
  const pc = (base + acc + 12) % 12;
  // Octave 4: C4 = 60. Root MIDI = 48 + pc so chord voicings sit around middle C.
  return 48 + pc;
}

// --- argv -----------------------------------------------------------------

function parseArgs(argv) {
  const out = { style: "trap", key: "Fm", bpm: null, bars: "16" };
  for (const a of argv) {
    const m = a.match(/^--([^=]+)=(.+)$/);
    if (m) out[m[1]] = m[2];
  }
  if (!STYLES[out.style]) throw new Error(`unknown style: ${out.style}. choices: ${Object.keys(STYLES).join(", ")}`);
  return out;
}

// --- parts ----------------------------------------------------------------

function drumsPart(style, bars) {
  const sixteenth = TPB / 4;
  const ch = 9;
  const lanes = [
    { pat: style.drums.kick,  pitch: 36, vel: 110, accent: false },
    { pat: style.drums.snare, pitch: 38, vel: 105, accent: false },
    { pat: style.drums.chat,  pitch: 42, vel: 75,  accent: true  },
    { pat: style.drums.ohat,  pitch: 46, vel: 80,  accent: false },
  ];
  const schedule = [];
  for (let bar = 0; bar < bars; bar++) {
    const offset = bar * 16 * sixteenth;
    for (const { pat, pitch, vel, accent } of lanes) {
      for (let i = 0; i < pat.length; i++) {
        if (pat[i] !== "x") continue;
        const t = offset + i * sixteenth;
        const v = accent && i % 4 === 0 ? vel + 10 : vel;
        schedule.push({ tick: t, kind: 1, ch, pitch, vel: v });
        schedule.push({ tick: t + sixteenth - 10, kind: 0, ch, pitch, vel: 0 });
      }
    }
  }
  return {
    name: "Drums",
    track: buildTrack([trackName("Drums"), ...scheduleToEvents(schedule), END_OF_TRACK]),
  };
}

function chordsPart(style, keyRoot, bars) {
  const ch = 0;
  const barTicks = TPB * 4;
  const schedule = [];
  for (let bar = 0; bar < bars; bar++) {
    const degName = style.chords[bar % style.chords.length];
    const semis = DEGREES[degName];
    if (!semis) throw new Error(`unknown chord degree: ${degName}`);
    const start = bar * barTicks;
    const end = start + barTicks - 20;
    for (const semi of semis) {
      const pitch = keyRoot + 5 + semi; // +5 so voicings sit around middle C
      schedule.push({ tick: start, kind: 1, ch, pitch, vel: 80 });
      schedule.push({ tick: end, kind: 0, ch, pitch, vel: 0 });
    }
  }
  return {
    name: "Chords",
    track: buildTrack([
      trackName("Chords"),
      programChange(0, ch, style.instruments.chords),
      ...scheduleToEvents(schedule),
      END_OF_TRACK,
    ]),
  };
}

function bassPart(style, keyRoot, bars) {
  const ch = 1;
  const sixteenth = TPB / 4;
  const schedule = [];
  for (let bar = 0; bar < bars; bar++) {
    const degName = style.chords[bar % style.chords.length];
    const semis = DEGREES[degName];
    const root = keyRoot - 24 + semis[0]; // two octaves below chord voicing
    const offset = bar * 16 * sixteenth;
    const pat = style.drums.kick;
    for (let i = 0; i < pat.length; i++) {
      if (pat[i] !== "x") continue;
      const t = offset + i * sixteenth;
      const pitch = i === 12 ? root + 12 : root;
      schedule.push({ tick: t, kind: 1, ch, pitch, vel: 100 });
      schedule.push({ tick: t + sixteenth * 2 - 10, kind: 0, ch, pitch, vel: 0 });
    }
  }
  return {
    name: "Bass",
    track: buildTrack([
      trackName("Bass"),
      programChange(0, ch, style.instruments.bass),
      ...scheduleToEvents(schedule),
      END_OF_TRACK,
    ]),
  };
}

function melodyPart(style, keyRoot, bars) {
  // Pentatonic-ish motif in scale degrees (semitones from key root).
  const motifs = [
    [[7, 0, 2], [10, 2, 2], [12, 4, 2], [10, 6, 2], [7, 8, 4]],
    [[12, 0, 3], [15, 3, 3], [14, 6, 4]],
    [[10, 0, 2], [14, 2, 2], [15, 4, 3], [14, 7, 3], [10, 10, 4]],
    [[5, 0, 2], [7, 2, 2], [10, 4, 6]],
  ];
  const ch = 2;
  const sixteenth = TPB / 4;
  const schedule = [];
  for (let bar = 0; bar < bars; bar++) {
    const motif = motifs[bar % motifs.length];
    const offset = bar * 16 * sixteenth;
    for (const [semi, start, length] of motif) {
      const t = offset + start * sixteenth;
      const end = t + length * sixteenth - 10;
      schedule.push({ tick: t, kind: 1, ch, pitch: keyRoot + 12 + semi, vel: 90 });
      schedule.push({ tick: end, kind: 0, ch, pitch: keyRoot + 12 + semi, vel: 0 });
    }
  }
  return {
    name: "Melody",
    track: buildTrack([
      trackName("Melody"),
      programChange(0, ch, style.instruments.melody),
      ...scheduleToEvents(schedule),
      END_OF_TRACK,
    ]),
  };
}

function metaTrack(name, bpm) {
  return buildTrack([trackName(name), tempoMeta(bpm), TIME_SIG, END_OF_TRACK]);
}

// --- main -----------------------------------------------------------------

const args = parseArgs(process.argv.slice(2));
const style = STYLES[args.style];
const bpm = args.bpm ? parseInt(args.bpm) : style.bpm;
const keyRoot = parseKey(args.key);
const bars = parseInt(args.bars);
if (!Number.isFinite(bars) || bars < 1) throw new Error(`bad --bars: ${args.bars}`);

const parts = [
  drumsPart(style, bars),
  chordsPart(style, keyRoot, bars),
  bassPart(style, keyRoot, bars),
  melodyPart(style, keyRoot, bars),
];
const smf = buildSMF([metaTrack("Conductor", bpm), ...parts.map((p) => p.track)]);
writeFileSync(join(HERE, "beat.mid"), smf);
console.log(`Wrote beat.mid (${args.style}, ${args.key}, ${bpm} BPM, ${bars} bars)`);
