// Zero-dependency MIDI generator for Logic Pro.
// Run: node make-beat.mjs
// Writes drums.mid, chords.mid, bass.mid, melody.mid next to this file.

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const TPB = 480;
const BPM = 140;

function vlq(n) {
  if (n === 0) return Buffer.from([0]);
  const bytes = [n & 0x7f];
  n >>= 7;
  while (n) {
    bytes.push((n & 0x7f) | 0x80);
    n >>= 7;
  }
  return Buffer.from(bytes.reverse());
}

function u32be(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n >>> 0, 0);
  return b;
}

function u16be(n) {
  const b = Buffer.alloc(2);
  b.writeUInt16BE(n & 0xffff, 0);
  return b;
}

function tempoMeta(bpm) {
  const us = Math.round(60_000_000 / bpm);
  return Buffer.concat([
    Buffer.from([0x00, 0xff, 0x51, 0x03]),
    Buffer.from([(us >> 16) & 0xff, (us >> 8) & 0xff, us & 0xff]),
  ]);
}

const TIME_SIG = Buffer.from([0x00, 0xff, 0x58, 0x04, 4, 2, 24, 8]);
const END_OF_TRACK = Buffer.from([0x00, 0xff, 0x2f, 0x00]);

function noteOn(delta, ch, pitch, vel) {
  return Buffer.concat([vlq(delta), Buffer.from([0x90 | ch, pitch, vel])]);
}

function noteOff(delta, ch, pitch) {
  return Buffer.concat([vlq(delta), Buffer.from([0x80 | ch, pitch, 0])]);
}

function programChange(delta, ch, program) {
  return Buffer.concat([vlq(delta), Buffer.from([0xc0 | ch, program])]);
}

function buildTrack(eventBufs) {
  const body = Buffer.concat(eventBufs);
  return Buffer.concat([Buffer.from("MTrk"), u32be(body.length), body]);
}

function buildSMF(tracks) {
  const header = Buffer.concat([
    Buffer.from("MThd"),
    u32be(6),
    u16be(1),
    u16be(tracks.length),
    u16be(TPB),
  ]);
  return Buffer.concat([header, ...tracks]);
}

function scheduleToEvents(schedule) {
  schedule.sort((a, b) => a.tick - b.tick || a.kind - b.kind);
  const out = [];
  let prev = 0;
  for (const e of schedule) {
    const delta = e.tick - prev;
    out.push(
      e.kind === 1 ? noteOn(delta, e.ch, e.pitch, e.vel) : noteOff(delta, e.ch, e.pitch)
    );
    prev = e.tick;
  }
  return out;
}

function makeDrums(outPath, bars = 4) {
  const sixteenth = TPB / 4;
  const KICK = 36,
    SNARE = 38,
    CHAT = 42,
    OHAT = 46;
  const ch = 9;

  const patterns = [
    { pat: "x..x..x...x..x..", pitch: KICK, vel: 110, accent: false },
    { pat: "....x.......x...", pitch: SNARE, vel: 105, accent: false },
    { pat: "x.x.x.x.x.x.x.x.", pitch: CHAT, vel: 75, accent: true },
    { pat: "..........x.....", pitch: OHAT, vel: 80, accent: false },
  ];

  const schedule = [];
  for (let bar = 0; bar < bars; bar++) {
    const barOffset = bar * 16 * sixteenth;
    for (const { pat, pitch, vel, accent } of patterns) {
      for (let i = 0; i < pat.length; i++) {
        if (pat[i] === "x") {
          const t = barOffset + i * sixteenth;
          const v = accent && i % 4 === 0 ? vel + 10 : vel;
          schedule.push({ tick: t, kind: 1, ch, pitch, vel: v });
          schedule.push({ tick: t + sixteenth - 10, kind: 0, ch, pitch, vel: 0 });
        }
      }
    }
  }

  const metaTrack = buildTrack([tempoMeta(BPM), TIME_SIG, END_OF_TRACK]);
  const drumTrack = buildTrack([...scheduleToEvents(schedule), END_OF_TRACK]);
  writeFileSync(outPath, buildSMF([metaTrack, drumTrack]));
}

