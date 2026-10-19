import test from 'node:test'
import assert from 'node:assert/strict'
import { slugifyBranch } from './slug.ts'

test('slugifyBranch keeps casing by default', () => {
  assert.equal(slugifyBranch('FLOE-123'), 'FLOE-123')
  assert.equal(slugifyBranch('feat/FLOE 123 Café'), 'feat/FLOE-123-Cafe')
})

test('slugifyBranch lowercases on request', () => {
  assert.equal(slugifyBranch('My Feature / Sub', { preserveCase: false }), 'my-feature/sub')
})
