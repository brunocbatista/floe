import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { installHook } from './config/hook.test-helper.ts'

installHook()

const { setSharedDataDir } = await import('./dataDir.ts')
const { addFollowup, cancelFollowup, listFollowups, restoreFollowups, setFollowupDelivery, stopFollowupTimers } =
  await import('./followups.ts')

const dir = mkdtempSync(join(tmpdir(), 'floe-followups-'))
setSharedDataDir(dir)
const file = join(dir, 'followups.json')
const onDisk = (): Array<{ id: string }> => JSON.parse(readFileSync(file, 'utf8'))
const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

test('a followup is written to disk and fires at its time', async () => {
  const fired: string[] = []
  setFollowupDelivery((f) => fired.push(f.message))
  const f = addFollowup({ fromToken: 't', sessionId: 's1', message: 'hello', fireAt: Date.now() + 20 })
  assert.deepEqual(onDisk().map((e) => e.id), [f.id])
  await wait(60)
  assert.deepEqual(fired, ['hello'])
  assert.deepEqual(onDisk(), [], 'a fired followup leaves the file')
  assert.deepEqual(listFollowups(), [])
})

test('cancel stops it and removes it from disk', async () => {
  const fired: string[] = []
  setFollowupDelivery((f) => fired.push(f.message))
  const f = addFollowup({ fromToken: 't', sessionId: 's1', message: 'nope', fireAt: Date.now() + 20 })
  assert.equal(cancelFollowup(f.id), true)
  assert.equal(cancelFollowup(f.id), false)
  await wait(60)
  assert.deepEqual(fired, [])
  assert.deepEqual(onDisk(), [])
})

test('a restart re-arms what was pending, and holds overdue ones until the window is up', () => {
  const later = Date.now() + 3_600_000
  const f = addFollowup({ fromToken: 't', sessionId: 's2', message: 'later', fireAt: later, kind: 'usage-resume' })
  stopFollowupTimers()
  assert.deepEqual(listFollowups(), [])
  assert.deepEqual(onDisk().map((e) => e.id), [f.id], 'quitting keeps the file')

  // One overdue entry written by a Floe that was closed when it fell due, and one bad row.
  const raw = JSON.parse(readFileSync(file, 'utf8'))
  raw.push({ id: 'old', fromToken: 't', sessionId: 's3', message: 'overdue', fireAt: Date.now() - 1000 }, { id: 3 })
  writeFileSync(file, JSON.stringify(raw))

  assert.equal(restoreFollowups(), 2)
  assert.equal(restoreFollowups(), 0, 'restoring twice arms nothing twice')
  const ids = listFollowups().map((e) => e.id).sort()
  assert.deepEqual(ids, ['old', f.id].sort())
  assert.equal(listFollowups().find((e) => e.id === f.id)?.kind, 'usage-resume')
  stopFollowupTimers()
})

test('a missing or broken file restores nothing', () => {
  writeFileSync(file, '{not json')
  assert.equal(restoreFollowups(), 0)
})
