import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { installHook } from './config/hook.test-helper.ts'

process.env.XDG_CONFIG_HOME = mkdtempSync(join(tmpdir(), 'floe-resume-cfg-'))
installHook()

const { setSharedDataDir } = await import('./dataDir.ts')
const { listFollowups, stopFollowupTimers } = await import('./followups.ts')
const { invalidateFloeConfig } = await import('./config/floe.ts')
const {
  MAX_ATTEMPTS,
  RESUME_MESSAGE,
  cancelUsageResume,
  claudeLimitText,
  claudeRejectedReset,
  codexFullReset,
  isQuotaError,
  resetMs,
  scheduleUsageResume
} = await import('./usageResume.ts')

setSharedDataDir(mkdtempSync(join(tmpdir(), 'floe-resume-data-')))

const resumesFor = (key: string) => listFollowups().filter((f) => f.kind === 'usage-resume' && f.sessionId === key)

test('resetMs reads unix seconds and epoch ms alike', () => {
  assert.equal(resetMs(1_760_000_000), 1_760_000_000_000)
  assert.equal(resetMs(1_760_000_000_000), 1_760_000_000_000)
  assert.equal(resetMs(0), undefined)
  assert.equal(resetMs('soon'), undefined)
})

test("claude's rate_limit_event only counts when the window refused", () => {
  const event = (status: string) => ({ type: 'rate_limit_event', rate_limit_info: { status, resetsAt: 1_760_000_000 } })
  assert.equal(claudeRejectedReset(event('rejected')), 1_760_000_000_000)
  assert.equal(claudeRejectedReset(event('allowed_warning')), undefined)
  assert.equal(claudeRejectedReset({ type: 'rate_limit_event' }), undefined)
})

test("claude's limit text gives the reset, and other errors are not limits", () => {
  const now = Date.UTC(2026, 9, 26, 12, 0)
  const read = claudeLimitText("You've hit your limit · resets 3pm (America/Sao_Paulo)", now)
  assert.equal(read.hit, true)
  assert.equal(read.resetAt, Date.UTC(2026, 9, 26, 18, 0))
  assert.deepEqual(claudeLimitText('Claude AI usage limit reached'), { hit: true, resetAt: undefined })
  assert.equal(claudeLimitText('Usage credits are required for this model.').hit, false)
})

test('codex resumes at the full window, the later one if both are', () => {
  assert.equal(
    codexFullReset({ primary: { usedPercent: 100, resetsAt: 100 }, secondary: { usedPercent: 40, resetsAt: 900 } }),
    100_000
  )
  assert.equal(
    codexFullReset({ primary: { usedPercent: 100, resetsAt: 100 }, secondary: { usedPercent: 100, resetsAt: 900 } }),
    900_000
  )
  assert.equal(codexFullReset({ primary: { usedPercent: 99, resetsAt: 100 } }), undefined)
  assert.equal(codexFullReset(undefined), undefined)
})

test('quota errors from the other harnesses are recognised', () => {
  assert.ok(isQuotaError('RESOURCE_EXHAUSTED: Quota exceeded for model'))
  assert.ok(isQuotaError('429 Too Many Requests'))
  assert.ok(!isQuotaError('opencode: provider not found'))
})

test('a known reset schedules one resume a minute after it, replacing an older one', () => {
  const now = Date.now()
  const notice = scheduleUsageResume('known', now + 2 * 3_600_000, now)
  assert.match(notice ?? '', /resumes this session in 2h 1m/)
  scheduleUsageResume('known', now + 3_600_000, now + 3 * 3_600_000)
  const resumes = resumesFor('known')
  assert.equal(resumes.length, 1, 'replaced, not stacked')
  assert.equal(resumes[0].message, RESUME_MESSAGE)
  assert.equal(resumes[0].fromToken, 'floe')
  assert.equal(cancelUsageResume('known'), true)
  assert.equal(cancelUsageResume('known'), false)
})

test('no reset time means a retry in 30 minutes', () => {
  const now = Date.now()
  assert.match(scheduleUsageResume('unknown', undefined, now) ?? '', /tries again in 30m/)
  assert.equal(resumesFor('unknown')[0].fireAt, now + 30 * 60_000)
  cancelUsageResume('unknown')
})

test('a resume that keeps hitting the limit gives up after MAX_ATTEMPTS', () => {
  let now = Date.now()
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    assert.match(scheduleUsageResume('stuck', undefined, now) ?? '', /tries again/)
    now = resumesFor('stuck')[0].fireAt + 1000 // the resume fires and is refused at once
  }
  assert.match(scheduleUsageResume('stuck', undefined, now) ?? '', /stopped retrying/)
  assert.deepEqual(resumesFor('stuck'), [])
  // Much later, a new limit starts the count again.
  assert.match(scheduleUsageResume('stuck', undefined, now + 86_400_000) ?? '', /tries again/)
  cancelUsageResume('stuck')
})

test('queries and auto-resume = false schedule nothing', () => {
  assert.equal(scheduleUsageResume('sess~codex', undefined), undefined)
  const cfg = join(process.env.XDG_CONFIG_HOME as string, 'floe')
  mkdirSync(cfg, { recursive: true })
  writeFileSync(join(cfg, 'floe.toml'), '[agent]\nauto-resume = false\n')
  invalidateFloeConfig()
  assert.equal(scheduleUsageResume('off', undefined), undefined)
  assert.deepEqual(resumesFor('off'), [])
  stopFollowupTimers()
})
