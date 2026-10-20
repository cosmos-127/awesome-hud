import type { BuiltinToolResults, SessionMeasureInput, SessionUsage } from 'claude-code'

import type { FileEdit, FilesReport, Git, GitOp, Limit, Meter, Mood, PathState, Pr, TestRun } from '../types'

// Thresholds from claude-hud: context warns at 70 and is critical at 85, quota at 75 and 90.
export const CONTEXT_WARN = 70
export const CONTEXT_CRIT = 85
export const QUOTA_WARN = 75
export const QUOTA_CRIT = 90
// Where auto-compact is taken to start, as a percent of the window, until the context breakdown says where it does.
export const COMPACT_AT = 92
export const BAR = 12
export const EFFORT_GLYPH: Record<string, string> = { low: '○', medium: '◔', high: '◑', xhigh: '◕', max: '●' }
// A branch's name past this many cells loses its middle: its prefix and its end say the most.
export const BRANCH_CELLS = 24
// A fetch older than a day may have missed what the upstream gained since.
export const FETCH_STALE_MS = 24 * 3_600_000

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

/** A run of text in one style: `color` and `bg` a theme key or hex; `href` makes it a link. */
export type Run = { text: string; color?: string; bg?: string; dim?: boolean; bold?: boolean; href?: string }

/**
 * A part of a row the band fits to its width: its runs, what is drawn between it and the part before it, and how
 * long it stays as the room runs out, higher staying longer and `Infinity` always.
 */
export type Segment = { key: string; runs: Run[]; sep?: string; keep: number }

/** A gauge as runs: the label and the free bar dim, the used bar in the alert's color or the accent, the percent in the alert's. */
export const gaugeRuns = (label: string, pct: number, alert: string | undefined, accent: string, tick?: number): Run[] => {
  const [head, used, free, tail] = gauge(label, pct, tick)
  return [
    { text: head, dim: true },
    { text: used, color: alert ?? accent },
    { text: free, dim: true },
    { text: tail, color: alert, bold: alert !== undefined },
  ]
}

const untilReset = (l: Limit, now: number) => (l.resetsAt ? Date.parse(l.resetsAt) - now : 0)

/**
 * The plan windows on one row: the first's gauge, the time to its reset and when; each other as its label and percent
 * until it warns, then as a gauge of its own with the time to its reset, the first's clock time making room for it.
 */
export const planSegments = (limits: readonly Limit[], now: number, accent: string, timeZone?: string): Segment[] => {
  const [first, ...rest] = limits
  if (!first) return []
  const isCrowded = rest.some(l => quotaAlert(l.percentUsed) !== undefined)
  const left = untilReset(first, now)
  const segments: Segment[] = [
    { key: first.kind, keep: Infinity, runs: gaugeRuns(limitLabel(first.kind), first.percentUsed, quotaAlert(first.percentUsed), accent) },
  ]
  if (first.resetsAt && left > 0) {
    segments.push({ key: `${first.kind}-in`, sep: '  ', keep: 70, runs: [{ text: `↻ in ${duration(left)}`, dim: true }] })
    if (!isCrowded) segments.push({ key: `${first.kind}-at`, sep: ' · ', keep: 30, runs: [{ text: resetTime(first.resetsAt, now, timeZone), dim: true }] })
  }
  for (const l of rest) {
    const alert = quotaAlert(l.percentUsed)
    if (alert === undefined) {
      segments.push({ key: l.kind, sep: ' · ', keep: 65, runs: [{ text: `${limitLabel(l.kind)} ${Math.round(l.percentUsed)}%`, dim: true }] })
      continue
    }
    // Beside another, a gauge's label needs no padding to line up.
    const runs = gaugeRuns(limitLabel(l.kind), l.percentUsed, alert, accent).map((r, i) => (i === 0 ? { ...r, text: r.text.trimStart() } : r))
    segments.push({ key: l.kind, sep: ' · ', keep: 90, runs })
    const leftOf = untilReset(l, now)
    if (leftOf > 0) segments.push({ key: `${l.kind}-in`, sep: ' ', keep: 60, runs: [{ text: `↻ ${duration(leftOf)}`, dim: true }] })
  }
  return segments
}

// Code points a terminal draws two cells wide (CJK, Hangul, fullwidth forms, emoji), and those it draws in none
// (combining marks, joiners, variation selectors).
const WIDE = /[\u1100-\u115f\u2e80-\u303e\u3041-\u33ff\u3400-\u4dbf\u4e00-\u9fff\ua000-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe4f\uff00-\uff60\uffe0-\uffe6\u{1f300}-\u{1f64f}\u{1f900}-\u{1f9ff}\u{20000}-\u{3fffd}]/u
const ZERO = /[\u0300-\u036f\u0483-\u0489\u0591-\u05bd\u0610-\u061a\u064b-\u065f\u200b-\u200f\u20d0-\u20ff\ufe00-\ufe0f\u{e0100}-\u{e01ef}]/u

