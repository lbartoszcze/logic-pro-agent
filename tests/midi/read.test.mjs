// A Standard MIDI File reads back into the schedule make-beat.mjs writes notes
// from: a file built by lib/midi.mjs returns its tempo, its track name and
// every note on, note off and controller at its tick, at the file's own
// resolution; running status and a note on of velocity 0 read as the SMF 1.0
// specification defines them; a file that counts SMPTE frames, or does not
// open with MThd, is refused naming why; read-midi.mjs prints the reading and
// refuses a missing file argument as misuse.
import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { TPB, buildSMF, buildTrack, controlChange, END_OF_TRACK, programChange, scheduleToEvents, tempoMeta, trackName } from '../../lib/midi.mjs'
import { readSMF } from '../../lib/midi-read.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const scratch = join(root, '.build', 'tests', randomUUID())
mkdirSync(scratch, { recursive: true })
after(() => rmSync(scratch, { recursive: true, force: true }))

// The shell's statuses for success and misuse (https://www.gnu.org/software/bash/manual/html_node/Exit-Status.html).
const SUCCEEDED = 0
const MISUSE = 2

const schedule = () => [
  { tick: 0, kind: 1, ch: 9, pitch: 36, vel: 110 },
  { tick: 240, kind: 0, ch: 9, pitch: 36 },
  { tick: 480, kind: 2, ch: 9, cc: 11, value: 90 },
  { tick: 480, kind: 1, ch: 9, pitch: 38, vel: 96 },
  { tick: 720, kind: 0, ch: 9, pitch: 38 },
]

test('a file lib/midi.mjs writes reads back into its schedule, name and tempo', () => {
  const bytes = buildSMF([
    buildTrack([tempoMeta(92), END_OF_TRACK]),
    buildTrack([trackName('Drums'), programChange(0, 9, 0), ...scheduleToEvents(schedule()), END_OF_TRACK]),
  ])
  const read = readSMF(bytes)
  assert.equal(read.format, 1)
  assert.equal(read.ticksPerQuarter, TPB)
  assert.equal(Math.round(read.tempoBpm), 92)
  assert.equal(read.tracks[1].name, 'Drums')
  assert.deepEqual(read.tracks[1].schedule, schedule().sort((a, b) => a.tick - b.tick || a.kind - b.kind))
})

test('running status and a note on of velocity 0 read as the specification defines them', () => {
  const body = Buffer.from([
    0x00, 0x90, 60, 100, // note on, channel 0
    0x60, 62, 90, // running status: another note on
    0x60, 60, 0, // running status, velocity 0: the note off of 60
    0x00, 0xff, 0x2f, 0x00,
  ])
  const header = Buffer.from([0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 0, 96])
  const track = Buffer.concat([Buffer.from('MTrk'), Buffer.from([0, 0, 0, body.length]), body])
  const read = readSMF(Buffer.concat([header, track]))
  assert.equal(read.ticksPerQuarter, 96)
  assert.deepEqual(read.tracks[0].schedule, [
    { tick: 0, kind: 1, ch: 0, pitch: 60, vel: 100 },
    { tick: 96, kind: 1, ch: 0, pitch: 62, vel: 90 },
    { tick: 192, kind: 0, ch: 0, pitch: 60 },
  ])
})

test('a file in SMPTE time or without MThd is refused naming why', () => {
  const smpte = Buffer.from([0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 0, 0xe7, 40])
  assert.throws(() => readSMF(smpte), /counts time in SMPTE frames/)
  assert.throws(() => readSMF(Buffer.from('RIFF0000')), /does not open with MThd/)
})

test('read-midi.mjs prints the reading and refuses a missing file as misuse', () => {
  const file = join(scratch, 'part.mid')
  writeFileSync(file, buildSMF([buildTrack([trackName('Bass'), controlChange(0, 1, 7, 100), END_OF_TRACK])]))
  const ran = spawnSync(process.execPath, [join(root, 'read-midi.mjs'), file], { encoding: 'utf8' })
  assert.equal(ran.status, SUCCEEDED, ran.stderr)
  assert.deepEqual(JSON.parse(ran.stdout).tracks[0].schedule, [{ tick: 0, kind: 2, ch: 1, cc: 7, value: 100 }])
  const bare = spawnSync(process.execPath, [join(root, 'read-midi.mjs')], { encoding: 'utf8' })
  assert.equal(bare.status, MISUSE)
  assert.match(bare.stderr, /usage: node read-midi\.mjs <file\.mid>/)
})
