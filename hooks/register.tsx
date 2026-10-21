import { atom, read, update } from 'claude-code'
import type { BuiltinToolResults, Elements, EngineInterface, Register, Timer, ToolCallResult } from 'claude-code'

import type { Activity, AgentFailure, Commit, Compaction, Eater, FileEdit, FilesReport, Git, GitOp, Meter, Mood, Pr, TestRun, TurnNote } from '../types'
import {
  COMPACT_AT, CONTEXT_CRIT, CONTEXT_WARN, FETCH_STALE_MS, branchSegments, clean, clockTime, commandKey, contextAlert, costOf, duration,
  editLines, effortMark, fileSegments, filesLine, fill, fit, gaugeRuns, gitOf, gitTrouble, headOf, isHot, isTestCommand, isUnder, limitLabel, parsePr, parseStatus,
  isMiss, partyOf, pick, planSegments, prOfOperation, prSegment, prettyModel, quotaAlert, recordEdit, reportRows, shortTool, shown, targetOf, testSegment,
  testsOf, toMeter, treeSegments, verbOf,
} from './format'
import type { GitOperation, GitStatus, Run, Segment } from './format'
import { play } from './sound'
import { encode, HEIGHT, WIDTH } from './sprite'
import { asciiFace, isUnicodeTerminal, sym, useSymbols } from './symbols'
import type { PartyCause, SoundEvent } from './theme'
import type { Theme } from './theme'
import { DEFAULT_THEME, THEMES } from './themes'

const themeName = atom({ plugin: 'awesome-hud', key: 'theme' } as const, DEFAULT_THEME)
const mood = atom({ plugin: 'awesome-hud', key: 'mood' } as const, 'idle' as Mood)
const quip = atom({ plugin: 'awesome-hud', key: 'quip' } as const, '')
const EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max']
const effort = atom({ plugin: 'awesome-hud', key: 'effort' } as const, null as string | null)
// Whether the band draws its plain-ASCII marks: the terminal's font may lack the others. Set once, at the session's start.
const ascii = atom({ plugin: 'awesome-hud', key: 'ascii' } as const, false)
const meter = atom({ plugin: 'awesome-hud', key: 'meter' } as const, null as Meter | null)
const minute = atom({ plugin: 'awesome-hud', key: 'minute' } as const, 0)
const activity = atom({ plugin: 'awesome-hud', key: 'activity' } as const, { running: [] } as Activity)
const git = atom({ plugin: 'awesome-hud', key: 'git' } as const, null as Git | null)
const tests = atom({ plugin: 'awesome-hud', key: 'tests' } as const, null as TestRun | null)
const files = atom({ plugin: 'awesome-hud', key: 'files' } as const, [] as FileEdit[])
const editedAt = atom({ plugin: 'awesome-hud', key: 'editedAt' } as const, 0)
const eater = atom({ plugin: 'awesome-hud', key: 'eater' } as const, null as Eater | null)
const compaction = atom({ plugin: 'awesome-hud', key: 'compaction' } as const, null as Compaction | null)
const agents = atom({ plugin: 'awesome-hud', key: 'agents' } as const, [] as string[])
const failures = atom({ plugin: 'awesome-hud', key: 'failures' } as const, [] as AgentFailure[])
const commits = atom({ plugin: 'awesome-hud', key: 'commits' } as const, [] as Commit[])
const pr = atom({ plugin: 'awesome-hud', key: 'pr' } as const, null as Pr | null)
const reports = atom({ plugin: 'awesome-hud', key: 'reports' } as const, {} as Record<string, FilesReport>)
const turnNotes = atom({ plugin: 'awesome-hud', key: 'turnNotes' } as const, {} as Record<string, TurnNote>)

const SLEEP_AFTER_MS = 5 * 60_000
// A quicker answer plays no done sound: it is there before you have looked away.
const LONG_TURN_MS = 30_000
// An agent yet to start, running, or waiting on something is at work; an idle teammate is not.
const AT_WORK = new Set(['pending', 'running', 'waiting'])
// The quip's `»` in the color of a mood that has one, so the state reads without the sprite.
const MOOD_COLOR: Partial<Record<Mood, string>> = { error: 'error', waiting: 'warning', done: 'success', party: 'success' }
const MIN_COLUMNS = 70
const MIN_ROWS = 7
// The sprite's height in rows, two pixels a cell; the status column is held to it, and a repository's second row.
const ROWS = HEIGHT / 2
// The branch cluster's cells, so the tree starts in the same column from one branch to the next.
const BRANCH_CLUSTER = 20
// shortcut: under the prompt only the terminal's height is reported, not the room left there; on 2.1.303 the
// five rows fit from about 20 rows, and 24 leaves room for a status line or a notice. Re-measure if rows get cut.
const BELOW_MIN_TERMINAL_ROWS = 25
// Edits come in bursts: the band's git counts follow once one pauses this long.
const EDIT_PAUSE_MS = 1_500
// Git moved outside Claude (another terminal, an editor, a `!` command): the band looks again this often.
const GIT_EVERY_MS = 15_000
// With PR status on, checks move on GitHub's side: they are read again this many minutes apart while the person is about.
const PR_EVERY_MINUTES = 5
const PR_AWAY_MS = 30 * 60_000
// An agent's end may land after its last turn's: while any is listed at work, the list is read again this often.
const AGENTS_EVERY_MS = 15_000
// A test run's saved output past this size is read from its end alone, where the summary is.
const OUTPUT_READ_BYTES = 2 ** 20

/** Where the band is drawn, and its room: cells across, and whether the sprite's rows fit. */
type Site = { requestId: string; columns: number; isTall: boolean }

/** Where git keeps the session's repository: its git dir, the one its worktrees share, and the top of its tree. */
type Repo = { gitDir: string; commonDir: string; top: string }

// Own keys only: `/awesome-hud constructor` must not find what every object inherits.
const isTheme = (name: string) => Object.hasOwn(THEMES, name)
const themeOf = (name: string): Theme => THEMES[isTheme(name) ? name : DEFAULT_THEME]!

