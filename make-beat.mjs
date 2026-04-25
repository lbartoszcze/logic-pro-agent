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
import {
  reseed,
  humanVel,
  swungTick,
  trapHatVel,
  lofiHatVel,
  isFillBar,
  isFinalFillBar,
  isSectionStart,
  FILL_PATTERNS,
  trap808Bar,
  hatRoll,
  motifIndex,
} from "./lib/production.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

// --- styles ---------------------------------------------------------------

const STYLES = {
  trap: {
    bpm: 140,
    swing: 54,
    drums: { kick: "x..x..x...x..x..", snare: "....x.......x...", chat: "x.x.x.x.x.x.x.x.", ohat: "..........x....." },
    chords: ["i7", "VI7", "III7", "VII7"],
    instruments: { chords: 4, bass: 38, melody: 5 },
    hatVel: trapHatVel,
    hatRolls: true,
    sparse808: true,
  },
  "lo-fi": {
    bpm: 85,
    swing: 58,
    drums: { kick: "x.......x...x...", snare: "....x.......x...", chat: "x.x.x.x.x.x.x.x.", ohat: "................" },
    chords: ["i7", "VI7", "iv7", "III7"],
    instruments: { chords: 4, bass: 33, melody: 5 },
    hatVel: lofiHatVel,
    hatRolls: false,
    sparse808: false,
  },
  "boom-bap": {
    bpm: 92,
    swing: 56,
    drums: { kick: "x.......x.......", snare: "....x.......x...", chat: "x.x.x.x.x.x.x.x.", ohat: "................" },
    chords: ["i", "iv", "VII", "III"],
    instruments: { chords: 1, bass: 33, melody: 26 },
    hatVel: lofiHatVel,
    hatRolls: false,
    sparse808: false,
  },
  drill: {
    bpm: 140,
    swing: 50,
    drums: { kick: "x...x...x...x...", snare: "....x.......x...", chat: "x.x.x.xxx.x.x.xx", ohat: "................" },
    chords: ["i", "v", "VI", "VII"],
    instruments: { chords: 4, bass: 38, melody: 5 },
    hatVel: trapHatVel,
    hatRolls: true,
    sparse808: true,
  },
};

const DEGREES = {
  i:    [0, 3, 7],         i7:   [0, 3, 7, 10],
  iv:   [5, 8, 12],        iv7:  [5, 8, 12, 15],
  v:    [7, 10, 14],       V:    [7, 11, 14],
  VI:   [8, 12, 15],       VI7:  [8, 12, 15, 19],
  III:  [3, 7, 10],        III7: [3, 7, 10, 14],
  VII:  [10, 14, 17],      VII7: [10, 14, 17, 21],
};

