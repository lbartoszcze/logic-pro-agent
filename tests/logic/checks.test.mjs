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

// The stand-in answers `menus` from menus.json and `find` by its selector,
// its last argument: Play matches nothing, Cycle two elements, the rest one.
const fake = join(scratch, 'golem')
writeFileSync(fake, `#!/bin/sh
for selector; do :; done
case "$1" in
  menus) cat '${menusFile}' ;;
  find)
    case "$selector" in
      *'"Play"'*) printf '%s\\n' '${JSON.stringify({ error: missing })}' >&2; exit 3 ;;
      *'"Cycle"'*) printf '%s\\n' '[{"role":"AXCheckBox"},{"role":"AXCheckBox"}]' ;;
      *) printf '%s\\n' '[{"role":"AXGroup"}]' ;;
    esac ;;
esac
`)
chmodSync(fake, 0o755)
process.env.GOLEM_BIN = fake
// GOLEM is read when the modules load, so the stand-in is named first.
const { WRAPPERS, checkWrappers } = await import('../../lib/logic/wrappers.mjs')
const { checkSelectors } = await import('../../lib/logic/doctor.mjs')

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

test('wrappers-check names a moved item with where it went, and counts loose matches', async () => {
  const paths = Object.values(WRAPPERS).map((press) => press.menuPath)
    .filter((path) => path.join(' > ') !== 'View > Movie Window')
    .map((path) => path.join(' > ') === 'Track > Rename Track' ? ['Track', 'rename track'] : path)
  writeFileSync(menusFile, JSON.stringify([...paths, ['Window', 'Movie Window']].map((path) => ({ path }))))

  const { result, lines } = await printed(checkWrappers)

  const total = Object.keys(WRAPPERS).length
  assert.deepEqual(lines, [
    'missing\tshow-movie-window\tView > Movie Window; Logic has Window > Movie Window',
    `${total - 1} of ${total} wrappers name an item in Logic's menus (1 only up to case or ellipsis, which golem still presses)`,
  ])
  assert.equal(result.status, 1)
  assert.match(result.message, /^1 wrappers name no item of this Logic: show-movie-window; fix their paths in lib\/logic\/wrappers\.mjs$/)
})

test('selectors-check shows what golem saw for a missing selector and refuses one that matches several', async () => {
  const { result, lines } = await printed(checkSelectors)

  assert.ok(lines.includes('missing\tPlay\tcheckbox[title="Play"]\n\tobserved: no element has role checkbox\n\tobserved: roles there: button 31, slider 4'))
  assert.ok(lines.some((line) => line.startsWith('several\tCycle\tcheckbox[title="Cycle"] matches 2 elements')))
  assert.ok(lines.includes('ok     \tTempo slider\tslider[label="Tempo"] (1 element)'))
  assert.equal(result.status, 1)
  assert.match(result.message, /^2 of control\.mjs's selectors do not fit this Logic: Play, Cycle\./)
})
