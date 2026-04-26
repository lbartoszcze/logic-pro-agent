// Direct sample-based audio renderer. Bypasses Logic — uses Logic's bundled
// Trap Door drum kit + Pure Sub Bass samples mixed via ffmpeg.
//
// Run: node lib/render/audio.mjs --style=trap --key=Fm --bpm=140 --bars=108
// Output: ./beat-rendered.wav

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");

const SAMPLES = {
  kick:  "/Library/Application Support/Logic/Ultrabeat Samples/Drum Machine Designer/Trap Door/Kick_1_TrapDoor.aif",
  snare: "/Library/Application Support/Logic/Ultrabeat Samples/Drum Machine Designer/Trap Door/Snare_1_TrapDoor.aif",
  chat:  "/Library/Application Support/Logic/Ultrabeat Samples/Drum Machine Designer/Trap Door/Hi-Hat_1_TrapDoor.aif",
  ohat:  "/Library/Application Support/Logic/Ultrabeat Samples/Drum Machine Designer/Trap Door/Hi-Hat_Open_TrapDoor.aif",
  sub:   "/Library/Application Support/Logic/Samples/Quicksampler/Pure Sub Bass.aif",
};

const SUB_NATURAL_NOTE = 36; // Pure Sub Bass natural pitch ~ C2

const STYLES = {
  trap:      { bpm: 140, kick: "x..x..x...x..x..", snare: "...gx..g....x.g.", chat: "x.x.x.x.x.x.x.x.", ohat: "..........x....." },
  drill:     { bpm: 142, kick: "x..x..xx..x.x...", snare: "..g.....g.g.x.g.", chat: "x.xxx.x.x.xx.xxx", ohat: "................" },
  "lo-fi":   { bpm: 85,  kick: "x.......x...x...", snare: "..g.x.g.g.g.x.g.", chat: "x.x.x.x.x.x.x.x.", ohat: "................" },
  "boom-bap":{ bpm: 92,  kick: "x.......x.......", snare: "...gx.g.g...x.g.", chat: "x.x.x.x.x.x.x.x.", ohat: "................" },
};
const NOTE_TO_SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const DEGREES = { i: 0, iv: 5, v: 7, V: 7, VI: 8, III: 3, VII: 10 };
const PROG = ["i", "VI", "III", "VII"];