let theme = themeOf(DEFAULT_THEME)
// The `flavorText` option: theme words in Claude Code's own spinner and turn line, and the party toasts.
let isFlavored = true
// The `sounds` option: off until the person turns it on.
let isSounding = false
// The `cost` option: auto, show or hide.
let costMode = 'auto'
// The `layout` option at `compact`: the stats alone, on two lines.
let isCompact = false
// The `prStatus` option: the branch's pull request from `gh pr view`, the mod's one use of the network.
let isPrStatus = false
// The `symbols` option: auto asks the terminal, unicode and ascii decide for it.
let symbolMode = 'auto'
let current: Mood = 'idle'
let hot = false
let isTurning = false
let idx = 0
let turnSeed = 0
let turnErrors = 0
let turnParty = false
let lastActive = 0
let isCompactWarned = false
let bandId: string | undefined
let lastBlit: string | undefined
let lastEffort: string | undefined
let animation: Timer | undefined
let revert: Timer | undefined
// The repository of the session's directory, as last found for that directory; null outside one.
let known: { cwd: string; repo: Repo | null } | undefined
// A status that ran out of time is run again without untracked files, which are what make one slow.
let isSlowRepo = false
// One status at a time: a refresh asked for while one runs has it run once more after.
let gitRun: Promise<void> | undefined
let isGitAgain = false
let gitSoon: Timer | undefined
// One gh at a time, like the status: a refresh asked for while one runs has it run once more after.
let prRun: Promise<void> | undefined
let isPrAgain = false

// By theme, then mood and frame: two themes may share an accent, a palette or frames.
const encoded = new Map<Theme, Map<string, string>>()
const cellsAt = (m: Mood, i: number) => {
  const frames = theme.moods[m]
  const n = i % frames.length
  let byFrame = encoded.get(theme)
  if (byFrame === undefined) encoded.set(theme, (byFrame = new Map()))
  let cells = byFrame.get(`${m}:${n}`)
  if (cells === undefined) byFrame.set(`${m}:${n}`, (cells = encode(frames[n]!.px, theme.palette)))
  return cells
}

const blit = ($: EngineInterface) => {
  if (bandId === undefined) return
  const cells = cellsAt(shown(current, hot), idx)
  if (cells === lastBlit) return
  lastBlit = cells
  void $.ui.blit({ requestId: bandId, key: 'cat', cells })
}

// Stops animating a sprite no longer drawn.
const park = () => {
  bandId = undefined
  animation?.cancel()
  animation = undefined
}

// One timer, re-armed per frame for that frame's own duration. It runs only
// while a band that shows the sprite is mounted.
const animate = ($: EngineInterface) => {
  animation?.cancel()
  animation = undefined
  if (bandId === undefined) return
  const frames = theme.moods[shown(current, hot)]
  animation = $.clock.after(frames[idx % frames.length]!.ms, () => {
    idx = (idx + 1) % frames.length
    blit($)
    animate($)
  })
}

async function setMood($: EngineInterface, next: Mood, opts: { backMs?: number; say?: string } = {}) {
  revert?.cancel()
  revert = opts.backMs === undefined ? undefined : $.clock.after(opts.backMs, () => void setMood($, isTurning ? 'working' : 'idle'))
  if (next !== current) {
    current = next
    idx = 0
    animate($)
  }
  await Promise.all([update($, mood, () => next), update($, quip, () => opts.say ?? '')])
  blit($)
}

const touch = async ($: EngineInterface) => {
  lastActive = await $.clock.now()
  if (current === 'asleep') await setMood($, isTurning ? 'working' : 'idle')
}

// Not awaited: a hook goes on while the sound plays.
const sound = ($: EngineInterface, event: SoundEvent) => {
  if (isSounding) void play($, theme.sounds[event])
}

const celebrate = async ($: EngineInterface, cause: PartyCause) => {
  turnParty = true
  sound($, 'party')
  if (isFlavored) $.ui.toast(theme.party[cause])
  await setMood($, 'party', { backMs: 4_000, say: theme.party[cause] })
}

// A frame at twice its size: every pixel two across and two down.
const twice = (px: readonly string[]) => px.flatMap(row => Array<string>(2).fill(row.replace(/./g, '$&$&')))

const basename = (path: string) => path.split(/[\\/]/).filter(Boolean).pop() ?? path
const isAbsolute = (path: string) => /^(?:[a-z]:)?[\\/]/i.test(path)
// The main tree's folder from the git dir its worktrees share: `/src/app/.git` is app's, and so is a bare `app.git`.
const projectOf = (commonDir: string) =>
  basename(commonDir) === '.git' ? basename(commonDir.replace(/[\\/]+\.git[\\/]*$/, '')) : basename(commonDir).replace(/\.git$/, '')

async function repoOf($: EngineInterface, cwd: string): Promise<Repo | null> {
  if (known?.cwd === cwd) return known.repo
  try {
    const r = await $.process.run(['git', 'rev-parse', '--absolute-git-dir', '--show-toplevel'], { cwd, timeoutMs: 3_000 })
    const [gitDir = '', top = ''] = r.stdout.trim().split(/\r?\n/)
    let repo: Repo | null = null
    if (r.exitCode === 0 && gitDir !== '' && top !== '') {
      // A linked worktree's git dir names, in `commondir`, the one it shares with the main tree.
      const common = await $.fs.read(`${gitDir}/commondir`).then(t => t.trim(), () => '')
      const shared = isAbsolute(common) ? common : `${gitDir}/${common}`
      const commonDir = common === '' ? gitDir : ((await $.fs.stat(shared, { resolve: true }).catch(() => undefined))?.realPath ?? shared)
      repo = { gitDir, commonDir, top }
    }
    if (repo?.top !== known?.repo?.top) isSlowRepo = false
    known = { cwd, repo }
    return repo
  } catch {
    // Out of time, or no git: asked again next time.
    return null
  }
}

// A status of the tree; `isFull` takes untracked files and paths whatever the last one took, for the files report.
async function statusOf($: EngineInterface, at: Repo, isFull = false) {
  const isQuick = isSlowRepo && !isFull
  // --no-optional-locks: a status in the background must not take index.lock from the person's own git.
  const argv = ['git', '--no-optional-locks', 'status', '--porcelain=v2', '--branch', '--show-stash', '-z', ...(isQuick ? ['--untracked-files=no'] : [])]
  try {
    const r = await $.process.run(argv, { cwd: at.top, timeoutMs: isFull ? 10_000 : 3_000 })
    const status = r.exitCode === 0 ? parseStatus(r.stdout, isFull) : null
    return status ? { status, isQuick } : undefined
  } catch {
    // Out of time: untracked files are what make a status slow, so the next one leaves them out.
    if (!isFull) isSlowRepo = true
    return undefined
  }
}