function makeChords(outPath) {
  const chords = [
    [53, 56, 60, 63], // Fm7
    [49, 53, 56, 60], // Dbmaj7
    [56, 60, 63, 67], // Abmaj7
    [51, 55, 58, 62], // Ebmaj7
  ];
  const ch = 0;
  const barTicks = TPB * 4;
  const schedule = [];
  chords.forEach((notes, i) => {
    const start = i * barTicks;
    const end = start + barTicks - 20;
    for (const n of notes) {
      schedule.push({ tick: start, kind: 1, ch, pitch: n, vel: 80 });
      schedule.push({ tick: end, kind: 0, ch, pitch: n, vel: 0 });
    }
  });

  const metaTrack = buildTrack([tempoMeta(BPM), TIME_SIG, END_OF_TRACK]);
  const events = [programChange(0, ch, 4), ...scheduleToEvents(schedule), END_OF_TRACK];
  writeFileSync(outPath, buildSMF([metaTrack, buildTrack(events)]));
}

function makeBass(outPath) {
  // Roots one octave down: F, Db, Ab, Eb
  const roots = [29, 25, 32, 27];
  const ch = 1;
  const sixteenth = TPB / 4;
  const kickPat = "x..x..x...x..x..";
  const schedule = [];
  roots.forEach((root, bar) => {
    const barOffset = bar * 16 * sixteenth;
    for (let i = 0; i < kickPat.length; i++) {
      if (kickPat[i] === "x") {
        const t = barOffset + i * sixteenth;
        const pitch = i === 12 ? root + 12 : root;
        schedule.push({ tick: t, kind: 1, ch, pitch, vel: 100 });
        schedule.push({ tick: t + sixteenth * 2 - 10, kind: 0, ch, pitch, vel: 0 });
      }
    }
  });

  const metaTrack = buildTrack([tempoMeta(BPM), TIME_SIG, END_OF_TRACK]);
  const events = [programChange(0, ch, 38), ...scheduleToEvents(schedule), END_OF_TRACK];
  writeFileSync(outPath, buildSMF([metaTrack, buildTrack(events)]));
}

function makeMelody(outPath) {
  // Per bar: [pitch, start_in_16ths, length_in_16ths]
  const hits = [
    [0, [[72, 0, 2], [75, 2, 2], [77, 4, 2], [75, 6, 2], [72, 8, 4]]],   // Fm7
    [1, [[77, 0, 3], [80, 3, 3], [79, 6, 4]]],                           // Dbmaj7
    [2, [[75, 0, 2], [79, 2, 2], [80, 4, 3], [79, 7, 3], [75, 10, 4]]],  // Abmaj7
    [3, [[70, 0, 2], [72, 2, 2], [75, 4, 6]]],                           // Ebmaj7
  ];
  const ch = 2;
  const sixteenth = TPB / 4;
  const schedule = [];
  for (const [bar, events] of hits) {
    const barOffset = bar * 16 * sixteenth;
    for (const [pitch, start, length] of events) {
      const t = barOffset + start * sixteenth;
      const end = t + length * sixteenth - 10;
      schedule.push({ tick: t, kind: 1, ch, pitch, vel: 90 });
      schedule.push({ tick: end, kind: 0, ch, pitch, vel: 0 });
    }
  }

  const metaTrack = buildTrack([tempoMeta(BPM), TIME_SIG, END_OF_TRACK]);
  const events = [programChange(0, ch, 5), ...scheduleToEvents(schedule), END_OF_TRACK];
  writeFileSync(outPath, buildSMF([metaTrack, buildTrack(events)]));
}

const files = [
  ["drums.mid", () => makeDrums(join(HERE, "drums.mid"), 4)],
  ["chords.mid", () => makeChords(join(HERE, "chords.mid"))],
  ["bass.mid", () => makeBass(join(HERE, "bass.mid"))],
  ["melody.mid", () => makeMelody(join(HERE, "melody.mid"))],
];
for (const [name, fn] of files) {
  fn();
  console.log(`Wrote ${join(HERE, name)}`);
}
