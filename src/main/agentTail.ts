import { closeSync, openSync, readSync, statSync } from 'node:fs'
import { contextTokens } from '../shared/types'
import { agentTranscriptFile } from './claudeSessions'

// An async agent runs detached from the CLI's stdout: none of its steps reach
// the stream the parent chat reads, so its row would say "running" and nothing
// else for as long as it works. Its steps ARE written to its own transcript
// (<session>/subagents/agent-<id>.jsonl), so the row's live part — the tool it
// is on and how much context it has filled — is read from there.

export interface AgentTail {
  agentId: string
  file?: string
  // Bytes already read. A resumed agent's file holds its earlier run, which
  // the row must not replay, so it starts at the end of what is there.
  offset: number
  buffer: string
  fromStart: boolean
  // The latest fill seen, carried so a scan that only saw a tool keeps it.
  tokens: number
}

export function newAgentTail(worktreePath: string, agentId: string, fromStart: boolean): AgentTail {
  const tail: AgentTail = { agentId, offset: 0, buffer: '', fromStart, tokens: 0 }
  locate(tail, worktreePath)
  return tail
}

// The file appears only once the agent writes its first line, so a fresh
// launch keeps looking until it is there.
function locate(tail: AgentTail, worktreePath: string): void {
  if (tail.file) return
  tail.file = agentTranscriptFile(worktreePath, tail.agentId)
  if (!tail.file || tail.fromStart) return
  try {
    tail.offset = statSync(tail.file).size
  } catch {
    tail.offset = 0
  }
}

function readNew(tail: AgentTail): string {
  if (!tail.file) return ''
  try {
    const size = statSync(tail.file).size
    if (size < tail.offset) tail.offset = 0
    if (size === tail.offset) return ''
    const buf = Buffer.alloc(size - tail.offset)
    const fd = openSync(tail.file, 'r')
    try {
      readSync(fd, buf, 0, buf.length, tail.offset)
    } finally {
      closeSync(fd)
    }
    tail.offset = size
    return buf.toString('utf8')
  } catch {
    return ''
  }
}

/**
 * What the agent did since the last scan: its latest context fill and the last
 * tool it called. `undefined` when it wrote nothing new worth a row update.
 */
export function scanAgentTail(tail: AgentTail, worktreePath: string): { tokens: number; tool?: string } | undefined {
  locate(tail, worktreePath)
  const text = tail.buffer + readNew(tail)
  const cut = text.lastIndexOf('\n')
  tail.buffer = text.slice(cut + 1)
  let seen = false
  let tool: string | undefined
  for (const line of text.slice(0, cut + 1).split('\n')) {
    const step = assistantStep(line)
    if (!step) continue
    seen = true
    if (step.tokens > 0) tail.tokens = step.tokens
    if (step.tool) tool = step.tool
  }
  return seen ? { tokens: tail.tokens, tool } : undefined
}

function assistantStep(line: string): { tokens: number; tool?: string } | undefined {
  if (!line.includes('"assistant"')) return undefined
  let m: Record<string, unknown>
  try {
    m = JSON.parse(line) as Record<string, unknown>
  } catch {
    return undefined
  }
  if (m.type !== 'assistant' || !m.message || typeof m.message !== 'object') return undefined
  const message = m.message as { usage?: unknown; content?: unknown }
  let tool: string | undefined
  if (Array.isArray(message.content)) {
    for (const block of message.content as Array<Record<string, unknown>>) {
      if (block.type === 'tool_use' && typeof block.name === 'string') tool = block.name
    }
  }
  return { tokens: contextTokens(message.usage), tool }
}