// What git is in the middle of, from the files it keeps meanwhile: a rebase's or `git am`'s step, and the branch it began on.
async function opOf($: EngineInterface, gitDir: string): Promise<(GitOp & { branch?: string }) | null> {
  const names = new Set(await $.fs.list(gitDir).then(entries => entries.map(n => n.name), () => [] as string[]))
  const readOf = (path: string) => $.fs.read(`${gitDir}/${path}`).then(t => clean(t.trim()), () => '')
  // A rebase of a detached HEAD began on no branch, and a bisect started from a commit names that commit.
  const branchOf = (ref: string) => (ref === 'detached HEAD' || /^[0-9a-f]{40,64}$/.test(ref) ? undefined : ref.replace(/^refs\/heads\//, '') || undefined)
  if (names.has('rebase-merge') || names.has('rebase-apply')) {
    const dir = names.has('rebase-merge') ? 'rebase-merge' : 'rebase-apply'
    const isApply = dir === 'rebase-apply'
    const [step, of, head, isAm] = await Promise.all([
      readOf(`${dir}/${isApply ? 'next' : 'msgnum'}`),
      readOf(`${dir}/${isApply ? 'last' : 'end'}`),
      readOf(`${dir}/head-name`),
      isApply ? $.fs.exists(`${gitDir}/${dir}/applying`).catch(() => false) : false,
    ])
    return { kind: isAm ? 'am' : 'rebase', step: Number(step) || undefined, of: Number(of) || undefined, branch: branchOf(head) }
  }
  if (names.has('MERGE_HEAD')) return { kind: 'merge' }
  if (names.has('CHERRY_PICK_HEAD')) return { kind: 'cherry-pick' }
  if (names.has('REVERT_HEAD')) return { kind: 'revert' }
  if (names.has('BISECT_LOG')) return { kind: 'bisect', branch: branchOf(await readOf('BISECT_START')) }
  return null
}

// When the last fetch ran: FETCH_HEAD's time, 0 where there was none.
const fetchedAtOf = ($: EngineInterface, at: Repo) => $.fs.stat(`${at.commonDir}/FETCH_HEAD`).then(s => s.mtimeMs, () => 0)

// With no upstream, ahead is what no remote has yet, where there is a remote to have it.
async function unpushedOf($: EngineInterface, at: Repo, status: GitStatus, branch: string | null) {
  if (status.upstream !== 'none' || status.oid === null || branch === null) return 0
  // Blanks and tabs, not `\s`: a config of empty lines would be read on from each of them.
  if (!/^[ \t]*\[remote "/m.test(await $.fs.read(`${at.commonDir}/config`).catch(() => ''))) return 0
  const r = await $.process.run(['git', 'rev-list', '--count', 'HEAD', '--not', '--remotes'], { cwd: at.top, timeoutMs: 3_000 }).catch(() => undefined)
  return r?.exitCode === 0 ? Number(r.stdout.trim()) || 0 : 0
}

// The repository as the band draws it: HEAD's branch at once, however slow the status; the status's counts; what git
// is in the middle of; the worktree the session is in.
async function readGit($: EngineInterface) {
  const cwd = await $.session.cwd().catch(() => undefined)
  const at = cwd === undefined ? null : await repoOf($, cwd)
  if (at === null) {
    await update($, git, () => null)
    return
  }
  const [headText, ran, op, fetchedAt, now, prev] = await Promise.all([
    $.fs.read(`${at.gitDir}/HEAD`).catch(() => ''),
    statusOf($, at),
    opOf($, at.gitDir),
    fetchedAtOf($, at),
    $.clock.now(),
    read($, git),
  ])
  const head = headOf(headText)
  const status = ran?.status
  const next = gitOf({
    head,
    status,
    prev,
    op,
    isUntrackedLeftOut: ran?.isQuick ?? false,
    unpushed: status ? await unpushedOf($, at, status, op?.branch ?? head.branch ?? status.head) : 0,
    isFetchStale: fetchedAt > 0 && now - fetchedAt > FETCH_STALE_MS,
    worktree: at.gitDir === at.commonDir ? null : { name: clean(basename(at.top)), project: clean(projectOf(at.commonDir)) },
  })
  await update($, git, () => next)
  // Each branch has its own pull request.
  if (isPrStatus && next.branch !== prev?.branch) void refreshPr($)
}

// One status at a time: a refresh asked for while one runs makes it run once more when it ends.
function refreshGit($: EngineInterface): Promise<void> {
  if (gitRun) {
    isGitAgain = true
    return gitRun
  }
  gitRun = (async () => {
    do {
      isGitAgain = false
      await readGit($).catch(() => undefined)
    } while (isGitAgain)
  })().finally(() => {
    gitRun = undefined
  })
  return gitRun
}

// Edits come in bursts: the counts follow once one pauses.
const gitAfterEdits = ($: EngineInterface) => {
  gitSoon?.cancel()
  gitSoon = $.clock.after(EDIT_PAUSE_MS, () => void refreshGit($))
}

// Whether the band's git is due a read on the timer: the session's directory changed, or there is a repository, whose
// tree moves with no file of git's own to show for it (an edit nobody staged, in another terminal or an editor), so a
// status is its only check. Before git has answered once (out of time, or no git at all) a turn's end or a prompt asks
// again, not the clock. A folder found to be no repository is one once it has a `.git` (a `git init` elsewhere).
async function gitMoved($: EngineInterface) {
  if (known === undefined) return false
  const cwd = await $.session.cwd().catch(() => undefined)
  if (cwd === undefined) return false
  if (known.cwd !== cwd) return true
  if (known.repo === null) {
    if (!(await $.fs.exists(`${cwd}/.git`).catch(() => false))) return false
    known = undefined
    return true
  }
  return true
}

// What a command did to git: the commit or pull request Claude Code saw it make kept, and the band's git read again.
async function gitAfterBash($: EngineInterface, command: string, op: GitOperation | undefined) {
  if (op?.commit) {
    const { sha, kind, branch } = op.commit
    const at = await $.clock.now()
    await update($, commits, list => [...list, { sha: clean(sha), kind, ...(branch ? { branch: clean(branch) } : {}), at }].slice(-50))
  }
  if (op?.pr) {
    const change = op.pr
    // `gh pr create` pushes the branch it opens the pull request for, where it has not been pushed.
    const branch = op.push?.branch ?? (await read($, git))?.branch ?? null
    await update($, pr, prev => prOfOperation(change, branch, prev))
  }
  if (op === undefined && !/\bgit\b/.test(command)) return
  // A git command in a folder with no repository may have made one.
  if (known?.repo === null) known = undefined
  // Not awaited: the tool's result waits on this hook, and git in a big repo takes seconds.
  void refreshGit($).then(() => (op?.push || op?.pr ? refreshPr($) : undefined))
}

// With PR status on, the branch's pull request from GitHub's CLI: the mod's one use of the network.
function refreshPr($: EngineInterface): Promise<void> {
  if (!isPrStatus) return Promise.resolve()
  if (prRun) {
    isPrAgain = true
    return prRun
  }
  prRun = (async () => {
    do {
      isPrAgain = false
      const branch = (await read($, git))?.branch ?? null
      if (branch === null) return
      try {
        const argv = ['gh', 'pr', 'view', '--json', 'number,url,state,isDraft,reviewDecision,statusCheckRollup']
        const env = { GH_PROMPT_DISABLED: '1', GH_NO_UPDATE_NOTIFIER: '1', NO_COLOR: '1' }
        const r = await $.process.run(argv, { cwd: await $.session.cwd(), timeoutMs: 15_000, env })
        const found = r.exitCode === 0 ? parsePr(r.stdout, branch) : null
        // gh exits 1 for a branch with no pull request, as when it is not signed in: one Claude opened stays until gh names one.
        await update($, pr, prev => found ?? (prev?.branch === branch ? prev : null))
      } catch {
        // No gh, or out of time: the band keeps what it had.
      }
    } while (isPrAgain)
  })().finally(() => {
    prRun = undefined
  })
  return prRun
}

async function refreshAgents($: EngineInterface) {
  try {
    const all = await $.agent.list()
    await update($, agents, () => all.filter(a => AT_WORK.has(a.status)).map(a => clean(a.description)))
    // One that failed is named at rest until the person's next prompt; one the person stopped is no news.
    const seen = await read($, failures)
    const fresh = all.filter(a => a.status === 'failed' && !seen.some(f => f.id === a.id))
    if (fresh.length > 0) await update($, failures, list => [...list, ...fresh.map(a => ({ id: a.id, task: clean(a.description), isDismissed: false }))])
  } catch {
    await update($, agents, () => [])
  }
}

// `summary` counts the breakdown locally, with none of the token-count requests /context sends. It says where
// auto-compact starts, and with `isFull`, from 70% full, what takes the most of the context.
async function refreshBreakdown($: EngineInterface, isFull: boolean) {
  try {
    const { context } = await $.session.usage({ breakdown: 'summary' })
    const b = context.breakdown
    const threshold = b?.autoCompactThreshold
    if (b?.isAutoCompactEnabled === false) await update($, compaction, () => ({ at: null }))
    else if (threshold !== undefined && context.window > 0) await update($, compaction, () => ({ at: Math.min(100, (threshold / context.window) * 100) }))
    if (!isFull) return
    const top = (b?.categories ?? []).filter(c => c.kind === 'used').sort((x, y) => y.tokens - x.tokens)[0]
    await update($, eater, () => (top ? { name: clean(top.name), tokens: top.tokens } : null))
  } catch {
    if (isFull) await update($, eater, () => null)
  }
}

// A long run's summary comes last, past what reached the model: it is read from the output Claude Code kept whole.
async function outputOf($: EngineInterface, result: ToolCallResult, bash: BuiltinToolResults['Bash'] | undefined) {
  const path = bash?.persistedOutputPath
  if (path === undefined) return result.text ?? ''
  try {
    const { size } = await $.fs.stat(path)
    if (size <= OUTPUT_READ_BYTES) return await $.fs.read(path)
    // shortcut: past that size only its end is read, with `tail`, which a Windows host lacks: it reads the preview instead.
    const r = await $.process.run(['tail', '-c', String(OUTPUT_READ_BYTES), '--', path], { timeoutMs: 5_000 })
    return r.exitCode === 0 ? r.stdout : (result.text ?? '')
  } catch {
    return result.text ?? ''
  }
}

// Whether a file lies in the project: the repository's tree, else the session's root; where neither is known, it does.
async function isInProjectOf($: EngineInterface, path: string) {
  const cwd = await $.session.cwd().catch(() => undefined)
  const at = cwd === undefined ? null : await repoOf($, cwd)
  const root = at?.top ?? (await $.session.root().catch(() => undefined))
  return root === undefined || isUnder(path, root)
}

// The files Claude edited this session, as a line the model reads and a report drawn under it.
async function filesReport($: EngineInterface) {
  const [list, commitsNow, prNow, gitNow, now] = await Promise.all([read($, files), read($, commits), read($, pr), read($, git), $.clock.now()])
  const cwd = await $.session.cwd().catch(() => undefined)
  const at = cwd === undefined ? null : await repoOf($, cwd)
  const root = at?.top ?? (await $.session.root().catch(() => cwd ?? ''))
  // Each file as git has it now, from a status of its own: the band keeps counts, not paths.
  const status = at ? (await statusOf($, at, true))?.status : undefined
  const home = (await $.env.get('HOME').catch(() => undefined)) ?? (await $.env.get('USERPROFILE').catch(() => undefined)) ?? null
  const report: FilesReport = { root, home, files: list, paths: status?.paths ?? null, commits: commitsNow, pr: prNow && prNow.branch === gitNow?.branch ? prNow : null }
  useSymbols(await read($, ascii))
  const text = filesLine(report, clockTime(now))
  await update($, reports, r => ({ ...Object.fromEntries(Object.entries(r).slice(-7)), [text]: report }))
  return { text }
}

// Whether the band draws ASCII marks: as the `symbols` option says, else as the terminal's environment does. Each name
// is spelled in a call of its own: the host reads the names from this module, and one it did not find is refused.
async function needsAscii($: EngineInterface) {
  if (symbolMode === 'ascii') return true
  if (symbolMode === 'unicode') return false
  const [OS, TERM, TERM_PROGRAM, WT_SESSION, TERMINUS_SUBLIME, ConEmuTask, TERMINAL_EMULATOR] = await Promise.all([
    $.env.get('OS').catch(() => undefined),
    $.env.get('TERM').catch(() => undefined),
    $.env.get('TERM_PROGRAM').catch(() => undefined),
    $.env.get('WT_SESSION').catch(() => undefined),
    $.env.get('TERMINUS_SUBLIME').catch(() => undefined),
    $.env.get('ConEmuTask').catch(() => undefined),
    $.env.get('TERMINAL_EMULATOR').catch(() => undefined),
  ])
  return !isUnicodeTerminal({ OS, TERM, TERM_PROGRAM, WT_SESSION, TERMINUS_SUBLIME, ConEmuTask, TERMINAL_EMULATOR })
}

const agentOf = (e: object) => (e as { agentId?: string }).agentId

// Runs as Text, a run with an address as a link around its Text.
const runsOf = (ui: Pick<Elements['terminal'], 'Text' | 'Link'>, runs: readonly Run[], key: string) => {
  const { Text, Link } = ui
  return runs.map((r, i) => {
    const text = (
      <Text key={`${key}${i}`} color={r.color} backgroundColor={r.bg} dimColor={r.dim} bold={r.bold}>
        {r.text}
      </Text>
    )
    return r.href ? (
      <Link key={`${key}${i}`} href={r.href}>
        {text}
      </Link>
    ) : (
      text
    )
  })
}

// The band, for whichever site holds it: under the prompt after the hint line, or above the prompt.
async function band($: EngineInterface, ui: Elements['terminal'], site: Site) {
  const hasCat = !isCompact && site.columns >= MIN_COLUMNS && site.isTall
  if (hasCat) bandId = site.requestId
  else park()

  const [
    name, m, say, meterNow, effortNow, model, cwd, now, minuteNow, act, gitNow, testsNow, filesNow, eaterNow, agentsNow, editedAtNow,
    compactionNow, prNow, failuresNow, isAscii,
  ] = await Promise.all([
    read($, themeName),
    read($, mood),
    read($, quip),
    read($, meter),
    read($, effort),
    $.session.model(),
    $.session.cwd(),
    $.clock.now(),
    read($, minute),
    read($, activity),
    read($, git),
    read($, tests),
    read($, files),
    read($, eater),
    read($, agents),
    read($, editedAt),
    read($, compaction),
    read($, pr),
    read($, failures),
    read($, ascii),
  ])
  theme = themeOf(name)
  useSymbols(isAscii)
  const shownMood = shown(m, isHot(meterNow))
  if (hasCat) {
    lastBlit = cellsAt(shownMood, idx)
    if (!animation) animate($)
  }

  const { Box, Text, Raster } = ui
  // The room a row has: beside the sprite, or the band's whole width.
  const columns = hasCat ? site.columns - WIDTH - 1 : site.columns
  // A row fitted to its room: what keeps least goes first, whole, rather than the row's end being cut.
  const row = (segments: readonly Segment[], key: string) => (
    <Text key={key} wrap="truncate-end">
      {fit(segments, columns).flatMap((s, i) => [
        ...(i > 0 && s.sep
          ? [
              <Text key={`${s.key}-sep`} dimColor={!s.sep.includes(sym.bar)} color={s.sep.includes(sym.bar) ? theme.accent : undefined}>
                {s.sep}
              </Text>,
            ]
          : []),
        <Text key={s.key}>{runsOf(ui, s.runs, s.key)}</Text>,
      ])}
    </Text>
  )

  // At rest the quip line says what needs you, failing tests first; a joke only when nothing does.
  const failed = failuresNow.filter(f => !f.isDismissed)
  const trouble = gitNow ? gitTrouble(gitNow) : ''
  const needs =
    !say && (m === 'idle' || m === 'asleep')
      ? [
          ...(testsNow && testsNow.failed > 0 ? [`${sym.fail} ${testsNow.failed} tests failed ${sym.dot} ${duration(now - testsNow.at)} ago`] : []),
          // A rebase or merge stopped halfway, and its conflicts.
          ...(trouble ? [`${sym.branch} ${trouble}`] : []),
          ...(failed.length > 0 ? [`${sym.fail} ${failed.length === 1 ? 'agent' : `${failed.length} agents`} failed: ${failed.at(-1)!.task}`] : []),
          ...(agentsNow.length > 0 ? [`${sym.agent} ${agentsNow.length} agent${agentsNow.length === 1 ? '' : 's'}: ${agentsNow.at(-1)}`] : []),
        ]
      : []
  const running = act.running.at(-1)
  // A tool past a minute says how long it has run, so one that hangs shows.
  const ranFor = running ? now - running.startedAt : 0
  const line =
    say ||
    (shownMood === 'working' && running
      ? fill(verbOf(theme.verbs, running.name), running.target) + (ranFor >= 60_000 ? ` ${sym.dot} ${duration(ranFor)}` : '')
      : needs.join(` ${sym.dot} `) || pick(theme.quips[shownMood], minuteNow))
  // A need is drawn plain, to stand out from the dim jokes.
  const quipLine = (
    <Text italic={needs.length === 0} dimColor={needs.length === 0}>
      {line}
    </Text>
  )

  const pct = Math.round(meterNow?.contextPercent ?? 0)
  // Where auto-compact starts, as the context breakdown last said: null once it said auto-compact is off.
  const compactAt = compactionNow === null ? COMPACT_AT : compactionNow.at
  // `┊` marks where auto-compact starts.
  const contextGauge = gaugeRuns('ctx', pct, contextAlert(pct), theme.accent, compactAt ?? undefined)
  // From 70% full, what takes the most of the context, as the last turn end counted it.
  const eaterNote: Run = { text: pct >= CONTEXT_WARN && eaterNow ? ` ${sym.dot} ${eaterNow.name} ${Math.round(eaterNow.tokens / 1_000)}k` : '', dim: true }

  // The plan windows share a row: the first with its reset, the others beside it, each a gauge of its own once it warns.
  const limits = meterNow?.limits ?? []
  const plan = planSegments(limits, now, theme.accent)

  const level = effortNow ? ` | ${[effortMark(effortNow), effortNow].filter(Boolean).join(' ')}` : ''
  const chip: Segment = { key: 'chip', keep: Infinity, runs: [{ text: ` ${prettyModel(model)}${level} `, bg: theme.accent, color: theme.onAccent, bold: true }] }
  // In a linked worktree the folder is the worktree's own: the project it belongs to says more, its name after.
  const place: Segment[] = gitNow?.worktree
    ? [
        { key: 'folder', sep: ' ', keep: 80, runs: [{ text: gitNow.worktree.project }] },
        { key: 'worktree', sep: ' ', keep: 40, runs: [{ text: `${sym.worktree} ${gitNow.worktree.name}`, dim: true }] },
      ]
    : [{ key: 'folder', sep: ' ', keep: 80, runs: [{ text: clean(cwd.split(/[\\/]/).pop() || cwd) }] }]
  const cost = costOf(meterNow, costMode)
  const spent: Segment[] = [
    { key: 'time', sep: ` ${sym.dot} `, keep: 45, runs: [{ text: meterNow ? duration(now - meterNow.startedAt) : '0m', dim: true }] },
    ...(cost ? [{ key: 'cost', sep: ` ${sym.dot} `, keep: 35, runs: [{ text: cost, dim: true }] }] : []),
  ]
  const branch = gitNow ? branchSegments(gitNow) : []
  // What changed: the tree, the files Claude edited, the last test run, the branch's pull request.
  const tree = gitNow ? treeSegments(gitNow) : []
  const work: Segment[] = [
    ...fileSegments(filesNow),
    ...(testsNow ? [testSegment(testsNow, editedAtNow, now)] : []),
    // A pull request is its branch's: a switch to another hides it.
    ...(prNow && gitNow && prNow.branch === gitNow.branch ? [prSegment(prNow)] : []),
  ]

  const changes = [...tree, ...work]

  // Two lines: compact's stats alone, or, with no room for the sprite, its text face and the quip over the gauges.
  if (!hasCat) {
    const gauges: Run[] = [
      ...contextGauge,
      ...limits.flatMap(l => [{ text: '  ' }, ...gaugeRuns(limitLabel(l.kind), l.percentUsed, quotaAlert(l.percentUsed), theme.accent)]),
    ]
    return (
      <Box flexDirection="column">
        {isCompact ? (
          row([chip, ...place, ...branch, ...spent, ...changes], 'top')
        ) : (
          <Text wrap="truncate-end">
            {runsOf(ui, chip.runs, 'chip')}
            <Text> {sym.isAscii ? asciiFace(theme.faces[shownMood]) : theme.faces[shownMood]} </Text>
            {quipLine}
          </Text>
        )}
        <Text wrap="truncate-end">{runsOf(ui, gauges, 'gauge')}</Text>
      </Box>
    )
  }

  // The repository takes two rows, what git holds and what Claude did; the column grows by one for it.
  const gitRow = [...(gitNow ? branchSegments(gitNow, BRANCH_CLUSTER) : []), ...tree]
  // The status column is held to the sprite's rows, the quip on the last, so no row moves as others come and go.
  return (
    <Box flexDirection="row" columnGap={1}>
      <Raster key="cat" columns={WIDTH} rows={ROWS} cells={cellsAt(shownMood, idx)} />
      <Box flexDirection="column" height={gitNow ? ROWS + 1 : ROWS} justifyContent="space-between">
        <Box flexDirection="column">
          {row([chip, ...place, ...spent], 'top')}
          <Text wrap="truncate-end">{runsOf(ui, [...contextGauge, eaterNote], 'ctx')}</Text>
          {plan.length > 0 ? row(plan, 'plan') : null}
          {gitRow.length > 0 ? row(gitRow, 'repo') : null}
          {work.length > 0 ? row(work, 'work') : null}
        </Box>
        <Text wrap="truncate-end">
          <Text color={MOOD_COLOR[shownMood] ?? theme.accent}>{`${sym.quip} `}</Text>
          {quipLine}
        </Text>
      </Box>
    </Box>
  )
}

export const register: Register = (on, options) => {
  isFlavored = options.flavorText !== false
  isSounding = options.sounds === true
  costMode = String(options.cost ?? 'auto')
  isCompact = options.layout === 'compact'
  isPrStatus = options.prStatus === true
  symbolMode = String(options.symbols ?? 'auto')
  // A fresh load draws the Unicode marks until session.start has asked the terminal.
  useSymbols(false)

  on('session.start', async ($, e, next) => {
    // The theme lives in /config: a change there reloads the mod, and this runs again with it.
    const configured = String(options.theme ?? DEFAULT_THEME)
    await update($, themeName, () => configured)
    theme = themeOf(configured)
    const isAscii = await needsAscii($)
    await update($, ascii, () => isAscii)

    // A usage that fails to read leaves the meter for session.measure: the rest of the setup must still run.
    const usage = await $.session.usage().catch(() => undefined)
    const m = usage ? toMeter(usage, usage.startedAt) : null
    hot = isHot(m)
    current = await read($, mood)
    lastActive = await $.clock.now()
    await update($, meter, () => m)
    // Not awaited: the first prompt waits on session.start, and git in a big repo takes seconds.
    void refreshGit($)
    // Where auto-compact starts, counted locally; from 70% full each turn's end counts it again.
    void refreshBreakdown($, false)

    $.clock.every(60_000, async () => {
      await update($, minute, n => n + 1)
      const now = await $.clock.now()
      if (current === 'idle' && now - lastActive > SLEEP_AFTER_MS) await setMood($, 'asleep')
      if (isPrStatus && now - lastActive < PR_AWAY_MS) {
        const [minutes, prNow] = await Promise.all([read($, minute), read($, pr)])
        // Checks running are read every minute: one about to pass should not wait five.
        if (minutes % PR_EVERY_MINUTES === 0 || (prNow?.checks?.pending ?? 0) > 0) void refreshPr($)
      }
    })

    $.clock.every(AGENTS_EVERY_MS, async () => {
      if ((await read($, agents)).length > 0) void refreshAgents($)
    })

    $.clock.every(GIT_EVERY_MS, async () => {
      // A status still running is not asked for again: a slow repository would have them queue up.
      if (!gitRun && (await gitMoved($))) void refreshGit($)
    })

    const themes = Object.keys(THEMES).join('|')
    await $.command.register({ name: 'awesome-hud', description: `Switch the theme: /awesome-hud ${themes}; or list the files Claude edited: /awesome-hud files` })

    return next(e)
  })

  on('command.run', { command: 'awesome-hud' }, async ($, e) => {
    const name = e.args.trim().toLowerCase()
    if (name === 'files') return filesReport($)
    if (name) {
      if (!isTheme(name)) return { text: `No theme "${name}". Themes: ${Object.keys(THEMES).join(', ')}.` }
      theme = themeOf(name)
      lastBlit = undefined
      await update($, themeName, () => name)
      animate($)
      blit($)
      const saved = await $.config.set({ key: 'awesome-hud.theme', value: name })
      return { text: saved.deny === undefined ? `Theme: ${name}` : `Theme: ${name}, for this session only: ${saved.deny}` }
    }
    const list = Object.entries(THEMES).map(([key, t]) => `${key}: ${t.description}`)
    return { text: `${list.join('\n')}\n\n/awesome-hud <theme> switches, and keeps the choice in /config. /awesome-hud files lists the files Claude edited.` }
  })

  // `/effort <level>` takes hold at the next request; the chip need not wait for `turn.step` to read it.
  on('command.run', { command: 'effort' }, async ($, e, next) => {
    const result = await next(e)
    const level = e.args.trim().toLowerCase()
    if (EFFORT_LEVELS.includes(level) && level !== lastEffort) {
      lastEffort = level
      await update($, effort, () => level)
    }
    return result
  }).catch(($, e, next) => next(e))

  on('session.measure', async ($, e, next) => {
    const prev = await read($, meter)
    const now = await $.clock.now()
    const m = toMeter(e, prev?.startedAt ?? now)
    hot = isHot(m)
    await update($, meter, () => m)
    const percent = m.contextPercent ?? 0
    if (percent >= CONTEXT_CRIT && !isCompactWarned) {
      isCompactWarned = true
      $.ui.toast(theme.compactNudge, { timeoutMs: 8_000 })
    } else if (percent < CONTEXT_CRIT - 15) isCompactWarned = false
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    // A cleared conversation starts its clock and context again; the last test run and the PR are the code's, and stay.
    if (e.reason === 'clear') {
      const now = await $.clock.now()
      await Promise.all([
        update($, meter, m => (m ? { ...m, startedAt: now } : m)),
        update($, eater, () => null),
        update($, turnNotes, () => ({})),
        update($, activity, () => ({ running: [] })),
        update($, files, () => []),
        update($, commits, () => []),
        update($, failures, () => []),
        update($, reports, () => ({})),
      ])
      isCompactWarned = false
    }
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    await touch($)
    if (/^\s*pspsps+\s*$/i.test(e.text)) await celebrate($, 'summoned')
    // The person is back: git may have moved meanwhile, and what failed has been seen.
    void refreshGit($)
    if ((await read($, failures)).some(f => !f.isDismissed)) await update($, failures, list => list.map(f => ({ ...f, isDismissed: true })))
    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.start', async ($, e, next) => {
    if (agentOf(e) === undefined) {
      isTurning = true
      turnSeed += 1
      turnErrors = 0
      turnParty = false
      await touch($)
      await setMood($, 'working')
    }
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    const level = e.effort === undefined ? undefined : String(e.effort)
    if (agentOf(e) === undefined && level !== lastEffort) {
      lastEffort = level
      await update($, effort, () => level ?? null)
    }
    return yield* next(e)
  })

  on('tool.check', async ($, e, next) => {
    const result = await next(e)
    // A question asks through the permission check too; tool.call already played its sound.
    if (result.decision === 'ask' && agentOf(e) === undefined && e.tool !== 'AskUserQuestion') {
      sound($, 'waiting')
      await setMood($, 'waiting')
    }
    return result
  }).catch(($, e, next) => next(e))

  // Every loop's tools: a subagent's test run is the code's last run too. The mood, sounds and parties are the main loop's.
  on('tool.call', async ($, e, next) => {
    const isMain = agentOf(e) === undefined
    let id: string | undefined
    if (isMain) {
      await touch($)
      const asks = e.tool === 'AskUserQuestion'
      if (asks) sound($, 'waiting')
      await setMood($, asks ? 'waiting' : 'working')
      const startedAt = await $.clock.now()
      id = `${e.tool}:${startedAt}:${Math.random()}`
      const entry = { id, name: shortTool(e.tool), target: targetOf(e as unknown as Record<string, unknown>), startedAt }
      await update($, activity, a => ({ running: [...a.running, entry] }))
    }
    const result = await next(e).finally(() => (id === undefined ? undefined : update($, activity, a => ({ running: a.running.filter(r => r.id !== id) }))))
    // A background agent has started by now, a foreground one ended.
    if (e.tool === 'Agent') void refreshAgents($)
    if (e.tool === 'EnterWorktree' || e.tool === 'ExitWorktree') void refreshGit($)

    // A failed command's record is a string; one that ran has the fields below.
    const bash = e.tool === 'Bash' && typeof result.result === 'object' && result.result !== null ? (result.result as BuiltinToolResults['Bash']) : undefined
    // A command refused, sent to the background or interrupted has not ended: what it printed so far proves nothing.
    const hasEnded = result.deny === undefined && !bash?.interrupted && bash?.backgroundTaskId === undefined
    const run = e.tool === 'Bash' && hasEnded && isTestCommand(e.command) ? testsOf(e.command, await outputOf($, result, bash)) : undefined
    if (run && e.tool === 'Bash') {
      const at = await $.clock.now()
      const command = commandKey(e.command)
      // The same command's counts the run before, for the trend: `✗ 2 failed (was 5)`.
      await update($, tests, prev => ({ ...run, at, command, ...(prev?.command === command ? { was: { passed: prev.passed, failed: prev.failed } } : {}) }))
    }
    if (e.tool === 'Bash' && hasEnded) await gitAfterBash($, e.command, bash?.gitOperation)
    if (!isMain) return result

    // A search that found nothing exits 1 and is no failure.
    const isFailed = result.isError === true && !(e.tool === 'Bash' && isMiss(e.command, result.text))
    if (isFailed || (run?.failed ?? 0) > 0) {
      turnErrors += 1
      // One error sound a turn, however many tools fail in it.
      if (turnErrors === 1) sound($, 'error')
      await setMood($, 'error', { backMs: 3_000 })
    } else if (e.tool === 'Bash' && hasEnded) {
      const cause = partyOf(e.command, bash?.gitOperation)
      // Tests party on a summary that says they passed, not on an exit code: `npm test | tail` exits 0 either way.
      if (cause && (cause !== 'tests' || run)) await celebrate($, cause)
      else await setMood($, 'working')
    } else await setMood($, 'working')
    return result
  }).catch(($, e, next) => next(e))

  // Every file an edit tool wrote, a subagent's too, with the lines it added and removed: the band's ✎.
  on('tool.call', { tool: ['Edit', 'Write', 'NotebookEdit'] }, async ($, e, next) => {
    const result = await next(e)
    // An edit held for review left the file as it was.
    const isHeld = typeof result.result === 'object' && result.result !== null && (result.result as { staged?: boolean }).staged === true
    if (result.deny !== undefined || result.isError === true || isHeld) return result
    const file = e.tool === 'NotebookEdit' ? e.notebook_path : e.file_path
    const [at, isInProject] = await Promise.all([$.clock.now(), isInProjectOf($, file)])
    await update($, files, list => recordEdit(list, file, editLines(e.tool, result.result), at, isInProject))
    // A file outside the project (Claude's memory, a scratch file) is no change to the code: it ages no test run.
    if (isInProject) {
      await update($, editedAt, () => at)
      gitAfterEdits($)
    }
    return result
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    if (agentOf(e) === undefined) {
      isTurning = false
      const m = await read($, meter)
      const note: TurnNote = { errors: turnErrors, isParty: turnParty }
      // Keyed `d<ms>`: a bare number key would sort by size, and the trim would keep the longest turns, not the latest.
      await update($, turnNotes, notes => ({ ...Object.fromEntries(Object.entries(notes).slice(-4)), [`d${e.durationMs}`]: note }))
      // A party already played its sound; an interruption is the person's own doing and plays none.
      if (e.reason === 'answer' && !turnParty && e.durationMs >= LONG_TURN_MS) sound($, 'done')
      else if ((e.reason === 'error' || e.reason === 'refusal') && turnErrors === 0) sound($, 'error')
      if (e.reason === 'answer') await setMood($, turnParty ? 'party' : 'done', { backMs: turnParty ? 4_000 : 6_000 })
      else if (e.reason === 'aborted') await setMood($, 'idle')
      else await setMood($, 'error', { backMs: 4_000 })
      // Not awaited: Claude Code waits on this hook, and git in a big repo takes seconds.
      void refreshGit($)
      // The breakdown is work, so it is counted here alone, and only once the context is 70% full.
      if ((m?.contextPercent ?? 0) >= CONTEXT_WARN) void refreshBreakdown($, true)
      else await update($, eater, () => null)
    }
    const result = await next(e)
    // An agent's turn, or the main loop's, can end the work of one.
    void refreshAgents($)
    return result
  })

  // Claude Code moved the session's folder (a worktree entered or left, /cd): its repository may be another.
  on('classic.CwdChanged', async ($, e, next) => {
    void refreshGit($)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    // On the desktop the word is the step the row is on (`Creating notes.md`), not one to theme.
    if (!isFlavored || e.props.message !== null || e.surface !== 'terminal') return next(e)
    const t = themeOf(await read($, themeName))
    return next({ ...e, props: { ...e.props, word: pick(t.spinner[e.props.mode], turnSeed + e.props.mode.length) } })
  })

  on('ui.render', { component: 'CommandOutput', props: { command: 'awesome-hud' } }, async ($, e, next) => {
    const name = e.props.args.trim().toLowerCase()
    if (e.props.isErrored) return next(e)
    const elements = $.ui.resolve(e)
    const { Box, Text } = elements
    // The files report draws under its line, from what the run saw; the model read the line alone.
    if (name === 'files') {
      const report = (await read($, reports))[e.props.text]
      if (report === undefined) return next(e)
      useSymbols(await read($, ascii))
      return (
        <Box flexDirection="column">
          {await next(e)}
          <Box flexDirection="column" paddingLeft={2}>
            {reportRows(report).map((runs, i) => (
              <Text key={`row${i}`} wrap="truncate-end">
                {runsOf(elements, runs, `row${i}-`)}
              </Text>
            ))}
          </Box>
        </Box>
      )
    }
    // A theme switched to draws its mascot at twice the size under the command's line, where a terminal can; the
    // model reads only the line.
    if (!isTheme(name) || e.surface !== 'terminal') return next(e)
    const t = themeOf(name)
    const { Raster } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        {await next(e)}
        <Box paddingLeft={5}>
          <Raster key="portrait" columns={WIDTH * 2} rows={HEIGHT} cells={encode(twice(t.moods.idle[0]!.px), t.palette)} />
        </Box>
      </Box>
    )
  })

  on('ui.render', { component: 'TurnDuration' }, async ($, e, next) => {
    if (!isFlavored) return next(e)
    const t = themeOf(await read($, themeName))
    const notes = await read($, turnNotes)
    // The note saved under this duration, else the nearest within a second: two saved turns can be that close in length.
    const gap = (k: string) => Math.abs(Number(k.slice(1)) - e.props.durationMs)
    const key = Object.keys(notes).filter(k => gap(k) < 1_000).sort((a, b) => gap(a) - gap(b))[0]
    const note = key === undefined ? undefined : notes[key]
    const word = note?.isParty ? t.turn.party : note?.errors ? t.turn.errors(note.errors) : pick(t.turn.plain, e.props.durationMs)
    return next({ ...e, props: { ...e.props, word } })
  })

  // The `position` option: under the prompt after Claude Code's hint line, or above it.
  const isBelow = options.position !== 'above'

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (isBelow || e.surface !== 'terminal') return next(e)
    // A survey takes the band, and the sprite with it.
    if (e.props.hasSurvey) {
      park()
      return next(e)
    }
    return band($, $.ui.resolve(e), { requestId: e.requestId, columns: e.props.bodyColumns, isTall: e.props.maxRows >= MIN_ROWS })
  })

  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    if (!isBelow || e.surface !== 'terminal') return next(e)
    const ui = $.ui.resolve(e)
    const { Box } = ui
    // The hint line indents its rows by two cells.
    const site = { requestId: e.requestId, columns: (e.viewport?.columns ?? 0) - 2, isTall: (e.viewport?.rows ?? 0) >= BELOW_MIN_TERMINAL_ROWS }
    return (
      <Box flexDirection="column">
        {await next(e)}
        {await band($, ui, site)}
      </Box>
    )
  })
}
