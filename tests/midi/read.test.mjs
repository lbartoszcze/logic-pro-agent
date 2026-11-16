// A Standard MIDI File reads back into the schedule make-beat.mjs writes notes
// from: a file built by lib/midi/midi.mjs returns its tempo, its track name and
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

import { TPB, buildSMF, buildTrack, controlChange, END_OF_TRACK, programChange, scheduleToEvents, tempoMeta, trackName } from '../../lib/midi/midi.mjs'
import { readSMF } from '../../lib/midi/midi-read.mjs'

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
  assert.throws(() => readSMF(Buffer.from('RIFF0000')), /does not open with MThd but with "RIFF"/)
})

test('a file cut short is refused naming where it ends, not read as fewer tracks', () => {
  assert.throws(() => readSMF(Buffer.from('MThd')), /the file is 4 bytes, shorter than the 14-byte MThd header/)
  const whole = buildSMF([buildTrack([trackName('Bass'), END_OF_TRACK]), buildTrack([trackName('Keys'), END_OF_TRACK])])
  assert.throws(() => readSMF(whole.subarray(0, whole.length - 2)), /track 2 announces \d+ bytes from byte \d+, but the file ends at byte \d+: it is cut short/)
  // Everything up to the second track's chunk, whose search starts past the first one's at byte 14.
  const firstTrackOnly = whole.subarray(0, whole.indexOf('MTrk', 20))
  assert.throws(() => readSMF(firstTrackOnly), /the header announces 2 tracks, but the file ends after 1/)
})

/** One-track file around `body`, at 96 ticks per quarter note. */
function oneTrack(body) {
  const header = Buffer.from([0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 0, 96])
  return Buffer.concat([header, Buffer.from('MTrk'), Buffer.from([0, 0, 0, body.length]), Buffer.from(body)])
}

test('a malformed event is refused naming the track and byte, not read as zeros', () => {
  // A data byte first: running status with no status before it.
  assert.throws(() => readSMF(oneTrack([0x00, 60, 100])), /track 1: data byte 0x3c at byte 23 has no status before it/)
  // Running status after a meta event, which cancels it.
  assert.throws(() => readSMF(oneTrack([0x00, 0x90, 60, 100, 0x00, 0xff, 0x03, 0x00, 0x00, 62, 90])), /data byte 0x3e at byte 31 has no status before it/)
  // A note on whose velocity lies past the track's end.
  assert.throws(() => readSMF(oneTrack([0x00, 0x90, 60])), /track 1: a channel message's 2 data byte\(s\) at byte 24 runs past the track's end at byte 25/)
  // A delta-time of five continuation bytes.
  assert.throws(() => readSMF(oneTrack([0x81, 0x81, 0x81, 0x81, 0x01, 0x90, 60, 100])), /the variable-length number at byte 22 runs past the 4 bytes it may take/)
  // A system common byte, which a file cannot hold.
  assert.throws(() => readSMF(oneTrack([0x00, 0xf2, 0x00, 0x00])), /status byte 0xf2 before byte 24 has no meaning in a Standard MIDI File/)
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
