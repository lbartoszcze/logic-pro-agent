// wrappers-check tells, for a wrapper's menu path, whether Logic's menus hold
// it as written, hold it only up to case or ellipsis (which golem still
// presses), or not at all, and then which items it may have become: the same
// title under another menu, else items whose title holds all its words.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { lookUp } from '../../lib/logic/wrappers.mjs'

const menus = [
  ['Track', 'New Audio Track'],
  ['Track', 'Global Tracks', 'Tempo Track'],
  ['Mix', 'Automation Settings…'],
  ['File', 'Bounce', 'Project or Section…'],
  ['Navigate', 'Other', 'Go to Position…'],
  ['Edit', 'Select All'],
  ['Functions', 'Select All'],
]

test('a path Logic holds as written is found, with ... and … the same', () => {
  assert.deepEqual(lookUp(['Track', 'New Audio Track'], menus), { found: 'exact' })
  assert.deepEqual(lookUp(['Mix', 'Automation Settings...'], menus), { found: 'exact' })
})

test('a path Logic holds only up to case or ellipsis is found loosely', () => {
  assert.deepEqual(lookUp(['Track', 'Global Tracks', 'tempo track'], menus), { found: 'loose' })
  assert.deepEqual(lookUp(['File', 'Bounce', 'Project or Section'], menus), { found: 'loose' })
})

test('a moved item is missing, with the item of the same title elsewhere as its candidate', () => {
  assert.deepEqual(lookUp(['Navigate', 'Go to Position…'], menus), {
    found: 'missing',
    candidates: ['Navigate > Other > Go to Position…'],
  })
})

test('a renamed item is missing, with the items holding all its words', () => {
  assert.deepEqual(lookUp(['Track', 'Tempo'], menus), {
    found: 'missing',
    candidates: ['Track > Global Tracks > Tempo Track'],
  })
  assert.deepEqual(lookUp(['Window', 'Show Movie'], menus), { found: 'missing', candidates: [] })
})
