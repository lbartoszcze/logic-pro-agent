#!/usr/bin/env node
// `node read-midi.mjs <file.mid>`: a MIDI file a person already has, printed as the
// schedule make-beat.mjs writes notes from (lib/midi-read.mjs), so a part made in another
// DAW is placed in a new beat as written.
import { readFileSync } from 'node:fs';
import { readSMF } from './lib/midi-read.mjs';

const [file] = process.argv.slice(2);
if (!file) {
  console.error('usage: node read-midi.mjs <file.mid>');
  process.exit(2);
}
try {
  console.log(JSON.stringify(readSMF(readFileSync(file)), null, 2));
} catch (error) {
  console.error(`${file}: ${error.message}`);
  process.exit(1);
}
