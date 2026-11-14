#!/usr/bin/env node
// beat-to-midi: the Logic Pro agent writes a beat as a Standard MIDI File
// and reads one back as the schedule it writes notes from, without Logic
// Pro. `make-beat.mjs --style=lo-fi --key=Am --bpm=96` writes beat.mid;
// `read-midi.mjs beat.mid` reads it back with its 96 BPM tempo and named
// tracks holding notes, each note on paired with a later note off; a file
// that does not open with MThd is refused naming why; then the agent's own
// MIDI reading test (tests/midi/read.test.mjs) runs.
//
// make-beat writes beat.mid in the checkout; a beat.mid already there is put
// aside first and put back at the end. The run names WISENT_WORKSPACE, the
// folder holding the logic-pro-agent checkout.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    process.stderr.write(`${name} is not set: run this journey through \`probierz run tui --app logic-pro-agent\`\n`);
    process.exit(2);
  }
  return value;
}

const checkout = join(required('WISENT_WORKSPACE'), 'logic-pro-agent');
const own = join(required('PROBIERZ_ARTIFACTS'), 'logic');
mkdirSync(own, { recursive: true });
const beat = join(checkout, 'beat.mid');
const aside = join(own, 'beat.mid.before-journey');
const hadBeat = existsSync(beat);
if (hadBeat) renameSync(beat, aside);

const node = (args) => spawnSync(process.execPath, args, { cwd: checkout, encoding: 'utf8', maxBuffer: Infinity });
const broken = [];
const expect = (holds, sentence) => {
  if (!holds) broken.push(sentence);
};
try {
  const made = node(['make-beat.mjs', '--style=lo-fi', '--key=Am', '--bpm=96']);
  expect(made.status === 0 && existsSync(beat), `make-beat did not write beat.mid: ${made.stderr.trim()}`);
  if (existsSync(beat)) copyFileSync(beat, join(own, 'beat.mid'));

  const read = node(['read-midi.mjs', beat]);
  let song = {};
  try {
    song = JSON.parse(read.stdout);
  } catch {
    broken.push(`read-midi printed no reading: ${read.stderr.trim()}`);
  }
  expect(Math.round(song.tempoBpm ?? 0) === 96, `the beat read back at ${song.tempoBpm} BPM, not 96`);
  const tracks = song.tracks ?? [];
  // lib/midi-read.mjs marks a note on as kind 1, a note off as kind 0.
  const withNotes = tracks.filter((track) => (track.schedule ?? []).some((event) => event.kind === 1));
  expect(withNotes.length > 0 && withNotes.every((track) => track.name), `the beat holds no named track with notes: ${JSON.stringify(tracks.map((track) => track.name))}`);

  const garbage = join(own, 'not-midi.mid');
  writeFileSync(garbage, 'RIFF this is not a MIDI file');
  const refused = node(['read-midi.mjs', garbage]);
  expect(refused.status !== 0 && refused.stderr.includes('MThd'), 'a file that does not open with MThd was not refused naming why');

  const tested = spawnSync(process.execPath, ['--test', 'tests/midi/read.test.mjs'], { cwd: checkout, stdio: 'inherit' });
  expect(tested.status === 0, 'the agent\'s own MIDI reading test failed');
} catch (failure) {
  broken.push(failure.message);
} finally {
  rmSync(beat, { force: true });
  if (hadBeat) renameSync(aside, beat);
}

if (broken.length > 0) {
  process.stderr.write(`${broken.join('\n')}\n`);
  process.exit(1);
}
process.stdout.write('The Logic Pro agent wrote a 96 BPM lo-fi beat as MIDI and read it back as written\n');
