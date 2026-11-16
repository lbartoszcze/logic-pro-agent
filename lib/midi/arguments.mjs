// make-beat.mjs's flag values: a key name and the whole numbers --bpm and
// --bars take, each refused naming what was given and how to write it.

// Semitones above C of each natural note in the twelve-tone equal-tempered scale.
const NOTE_TO_SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
// The key's root lies in the octave starting one octave below middle C, which
// the MIDI 1.0 Detailed Specification numbers 60: note 48.
const ROOT_OCTAVE = 48;
const SEMITONES = 12;

/** The MIDI note of `str`'s root (C, F#m, Bb), or the error saying how a key is written. */
export function parseKey(str) {
  const m = str.match(/^([A-G])([#b]?)m?$/);
  if (!m) {
    // German and Polish note names call B "H": a likely reason for one.
    const hint = /^H/.test(str) ? `; H is ${str.replace(/^H/, "B")} in English note names` : "";
    throw new Error(`--key takes a note A-G, then # or b for sharp or flat, then m for minor (C, F#m, Bb); got ${JSON.stringify(str)}${hint}`);
  }
  const accidental = m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0;
  return ROOT_OCTAVE + ((NOTE_TO_SEMI[m[1]] + accidental + SEMITONES) % SEMITONES);
}

/** `value` of flag --`name` as a whole number from 1, or the error naming what was given. */
export function wholeNumber(name, value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) throw new Error(`--${name} takes a whole number from 1, not ${JSON.stringify(value)}`);
  return number;
}
