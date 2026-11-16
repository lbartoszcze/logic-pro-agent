// Beat-style pack layer — analog of final-cut-pro-agent lib/styles/.
//
// make-beat.mjs already owns the runtime STYLES const (drum grids, chord
// degrees, swing, bpm). This module adds the per-archetype *defaults* that
// const lacks — recommended key, bar count, and a human description — plus
// a catalog accessor. make-beat.mjs resolves --key/--bars in priority
// order: an explicit user flag wins; otherwise the archetype pack value.
// Every style make-beat.mjs knows has a pack, so no third default exists.

export const STYLE_PACKS = {
  trap: {
    key: "Fm", bars: 16,
    description: "Hard 140-BPM trap — rolling 808 sub, triplet hat rolls, sparse minor-7 stabs.",
  },
  "lo-fi": {
    key: "Am", bars: 24,
    description: "85-BPM lo-fi hip-hop — laid-back swing, dusty kit, jazzy min-7/maj-7 chords.",
  },
  "boom-bap": {
    key: "Cm", bars: 16,
    description: "92-BPM boom-bap — punchy kick/snare, straight hats, sampled-soul triad loop.",
  },
  drill: {
    key: "Gm", bars: 16,
    description: "Dark UK/NY drill — sliding 808s, syncopated hats, ~144 BPM minor tension.",
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