function parseArgs(argv) {
  const out = { style: "trap", key: "Fm", bpm: null, bars: "32", out: join(ROOT, "beat-rendered.wav") };
  for (const a of argv) {
    const m = a.match(/^--([^=]+)=(.+)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

function parseKey(str) {
  const m = str.match(/^([A-G])([#b]?)m?$/);
  if (!m) throw new Error(`bad key: ${str}`);
  const pc = (NOTE_TO_SEMI[m[1]] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0) + 12) % 12;
  return 24 + pc; // bass octave (C1 = 24)
}

function build(args) {
  const style = STYLES[args.style];
  if (!style) throw new Error(`unknown style: ${args.style}`);
  const bpm = args.bpm ? parseInt(args.bpm) : style.bpm;
  const bars = parseInt(args.bars);
  const beatSec = 60 / bpm;
  const sixteenth = beatSec / 4;
  const barSec = beatSec * 4;
  const totalSec = barSec * bars + 1;

  const drumHits = [];
  const bassHits = [];
  for (let bar = 0; bar < bars; bar++) {
    const barT = bar * barSec;
    for (let i = 0; i < 16; i++) {
      const t = barT + i * sixteenth;
      const k = style.kick[i], s = style.snare[i], c = style.chat[i], o = style.ohat[i];
      if (k === "x") drumHits.push({ sample: SAMPLES.kick, t, gain: 1.0 });
      if (s === "x") drumHits.push({ sample: SAMPLES.snare, t, gain: 0.85 });
      else if (s === "g") drumHits.push({ sample: SAMPLES.snare, t, gain: 0.30 });
      if (c === "x") {
        const gain = i % 4 === 0 ? 0.7 : i % 2 === 0 ? 0.5 : 0.35;
        drumHits.push({ sample: SAMPLES.chat, t, gain });
      }
      if (o === "x") drumHits.push({ sample: SAMPLES.ohat, t, gain: 0.6 });
    }
    const semis = DEGREES[PROG[bar % PROG.length]];
    bassHits.push({ t: barT, dur: barSec * 0.5, semi: semis, gain: 1.2 });
    bassHits.push({ t: barT + barSec * 0.5, dur: barSec * 0.5, semi: semis + (bar % 2 ? 12 : 0), gain: 1.0 });
  }
  return { drumHits, bassHits, totalSec, bpm, bars };
}

function ffmpeg(args) {
  const r = spawnSync("ffmpeg", ["-y", ...args], { encoding: "utf8" });
  if (r.status !== 0) throw new Error("ffmpeg failed:\n" + (r.stderr || "").slice(-1500));
}

function renderDrums(hits, totalSec, outPath) {
  const sampleList = [...new Set(hits.map(h => h.sample))];
  const inputs = sampleList.flatMap(s => ["-i", s]);
  const filters = [];
  const labels = [];
  hits.forEach((h, idx) => {
    const inIdx = sampleList.indexOf(h.sample);
    const ms = Math.round(h.t * 1000);
    filters.push(`[${inIdx}:a]aformat=sample_fmts=fltp:channel_layouts=stereo,adelay=${ms}|${ms},volume=${h.gain}[d${idx}]`);
    labels.push(`[d${idx}]`);
  });
  filters.push(`${labels.join("")}amix=inputs=${labels.length}:dropout_transition=0:normalize=0[out]`);
  ffmpeg([...inputs, "-filter_complex", filters.join(";"), "-map", "[out]", "-t", totalSec.toString(), "-ar", "44100", "-ac", "2", outPath]);
}

function renderBass(hits, totalSec, keyRoot, outPath) {
  const filters = [];
  const labels = [];
  hits.forEach((h, idx) => {
    const note = keyRoot + h.semi;
    const ratio = Math.pow(2, (note - SUB_NATURAL_NOTE) / 12);
    const ms = Math.round(h.t * 1000);
    const dur = Math.min(h.dur, 4 / ratio);
    filters.push(`[0:a]aformat=sample_fmts=fltp:channel_layouts=stereo,asetrate=${Math.round(44100 * ratio)},aresample=44100,atrim=duration=${dur.toFixed(3)},adelay=${ms}|${ms},volume=${h.gain}[b${idx}]`);
    labels.push(`[b${idx}]`);
  });
  filters.push(`${labels.join("")}amix=inputs=${labels.length}:dropout_transition=0:normalize=0[out]`);
  ffmpeg(["-i", SAMPLES.sub, "-filter_complex", filters.join(";"), "-map", "[out]", "-t", totalSec.toString(), "-ar", "44100", "-ac", "2", outPath]);
}

function masterMix(drumPath, bassPath, outPath) {
  ffmpeg(["-i", drumPath, "-i", bassPath, "-filter_complex",
    `[0:a]volume=0.9[d];[1:a]volume=0.7[b];[d][b]amix=inputs=2:normalize=0[m];[m]alimiter=limit=0.95:level=disabled[out]`,
    "-map", "[out]", "-ar", "44100", "-ac", "2", outPath]);
}

const args = parseArgs(process.argv.slice(2));
const keyRoot = parseKey(args.key);
const { drumHits, bassHits, totalSec, bpm, bars } = build(args);
const drumPath = "/tmp/_logic-agent-drums.wav";
const bassPath = "/tmp/_logic-agent-bass.wav";

console.log(`Rendering ${bars} bars of ${args.style} at ${bpm} BPM in ${args.key}…`);
console.log(`  drum hits: ${drumHits.length}`);
console.log(`  bass hits: ${bassHits.length}`);
console.log("  Stage 1/3: drums…");
renderDrums(drumHits, totalSec, drumPath);
console.log("  Stage 2/3: 808 sub-bass…");
renderBass(bassHits, totalSec, keyRoot, bassPath);
console.log("  Stage 3/3: master mix + limiter…");
masterMix(drumPath, bassPath, args.out);
console.log(`Wrote ${args.out}`);
