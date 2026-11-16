// wrappers-check and selectors-check tell, before a beat is made, which of
// this checkout's assumptions about Logic's menus and elements no longer hold:
// each failing one named with what Logic has instead, and the check failing
// with exit status 1. A stand-in golem (GOLEM_BIN) answers `menus` and `find`
// as golem does for a Logic that moved one menu item and renamed elements.
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

const menusFile = join(scratch, 'menus.json')
const missing = {
  message: 'nothing in Logic Pro matches checkbox[title="Play"] (412 elements read)',
  observed: ['no element has role checkbox', 'roles there: button 31, slider 4'],
  fix: '`golem tree --app A` shows every element',
  cause: 'selector.no-match',
  kind: 'not-found',
  exit: 3,
}

// The stand-in answers `menus` from menus.json, `apps` with Logic running in
// the background, `get` with the project's file, and `find` by its selector,
// its last argument: Play matches nothing, Cycle two elements, Tempo one
// reading 96, the rest one.
const fake = join(scratch, 'golem')
writeFileSync(fake, `#!/bin/sh
for selector; do :; done
case "$1" in
  menus) cat '${menusFile}' ;;
  apps) printf '%s\\n' '[{"pid":4242,"name":"Logic Pro","bundleId":"com.apple.logic10","active":false,"hidden":false}]' ;;
  get) printf '%s\\n' 'file:///Users/me/beat.logicx' ;;
  find)
    case "$selector" in
      *'"Play"'*) printf '%s\\n' '${JSON.stringify({ error: missing })}' >&2; exit 3 ;;
      *'"Cycle"'*) printf '%s\\n' '[{"role":"AXCheckBox"},{"role":"AXCheckBox"}]' ;;
      *'"Tempo"'*) printf '%s\\n' '[{"role":"AXSlider","value":"96"}]' ;;
      *) printf '%s\\n' '[{"role":"AXGroup"}]' ;;
    esac ;;
esac
`)
chmodSync(fake, 0o755)
process.env.GOLEM_BIN = fake
// GOLEM is read when the modules load, so the stand-in is named first.
const { WRAPPERS, checkWrappers } = await import('../../lib/logic/wrappers.mjs')
const { CONTROL_MENUS } = await import('../../lib/logic/control.mjs')
const { checkSelectors, status } = await import('../../lib/logic/doctor.mjs')

/** Runs `check` with console.log's lines collected instead of shown. */
async function printed(check) {
  const lines = []
  const log = console.log
  console.log = (line) => { lines.push(String(line)) }
  try {
    return { result: await check().catch((error) => error), lines }
  } finally {
    console.log = log
  }
}

test('wrappers-check names a moved wrapper or command item with where it went, and counts loose matches', async () => {
  const moved = new Set(['View > Movie Window', 'Mix > Mastering Assistant…'])
  const paths = [...Object.values(WRAPPERS).map((press) => press.menuPath), ...CONTROL_MENUS.map(({ path }) => path)]
    .filter((path) => !moved.has(path.join(' > ')))
    .map((path) => path.join(' > ') === 'Track > Rename Track' ? ['Track', 'rename track'] : path)
  const now = [...paths, ['Window', 'Movie Window'], ['Window', 'Mastering Assistant']]
  writeFileSync(menusFile, JSON.stringify(now.map((path) => ({ path }))))

  const { result, lines } = await printed(checkWrappers)

  const total = Object.keys(WRAPPERS).length + CONTROL_MENUS.length
  assert.deepEqual(lines, [
    'missing\tshow-movie-window\tView > Movie Window; Logic has Window > Movie Window',
    'missing\tmaster\tMix > Mastering Assistant…; Logic has Window > Mastering Assistant',
    `${total - 2} of ${total} menu paths name an item in Logic's menus (1 only up to case or ellipsis, which golem still presses)`,
  ])
  assert.equal(result.status, 1)
  assert.equal(result.message, '2 menu paths name no item of this Logic: show-movie-window (lib/logic/wrappers.mjs), master (lib/logic/control.mjs); fix them where named')
})

test('selectors-check shows what golem saw for a missing selector and refuses one that matches several', async () => {
  const { result, lines } = await printed(checkSelectors)

  assert.ok(lines.includes('missing\tPlay\tcheckbox[title="Play"]\n\tobserved: no element has role checkbox\n\tobserved: roles there: button 31, slider 4'))
  assert.ok(lines.some((line) => line.startsWith('several\tCycle\tcheckbox[title="Cycle"] matches 2 elements')))
  assert.ok(lines.includes('ok     \tTempo slider\tslider[label="Tempo"] (1 element)'))
  assert.equal(result.status, 1)
  assert.match(result.message, /^2 of control\.mjs's selectors do not fit this Logic: Play, Cycle\./)
})

test('status shows whether Logic runs, the project file, and each element with its count and value', async () => {
  const { result, lines } = await printed(status)

  assert.equal(result, undefined)
  assert.deepEqual(lines, [
    'Logic\trunning, pid 4242, in the background',
    'project\tfile:///Users/me/beat.logicx',
    'track headers\t1 showing',
    'Play\tnot showing',
    'Cycle\t2 showing',
    'Metronome Click\t1 showing',
    'Tempo slider\t1 showing, value 96',
    'Library search field (Library open)\t1 showing',
    'Library header naming the loaded patch (Library open)\t1 showing',
  ])
})