const NOTE_TO_SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function parseKey(str) {
  const m = str.match(/^([A-G])([#b]?)m?$/);
  if (!m) throw new Error(`unparseable key: ${str}`);
  const pc = (NOTE_TO_SEMI[m[1]] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0) + 12) % 12;
  return 48 + pc;
}

function parseArgs(argv) {
  const out = { style: "trap", key: "Fm", bpm: null, bars: "16" };
  for (const a of argv) {
    const m = a.match(/^--([^=]+)=(.+)$/);
    if (m) out[m[1]] = m[2];
  }
  if (!STYLES[out.style]) throw new Error(`unknown style: ${out.style}`);
  return out;
}

// --- parts ----------------------------------------------------------------

const KICK = 36, SNARE = 38, CHAT = 42, OHAT = 46, CRASH = 49;

function emit(schedule, t, ch, pitch, vel, len) {
  schedule.push({ tick: t, kind: 1, ch, pitch, vel });
  schedule.push({ tick: t + len, kind: 0, ch, pitch, vel: 0 });
}

function drumsPart(style, bars) {
  const sixteenth = TPB / 4;
  const beatTicks = TPB;
  const ch = 9;
  const schedule = [];

  for (let bar = 0; bar < bars; bar++) {
    const barOffset = bar * 16 * sixteenth;
    const fill = isFillBar(bar, bars) || isFinalFillBar(bar, bars);
    const pat = fill ? FILL_PATTERNS[style.styleName] || style.drums : style.drums;

    for (let i = 0; i < 16; i++) {
      const t = swungTick(barOffset + i * sixteenth, sixteenth, style.swing);
      if (pat.kick[i] === "x")  emit(schedule, t, ch, KICK,  humanVel(112), sixteenth - 8);
      if (pat.snare[i] === "x") emit(schedule, t, ch, SNARE, humanVel(105), sixteenth - 8);
      if (pat.chat[i] === "x")  emit(schedule, t, ch, CHAT,  humanVel(style.hatVel(i), 4), sixteenth - 12);
      if (pat.ohat[i] === "x")  emit(schedule, t, ch, OHAT,  humanVel(82), sixteenth - 8);
    }

    // Trap-style 1/32 hat roll into the next downbeat on bars 4 and 8 of each phrase.
    if (style.hatRolls && (bar + 1) % 4 === 0 && !fill) {
      for (const r of hatRoll(barOffset, beatTicks)) {
        emit(schedule, swungTick(r.tick, sixteenth, style.swing), ch, CHAT, r.vel, r.length);
      }
    }

    // Crash on the downbeat of every 8-bar section.
    if (isSectionStart(bar) && bar % 8 === 0) {
      emit(schedule, barOffset, ch, CRASH, 100, beatTicks * 2);
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
    const semis = DEGREES[style.chords[bar % style.chords.length]];
    const start = bar * barTicks;
    const end = start + barTicks - 30;
    for (const semi of semis) {
      emit(schedule, start, ch, keyRoot + 5 + semi, humanVel(78, 4), end - start);
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
  const beatTicks = TPB;
  const schedule = [];
  for (let bar = 0; bar < bars; bar++) {
    const semis = DEGREES[style.chords[bar % style.chords.length]];
    const root = keyRoot - 24 + semis[0];
    const barOffset = bar * 4 * beatTicks;

    if (style.sparse808) {
      // Trap/drill: 2 long sustained notes per bar (kick-anchored, no per-hit retrigger).
      for (const ev of trap808Bar(bar, root, beatTicks)) {
        emit(schedule, barOffset + ev.tick, ch, ev.pitch, humanVel(ev.vel, 4), ev.length);
      }
    } else {
      // Lo-fi / boom-bap: walking root note on beats 1 and 3.
      emit(schedule, barOffset, ch, root, humanVel(96, 5), beatTicks * 2 - 20);
      emit(schedule, barOffset + beatTicks * 2, ch, root, humanVel(92, 5), beatTicks * 2 - 20);
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
  // Four phrase-length motifs (one per 4-bar section). Sparse, leaves space.
  const motifs = [
    [[7, 0, 4], [10, 4, 4], [12, 8, 4], [10, 12, 4]],
    [[12, 0, 6], [15, 6, 4], [14, 10, 6]],
    [[10, 0, 4], [14, 4, 4], [15, 8, 6], [14, 14, 2]],
    [[5, 0, 4], [7, 4, 4], [10, 8, 4], [12, 12, 4]],
  ];
  const ch = 2;
  const sixteenth = TPB / 4;
  const schedule = [];
  for (let bar = 0; bar < bars; bar++) {
    if (isFillBar(bar, bars) || isFinalFillBar(bar, bars)) continue; // breathe on fills
    const motif = motifs[motifIndex(bar, motifs.length)];
    const barOffset = bar * 16 * sixteenth;
    for (const [semi, start, length] of motif) {
      const t = swungTick(barOffset + start * sixteenth, sixteenth, style.swing);
      const len = length * sixteenth - 10;
      emit(schedule, t, ch, keyRoot + 12 + semi, humanVel(88, 5), len);
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

const args = parseArgs(process.argv.slice(2));
const style = { ...STYLES[args.style], styleName: args.style };
const bpm = args.bpm ? parseInt(args.bpm) : style.bpm;
const keyRoot = parseKey(args.key);
const bars = parseInt(args.bars);
if (!Number.isFinite(bars) || bars < 1) throw new Error(`bad --bars: ${args.bars}`);

reseed((bpm * 1000 + keyRoot) >>> 0);

const parts = [
  drumsPart(style, bars),
  chordsPart(style, keyRoot, bars),
  bassPart(style, keyRoot, bars),
  melodyPart(style, keyRoot, bars),
];
const smf = buildSMF([metaTrack("Conductor", bpm), ...parts.map((p) => p.track)]);
writeFileSync(join(HERE, "beat.mid"), smf);
console.log(`Wrote beat.mid (${args.style}, ${args.key}, ${bpm} BPM, ${bars} bars, humanized + fills)`);
