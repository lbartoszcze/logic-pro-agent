// The MIDI commands of logic.mjs send bytes Logic acts on at once, so a word
// that is not a number in range must be refused before anything is sent:
// `+"loud"` is NaN, and NaN & 0x7f is 0, which would pull a fader to the
// bottom or play note 0; strip 9 would act on strip 1. Each refusal names the
// usage, the argument, its range and what was given, and exits 1 with nothing
// on standard output (where a sent message is reported).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const logic = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'logic.mjs')

/** Runs `node logic.mjs ...words` and answers its status and output. */
function run(...words) {
  const { status, stdout, stderr } = spawnSync(process.execPath, [logic, ...words], { encoding: 'utf8' })
  return { status, stdout, stderr }
}

const refusals = [
  [['fader', '3', 'loud'], 'usage: fader <strip 0-7> <level 0..1>\nlevel must be a number from 0 (bottom) to 1 (top), such as 0.75; got "loud"'],
  [['fader', '9', '0.5'], 'usage: fader <strip 0-7> <level 0..1>\nstrip must be a whole number from 0 to 7; got "9"'],
  [['master-fader', '1.5'], 'usage: master-fader <level 0..1>\nlevel must be a number from 0 (bottom) to 1 (top), such as 0.75; got "1.5"'],
  [['mute-ch'], 'usage: mute-ch <strip 0-7>\nstrip is missing'],
  [['vpot', '2', '100'], 'usage: vpot <strip 0-7> <ticks -63..63>\nticks must be a whole number from -63 to 63; got "100"'],
  [['cc', '0', '7', '100'], 'usage: cc <channel 1-16> <controller 0-127> <value 0-127>\nchannel must be a whole number from 1 to 16; got "0"'],
  [['midi-note', '1', 'C4'], 'usage: midi-note <channel 1-16> <pitch 0-127, middle C is 60> [velocity 0-127] [milliseconds]\npitch must be a whole number from 0 to 127; got "C4"'],
  [['midi-note', '1', '60', ' '], 'usage: midi-note <channel 1-16> <pitch 0-127, middle C is 60> [velocity 0-127] [milliseconds]\nvelocity is missing'],
  [['pc', '1', '128'], 'usage: pc <channel 1-16> <program 0-127>\nprogram must be a whole number from 0 to 127; got "128"'],
]

for (const [words, message] of refusals) {
  test(`node logic.mjs ${words.join(' ')} is refused before anything is sent`, () => {
    const { status, stdout, stderr } = run(...words)
    assert.equal(status, 1)
    assert.equal(stdout, '')
    assert.equal(stderr, `${message}\n`)
  })
}

test('a word that names no mode is refused naming the modes there are', () => {
  const { status, stdout, stderr } = run('assign', 'volume')
  assert.equal(status, 1)
  assert.equal(stdout, '')
  assert.equal(stderr, 'assign mode "volume" is none of track|send|pan|plugin|eq|instrument\n')
})

test('an unknown command is named, with the command nearest to it and those sharing a word with it', () => {
  const { status, stdout, stderr } = run('new-track')
  assert.equal(status, 1)
  assert.equal(stdout, '')
  const lines = stderr.split('\n')
  assert.equal(lines[0], 'node logic.mjs knows no command "new-track"')
  assert.ok(lines.includes('Nearest to it: new-tracks'), stderr)
  assert.ok(lines.some((line) => /^Commands sharing a word with it: .*\bnew-audio-track\b/.test(line)), stderr)
})

test('a typo with no word in common still names the command meant', () => {
  const { stderr } = run('tempp')
  assert.ok(stderr.split('\n').includes('Nearest to it: tempo'), stderr)
})
