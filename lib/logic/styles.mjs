// Beat-style pack layer — analog of final-cut-pro-agent lib/styles/.
//
// make-beat.mjs already owns the runtime STYLES const (drum grids, chord
// degrees, swing, bpm). This module adds the per-archetype *defaults* that
// const lacks — recommended key, bar count, and a human description — plus
// a catalog accessor. make-beat.mjs resolves --key/--bars in priority
// order: an explicit user flag wins; otherwise the archetype pack value.
// Every style make-beat.mjs knows has a pack, so no third default exists.

/** The style a beat takes when --style names none. */
export const DEFAULT_STYLE = "trap";

// `swaps`: the patch each imported track gets after the MIDI import, as
// [part of the track's name, Library patch]. The names are those Logic gave
// the beat's imported tracks when these swaps were written (SoCal drums,
// Pulse Bass, 80s FM Piano); golem/PLAN.md lists checking them on Logic 13.
export const STYLE_PACKS = {
  trap: {
    key: "Fm", bars: 16,
    description: "Hard 140-BPM trap — rolling 808 sub, triplet hat rolls, sparse minor-7 stabs.",
    swaps: [["SoCal", "Electro Trap Combo"], ["Pulse Bass", "Tough 808 Bass"], ["80s FM Piano", "Watery Rhodes"]],
  },
  "lo-fi": {
    key: "Am", bars: 24,
    description: "85-BPM lo-fi hip-hop — laid-back swing, dusty kit, jazzy min-7/maj-7 chords.",
    swaps: [["Pulse Bass", "Soft Acoustic Bass"], ["80s FM Piano", "Watery Rhodes"]],
  },
  "boom-bap": {
    key: "Cm", bars: 16,
    description: "92-BPM boom-bap — punchy kick/snare, straight hats, sampled-soul triad loop.",
    swaps: [],
  },
  drill: {
    key: "Gm", bars: 16,
    description: "Dark UK/NY drill — sliding 808s, syncopated hats, ~144 BPM minor tension.",
    swaps: [["SoCal", "Electro Trap Combo"], ["Pulse Bass", "Heavy 808 Bass"], ["80s FM Piano", "Watery Rhodes"]],
  },
};

export function listStyles() {
  return Object.entries(STYLE_PACKS).map(([name, p]) => ({
    name, key: p.key, bars: p.bars, description: p.description,
  }));
}

/** The pack of style `name`; a style make-beat.mjs knows but this file lacks is a mistake to name. */
export function stylePack(name) {
  const pack = STYLE_PACKS[name];
  if (pack === undefined) {
    throw new Error(`style ${name} has no pack in lib/logic/styles.mjs: add its key, bars and description there`);
  }
  return pack;
}
