// Logic is driven through golem's command line, so what this checkout relies
// on is golem's contract: the command, then --app Logic and --json before the
// caller's words; standard output as the answer; progress lines on standard
// error passed through as they come; a failure as one JSON object naming what
// failed, what golem saw, the fix and the cause, with golem's exit status.
// A stand-in golem (GOLEM_BIN) plays each side of that contract. A failed
// Logic step then reads in Logic's terms, golem's report kept under it.
import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { chmodSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const scratch = join(root, '.build', 'tests', randomUUID())
mkdirSync(scratch, { recursive: true })
after(() => rmSync(scratch, { recursive: true, force: true }))

const missing = {
  message: 'nothing in Logic Pro matches checkbox[title="Play"] (412 elements read)',
  observed: ['no element has role checkbox'],
  fix: '`golem tree --app A` shows every element',
  cause: 'selector.no-match',
  kind: 'not-found',
  exit: 3,
}
const quit = { message: 'Logic Pro (pid 4242) is no longer running', observed: [], fix: 'start it again', cause: 'app.quit', kind: 'no-app', exit: 7 }

// The stand-in answers as $FAKE_GOLEM says: echo its arguments, or fail as golem does.
const fake = join(scratch, 'golem')
writeFileSync(fake, `#!/bin/sh
case "$FAKE_GOLEM" in
  echo) printf '%s\\n' "$@" ;;
  missing)
    printf '%s\\n' 'golem: waiting for checkbox[title="Play"] to match in Logic Pro until it shows (interrupt to stop); now: nothing' >&2
    printf '%s\\n' '${JSON.stringify({ error: missing })}' >&2
    exit 3 ;;
  quit)
    printf '%s\\n' '${JSON.stringify({ error: quit })}' >&2
    exit 7 ;;
esac
`)
chmodSync(fake, 0o755)
process.env.GOLEM_BIN = fake
// GOLEM is read when the module loads, so the stand-in is named first.
const { golem, GolemFailure, golemHolds, literal, q } = await import('../../lib/golem.mjs')
const { LogicFailure } = await import('../../lib/logic/control.mjs')

/** Runs `act` with process.stderr's writes collected instead of shown. */
async function capturingStderr(act) {
  const written = []
  const write = process.stderr.write
  process.stderr.write = (chunk) => { written.push(String(chunk)); return true }
  try {
    return { result: await act().catch((error) => error), written: written.join('') }
  } finally {
    process.stderr.write = write
  }
}

test('the command, --app Logic and --json come before the caller\'s words, and stdout is the answer', async () => {
  process.env.FAKE_GOLEM = 'echo'
  const answer = await golem('press', ['checkbox[title="Play"]', '--', '--expect'])
  assert.deepEqual(answer.split('\n'), ['press', '--app', 'com.apple.logic10', '--json', 'checkbox[title="Play"]', '--', '--expect'])
  assert.deepEqual((await golem('apps', [], { app: false })).split('\n'), ['apps', '--json'])
})

test('a failure carries golem\'s report and exit status, and its progress lines pass through', async () => {
  process.env.FAKE_GOLEM = 'missing'
  const { result, written } = await capturingStderr(() => golem('press', ['checkbox[title="Play"]']))
  assert.ok(result instanceof GolemFailure, `not a GolemFailure: ${result}`)
  assert.equal(result.status, 3)
  assert.deepEqual(result.report, missing)
  assert.match(written, /^golem: waiting for checkbox\[title="Play"\]/)
  assert.doesNotMatch(written, /"error"/)
})

test('golemHolds answers false for "not there" and lets every other failure through', async () => {
  process.env.FAKE_GOLEM = 'missing'
  const { result } = await capturingStderr(() => golemHolds('find', ['checkbox[title="Play"]']))
  assert.equal(result, false)
  process.env.FAKE_GOLEM = 'quit'
  await assert.rejects(golemHolds('find', ['checkbox[title="Play"]']), (error) => error instanceof GolemFailure && error.status === 7)
})

test('a failed Logic step names the step, keeps golem\'s report, adds the Logic fix and keeps the exit status', async () => {
  process.env.FAKE_GOLEM = 'missing'
  const { result } = await capturingStderr(() => golem('press', ['checkbox[title="Play"]']))
  const failure = new LogicFailure('pressing Play', result)
  const lines = failure.message.split('\n')
  assert.equal(lines[0], 'logic: pressing Play did not happen')
  assert.equal(lines[1], `golem: ${missing.message}`)
  assert.ok(lines.includes('observed: no element has role checkbox'), failure.message)
  assert.ok(lines.includes(`fix: ${missing.fix}`), failure.message)
  assert.ok(lines.some((line) => line.startsWith('fix: Logic 13 may name this element differently')), failure.message)
  assert.equal(lines.at(-1), 'cause: selector.no-match (exit 3, not-found)')
  assert.equal(failure.status, 3)
})

test('names with quotes, backslashes and regex characters stay one literal selector value', () => {
  assert.equal(q('Rhodes "Classic" \\ Warm'), '"Rhodes \\"Classic\\" \\\\ Warm"')
  const pattern = new RegExp(`^${literal('808 Bass (Hard)+.*')}$`)
  assert.ok(pattern.test('808 Bass (Hard)+.*'))
  assert.ok(!pattern.test('808 Bass Hard'))
})
