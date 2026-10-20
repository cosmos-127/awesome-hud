import type { SessionMeasureInput, SessionUsage } from 'claude-code'

import type { Git, Meter, Mood, TestRun } from '../types'

// Thresholds from claude-hud: context warns at 70 and is critical at 85, quota at 75 and 90.
export const CONTEXT_WARN = 70
export const CONTEXT_CRIT = 85
export const QUOTA_WARN = 75
export const QUOTA_CRIT = 90
// shortcut: auto-compact is assumed to start at 92% of the window; `$.session.usage({ breakdown })` has the real
// `autoCompactThreshold`, if "~N turns left" needs to be exact.
export const COMPACT_AT = 92
export const BAR = 12
export const EFFORT_GLYPH: Record<string, string> = { low: '○', medium: '◔', high: '◑', xhigh: '◕', max: '●' }

export const toMeter = (u: SessionUsage | SessionMeasureInput, startedAt: number): Meter => ({
  startedAt,
  contextPercent: u.context.percent,
  limits: u.rateLimits.map(({ kind, percentUsed, resetsAt }) => ({ kind, percentUsed, resetsAt })),
  costUsd: u.cost?.usd,
})

const LIMIT_LABEL: Record<string, string> = { five_hour: '5h', seven_day: '7d', spend_limit: '$' }

/** A rate-limit window's gauge label, at most 3 cells; a kind not listed by its first letters. */
export const limitLabel = (kind: string) => LIMIT_LABEL[kind] ?? kind.slice(0, 3)

export const isHot = (m: Meter | null) =>
  !!m && ((m.contextPercent ?? 0) >= CONTEXT_CRIT || m.limits.some(l => l.percentUsed >= QUOTA_CRIT))

// Worry only shows while the mascot has nothing better to do.
export const shown = (m: Mood, hot: boolean): Mood => (hot && (m === 'idle' || m === 'done') ? 'sweat' : m)

/** Turns of context left before auto-compact, from how much the recent turns grew it; null with too little history. */
export const turnsLeft = (history: readonly number[], percent: number | undefined, compactAt: number): number | null => {
  if (percent === undefined) return null
  const growth = history.slice(-6).flatMap((p, i, all) => (i > 0 && p > all[i - 1]! ? [p - all[i - 1]!] : []))
  if (growth.length < 2) return null
  const avg = growth.reduce((a, b) => a + b, 0) / growth.length
  return Math.max(0, Math.floor((compactAt - percent) / avg))
}

/**
 * A bar of `width` cells, its used part and its free part apart so each takes its own color. It fills by half
 * cells, `╸` the odd half, and `┊` marks the free cell where `tick`, a percent, falls.
 */
export const thinBar = (pct: number | undefined, width = BAR, tick?: number): [string, string] => {
  const halves = Math.max(0, Math.min(2 * width, Math.round(((pct ?? 0) / 100) * 2 * width)))
  const used = '━'.repeat(Math.floor(halves / 2)) + (halves % 2 === 1 ? '╸' : '')
  const free = [...'─'.repeat(width - used.length)]
  const at = tick === undefined ? -1 : Math.floor((tick / 100) * width) - used.length
  if (at >= 0 && at < free.length) free[at] = '┊'
  return [used, free.join('')]
}

/** A gauge as label, used bar, free bar and percent, each at a fixed width so gauges stacked in rows line up. */
export const gauge = (label: string, pct: number, tick?: number): [string, string, string, string] => {
  const [used, free] = thinBar(pct, BAR, tick)
  return [`${label.padStart(3)} `, used, free, ` ${String(Math.round(pct)).padStart(3)}%`]
}

/** `items` with `sep(i)` between each pair. */
export const between = <T,>(items: readonly T[], sep: (i: number) => T): T[] => items.flatMap((item, i) => (i === 0 ? [item] : [sep(i), item]))

export const pick = <T,>(list: readonly T[], seed: number): T => list[Math.abs(seed) % list.length]!

export const fill = (template: string, target: string | undefined) => template.replace('{}', target ?? 'something')

// `claude-opus-5-5[1m]` reads `Opus 5.5`, `claude-3-5-sonnet-20241022` reads `Sonnet 3.5`.
export const prettyModel = (raw: string) => {
  const id = raw.replace(/\[[^\]]*\]$/, '')
  const current = /^claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?$/i.exec(id)
  const legacy = /^claude-(\d+)(?:-(\d{1,2}))?-([a-z]+)(?:-\d{8})?$/i.exec(id)
  const [family, major, minor] = current ? [current[1], current[2], current[3]] : legacy ? [legacy[3], legacy[1], legacy[2]] : []
  if (!family) return id
  return `${family.charAt(0).toUpperCase()}${family.slice(1).toLowerCase()} ${major}${minor ? `.${minor}` : ''}`
}

/** When a window resets, in the person's own time as /usage writes it: `3:20am` within a day, else `Oct 22, 4:30pm`. */
export const resetTime = (resetsAt: string, now: number, timeZone?: string) => {
  const at = new Date(resetsAt)
  const time = at.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone }).replace(/\s/g, '').toLowerCase()
  return at.getTime() - now < 24 * 3_600_000 ? time : `${at.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone })}, ${time}`
}

