import { test } from 'node:test'
import assert from 'node:assert/strict'
import { push, put, shed, type Entry } from './history.ts'

test('push skips blanks and repeats, keeps order', () => {
  let list: Entry[] = []
  list = push(list, 'one')
  list = push(list, '   ')
  list = push(list, 'one')
  list = push(list, 'two')
  assert.deepEqual(list, [{ text: 'one' }, { text: 'two' }])
})

test('push caps at 100, newest kept', () => {
  let list: Entry[] = []
  for (let i = 0; i < 105; i++) list = push(list, `m${i}`)
  assert.equal(list.length, 100)
  assert.equal(list[0].text, 'm5')
  assert.equal(list[99].text, 'm104')
})

test('put keeps one list per worktree', () => {
  let all = put({}, '/wt/a', 'from a')
  all = put(all, '/wt/b', 'from b')
  all = put(all, '/wt/a', 'more a')
  assert.deepEqual(all['/wt/a'], [{ text: 'from a' }, { text: 'more a' }])
  assert.deepEqual(all['/wt/b'], [{ text: 'from b' }])
})

test('put ignores a blank message', () => {
  const all = { '/wt/a': [{ text: 'one' }] }
  assert.equal(put(all, '/wt/a', '  '), all)
  assert.deepEqual(put(all, '/wt/b', '  '), all)
})

test('put caps at 40 worktrees, least recently used dropped', () => {
  let all: Record<string, Entry[]> = {}
  for (let i = 0; i < 41; i++) all = put(all, `/wt/${i}`, 'hi')
  // Touching /wt/1 again makes it the newest, so the next write evicts /wt/2.
  all = put(all, '/wt/1', 'again')
  all = put(all, '/wt/new', 'hi')
  assert.equal(Object.keys(all).length, 40)
  assert.equal(all['/wt/0'], undefined)
  assert.equal(all['/wt/2'], undefined)
  assert.deepEqual(all['/wt/1'], [{ text: 'hi' }, { text: 'again' }])
})

test('push keeps the pastes a message was sent with', () => {
  let list: Entry[] = []
  list = push(list, '│ paste 01 · 900 lines · 41 KB\n│ Error: boom', ['Error: boom\n...'])
  assert.deepEqual(list[0].pastes, ['Error: boom\n...'])
  // Same rails, different paste: a different message, not a repeat.
  list = push(list, '│ paste 01 · 900 lines · 41 KB\n│ Error: boom', ['Error: other'])
  assert.equal(list.length, 2)
})

test('shed drops the oldest paste bodies first, then gives up', () => {
  const all = {
    '/wt/a': [{ text: 'a1', pastes: ['big a'] }, { text: 'a2', pastes: ['big a2'] }]
  }
  const once = shed(all)
  assert.deepEqual(once?.['/wt/a'], [{ text: 'a1' }, { text: 'a2', pastes: ['big a2'] }])
  const twice = shed(once!)
  assert.deepEqual(twice?.['/wt/a'], [{ text: 'a1' }, { text: 'a2' }])
  assert.equal(shed(twice!), null)
})
