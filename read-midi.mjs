#!/usr/bin/env node
// `node read-midi.mjs <file.mid>`: a MIDI file a person already has, printed as the
// schedule make-beat.mjs writes notes from (lib/midi-read.mjs), so a part made in another
// DAW is placed in a new beat as written.
//
// `node read-midi.mjs sources [--all] | sources discover <adapter> --path <file.mid>`: what
// the agent reads of music a person already made, one adapter each (IMP-LOGI-<NN>), under
// the import guidelines' contract. A Standard MIDI File (02) is read by this command;
// `discover` reads one as it would and says how many tracks and note events it holds. Nothing is
// kept, so the writing verbs are refused. A MIDI file named `sources` or `doctor` is
// written `./sources` or `./doctor`.
//
// `node read-midi.mjs doctor --check import-sources`: the Logic Pro and GarageBand projects
// in the folders they save to by default (~/Music/Logic, ~/Music/GarageBand), each with
// the export that brings its notes in.
import { readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { readSMF } from './lib/midi-read.mjs';

const ADAPTERS = [
  { adapter: 'IMP-LOGI-02', source: 'a Standard MIDI File (Logic Pro, GarageBand, Ableton or any DAW)', kind: 'F', read_by: 'node read-midi.mjs <file.mid>' },
];
// The projects and libraries the plan names that no reader takes, each with why and what to do.
const AS_MIDI = 'export the regions as a Standard MIDI File and read it as IMP-LOGI-02';
const NAMED = [
  { adapter: 'IMP-LOGI-01', source: 'a Logic Pro project (.logicx)', why: 'is Logic Pro\'s own package format', remedy: AS_MIDI },
  { adapter: 'IMP-LOGI-03', source: 'sample libraries', why: 'are audio, and the agent reads notes', remedy: 'none: no reader of the agent takes audio' },
  { adapter: 'IMP-LOGI-04', source: 'a GarageBand project (.band)', why: 'is GarageBand\'s own package format', remedy: AS_MIDI },
  { adapter: 'IMP-LOGI-05', source: 'an Ableton Live set (.als)', why: 'is Ableton\'s own set format', remedy: AS_MIDI },
].map((named) => ({ ...named, kind: 'D', found: false }));
const WRITES = ['preview', 'import', 'release', 'sync', 'resolve', 'forget', 'log'];

function refuse(message) {
  console.error(message);
  process.exit(2);
}

function sources(words) {
  const at = words.indexOf('--path');
  const path = at < 0 ? undefined : words[at + 1];
  const plain = words.filter((word, index) => word !== '--all' && word !== '--path' && !(at >= 0 && index === at + 1));
  if (!plain.length) return { adapters: [...ADAPTERS.map((adapter) => ({ ...adapter, found: false })), ...NAMED], all: words.includes('--all') };
  const [verb, id, ...rest] = plain;
  if (WRITES.includes(verb)) refuse(`sources ${verb}: the agent keeps nothing; read-midi.mjs prints a file's schedule for a new beat`);
  if (verb !== 'discover' || !id || rest.length) refuse(`sources takes no words, or discover <adapter> --path <file.mid>; got ${plain.join(' ')}`);
  const named = NAMED.find((candidate) => candidate.adapter === id);
  if (named) return named;
  const adapter = ADAPTERS.find((candidate) => candidate.adapter === id);
  if (!adapter) refuse(`${id} is not an adapter of logic-pro-agent; it has ${[...ADAPTERS, ...NAMED].map((candidate) => candidate.adapter).join(', ')}`);
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

// Each project package (by its extension) directly in a DAW's default project folder.
const PROJECT_FOLDERS = [
  ['IMP-LOGI-01', join(homedir(), 'Music', 'Logic'), '.logicx'],
  ['IMP-LOGI-04', join(homedir(), 'Music', 'GarageBand'), '.band'],
];

function importSourcesCheck(words) {
  if (words.length !== 2 || words[0] !== '--check' || words[1] !== 'import-sources') refuse(`doctor takes --check import-sources; got ${words.join(' ')}`);
  const outside = PROJECT_FOLDERS.flatMap(([adapter, folder, extension]) => {
    let names = [];
    try {
      names = readdirSync(folder).filter((name) => name.endsWith(extension));
    } catch {
      return [];
    }
    return names.map((name) => ({ adapter, place: join(folder, name), moved_by: AS_MIDI }));
  });
  return { check: 'import-sources', outside };
}

const [file, ...rest] = process.argv.slice(2);
if (file === 'sources') {
  console.log(JSON.stringify(sources(rest), null, 2));
} else if (file === 'doctor') {
  console.log(JSON.stringify(importSourcesCheck(rest), null, 2));
} else {
  if (!file) {
    console.error('usage: node read-midi.mjs <file.mid> | node read-midi.mjs sources [--all] | sources discover <adapter> --path <file.mid> | doctor --check import-sources');
    process.exit(2);
  }
  try {
    console.log(JSON.stringify(readSMF(readFileSync(file)), null, 2));
  } catch (error) {
    console.error(`${file}: ${error.message}`);
    process.exit(1);
  }
}
