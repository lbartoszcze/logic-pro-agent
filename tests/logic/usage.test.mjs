// A Logic command given a wrong or missing argument is refused before golem
// is asked anything: the refusal shows the command's usage, then names the
// argument, the range Logic takes and what was given. Exit status 1, nothing
// on standard output.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const logic = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'logic.mjs')

const refusals = [
  [['tempo', 'fast'], 'usage: node logic.mjs tempo <bpm>\nthe tempo must be a number of beats per minute from 5 to 990, Logic\'s range, such as 92 or 120.5; got "fast"'],
  [['tempo', '1000'], 'usage: node logic.mjs tempo <bpm>\nthe tempo must be a number of beats per minute from 5 to 990, Logic\'s range, such as 92 or 120.5; got "1000"'],
  [['tempo'], 'usage: node logic.mjs tempo <bpm>\nthe tempo in beats per minute is missing'],
  [['wait-tracks', '2.5'], 'usage: node logic.mjs wait-tracks <count>\nthe number of tracks must be a whole number from 1; got "2.5"'],
  [['bounce-in-place', 'toString'], 'usage: node logic.mjs bounce-in-place <regions|tracks|replace>\nthe scope is "toString", none of those'],
  [['bounce-in-place'], 'usage: node logic.mjs bounce-in-place <regions|tracks|replace>\nthe scope is missing'],
  [['swap', 'Bass'], 'usage: node logic.mjs swap <track-hint> <patch>\nthe patch\'s name is missing'],
  [['select'], 'usage: node logic.mjs select <track-hint>\na word of the track\'s name is missing'],
]

for (const [words, message] of refusals) {
  test(`node logic.mjs ${words.join(' ')} is refused before golem is asked`, () => {
    const { status, stdout, stderr } = spawnSync(process.execPath, [logic, ...words], {
      encoding: 'utf8',
      // A golem that cannot run: were it asked, the failure would name it instead of the usage.
      env: { ...process.env, GOLEM_BIN: join(dirname(logic), 'no-golem-here') },
    })
    assert.equal(status, 1)
    assert.equal(stdout, '')
    assert.equal(stderr, `${message}\n`)
  })
}
