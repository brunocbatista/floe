import test from 'node:test'
import assert from 'node:assert/strict'
import { collapseTaskRefs, expandTaskRefs, hasTaskRef, type TaskRef } from './taskRefs.ts'

const tasks: Record<string, TaskRef> = {
  '001': { number: '001', title: 'the "new" sidebar', status: 'idea', path: '/tmp/floe/.floe/tasks/001-sidebar' }
}
const resolve = (ref: string): TaskRef | null => tasks[ref.padStart(3, '0')] ?? null

test('a known number expands to the task folder', () => {
  const out = expandTaskRefs('look at #001 please', resolve)
  assert.ok(out.startsWith('look at <floe-task '))
  assert.ok(out.includes('/tmp/floe/.floe/tasks/001-sidebar'))
  assert.ok(out.includes('task_read'))
  assert.ok(out.endsWith(' please'))
})

test('collapsing puts the message back the way it was typed', () => {
  for (const typed of ['#001', 'see #001 and #1 now']) {
    const sent = expandTaskRefs(typed, resolve)
    assert.ok(hasTaskRef(sent))
    assert.equal(collapseTaskRefs(sent), typed)
  }
})

test('anything but a whole number token is left alone', () => {
  for (const text of ['#002', '#001,', 'issue#001', '#001a', '## 001', '#src/001.ts']) {
    assert.equal(expandTaskRefs(text, resolve), text)
  }
  assert.equal(hasTaskRef('nothing here'), false)
})
