// Where this checkout finds golem when GOLEM_BIN is unset: golem is built
// with kompilator, which writes a release build to
// <golem checkout>/.build/kompilator/release/golem (`kompilator build --help`:
// --out defaults to <package dir>/.build/kompilator/<profile>), and Cargo's
// target/release is never written. A missing golem, and the doctor's golem
// check, name the kompilator build that writes it.
import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { chmodSync, cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const scratch = join(root, '.build', 'tests', randomUUID())
mkdirSync(scratch, { recursive: true })
after(() => rmSync(scratch, { recursive: true, force: true }))

const build = 'kompilator build --release --manifest-path Cargo.toml'

/**
 * A workspace holding a copy of lib/ in a logic-pro-agent checkout, with a
 * stand-in golem at `builtAt` (path parts inside a golem checkout beside it)
 * when one is named. Answers the copied lib/ and the golem checkout.
 */
function workspace(builtAt) {
  const top = join(scratch, randomUUID())
  const lib = join(top, 'logic-pro-agent', 'lib')
  cpSync(join(root, 'lib'), lib, { recursive: true })
  if (builtAt) {
    const binary = join(top, 'golem', ...builtAt)
    mkdirSync(dirname(binary), { recursive: true })
    writeFileSync(binary, '#!/bin/sh\necho golem-stand-in\n')
    chmodSync(binary, 0o755)
  }
  return { lib, golemCheckout: join(top, 'golem') }
}

/**
 * Runs `script` (an ES module reading the copied lib/ at LIB) in a process of
 * its own, since GOLEM is read when golem.mjs loads: GOLEM_BIN unset and a
 * PATH holding no golem.
 */
function run(lib, script) {
  const env = { ...process.env, PATH: join(scratch, 'no-golem-here'), LIB: lib }
  delete env.GOLEM_BIN
  const ran = spawnSync(process.execPath, ['--input-type=module', '-e', script], { env, encoding: 'utf8' })
  assert.equal(ran.status, 0, ran.stderr)
  return JSON.parse(ran.stdout)
}

/** GOLEM, and what `golem version` answers or the message it fails with. */
const version = `const m = await import(process.env.LIB + '/golem.mjs')
let answer, failure
try { answer = await m.golem('version', [], { app: false }) } catch (error) { failure = error.message }
process.stdout.write(JSON.stringify({ golem: m.GOLEM, answer, failure }))`

test('a kompilator release build of a golem checkout beside this one is the golem used', () => {
  const { lib, golemCheckout } = workspace(['.build', 'kompilator', 'release', 'golem'])
  const seen = run(lib, version)
  assert.equal(seen.golem, join(golemCheckout, '.build', 'kompilator', 'release', 'golem'))
  assert.equal(seen.answer, 'golem-stand-in')
})

test('a Cargo target/release build beside this one is not taken for golem', () => {
  const { lib } = workspace(['target', 'release', 'golem'])
  assert.equal(run(lib, version).golem, 'golem')
})

test('a golem found nowhere is refused naming the kompilator build that writes it', () => {
  const { lib } = workspace()
  const seen = run(lib, version)
  assert.equal(seen.failure,
    `golem is not at golem: run \`${build}\` in a golem checkout beside this one, or set GOLEM_BIN to the binary`)
})

test('the doctor\'s golem check names the kompilator build when golem is missing', () => {
  const { lib } = workspace()
  const seen = run(lib, `const lines = []
console.log = (line) => { lines.push(String(line)) }
let failure
try { await (await import(process.env.LIB + '/logic/doctor.mjs')).doctor() } catch (error) { failure = error.message }
process.stdout.write(JSON.stringify({ lines, failure }))`)
  assert.match(seen.failure, /^Logic cannot be driven yet: golem/)
  const golemLine = seen.lines.find((line) => line.startsWith('missing\tgolem\t'))
  assert.ok(golemLine, seen.lines.join('\n'))
  assert.ok(golemLine.endsWith(`\n\tfix: build it: ${build} in a golem checkout beside this one (golem)`), golemLine)
})
