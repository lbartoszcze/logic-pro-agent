// Production-quality helpers — humanization, swing, fills, trap 808 logic.
// Pure functions, deterministic given the seeded RNG. Imported by make-beat.mjs.

// Tiny LCG so output is reproducible across runs.
let _seed = 0x9e3779b9 >>> 0;
function rand() {
  _seed = (_seed * 1664525 + 1013904223) >>> 0;
  return _seed / 0xffffffff;
}
export function reseed(s) {
  _seed = s >>> 0;
}

// Velocity jitter that respects MIDI's 1-127 range.
export function humanVel(base, jitter = 6) {
  const v = base + Math.round((rand() - 0.5) * 2 * jitter);
  return Math.max(1, Math.min(127, v));
}

// Swing: delay every off-beat sixteenth by a fraction of its slot width.
// 50% = no swing (straight). Trap & lo-fi typically sit ~54-58.
export function swungTick(tick, sixteenth, swingPct = 50) {
  const stepIdx = Math.round(tick / sixteenth);
  if (stepIdx % 2 === 0) return tick;
  const shift = Math.round((sixteenth * (swingPct - 50)) / 100);
  return tick + shift;
}

// Trap hat velocity contour over a 16-step bar:
// downbeats loud, "ands" medium, ghosts in between.
const TRAP_HAT_VEL = [108, 56, 70, 56, 95, 56, 70, 56, 102, 56, 70, 56, 95, 56, 70, 56];
export function trapHatVel(stepIdx) {
  return TRAP_HAT_VEL[stepIdx % 16];
}

// Lo-fi / boom-bap hats are more even, slightly behind the beat.
const LOFI_HAT_VEL = [85, 55, 65, 55, 80, 55, 65, 55, 85, 55, 65, 55, 80, 55, 65, 55];
export function lofiHatVel(stepIdx) {
  return LOFI_HAT_VEL[stepIdx % 16];
}

// Fill detection. Last bar of every 4-bar phrase = fill.
export function isFillBar(barIdx, bars) {
  if (bars < 4) return false;
  return (barIdx + 1) % 4 === 0 && barIdx !== bars - 1;
}

// Last bar of the loop is also a fill so the loop seam doesn't sound flat.
export function isFinalFillBar(barIdx, bars) {
  return barIdx === bars - 1;
}

// Per-style fill kit. Snare roll on the last beat, kick breath, open hat crash.
export const FILL_PATTERNS = {
  trap: {
    kick:  "x..x..x.........",
    snare: "....x.......x.xx",  // ghost roll into next bar
    chat:  "x.x.x.x.x.x.x.x.",
    ohat:  "............x...",
    crashOnOne: false,
  },
  drill: {
    kick:  "x...x.....x.....",
    snare: "....x.......xxxx",
    chat:  "x.x.xxxxx.x.xxxx",
    ohat:  "................",
    crashOnOne: false,
  },
  "lo-fi": {
    kick:  "x...............",
    snare: "....x.......x.x.",
    chat:  "x.x.x.x.x.x.x.x.",
    ohat:  "............x...",
    crashOnOne: false,
  },
  "boom-bap": {
    kick:  "x...........x...",
    snare: "....x.......xxxx",
    chat:  "x.x.x.x.x.x.x.x.",
    ohat:  "............x...",
    crashOnOne: false,
  },
};

// Crash cymbal on bar 1 of a new section.
export function isSectionStart(barIdx) {
  return barIdx > 0 && barIdx % 4 === 0;
}

// Sparse trap 808 — long sustained notes on beat 1 and beat 3 of each bar,
// with octave jumps on the second hit of every-other bar for movement.
// Returns [{tick, length, pitch, vel}, ...] all relative to bar start.
export function trap808Bar(barIdx, root, beatTicks) {
  const out = [];
  // Note 1: beat 1, sustain to beat 3.
  out.push({ tick: 0, length: beatTicks * 2 - 20, pitch: root, vel: 110 });
  // Note 2: beat 3. Octave jump on alternating bars; on the bar before a fill,
  // use a tied pickup (longer note that bleeds into next bar).
  const beat3 = beatTicks * 2;
  const jump = barIdx % 2 === 1 ? 12 : 0;
  const tail = (barIdx + 1) % 4 === 0 ? beatTicks * 2 + beatTicks / 2 : beatTicks * 2 - 20;
  out.push({ tick: beat3, length: tail, pitch: root + jump, vel: 100 });
  return out;
}

// Adds a hat-roll dressing to the LAST quarter of a bar — six 1/32 hits
// at descending velocity into the next downbeat. Common trap signature.
export function hatRoll(barOffsetTicks, beatTicks) {
  const events = [];
  const start = barOffsetTicks + beatTicks * 3;
  const stepLen = beatTicks / 8; // 1/32 notes
  for (let i = 0; i < 6; i++) {
    events.push({
      tick: start + i * stepLen,
      length: stepLen - 5,
      vel: Math.max(60, 110 - i * 6),
    });
  }
  return events;
}

// Choose a melody motif index based on bar position so phrases vary.
// Bars 0-3 use motif A, 4-7 use B, 8-11 use C, 12-15 use D-with-resolution.
export function motifIndex(barIdx, motifCount) {
  const phrase = Math.floor(barIdx / 4);
  return phrase % motifCount;
}

// Section labels for an N-bar loop. Drives which parts play in which bars.
//   intro    : drums + bass only (no chords / no melody)  [bars 0..3]
//   verse    : full mix                                   [bars 4..7]
//   chorus   : full mix + busier hats                     [bars 8..11]
//   outro    : break — chords + melody, drums sparse      [bars 12..15]
// For loops shorter than 16 bars we collapse: 4 bars → all "verse",
// 8 bars → 4 intro + 4 chorus, 12 bars → 4 intro + 4 verse + 4 chorus.
export function sectionOf(barIdx, totalBars) {
  if (totalBars <= 4) return "verse";
  if (totalBars <= 8) return barIdx < 4 ? "intro" : "chorus";
  if (totalBars <= 12) {
    if (barIdx < 4) return "intro";
    if (barIdx < 8) return "verse";
    return "chorus";
  }
  if (barIdx < 4) return "intro";
  if (barIdx < 8) return "verse";
  if (barIdx < 12) return "chorus";
  return "outro";
}

// Per-section "should this part play?" rules.
export function partActiveIn(part, section) {
  switch (section) {
    case "intro":  return part === "drums" || part === "bass";
    case "verse":  return true;
    case "chorus": return true;
    case "outro":  return part === "chords" || part === "melody" || part === "bass";
    default:       return true;
  }
}
