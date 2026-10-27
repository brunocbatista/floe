// Picking a session back up when the usage limit that stopped it resets.
//
// A turn refused for a usage limit used to leave the session sitting there
// until somebody noticed and typed "continue". Now the refusal schedules a
// followup at the moment the window reopens, and the followup says so.
//
// Each harness says when differently, so each gets its own reader and one
// scheduler:
//   - claude: a `rate_limit_event` with `status: "rejected"` carries resetsAt
//     (unix seconds). The result text ("resets 3pm (Zone)") is the fallback.
//   - codex: turn/completed with codexErrorInfo `usageLimitExceeded`. The
//     reset comes from account/rateLimits/read, the window that is full.
//   - opencode, gemini: an error that reads like a quota, and no reset time.
//     Those retry every RETRY_MS instead.

import type { CodexUsage } from '../shared/types'
import { parseResetHint, resetsIn } from '../shared/resets'
import { isQueryKey } from '../shared/queries'
import { floeConfig } from './config/floe'
import { addFollowup, cancelFollowup, listFollowups } from './followups'

export const RESUME_MESSAGE = 'The usage limit has reset. Continue where you left off.'

// The window is not always open the second it says it is.
const GRACE_MS = 60_000
// How often a harness that never says when gets another try.
const RETRY_MS = 30 * 60_000
// A resume that hits the limit again counts as a retry. This many, then stop.
export const MAX_ATTEMPTS = 6
// A refusal this soon after a resume fired is that resume failing.
const RESUME_FAILED_WITHIN_MS = 15 * 60_000

/** Per session: when its last resume was due, and how many in a row. */
const attempts = new Map<string, { at: number; n: number }>()

/** A reset time in unix seconds or epoch ms, as epoch ms. */
export function resetMs(v: unknown): number | undefined {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return undefined
  return v < 1e12 ? v * 1000 : v
}

/** Claude's `rate_limit_event`: when the window that just refused reopens. */
export function claudeRejectedReset(msg: Record<string, unknown>): number | undefined {
  const info = msg.rate_limit_info as Record<string, unknown> | undefined
  if (info?.status !== 'rejected') return undefined
  return resetMs(info.resetsAt)
}

const CLAUDE_LIMIT = /hit your (?:\w+ )?limit|usage limit (?:reached|exceeded)|limit reached/i

/**
 * Claude's error result, read for a usage limit: "You've hit your limit ·
 * resets 3pm (America/Sao_Paulo)". `hit` false means it was some other error.
 */
export function claudeLimitText(text: string, now = Date.now()): { hit: boolean; resetAt?: number } {
  if (!CLAUDE_LIMIT.test(text)) return { hit: false }
  const hint = text.match(/resets\s+([^)]*\))/i)?.[1]
  return { hit: true, resetAt: resetMs(parseResetHint(hint, now)) }
}

/** opencode or gemini failing on a quota. Neither says when it lifts. */
export const isQuotaError = (text: string): boolean =>
  /usage limit|rate.?limit|quota|resource_exhausted|too many requests|\b429\b/i.test(text)

/** The reset of codex's full window, the latest one if both are full. */
export function codexFullReset(usage: CodexUsage | undefined): number | undefined {
  const resets = [usage?.primary, usage?.secondary]
    .filter((w) => w && w.usedPercent >= 100)
    .map((w) => resetMs(w?.resetsAt))
    .filter((ms): ms is number => ms !== undefined)
  return resets.length ? Math.max(...resets) : undefined
}

/** The pending resume for this session, if there is one. */
const pendingResume = (sessionKey: string) =>
  listFollowups().find((f) => f.kind === 'usage-resume' && f.sessionId === sessionKey)

/** Call off this session's resume. Answers whether there was one. */
export function cancelUsageResume(sessionKey: string): boolean {
  const f = pendingResume(sessionKey)
  return f ? cancelFollowup(f.id) : false
}

/**
 * Schedule this session's resume after a usage limit, and answer the line to
 * show in its chat. `resetAt` (epoch ms) when the harness said when; without
 * it, a retry in RETRY_MS. Undefined when there is nothing to say: switched
 * off, or a query (its panel is not a session a followup can reach).
 */
export function scheduleUsageResume(sessionKey: string, resetAt?: number, now = Date.now()): string | undefined {
  if (!floeConfig().agent.autoResume || isQueryKey(sessionKey)) return undefined
  const prev = attempts.get(sessionKey)
  const n = prev && now - prev.at < RESUME_FAILED_WITHIN_MS ? prev.n + 1 : 1
  cancelUsageResume(sessionKey)
  if (n > MAX_ATTEMPTS) {
    attempts.delete(sessionKey)
    return `Usage limit still in force after ${MAX_ATTEMPTS} resumes. Floe stopped retrying. Send a message once it resets.`
  }
  const known = resetAt !== undefined && resetAt > now
  const fireAt = known ? resetAt + GRACE_MS : now + RETRY_MS
  attempts.set(sessionKey, { at: fireAt, n })
  addFollowup({ fromToken: 'floe', sessionId: sessionKey, message: RESUME_MESSAGE, fireAt, kind: 'usage-resume' })
  const when = resetsIn(fireAt / 1000, now)
  return known
    ? `Usage limit reached. Floe resumes this session in ${when}, when it resets. Send a message to cancel.`
    : `Usage limit reached. Floe tries again in ${when}. Send a message to cancel.`
}
