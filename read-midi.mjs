#!/usr/bin/env node
// `node read-midi.mjs <file.mid>`: a MIDI file a person already has, printed as the
// schedule make-beat.mjs writes notes from (lib/midi-read.mjs), so a part made in another
// DAW is placed in a new beat as written.
//
// `node read-midi.mjs sources [--all] | sources discover <adapter> --path <file.mid>`: what
// the agent reads of music a person already made, one adapter each (IMP-LOGI-<NN>), under
// the import guidelines' contract. A Standard MIDI File (02) is read by this command;
// `discover` reads one as it would and says how many tracks and note events it holds. Nothing is
// kept, so the writing verbs are refused. A MIDI file named `sources` is written
// `./sources`.
import { readFileSync } from 'node:fs';
import { readSMF } from './lib/midi-read.mjs';

const ADAPTERS = [
  { adapter: 'IMP-LOGI-02', source: 'a Standard MIDI File (Logic Pro, GarageBand, Ableton or any DAW)', kind: 'F', read_by: 'node read-midi.mjs <file.mid>' },
];
const WRITES = ['preview', 'import', 'release', 'sync', 'resolve', 'forget', 'log'];

function refuse(message) {
  console.error(message);
  process.exit(2);
}

function sources(words) {
  const at = words.indexOf('--path');
  const path = at < 0 ? undefined : words[at + 1];
  const plain = words.filter((word, index) => word !== '--all' && word !== '--path' && !(at >= 0 && index === at + 1));
  if (!plain.length) return { adapters: ADAPTERS.map((adapter) => ({ ...adapter, found: false })), all: words.includes('--all') };
  const [verb, id, ...rest] = plain;
  if (WRITES.includes(verb)) refuse(`sources ${verb}: the agent keeps nothing; read-midi.mjs prints a file's schedule for a new beat`);
  if (verb !== 'discover' || !id || rest.length) refuse(`sources takes no words, or discover <adapter> --path <file.mid>; got ${plain.join(' ')}`);
  const adapter = ADAPTERS.find((candidate) => candidate.adapter === id);
  if (!adapter) refuse(`${id} is not an adapter of logic-pro-agent; it has ${ADAPTERS.map((candidate) => candidate.adapter).join(', ')}`);
  if (!path) refuse(`${id} reads a file; name it with --path <file.mid>`);
  try {
    const { tracks } = readSMF(readFileSync(path));
    // Every scheduled event that is no controller (kind 2) is a note's on or off.
    const noteEvents = tracks.reduce((sum, track) => sum + track.schedule.filter((event) => event.kind !== 2).length, 0);
    return { ...adapter, path, found: tracks.length > 0, tracks: tracks.length, note_events: noteEvents };
  } catch (error) {
    return { ...adapter, path, found: false, why_not: error.message };
  }
}

const [file, ...rest] = process.argv.slice(2);
if (file === 'sources') {
  console.log(JSON.stringify(sources(rest), null, 2));
} else {
  if (!file) {
    console.error('usage: node read-midi.mjs <file.mid> | node read-midi.mjs sources [--all] | sources discover <adapter> --path <file.mid>');
    process.exit(2);
  }
  try {
    console.log(JSON.stringify(readSMF(readFileSync(file)), null, 2));
  } catch (error) {
    console.error(`${file}: ${error.message}`);
    process.exit(1);
  }
}