/** How many terminal cells `text` takes, near enough to fit a row by. */
export const cells = (text: string) => {
  let n = 0
  for (const ch of text) n += ZERO.test(ch) ? 0 : WIDE.test(ch) ? 2 : 1
  return n
}

/** `text` in at most `max` cells, its middle given up for `…` when it is longer. */
export const middle = (text: string, max: number) => {
  if (cells(text) <= max) return text
  const chars = [...text]
  const head = Math.ceil((max - 1) / 2)
  const tail = max - 1 - head
  return `${chars.slice(0, head).join('')}…${tail > 0 ? chars.slice(-tail).join('') : ''}`
}

/** The segments that fit in `columns` cells, the least kept dropped first and of those the rightmost; all of them where the width is unknown. */
export const fit = (segments: readonly Segment[], columns: number): Segment[] => {
  const kept = [...segments]
  if (columns <= 0) return kept
  const widthOf = (s: Segment, i: number) => (i > 0 ? cells(s.sep ?? '') : 0) + s.runs.reduce((n, r) => n + cells(r.text), 0)
  for (;;) {
    if (kept.reduce((n, s, i) => n + widthOf(s, i), 0) <= columns) return kept
    let drop = -1
    kept.forEach((s, i) => {
      if (s.keep !== Infinity && (drop < 0 || s.keep <= kept[drop]!.keep)) drop = i
    })
    if (drop < 0) return kept
    kept.splice(drop, 1)
  }
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

/** A moment as a clock with seconds, `3:20:41pm`: what makes each `/awesome-hud files` line its own. */
export const clockTime = (at: number, timeZone?: string) =>
  new Date(at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', timeZone }).replace(/\s/g, '').toLowerCase()

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

// A path with forward slashes and no trailing one; a Windows path in lower case, as its file system compares it.
const normal = (path: string) => {
  const p = path.replace(/\\/g, '/').replace(/\/+$/, '')
  return /^[a-z]:/i.test(p) ? p.toLowerCase() : p
}

/** Whether the absolute `path` lies in the directory `root`. */
export const isUnder = (path: string, root: string) => {
  const [p, r] = [normal(path), normal(root)]
  return r === '' || p === r || p.startsWith(`${r}/`)
}

/** `path` from `root` when it lies in it, with forward slashes; else as it is, with `home` written `~`. */
export const shortPath = (path: string, root: string, home: string | null) => {
  const p = path.replace(/\\/g, '/')
  if (normal(root) !== '' && isUnder(path, root)) return p.slice(normal(root).length + 1)
  if (home && normal(home) !== '' && isUnder(path, home)) return `~${p.slice(normal(home).length)}`
  return p
}

// The test runners whose summaries summaryOf reads, and the task runners that run one (`make test`, `turbo run test`).
const TESTS = new RegExp(
  [
    String.raw`\b(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?test\b`,
    String.raw`\b(?:pytest|vitest|jest|mocha|rspec|phpunit|pest|unittest|tox|nox)\b`,
    String.raw`\b(?:go|cargo|dotnet|deno|mix|swift)\s+test\b`,
    String.raw`\bplaywright\s+test\b|\bmanage\.py\s+test\b|\bclaude\s+plugin\s+test\b`,
    String.raw`\bmvnw?\b[^|;&\n]*\btest\b`,
    String.raw`\b(?:make|just|turbo|nx)\b[^|;&\n]*\b(?:test|check)\b`,
  ].join('|'),
)

/** Whether a command runs tests, by its runner. */
export const isTestCommand = (command: string) => TESTS.test(command)

// `git [options] commit|push` run as a command, its quoted text dropped first: a message or an echo that names one runs none.
const GIT_RUN = /(?:^|[;&|({\n])\s*(?:[A-Za-z_]\w*=\S*\s+)*git((?:\s+(?:-[cC]\s+\S+|--?[a-z][\w-]*(?:=\S+)?))*)\s+(commit|push)\b([^;&|\n]*)/g

/** The commit or push a shell line runs, read from its text alone: a push before a commit; a dry run is neither. */
export const gitPartyOf = (command: string): 'commit' | 'push' | undefined => {
  const bare = command.replace(/'[^']*'|"(?:\\.|[^"\\])*"/g, "''")
  const verbs = [...bare.matchAll(GIT_RUN)]
    .filter(m => !/(?:^|\s)--dry-run\b/.test(m[3]!) && !(m[2] === 'push' && /(?:^|\s)-n\b/.test(m[3]!)))
    .map(m => m[2])
  return verbs.includes('push') ? 'push' : verbs.includes('commit') ? 'commit' : undefined
}

/** What Claude Code's Bash tool read a command to have done in git: a commit, a push, a branch merged or rebased, a pull request changed. */
export type GitOperation = NonNullable<BuiltinToolResults['Bash']['gitOperation']>

/**
 * What a finished Bash command is worth a party for: a push or a commit, as Claude Code read the command (else as its
 * text reads), or a test run (if its summary passed).
 */
export const partyOf = (command: string, op?: GitOperation): 'tests' | 'commit' | 'push' | undefined =>
  (op ? (op.push ? 'push' : op.commit ? 'commit' : undefined) : gitPartyOf(command)) ?? (TESTS.test(command) ? 'tests' : undefined)

const matches = (text: string, re: RegExp) => [...text.matchAll(re)]
const sum = (found: RegExpMatchArray[], group: number) => found.reduce((n, m) => n + Number(m[group] ?? 0), 0)
// A `name=N` count from a list like unittest's `failures=2, errors=1`.
const countIn = (list: string, name: string) => Number(new RegExp(String.raw`\b${name}=(\d+)`).exec(list)?.[1] ?? 0)
const countOf = (line: string, name: string) => Number(new RegExp(String.raw`\b${name}: (\d+)`).exec(line)?.[1] ?? 0)

// The summary each runner closes with, as passed and failed counts.
const summaryOf = (out: string): Pick<TestRun, 'passed' | 'failed'> | undefined => {
  // jest and pest `Tests:  2 failed, 10 passed, 12 total`, vitest `Tests  2 failed | 40 passed (42)`, pytest `== 2 failed, 40 passed in 1.2s ==`.
  const line = matches(out, /^\s*Tests:?\s.*\d+ (?:passed|failed).*$|^=*\s*\d+ \w+(?:, \d+ \w+)* in \d+(?:\.\d+)?s\b.*$/gm).at(-1)?.[0]
  if (line) return { passed: sum(matches(line, /\b(\d+) passed\b/g), 1), failed: sum(matches(line, /\b(\d+) (?:failed|errors?)\b/g), 1) }
  // cargo: `test result: FAILED. 38 passed; 2 failed; ...`, a line per test binary.
  const cargo = matches(out, /^test result: \w+\. (\d+) passed; (\d+) failed/gm)
  if (cargo.length > 0) return { passed: sum(cargo, 1), failed: sum(cargo, 2) }
  // dotnet: `Failed!  - Failed:     2, Passed:    10, ...`, a line per test project, or the newer `Test summary: total: 12, failed: 2, succeeded: 10`.
  const dotnet = matches(out, /^\s*(?:Passed|Failed)!\s+-\s+Failed:\s+(\d+),\s+Passed:\s+(\d+)/gm)
  if (dotnet.length > 0) return { passed: sum(dotnet, 2), failed: sum(dotnet, 1) }
  const dotnetSummary = matches(out, /^\s*Test summary: total: \d+, failed: (\d+), succeeded: (\d+)/gm).at(-1)
  if (dotnetSummary) return { passed: Number(dotnetSummary[2]), failed: Number(dotnetSummary[1]) }
  // maven: a module's total `[ERROR] Tests run: 12, Failures: 2, Errors: 1, Skipped: 1`; a class's line goes on past Skipped.
  const maven = matches(out, /^\[(?:INFO|WARNING|ERROR)\]\s+Tests run: (\d+), Failures: (\d+), Errors: (\d+), Skipped: (\d+)\s*$/gm)
  if (maven.length > 0) {
    const failed = sum(maven, 2) + sum(maven, 3)
    return { passed: sum(maven, 1) - failed - sum(maven, 4), failed }
  }
  // rspec: `10 examples, 2 failures, 1 pending`.
  const rspec = matches(out, /^(\d+) examples?, (\d+) failures?(?:, (\d+) pending)?/gm).at(-1)
  if (rspec) return { passed: Number(rspec[1]) - Number(rspec[2]) - Number(rspec[3] ?? 0), failed: Number(rspec[2]) }
  // mix: `1 doctest, 12 tests, 2 failures`.
  const mix = matches(out, /^(?:(\d+) doctests?, )?(?:\d+ propert(?:y|ies), )?(\d+) tests?, (\d+) failures?\b/gm).at(-1)
  if (mix) return { passed: Number(mix[1] ?? 0) + Number(mix[2]) - Number(mix[3]), failed: Number(mix[3]) }
  // swift (XCTest): `Executed 12 tests, with 2 failures`, the last line the whole run's.
  const swift = matches(out, /Executed (\d+) tests?, with (\d+) failures?/g).at(-1)
  if (swift) return { passed: Number(swift[1]) - Number(swift[2]), failed: Number(swift[2]) }
  // phpunit: `OK (12 tests, 30 assertions)`, or `Tests: 12, Assertions: 30, Errors: 1, Failures: 2, Skipped: 1.`
  const phpOk = matches(out, /^OK \((\d+) tests?, \d+ assertions?\)/gm).at(-1)
  if (phpOk) return { passed: Number(phpOk[1]), failed: 0 }
  const php = matches(out, /^Tests: (\d+), Assertions: \d+.*$/gm).at(-1)
  if (php) {
    const failed = countOf(php[0], 'Errors') + countOf(php[0], 'Failures')
    return { passed: Number(php[1]) - failed - countOf(php[0], 'Skipped') - countOf(php[0], 'Incomplete'), failed }
  }
  // deno: `FAILED | 10 passed | 2 failed (1s)`.
  const deno = matches(out, /^(?:ok|FAILED) \| (\d+) passed(?: \(\d+ steps?\))? \| (\d+) failed/gm).at(-1)
  if (deno) return { passed: Number(deno[1]), failed: Number(deno[2]) }
  // unittest, and Django's `manage.py test`: `Ran 12 tests in 0.1s` over `FAILED (failures=2, errors=1)` or `OK`.
  const ran = matches(out, /^Ran (\d+) tests? in \d/gm).at(-1)
  const verdict = matches(out, /^(?:OK|FAILED)(?: \(([^)]*)\))?\s*$/gm).at(-1)
  if (ran && verdict) {
    const list = verdict[1] ?? ''
    const failed = countIn(list, 'failures') + countIn(list, 'errors')
    return { passed: Number(ran[1]) - failed - countIn(list, 'skipped') - countIn(list, 'expected failures'), failed }
  }
  // go: `ok  <pkg>` or `FAIL <pkg>` a package, and `--- PASS: TestX` (with -v) or `--- FAIL: TestX` a test.
  if (/^(?:ok|FAIL)[ \t]+\S/m.test(out)) {
    const failed = Math.max(matches(out, /^--- FAIL:/gm).length, matches(out, /^FAIL[ \t]+\S/gm).length)
    return { passed: matches(out, /^--- PASS:/gm).length || matches(out, /^ok[ \t]+\S/gm).length, failed }
  }
  // bun and `claude plugin test`: ` 24 pass` over ` 0 fail`; playwright: `  3 passed (5.2s)` over `  1 failed`; mocha: `5 passing` over `2 failing`.
  const passed = matches(out, /^\s*(\d+) pass(?:ed|ing)?\b/gm).at(-1)
  const failed = matches(out, /^\s*(\d+) fail(?:ed|ing)?\b/gm).at(-1)
  return passed || failed ? { passed: Number(passed?.[1] ?? 0), failed: Number(failed?.[1] ?? 0) } : undefined
}

/** A test command's passed and failed counts, read from its runner's summary; undefined for another command, no summary, or nothing run. */
export const testsOf = (command: string, output: string) => {
  if (!TESTS.test(command)) return undefined
  // Without colors, which some runners force on.
  const counts = summaryOf(output.replace(/\x1b\[[\d;]*m/g, ''))
  return counts && counts.passed + counts.failed > 0 ? counts : undefined
}

/** A test command as runs of it are compared for a trend: without the redirect and the `| tail` or `| head` a long run is read through. */
export const commandKey = (command: string) =>
  command.replace(/\s*2>&1/g, '').replace(/\s*\|\s*(?:tail|head)\b[^|;&]*/g, '').trim()

/** `git status --porcelain=v2 --branch --show-stash -z`: the head, the upstream, the paths by kind, the stashes; each path's state when asked. */
export type GitStatus = {
  head: string
  oid: string | null
  upstream: Git['upstream']
  ahead: number
  behind: number
  staged: number
  unstaged: number
  untracked: number
  conflicts: number
  stashes: number
  paths: Record<string, PathState>
}

export const parseStatus = (out: string, withPaths = false): GitStatus | null => {
  const fields = out.split('\0')
  if (!fields[0]?.startsWith('# branch.')) return null
  const s: GitStatus = { head: '', oid: null, upstream: 'none', ahead: 0, behind: 0, staged: 0, unstaged: 0, untracked: 0, conflicts: 0, stashes: 0, paths: {} }
  let hasUpstream = false
  let hasCounts = false
  for (let i = 0; i < fields.length; i++) {
    const f = fields[i]!
    const kind = f.slice(0, 2)
    if (kind === '# ') {
      const [key = '', ...rest] = f.slice(2).split(' ')
      const value = rest.join(' ')
      if (key === 'branch.oid') s.oid = value === '(initial)' ? null : value
      else if (key === 'branch.head') s.head = value
      else if (key === 'branch.upstream') hasUpstream = true
      else if (key === 'branch.ab') {
        hasCounts = true
        s.ahead = Number(/\+(\d+)/.exec(value)?.[1] ?? 0)
        s.behind = Number(/-(\d+)/.exec(value)?.[1] ?? 0)
      } else if (key === 'stash') s.stashes = Number(value) || 0
    } else if (kind === '1 ' || kind === '2 ') {
      // `1 XY sub mH mI mW hH hI path`; a rename has its score before the path and its old path as the next field.
      const [x, y] = [f[2], f[3]]
      if (x !== '.') s.staged += 1
      if (y !== '.') s.unstaged += 1
      if (withPaths) s.paths[f.split(' ').slice(kind === '1 ' ? 8 : 9).join(' ')] = x === 'D' || y === 'D' ? 'deleted' : y !== '.' ? 'modified' : 'staged'
      if (kind === '2 ') i += 1
    } else if (kind === 'u ') {
      s.conflicts += 1
      if (withPaths) s.paths[f.split(' ').slice(10).join(' ')] = 'conflict'
    } else if (kind === '? ') {
      s.untracked += 1
      if (withPaths) s.paths[f.slice(2)] = 'new'
    }
  }
  // An upstream git has no counts for is one the remote no longer has.
  s.upstream = !hasUpstream ? 'none' : hasCounts ? 'tracking' : 'gone'
  return s
}

/** `.git/HEAD`: the branch it names, or the commit a detached HEAD holds. */
export const headOf = (text: string): { branch: string | null; oid: string | null } => {
  const t = text.trim()
  const ref = /^ref:\s*(\S+)$/.exec(t)?.[1]
  if (ref) return { branch: clean(ref.replace(/^refs\/heads\//, '')), oid: null }
  return { branch: null, oid: /^[0-9a-f]{7,64}$/i.test(t) ? t : null }
}

/** What readGit read, for gitOf: a status undefined when it did not finish. */
export type GitReading = {
  head: { branch: string | null; oid: string | null }
  status: GitStatus | undefined
  prev: Git | null
  /** What git is in the middle of, and the branch a rebase or bisect began on. */
  op: (GitOp & { branch?: string }) | null
  isUntrackedLeftOut: boolean
  unpushed: number
  isFetchStale: boolean
  worktree: Git['worktree']
}

/**
 * The band's git from a reading: the branch a rebase or bisect began on, else HEAD's, else the status's; the status's
 * counts, or when it did not finish the last ones, stale; and with no upstream, ahead is what no remote has.
 */
export const gitOf = (r: GitReading): Git => {
  const s = r.status
  const counts = s ?? r.prev
  return {
    branch: r.op?.branch ?? r.head.branch ?? (s && s.head !== '' && s.head !== '(detached)' ? clean(s.head) : null),
    oid: s?.oid ?? r.head.oid ?? r.prev?.oid ?? null,
    op: r.op ? { kind: r.op.kind, ...(r.op.step ? { step: r.op.step } : {}), ...(r.op.of ? { of: r.op.of } : {}) } : null,
    upstream: s?.upstream ?? r.prev?.upstream ?? 'none',
    ahead: s ? (s.upstream === 'none' ? r.unpushed : s.ahead) : (r.prev?.ahead ?? 0),
    behind: counts?.behind ?? 0,
    isFetchStale: r.isFetchStale,
    staged: counts?.staged ?? 0,
    unstaged: counts?.unstaged ?? 0,
    untracked: s ? (r.isUntrackedLeftOut ? null : s.untracked) : (r.prev?.untracked ?? null),
    conflicts: counts?.conflicts ?? 0,
    stashes: counts?.stashes ?? 0,
    worktree: r.worktree,
    isStale: s === undefined,
  }
}

// As git's own prompt names what it is in the middle of, and as the quip line says it.
const OP_LABEL: Record<GitOp['kind'], string> = { rebase: 'REBASE', am: 'AM', merge: 'MERGING', 'cherry-pick': 'CHERRY-PICKING', revert: 'REVERTING', bisect: 'BISECTING' }
const OP_WORDS: Record<GitOp['kind'], string> = { rebase: 'rebasing', am: 'applying patches', merge: 'merging', 'cherry-pick': 'cherry-picking', revert: 'reverting', bisect: 'bisecting' }
const stepOf = (op: GitOp) => (op.step && op.of ? ` ${op.step}/${op.of}` : '')
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** The branch cluster: `⎇ main|REBASE 2/5`, the commits ahead and behind, and an upstream gone or never set. */
export const branchSegments = (git: Git): Segment[] => {
  const name = git.branch === null ? `@${(git.oid ?? '').slice(0, 7)}` : middle(git.branch, BRANCH_CELLS)
  const segments: Segment[] = [
    {
      key: 'branch',
      sep: ' ',
      keep: Infinity,
      runs: [{ text: `⎇ ${name}`, color: 'suggestion' }, ...(git.op ? [{ text: `|${OP_LABEL[git.op.kind]}${stepOf(git.op)}`, color: 'warning', bold: true }] : [])],
    },
  ]
  // Behind counts only what the last fetch saw: past a day it is dim, not a warning.
  const sync: Run[] = [
    ...(git.ahead > 0 ? [{ text: `↑${git.ahead}` }] : []),
    ...(git.behind > 0 ? [{ text: `${git.ahead > 0 ? ' ' : ''}↓${git.behind}`, color: git.isFetchStale ? undefined : 'warning', dim: git.isFetchStale }] : []),
  ]
  if (sync.length > 0) segments.push({ key: 'sync', sep: ' ', keep: 90, runs: sync })
  if (git.upstream === 'gone') segments.push({ key: 'upstream', sep: ' ', keep: 30, runs: [{ text: 'upstream gone', color: 'warning' }] })
  else if (git.upstream === 'none' && git.ahead > 0) segments.push({ key: 'upstream', sep: ' ', keep: 30, runs: [{ text: 'unpublished', dim: true }] })
  return segments
}

/** The tree: conflicts in words, then the files staged, changed and untracked, and the stashes; dim when the counts are an earlier status's. */
export const treeSegments = (git: Git): Segment[] => {
  const segments: Segment[] = []
  if (git.conflicts > 0) segments.push({ key: 'conflicts', sep: ' · ', keep: 95, runs: [{ text: plural(git.conflicts, 'conflict'), color: 'error', bold: true }] })
  const counts = ([['●', git.staged, 'success'], ['✚', git.unstaged, 'warning'], ['?', git.untracked ?? 0, undefined]] as const).flatMap(([mark, n, color]) =>
    n > 0 ? [{ text: `${mark}${n}`, color: git.isStale ? undefined : color, dim: git.isStale || color === undefined }] : [],
  )
  if (counts.length > 0) segments.push({ key: 'tree', sep: ' · ', keep: 60, runs: between<Run>(counts, () => ({ text: ' ' })) })
  if (git.stashes > 0) segments.push({ key: 'stash', sep: ' ', keep: 20, runs: [{ text: `≡${git.stashes}`, dim: true }] })
  return segments
}

/** What Claude changed in the project this session: `✎5`, then the lines it added and removed. */
export const fileSegments = (files: readonly FileEdit[]): Segment[] => {
  const mine = files.filter(f => f.isInProject)
  if (mine.length === 0) return []
  const added = mine.reduce((n, f) => n + f.added, 0)
  const removed = mine.reduce((n, f) => n + f.removed, 0)
  const lines: Run[] = [...(added > 0 ? [{ text: `+${added}`, color: 'success' }] : []), ...(removed > 0 ? [{ text: `−${removed}`, color: 'error' }] : [])]
  return [
    { key: 'files', sep: ' · ', keep: 55, runs: [{ text: `✎${mine.length}` }] },
    ...(lines.length > 0 ? [{ key: 'lines', sep: ' ', keep: 25, runs: between<Run>(lines, () => ({ text: ' ' })) }] : []),
  ]
}

/** The last test run, `✗ 2 failed (was 5) · 3m ago`: gray once an edit in the project came after it. */
export const testSegment = (run: TestRun, editedAt: number, now: number): Segment => {
  // A run older than the last edit no longer vouches for the code: it loses its color.
  const color = editedAt > run.at ? undefined : run.failed > 0 ? 'error' : 'success'
  const was = run.failed > 0 && run.was && run.was.failed !== run.failed ? ` (was ${run.was.failed})` : ''
  return {
    key: 'tests',
    sep: ' · ',
    keep: 85,
    runs: [
      { text: run.failed > 0 ? `✗ ${run.failed} failed` : `✓ ${run.passed} passed`, color, dim: color === undefined },
      { text: `${was} · ${duration(now - run.at)} ago`, dim: true },
    ],
  }
}

/** The branch's pull request, a link, `PR #42`: what became of it, or with PR status, its checks and its review. */
export const prSegment = (pr: Pr): Segment => {
  const c = pr.checks
  const isOpen = pr.state === 'open' || pr.state === 'draft'
  const checks: Run[] =
    !c || !isOpen
      ? []
      : c.failed > 0
        ? [{ text: ` ✗${c.failed}`, color: 'error' }]
        : c.pending > 0
          ? [{ text: ` ◌${c.pending}`, dim: true }]
          : c.passed > 0
            ? [{ text: ' ✓', color: 'success' }]
            : []
  const state: Run[] =
    pr.state === 'merged' ? [{ text: ' merged', color: 'merged' }] : pr.state === 'closed' ? [{ text: ' closed', dim: true }] : pr.state === 'draft' ? [{ text: ' draft', dim: true }] : []
  const review: Run[] = !isOpen
    ? []
    : pr.review === 'approved'
      ? [{ text: ' approved', color: 'success' }]
      : pr.review === 'changes'
        ? [{ text: ' changes requested', color: 'warning' }]
        : []
  return { key: 'pr', sep: ' · ', keep: 70, runs: [{ text: `PR #${pr.number}`, color: 'suggestion', href: linkOf(pr.url) }, ...state, ...checks, ...review] }
}

// An address the band will open: a web page's alone, whatever a command printed.
const linkOf = (url: string | undefined) => (url && /^https:\/\//.test(url) ? url : undefined)

/** What git is stuck in, for the quip line at rest: `rebasing 2/5, 2 conflicts`; '' for nothing. */
export const gitTrouble = (git: Git) =>
  [...(git.op ? [`${OP_WORDS[git.op.kind]}${stepOf(git.op)}`] : []), ...(git.conflicts > 0 ? [plural(git.conflicts, 'conflict')] : [])].join(', ')

/** Lines a patch adds and removes: its hunks' `+` and `-` rows. */
export const patchLines = (hunks: readonly { lines: readonly string[] }[]) => {
  let added = 0
  let removed = 0
  for (const h of hunks) {
    for (const l of h.lines) {
      if (l.startsWith('+')) added += 1
      else if (l.startsWith('-')) removed += 1
    }
  }
  return { added, removed }
}

const linesOf = (text: string) => (text === '' ? [] : text.replace(/\n$/, '').split('\n'))

/** Lines added and removed between two texts, as a diff totals them but for moves: each line by how much more or less often it appears. */
export const lineDelta = (before: string, after: string) => {
  const counts = new Map<string, number>()
  for (const l of linesOf(before)) counts.set(l, (counts.get(l) ?? 0) - 1)
  for (const l of linesOf(after)) counts.set(l, (counts.get(l) ?? 0) + 1)
  let added = 0
  let removed = 0
  for (const n of counts.values()) {
    if (n > 0) added += n
    else removed -= n
  }
  return { added, removed }
}

const NO_LINES = { added: 0, removed: 0 }

/**
 * The lines an edit tool's result says it added and removed: Edit's and Write's patch, or every line of a new file;
 * a notebook cell's old source against its new. None where the result does not say, as for a write too big to diff.
 */
export const editLines = (tool: string, result: unknown): { added: number; removed: number } => {
  const r = (typeof result === 'object' && result !== null ? result : {}) as {
    structuredPatch?: { lines: string[] }[]
    type?: string
    content?: unknown
    new_source?: unknown
    old_source?: unknown
  }
  if (tool === 'NotebookEdit') return typeof r.new_source === 'string' ? lineDelta(typeof r.old_source === 'string' ? r.old_source : '', r.new_source) : NO_LINES
  if (r.structuredPatch && r.structuredPatch.length > 0) return patchLines(r.structuredPatch)
  if (tool === 'Write' && r.type === 'create' && typeof r.content === 'string') return lineDelta('', r.content)
  return NO_LINES
}

/** `files` with one more edit of `path`: its count, its lines added and removed, and when. */
export const recordEdit = (files: readonly FileEdit[], path: string, lines: { added: number; removed: number }, at: number, isInProject: boolean): FileEdit[] => {
  const old = files.find(f => f.path === path)
  const next: FileEdit = { path, edits: (old?.edits ?? 0) + 1, added: (old?.added ?? 0) + lines.added, removed: (old?.removed ?? 0) + lines.removed, at, isInProject }
  return old ? files.map(f => (f === old ? next : f)) : [...files, next]
}

type PrAction = NonNullable<GitOperation['pr']>['action']
const PR_STATE: Partial<Record<PrAction, Pr['state']>> = { created: 'open', reopened: 'open', ready: 'open', draft: 'draft', merged: 'merged', closed: 'closed' }

/** The pull request a `gh pr` command Claude ran changed: what PR status read of the same one kept, its state as the command left it. */
export const prOfOperation = (op: NonNullable<GitOperation['pr']>, branch: string | null, prev: Pr | null): Pr => {
  const same = prev?.number === op.number ? prev : null
  return {
    ...(same ?? {}),
    number: op.number,
    url: op.url === undefined ? same?.url : clean(op.url),
    state: PR_STATE[op.action] ?? same?.state ?? 'open',
    branch: same?.branch ?? branch,
  }
}

const CHECK_FAILED = new Set(['FAILURE', 'ERROR', 'CANCELLED', 'TIMED_OUT', 'ACTION_REQUIRED', 'STARTUP_FAILURE'])
const CHECK_PENDING = new Set(['PENDING', 'EXPECTED', 'QUEUED', 'IN_PROGRESS', 'WAITING', 'REQUESTED'])

type GhCheck = { status?: string; conclusion?: string | null; state?: string }
type GhPr = { number?: unknown; url?: unknown; state?: string; isDraft?: boolean; reviewDecision?: string; statusCheckRollup?: GhCheck[] }

/** `gh pr view --json number,url,state,isDraft,reviewDecision,statusCheckRollup` as the band's PR, read on `branch`. */
export const parsePr = (json: string, branch: string | null): Pr | null => {
  let v: GhPr
  try {
    v = JSON.parse(json) as GhPr
  } catch {
    return null
  }
  if (typeof v.number !== 'number') return null
  const checks = { failed: 0, pending: 0, passed: 0 }
  for (const c of v.statusCheckRollup ?? []) {
    // A check run has a status and, once completed, a conclusion; a commit status has a state alone.
    const verdict = c.status === undefined ? (c.state ?? '') : c.status === 'COMPLETED' ? (c.conclusion ?? '') : c.status
    if (CHECK_FAILED.has(verdict)) checks.failed += 1
    else if (CHECK_PENDING.has(verdict)) checks.pending += 1
    else if (verdict === 'SUCCESS') checks.passed += 1
  }
  const state: Pr['state'] = v.state === 'MERGED' ? 'merged' : v.state === 'CLOSED' ? 'closed' : v.isDraft ? 'draft' : 'open'
  const review = v.reviewDecision === 'APPROVED' ? 'approved' : v.reviewDecision === 'CHANGES_REQUESTED' ? 'changes' : undefined
  return { number: v.number, url: typeof v.url === 'string' ? clean(v.url) : undefined, state, branch, checks, ...(review ? { review } : {}) }
}

// How the files report names the state git has a file in; a file git has no change for is clean: committed, or reverted.
const STATE_WORD: Record<PathState | 'clean', [string, string | undefined]> = {
  staged: ['staged', 'success'],
  modified: ['changed', 'warning'],
  new: ['new', 'success'],
  deleted: ['deleted', 'error'],
  conflict: ['conflict', 'error'],
  clean: ['clean', undefined],
}

const stateOf = (r: FilesReport, f: FileEdit) => (r.paths && f.isInProject ? (r.paths[shortPath(f.path, r.root, null)] ?? 'clean') : undefined)

/** The `/awesome-hud files` line the model reads: what Claude edited in the project, how much git still has as changed, and the rest. */
export const filesLine = (r: FilesReport, at: string) => {
  const mine = r.files.filter(f => f.isInProject)
  const others = r.files.length - mine.length
  const added = mine.reduce((n, f) => n + f.added, 0)
  const removed = mine.reduce((n, f) => n + f.removed, 0)
  const open = r.paths ? mine.filter(f => stateOf(r, f) !== 'clean').length : undefined
  const parts = [
    mine.length === 0
      ? 'Claude has edited no files in the project this session'
      : `Claude edited ${plural(mine.length, 'file')} in the project this session (+${added} −${removed})${open === undefined ? '' : open === 0 ? ', all committed or reverted' : `, ${open} not yet committed`}`,
    ...(others > 0 ? [`${others} outside it`] : []),
    ...(r.commits.length > 0 ? [`${plural(r.commits.length, 'commit')} made`] : []),
    ...(r.pr ? [`PR #${r.pr.number} ${r.pr.state}`] : []),
  ]
  return `${parts.join('; ')}. As of ${at}.`
}

/**
 * The files report as rows of runs: each file in the project with its edits, the lines added and removed and the state
 * git has it in now; then the files outside the project, the commits made this session, and the pull request.
 */
export const reportRows = (r: FilesReport): Run[][] => {
  const byPath = (a: FileEdit, b: FileEdit) => a.path.localeCompare(b.path)
  const group = (list: FileEdit[]): Run[][] => {
    const name = (f: FileEdit) => clean(middle(shortPath(f.path, r.root, r.home), 48))
    const widthOf = (text: (f: FileEdit) => string) => Math.max(0, ...list.map(f => cells(text(f))))
    const [names, edits, adds, dels] = [widthOf(name), widthOf(f => `×${f.edits}`), widthOf(f => `+${f.added}`), widthOf(f => `−${f.removed}`)]
    const right = (text: string, width: number) => `  ${' '.repeat(width - cells(text))}${text}`
    return list.map(f => {
      const state = stateOf(r, f)
      const [word, color] = state ? STATE_WORD[state] : ['', undefined]
      return [
        { text: name(f) + ' '.repeat(names - cells(name(f))) },
        { text: right(`×${f.edits}`, edits), dim: true },
        { text: right(`+${f.added}`, adds), color: f.added > 0 ? 'success' : undefined, dim: f.added === 0 },
        { text: right(`−${f.removed}`, dels), color: f.removed > 0 ? 'error' : undefined, dim: f.removed === 0 },
        ...(state ? [{ text: `  ${word}`, color, dim: color === undefined }] : []),
      ]
    })
  }
  const others = r.files.filter(f => !f.isInProject).sort(byPath)
  return [
    ...group(r.files.filter(f => f.isInProject).sort(byPath)),
    ...(others.length > 0 ? [[{ text: 'outside the project', dim: true }], ...group(others)] : []),
    ...(r.commits.length > 0
      ? [
          [{ text: `${r.commits.length === 1 ? 'commit' : 'commits'} this session`, dim: true }],
          ...r.commits.map(c => [
            { text: c.sha.slice(0, 7), color: 'suggestion' },
            { text: `  ${c.branch ?? ''}${c.kind === 'committed' ? '' : ` (${c.kind})`}`, dim: true },
          ]),
        ]
      : []),
    ...(r.pr ? [[{ text: `PR #${r.pr.number}`, color: 'suggestion', href: linkOf(r.pr.url) }, { text: `  ${r.pr.state}${r.pr.url ? `  ${r.pr.url}` : ''}`, dim: true }]] : []),
  ]
}
