// A delayed send_message that Floe owns, not the turn that asked for it.
//
// An agent that would otherwise `sleep 3m` and poll registers a followup, and
// Floe's own timer sends the message so the asking turn can end. They are kept
// on disk: the longest of them, a usage-limit resume waiting out a weekly
// window (usageResume.ts), would otherwise die with the first restart.
//
// Delivery is injected (setFollowupDelivery) because sending is mcpServer's
// business: it resolves the session, reads the handle, and picks the harness.
// Importing that here would be a cycle.

import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { dataDir } from './dataDir'

export interface Followup {
  id: string
  /** The MCP token that registered it. `floe` for one Floe set itself. */
  fromToken: string
  sessionId: string
  message: string
  /** Epoch ms. */
  fireAt: number
  /** The resume a usage limit schedules. One per session, replaced rather than stacked. */
  kind?: 'usage-resume'
}

type Deliver = (f: Followup) => void

let deliver: Deliver = () => {}

export function setFollowupDelivery(fn: Deliver): void {
  deliver = fn
}

// setTimeout's ceiling (~24.8 days). A later fireAt waits in hops.
const MAX_DELAY_MS = 2_147_483_647
// A followup that fell due while Floe was closed fires this long after boot,
// not during it: delivery needs a window, and the first one is not up yet.
const OVERDUE_DELAY_MS = 30_000

const pending = new Map<string, { entry: Followup; timer: NodeJS.Timeout }>()

const storeFile = (): string => join(dataDir(), 'followups.json')

function save(): void {
  const file = storeFile()
  const tmp = `${file}.tmp`
  writeFileSync(tmp, JSON.stringify([...pending.values()].map((p) => p.entry), null, 2))
  renameSync(tmp, file)
}

function fire(entry: Followup): void {
  if (entry.fireAt > Date.now()) return arm(entry, entry.fireAt)
  pending.delete(entry.id)
  save()
  deliver(entry)
}

/** Start the timer. `at` is when it fires, which is entry.fireAt except on restore. */
function arm(entry: Followup, at: number): void {
  const delay = Math.min(Math.max(0, at - Date.now()), MAX_DELAY_MS)
  const timer = setTimeout(() => fire(entry), delay)
  // Never what keeps a process alive. Matters in tests; harmless in Electron.
  timer.unref()
  pending.set(entry.id, { entry, timer })
}

export function addFollowup(f: Omit<Followup, 'id'>): Followup {
  const entry: Followup = { ...f, id: randomUUID() }
  arm(entry, entry.fireAt)
  save()
  return entry
}

export function listFollowups(): Followup[] {
  return [...pending.values()].map((p) => p.entry)
}

export function cancelFollowup(id: string): boolean {
  const p = pending.get(id)
  if (!p) return false
  clearTimeout(p.timer)
  pending.delete(id)
  save()
  return true
}

/** Quit: stop the clocks, keep the file. restoreFollowups picks them up next launch. */
export function stopFollowupTimers(): void {
  for (const p of pending.values()) clearTimeout(p.timer)
  pending.clear()
}

const isFollowup = (v: unknown): v is Followup => {
  const o = v as Partial<Followup> | null
  return (
    !!o &&
    typeof o.id === 'string' &&
    typeof o.sessionId === 'string' &&
    typeof o.message === 'string' &&
    typeof o.fireAt === 'number'
  )
}

function readStore(): Followup[] {
  const file = storeFile()
  if (!existsSync(file)) return []
  try {
    const data: unknown = JSON.parse(readFileSync(file, 'utf8'))
    return Array.isArray(data) ? data.filter(isFollowup) : []
  } catch {
    return []
  }
}

/**
 * Re-arm what was pending when Floe last closed. Safe to call again: an entry
 * already armed is left alone. Answers how many it re-armed.
 */
export function restoreFollowups(now = Date.now()): number {
  let armed = 0
  for (const entry of readStore()) {
    if (pending.has(entry.id)) continue
    arm(entry, Math.max(entry.fireAt, now + OVERDUE_DELAY_MS))
    armed++
  }
  return armed
}