export const duration = (ms: number) => {
  const minutes = Math.max(0, Math.floor(ms / 60_000))
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours >= 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`
  return `${hours}h ${minutes % 60}m`
}

/**
 * The cost the status row draws, or '' for none: never $0.00, and under the `cost` option's `auto` not on a
 * Pro or Max plan, whose 5h and 7d windows mark the figure as an API-price estimate rather than a bill.
 */
export const costOf = (m: Meter | null, mode: string) => {
  const isOnPlan = !!m?.limits.some(l => l.kind === 'five_hour' || l.kind === 'seven_day')
  return m?.costUsd && (mode === 'show' || (mode !== 'hide' && !isOnPlan)) ? `$${m.costUsd.toFixed(2)}` : ''
}

// The color a gauge warns in, or undefined while it needs no attention.
export const contextAlert = (pct: number) => (pct >= CONTEXT_CRIT ? 'error' : pct >= CONTEXT_WARN ? 'warning' : undefined)
export const quotaAlert = (pct: number) => (pct >= QUOTA_CRIT ? 'error' : pct >= QUOTA_WARN ? 'warning' : undefined)

// Tool names and targets come from the model and MCP servers: strip control characters.
export const clean = (text: string) => text.replace(/[\u0000-\u001f\u007f-\u009f]/g, '')

export const targetOf = (input: Record<string, unknown>) => {
  const raw = input.file_path ?? input.path ?? input.pattern ?? input.command ?? input.url
  if (typeof raw !== 'string') return undefined
  const text = clean(raw)
  const short = /[/\\]/.test(text) && !input.command ? text.split(/[/\\]/).pop() || text : text
  return short.length > 20 ? `${short.slice(0, 19)}…` : short
}

export const shortTool = (name: string) => clean(/^mcp__.+__.+$/.test(name) ? name.split('__').pop() ?? name : name)

const TESTS = /\b(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?test\b|\b(?:pytest|vitest|jest|mocha)\b|\bgo\s+test\b|\bcargo\s+test\b|\bclaude\s+plugin\s+test\b/
const GIT = /\bgit\s+(commit|push)\b/

/** What a finished Bash command is worth a party for: a test run (if its summary passed), a commit, a push. */
export const partyOf = (command: string): 'tests' | 'commit' | 'push' | undefined => {
  const git = GIT.exec(command)?.[1]
  return git === 'commit' || git === 'push' ? git : TESTS.test(command) ? 'tests' : undefined
}

const matches = (text: string, re: RegExp) => [...text.matchAll(re)]
const sum = (found: RegExpMatchArray[], group: number) => found.reduce((n, m) => n + Number(m[group]), 0)

// The summary each runner closes with, as passed and failed counts.
const summaryOf = (out: string): Pick<TestRun, 'passed' | 'failed'> | undefined => {
  // jest `Tests:  2 failed, 10 passed, 12 total`, vitest `Tests  2 failed | 40 passed (42)`, pytest `== 2 failed, 40 passed in 1.2s ==`.
  const line = matches(out, /^\s*Tests:?\s.*\d+ (?:passed|failed).*$|^=*\s*\d+ \w+(?:, \d+ \w+)* in \d+(?:\.\d+)?s\b.*$/gm).at(-1)?.[0]
  if (line) return { passed: sum(matches(line, /\b(\d+) passed\b/g), 1), failed: sum(matches(line, /\b(\d+) (?:failed|errors?)\b/g), 1) }
  // cargo: `test result: FAILED. 38 passed; 2 failed; ...`, a line per test binary.
  const cargo = matches(out, /^test result: \w+\. (\d+) passed; (\d+) failed/gm)
  if (cargo.length > 0) return { passed: sum(cargo, 1), failed: sum(cargo, 2) }
  // go: `ok  <pkg>` or `FAIL <pkg>` a package, and `--- PASS: TestX` (with -v) or `--- FAIL: TestX` a test.
  if (/^(?:ok|FAIL)[ \t]+\S/m.test(out)) {
    const failed = Math.max(matches(out, /^--- FAIL:/gm).length, matches(out, /^FAIL[ \t]+\S/gm).length)
    return { passed: matches(out, /^--- PASS:/gm).length || matches(out, /^ok[ \t]+\S/gm).length, failed }
  }
  // bun and `claude plugin test`: ` 24 pass` over ` 0 fail`; mocha: `5 passing` over `2 failing`.
  const passed = /^\s*(\d+) pass(?:ing)?\b/m.exec(out)
  const failed = /^\s*(\d+) fail(?:ing)?\b/m.exec(out)
  return passed || failed ? { passed: Number(passed?.[1] ?? 0), failed: Number(failed?.[1] ?? 0) } : undefined
}

/** A test command's passed and failed counts, read from its runner's summary; undefined for another command, no summary, or nothing run. */
export const testsOf = (command: string, output: string) => {
  if (!TESTS.test(command)) return undefined
  // Without colors, which some runners force on.
  const counts = summaryOf(output.replace(/\x1b\[[\d;]*m/g, ''))
  return counts && counts.passed + counts.failed > 0 ? counts : undefined
}

/** `git status --porcelain=v1 --branch` as a branch, a dirty mark, and commits ahead of and behind the upstream. */
export const parseGit = (out: string): Git | null => {
  const [head = '', ...rest] = out.split('\n')
  if (!head.startsWith('## ')) return null
  const branch = head.slice(3).replace(/^No commits yet on /, '').split('...')[0]!.split(' ')[0]!
  // `## main...origin/main [ahead 1, behind 2]`; a ref name cannot hold `[`.
  const ahead = Number(/\[ahead (\d+)/.exec(head)?.[1] ?? 0)
  const behind = Number(/behind (\d+)\]/.exec(head)?.[1] ?? 0)
  return { branch: clean(branch), isDirty: rest.some(line => line.trim() !== ''), ahead, behind }
}

/** `✎5 ↑2 ↓1`: files edited, and commits ahead of and behind the upstream; a zero left out. */
export const changesOf = (edited: number, git: Git | null) =>
  ([['✎', edited], ['↑', git?.ahead ?? 0], ['↓', git?.behind ?? 0]] as const).flatMap(([mark, n]) => (n > 0 ? [`${mark}${n}`] : [])).join(' ')
