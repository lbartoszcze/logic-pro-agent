// make-beat.mjs refuses a beat it cannot make as asked, naming the flag and
// what was given, and leaves beat.mid as it was: a bar count or tempo that is
// not a whole number from 1 (no longer read as its leading digits), a style
// it does not know, a key it cannot read.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const beat = join(root, 'beat.mid')

/** beat.mid's bytes, or null when there is none, to show a refusal left it alone. */
const beatNow = () => (existsSync(beat) ? readFileSync(beat) : null)

for (const [flags, said] of [
  [['--bars=12abc'], '--bars takes a whole number from 1, not "12abc"'],
  [['--bars=0'], '--bars takes a whole number from 1, not "0"'],
  [['--bpm=96.5'], '--bpm takes a whole number from 1, not "96.5"'],
  [['--style=polka'], 'unknown style: polka'],
  [['--key=H'], 'unparseable key: H'],
]) {
  test(`make-beat ${flags.join(' ')} is refused and writes nothing`, () => {
    const before = beatNow()
    const run = spawnSync(process.execPath, [join(root, 'make-beat.mjs'), ...flags], { cwd: root, encoding: 'utf8' })
    assert.notEqual(run.status, 0, `exited 0: ${run.stdout}`)
    assert.ok(run.stderr.includes(said), run.stderr)
    assert.deepEqual(beatNow(), before)
  })
}
