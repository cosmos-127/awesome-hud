import type { On, ToolCallResult } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import type { Git } from '../types'
import {
  branchSegments, cells, costOf, fit, gauge, headOf, isMiss, limitLabel, middle, parseStatus, partyOf, prettyModel, resetTime, shortTool, targetOf, testSegment, testsOf, treeSegments,
  turnsLeft,
} from './format'
import type { Segment } from './format'
import { HEIGHT, WIDTH } from './sprite'
import { THEMES } from './themes'

const BAND = { plugin: 'awesome-hud', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 100, scroll: { offset: 0, bodyRows: 20 }, view: {} } } as const

// The hint line under the prompt, where the band goes by default, in a 105 x 40 terminal.
const HINT = { plugin: 'awesome-hud', component: 'PromptHint', surface: 'terminal', props: { isDraft: false, isWorking: false, hint: '? for shortcuts' }, viewport: { columns: 105, rows: 40 } } as const

// The engine's own hint line, beneath the plugin.
const hintLine = (on: On) =>
  on('ui.render', { component: 'PromptHint' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>{e.props.hint}</Text>
  })

const SPINNER = { plugin: 'awesome-hud', component: 'Spinner', surface: 'terminal', props: { word: 'Sauteing', message: null, suffix: '…', mode: 'thinking' } } as const

const textOf = (node: unknown): string =>
  typeof node === 'string' ? node : ((node as { children?: unknown[] }).children ?? []).map(textOf).join('')

// A row of segments as it reads once fitted: each one's separator, then its runs.
const rowText = (segments: Segment[]) => segments.map((s, i) => (i > 0 ? (s.sep ?? '') : '') + s.runs.map(r => r.text).join('')).join('')

// A turn long enough for the done sound.
const ANSWERED = { answer: 'ok', durationMs: 40_000, isAborted: false, turnId: 't1', reason: 'answer' } as const

// `git status --porcelain=v2 --branch --show-stash -z`: each record ends in NUL.
const z = (...records: string[]) => records.map(r => `${r}\0`).join('')
const STATUS = (head: string, ...more: string[]) => z(`# branch.oid ${'a'.repeat(40)}`, `# branch.head ${head}`, ...more)

type RepoMock = {
  gitDir?: string
  top?: string
  /** What `git status` prints; a function to change it between calls, undefined from it running out of time. */
  status?: string | (() => string | undefined)
  /** The git dir's files, by path; HEAD names main unless given. Changes to it reach later reads. */
  files?: Record<string, string>
  /** Modification times by path, for the files git writes. */
  times?: Record<string, number>
  /** What `gh pr view` prints; a function for an answer that comes later. */
  gh?: string | (() => Promise<string>)
  env?: Record<string, string>
  /** False while the folder is no repository yet: rev-parse fails. */
  isRepo?: () => boolean
}

// `a/b/../c` as `a/c`.
const resolved = (path: string) =>
  path.split('/').reduce<string[]>((parts, p) => (p === '..' ? parts.slice(0, -1) : p === '.' ? parts : [...parts, p]), []).join('/')

// A Linux host with pw-play: records what it plays and every command it runs. Given `repo`, the session's folder is
// in a git repository: git answers from it, and the files of its git dir are `repo.files`.
const linuxHost = (on: On, repo?: RepoMock) => {
  const played: string[][] = []
  const ran: string[][] = []
  const out = (stdout: string, exitCode = 0) => ({ value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })
  on('env.get', ($, e) => ({ value: repo?.env?.[e.name] }))
  on('process.run', ($, e) => {
    ran.push([...e.argv])
    if (e.argv[0] === 'uname') return out('Linux\n')
    if (e.argv[0] === 'git' && repo) {
      if (e.argv.includes('rev-parse') && repo.isRepo?.() === false) return out('', 128)
      if (e.argv.includes('rev-parse')) return out(`${repo.gitDir ?? '/p/.git'}\n${repo.top ?? '/p'}\n`)
      if (e.argv.includes('status')) {
        const status = typeof repo.status === 'function' ? repo.status() : (repo.status ?? STATUS('main'))
        return status === undefined ? { deny: 'timed out' } : out(status)
      }
      if (e.argv.includes('rev-list')) return out('0\n')
    }
    if (e.argv[0] === 'gh' && repo?.gh !== undefined) return typeof repo.gh === 'string' ? out(repo.gh) : repo.gh().then(stdout => out(stdout))
    if (e.argv[0] !== 'pw-play') return out('', 128)
    if (e.argv[1] !== '--version') played.push([...e.argv])
    return out('')
  })
  if (repo) {
    const files = (repo.files ??= {})
    files[`${repo.gitDir ?? '/p/.git'}/HEAD`] ??= 'ref: refs/heads/main\n'
    const times = repo.times ?? {}
    const isDir = (path: string) => Object.keys(files).some(p => p.startsWith(`${path}/`))
    on('fs.read', ($, e) => (e.path in files ? { value: files[e.path]! } : { deny: 'ENOENT' }))
    on('fs.exists', ($, e) => ({ value: e.path in files || isDir(e.path) }))
    on('fs.list', ($, e) => ({
      value: [...new Set(Object.keys(files).filter(p => p.startsWith(`${e.path}/`)).map(p => p.slice(e.path.length + 1).split('/')[0]!))].map(name => ({
        name,
        kind: 'file' as const,
        size: 0,
        mtimeMs: 0,
        isLink: false,
      })),
    }))
    on('fs.stat', ($, e) => {
      if (e.resolve) return { value: { kind: 'dir', size: 0, mtimeMs: 0, isLink: false, realPath: resolved(e.path) } }
      if (!(e.path in files) && times[e.path] === undefined) return { deny: 'ENOENT' }
      return { value: { kind: 'file', size: files[e.path]?.length ?? 0, mtimeMs: times[e.path] ?? 1, isLink: false } }
    })
  }
  on('turn.complete', () => ({ text: '' }))
  return { played, ran }
}

// What a band under the prompt needs from the engine: the hint line, the model, the folder, the sprite's repaints.
const bandHost = (on: On, cwd = '/home/me/project') => {
  hintLine(on)
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.cwd', () => ({ value: cwd }))
  on('ui.blit', () => ({ value: {} }))
}

const patchOf = (lines: string[]): ToolCallResult => ({ result: { structuredPatch: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines }] } })
const created = (content: string): ToolCallResult => ({ result: { type: 'create', content, structuredPatch: [] } })
const ranBash = (stdout: string, more: object = {}): ToolCallResult => ({ result: { stdout, stderr: '', interrupted: false, ...more }, text: stdout })

const GIT: Git = {
  branch: 'main',
  oid: 'a'.repeat(40),
  op: null,
  upstream: 'tracking',
  ahead: 0,
  behind: 0,
  isFetchStale: false,
  staged: 0,
  unstaged: 0,
  untracked: 0,
  conflicts: 0,
  stashes: 0,
  worktree: null,
  isStale: false,
}

test('every frame of every theme is a full grid of known pixels', async () => {
  for (const theme of Object.values(THEMES)) {
    for (const frames of Object.values(theme.moods)) {
      for (const f of frames) {
        expect(f.px.length).toBe(HEIGHT)
        expect(f.ms).toBeGreaterThan(0)
        for (const row of f.px) {
          expect(row.length).toBe(WIDTH)
          for (const p of row) expect(p === '.' || p in theme.palette).toBe(true)
        }
      }
    }
  }
})

test('at rest every theme draws beside its face, so no gap opens between the mascot and the stats', async () => {
  for (const t of Object.values(THEMES)) expect(t.moods.idle[0]!.px.some(row => /[^.]/.test(row.slice(14)))).toBe(true)
})

test('every theme has a sound for every event, and none is named files', async () => {
  for (const [name, t] of Object.entries(THEMES)) {
    expect(Object.keys(t.sounds).sort()).toEqual(['done', 'error', 'party', 'waiting'])
    for (const path of Object.values(t.sounds)) expect(path).toMatch(new RegExp(`^sounds/${name}/[a-z]+\\.wav$`))
  }
  // `/awesome-hud files` takes the name.
  expect(Object.hasOwn(THEMES, 'files')).toBe(false)
})

test("a long turn answered plays the theme's done sound through the Linux host's player", async ($, on) => {
  const clock = mock.clock(on)
  const { played } = linuxHost(on)
  await $.turn.complete(ANSWERED)
  await clock.advance(0)
  expect(played).toHaveLength(1)
  expect(played[0]![0]).toBe('pw-play')
  expect(played[0]![1]).toMatch(/\/sounds\/cat\/done\.wav$/)
})

test('one error sound a turn, and none for a party turn, a quick turn or an interrupt; waiting on an ask', async ($, on) => {
  const clock = mock.clock(on)
  const { played } = linuxHost(on)
  on('session.cwd', () => ({ value: '/home/me/project' }))
  on('ui.toast', () => ({ value: undefined }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('tool.check', () => ({ decision: 'ask' }))
  const failed: ToolCallResult = { isError: true, result: 'Exit code 1', text: 'Exit code 1' }
  const answers: ToolCallResult[] = [failed, failed, { result: { stdout: '', stderr: '', interrupted: false }, text: ' 3 pass\n 0 fail' }, { result: {} }]
  on('tool.call', () => answers.shift()!)
  const heard = async () => {
    await clock.advance(0)
    return played.splice(0).map(argv => /(\w+)\.wav$/.exec(argv[1]!)?.[1])
  }

  await $.turn.start({ text: 'a', turnId: 't1' })
  await $.tool.call({ tool: 'Bash', command: 'false' })
  await $.tool.call({ tool: 'Bash', command: 'false' })
  await $.turn.complete({ ...ANSWERED, reason: 'error' })
  expect(await heard()).toEqual(['error'])

  await $.turn.start({ text: 'b', turnId: 't2' })
  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  await $.turn.complete({ ...ANSWERED, turnId: 't2' })
  expect(await heard()).toEqual(['party'])

  await $.turn.start({ text: 'c', turnId: 't3' })
  await $.turn.complete({ ...ANSWERED, turnId: 't3', durationMs: 5_000 })
  await $.turn.start({ text: 'd', turnId: 't4' })
  await $.turn.complete({ ...ANSWERED, turnId: 't4', reason: 'aborted', isAborted: true })
  expect(await heard()).toEqual([])

  await $.tool.check({ tool: 'Bash', input: { command: 'rm -rf build' } })
  const question = { question: 'Which?', header: 'Pick', options: [{ label: 'a', description: 'A' }, { label: 'b', description: 'B' }], multiSelect: false }
  await $.tool.call({ tool: 'AskUserQuestion', questions: [question] })
  // The question's own permission check plays no second sound.
  await $.tool.check({ tool: 'AskUserQuestion', input: { questions: [question] } })
  expect(await heard()).toEqual(['waiting', 'waiting'])
})

test('at rest the quip line names failing tests and the agents at work instead of a joke', async ($, on) => {
  const clock = mock.clock(on)
  linuxHost(on)
  bandHost(on)
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('tool.call', () => ({ result: { stdout: '', stderr: '', interrupted: false }, text: 'Tests:  2 failed, 10 passed, 12 total' }))
  const agent = { type: 'general-purpose', status: 'running' } as const
  on('agent.list', () => ({ value: [{ ...agent, id: 'a1', description: 'old task', status: 'completed' }, { ...agent, id: 'a2', description: 'refactor auth' }] }))
  await $.turn.start({ text: 'a', turnId: 't1' })
  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  await $.turn.complete(ANSWERED)
  // Past the done mood's few seconds.
  await clock.advance(10_000)
  const band = await $.ui.mount(HINT)
  expect(await band.find({ type: 'Text', text: /^✗ 2 tests failed · 0m ago · ◐ 1 agent: refactor auth$/ })).toBeDefined()
  await band.unmount()
})

test('an agent that failed is named at rest until the next prompt', async ($, on) => {
  const clock = mock.clock(on)
  linuxHost(on)
  bandHost(on)
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('agent.list', () => ({ value: [{ id: 'a1', type: 'general-purpose', status: 'failed', description: 'migrate the db' }] }))
  await $.turn.start({ text: 'a', turnId: 't1' })
  await $.turn.complete(ANSWERED)
  await clock.advance(10_000)
  const band = await $.ui.mount(HINT)
  expect(await band.find({ type: 'Text', text: /^✗ agent failed: migrate the db$/ })).toBeDefined()
  await band.unmount()
  await $.prompt.submit({ text: 'ok, retry it', wait: false, origin: { kind: 'composer' } })
  const seen = await $.ui.mount(HINT)
  expect(await seen.find({ type: 'Text', text: /agent failed/ })).toBeUndefined()
  await seen.unmount()
})

test("from 70% full the context row names what takes the most of it, as the turn's end counted", async ($, on) => {
  mock.clock(on)
  linuxHost(on)
  bandHost(on)
  on('session.measure', ($, e) => ({ changed: e.changed }))
  const categories = [
    { name: 'System prompt', tokens: 3_000, kind: 'used' },
    { name: 'Messages', tokens: 120_400, kind: 'used' },
    { name: 'Free space', tokens: 150_000, kind: 'free' },
  ]
  let detail: unknown
  on('session.usage', ($, e) => ((detail = e.breakdown), { value: { startedAt: 0, context: { window: 200_000, percent: 75, breakdown: { categories } }, rateLimits: [] } as never }))
  await $.session.measure({ context: { window: 200_000, percent: 75 }, rateLimits: [], changed: ['context'] })
  await $.turn.complete(ANSWERED)
  const band = await $.ui.mount(HINT)
  expect(await band.find({ type: 'Text', text: /ctx .* 75% · Messages 120k$/ })).toBeDefined()
  expect(detail).toBe('summary')
  await band.unmount()
})

test('the context breakdown says where auto-compact starts, or that it is off and the turns run to full', async ($, on) => {
  mock.clock(on)
  linuxHost(on)
  bandHost(on)
  on('session.measure', ($, e) => ({ changed: e.changed }))
  // Auto-compact at 90% of a 200k window.
  let breakdown = { categories: [], isAutoCompactEnabled: true, autoCompactThreshold: 180_000 }
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200_000, percent: 80, breakdown }, rateLimits: [] } as never }))
  for (const percent of [70, 75, 80]) {
    await $.session.measure({ context: { window: 200_000, percent }, rateLimits: [], changed: ['context'] })
    await $.turn.complete(ANSWERED)
  }
  const on90 = await $.ui.mount(HINT)
  expect(await on90.find({ type: 'Text', text: /^┊─$/ })).toBeDefined()
  expect(await on90.find({ type: 'Text', text: /^ {2}~2 turns left$/ })).toBeDefined()
  await on90.unmount()

  breakdown = { ...breakdown, isAutoCompactEnabled: false }
  await $.turn.complete(ANSWERED)
  const off = await $.ui.mount(HINT)
  expect(await off.find({ type: 'Text', text: /^──$/ })).toBeDefined()
  expect(await off.find({ type: 'Text', text: /^ {2}~4 turns to full$/ })).toBeDefined()
  await off.unmount()
})

test('bars take the theme accent until they warn, then their percent warns too; ┊ marks auto-compact', async ($, on) => {
  mock.clock(on)
  bandHost(on)
  on('session.measure', ($, e) => ({ changed: e.changed }))
  await $.session.measure({ context: { window: 200_000, percent: 42 }, rateLimits: [{ kind: 'five_hour', percentUsed: 80 }], changed: ['context', 'rateLimits'] })
  const band = await $.ui.mount(HINT)
  expect((await band.find({ type: 'Text', text: /^━━━━━$/ }))?.props.color).toBe(THEMES.cat!.accent)
  expect(await band.find({ type: 'Text', text: /^──────┊$/ })).toBeDefined()
  expect((await band.find({ type: 'Text', text: /^━━━━━━━━━╸$/ }))?.props.color).toBe('warning')
  const percent = await band.find({ type: 'Text', text: /^ {2}80%$/ })
  expect([percent?.props.color, percent?.props.bold]).toEqual(['warning', true])
  await band.unmount()
})

test("a tool past a minute says how long it has run, and the quip's » takes the mood's color", async ($, on) => {
  const clock = mock.clock(on)
  linuxHost(on)
  bandHost(on)
  let fail = () => {}
  on('tool.call', () => new Promise<ToolCallResult>(resolve => (fail = () => resolve({ isError: true, result: 'Exit code 1', text: 'Exit code 1' }))))
  const call = $.tool.call({ tool: 'Bash', command: 'npm run build' })
  await clock.advance(0)
  await clock.advance(125_000)
  const busy = await $.ui.mount(HINT)
  expect(await busy.find({ type: 'Text', text: /^pawing at npm run build · 2m$/ })).toBeDefined()
  expect((await busy.find({ type: 'Text', text: /^» $/ }))?.props.color).toBe(THEMES.cat!.accent)
  await busy.unmount()
  fail()
  await call
  const failed = await $.ui.mount(HINT)
  expect((await failed.find({ type: 'Text', text: /^» $/ }))?.props.color).toBe('error')
  await failed.unmount()
})

test('a test result older than the last edit loses its color', async ($, on) => {
  const clock = mock.clock(on)
  linuxHost(on)
  bandHost(on)
  on('ui.toast', () => ({ value: undefined }))
  const answers: ToolCallResult[] = [{ result: { stdout: '', stderr: '', interrupted: false }, text: ' 3 pass\n 0 fail' }, { result: {} }]
  on('tool.call', () => answers.shift()!)
  const colorOfRun = async () => {
    const band = await $.ui.mount(HINT)
    const run = await band.find({ type: 'Text', text: /^✓ 3 passed$/ })
    await band.unmount()
    expect(run).toBeDefined()
    return run?.props.color
  }
  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  expect(await colorOfRun()).toBe('success')
  await clock.advance(1_000)
  await $.tool.call({ tool: 'Edit', file_path: '/p/a.ts', old_string: 'a', new_string: 'b' })
  expect(await colorOfRun()).toBeUndefined()
})

test('an edit held for review, and a file outside the project, neither count nor age the last run', async ($, on) => {
  const clock = mock.clock(on)
  linuxHost(on, {})
  bandHost(on, '/p')
  on('ui.toast', () => ({ value: undefined }))
  const held: ToolCallResult = { result: { filePath: '/p/a.ts', structuredPatch: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: ['-a', '+b'] }], staged: true } }
  const answers: ToolCallResult[] = [ranBash(' 3 pass\n 0 fail'), held, created('remember this\n')]
  on('tool.call', () => answers.shift()!)
  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  await clock.advance(1_000)
  await $.tool.call({ tool: 'Edit', file_path: '/p/a.ts', old_string: 'a', new_string: 'b' })
  await $.tool.call({ tool: 'Write', file_path: '/home/me/.claude/projects/p/memory/MEMORY.md', content: 'remember this\n' })
  const band = await $.ui.mount(HINT)
  expect((await band.find({ type: 'Text', text: /^✓ 3 passed$/ }))?.props.color).toBe('success')
  expect(await band.find({ type: 'Text', text: /✎/ })).toBeUndefined()
  await band.unmount()
})

test("a subagent's test run is the band's last run, with no party", async ($, on) => {
  const clock = mock.clock(on)
  const { played } = linuxHost(on)
  bandHost(on)
  const toasts: string[] = []
  on('ui.toast', ($, e) => (toasts.push(e.text), { value: undefined }))
  on('tool.call', () => ranBash(' 5 pass\n 0 fail'))
  await $.tool.call({ tool: 'Bash', command: 'npm test', agentId: 'a1' } as never)
  await clock.advance(0)
  expect([toasts, played]).toEqual([[], []])
  const band = await $.ui.mount(HINT)
  expect(await band.find({ type: 'Text', text: /^✓ 5 passed \(0m ago\)$/ })).toBeDefined()
  await band.unmount()
})

test('a test run too long to show Claude is read from the output Claude Code kept', async ($, on) => {
  mock.clock(on)
  linuxHost(on)
  bandHost(on)
  const whole = `${'PASS src/a.test.ts\n'.repeat(400)}Tests:  1 failed, 99 passed, 100 total\n`
  on('fs.stat', () => ({ value: { kind: 'file', size: whole.length, mtimeMs: 1, isLink: false } }))
  on('fs.read', ($, e) => (e.path === '/tmp/out.txt' ? { value: whole } : { deny: 'ENOENT' }))
  const kept = { stdout: 'PASS src/a.test.ts\n', stderr: '', interrupted: false, persistedOutputPath: '/tmp/out.txt', persistedOutputSize: whole.length }
  on('tool.call', () => ({ isError: true, result: kept, text: 'Output too large, saved to /tmp/out.txt. Preview:\nPASS src/a.test.ts\n' }))
  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  const band = await $.ui.mount(HINT)
  expect(await band.find({ type: 'Text', text: /^✗ 1 failed \(0m ago\)$/ })).toBeDefined()
  await band.unmount()
})

test('the same test command run again says what it failed before', async ($, on) => {
  mock.clock(on)
  linuxHost(on)
  bandHost(on)
  const answers: ToolCallResult[] = [ranBash('Tests:  5 failed, 10 passed, 15 total'), ranBash('Tests:  2 failed, 13 passed, 15 total')]
  on('tool.call', () => answers.shift()!)
  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  // The same run, read through tail.
  await $.tool.call({ tool: 'Bash', command: 'npm test 2>&1 | tail -20' })
  const band = await $.ui.mount(HINT)
  expect(await band.find({ type: 'Text', text: /^✗ 2 failed \(was 5, 0m ago\)$/ })).toBeDefined()
  await band.unmount()
})

test('the compact layout draws the stats alone on two lines', { options: { layout: 'compact' } }, async ($, on) => {
  mock.clock(on)
  hintLine(on)
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.cwd', () => ({ value: '/home/me/project' }))
  const band = await $.ui.mount(HINT)
  expect(await band.find({ key: 'cat' })).toBeUndefined()
  expect(await band.find({ type: 'Text', text: /^ Opus 5\.5  project · 0m$/ })).toBeDefined()
  expect(await band.find({ type: 'Text', text: /^ctx / })).toBeDefined()
  expect(await band.find({ type: 'Text', text: /=\^\.\^=|»/ })).toBeUndefined()
  await band.unmount()
})

test('the compact layout puts the branch after the folder', { options: { layout: 'compact' } }, async ($, on) => {
  const clock = mock.clock(on)
  linuxHost(on, { status: STATUS('main', '# branch.upstream origin/main', '# branch.ab +1 -0', '1 .M N... 100644 100644 100644 x y a.ts') })
  bandHost(on, '/p')
  await $.turn.complete(ANSWERED)
  await clock.advance(0)
  const band = await $.ui.mount(HINT)
  expect(await band.find({ type: 'Text', text: /^ Opus 5\.5  p ⎇ main ↑1 · 0m │ ✚ 1$/ })).toBeDefined()
  await band.unmount()
})

test('with sounds off nothing plays', { options: { sounds: false } }, async ($, on) => {
  const clock = mock.clock(on)
  const { played } = linuxHost(on)
  await $.turn.complete(ANSWERED)
  await clock.advance(0)
  expect(played).toHaveLength(0)
})

test('switching theme draws its mascot at twice the size under the command line', async ($, on) => {
  on('ui.render', { component: 'CommandOutput' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>{e.props.text}</Text>
  })
  const props = { command: 'awesome-hud', args: 'got', text: 'Theme: got', isErrored: false }
  const row = await $.ui.mount({ plugin: 'awesome-hud', component: 'CommandOutput', surface: 'terminal', props })
  const texts = (await row.findAll({ type: 'Text' })).map(t => t.text)
  expect(texts).toContain('Theme: got')
  const portrait = await row.find({ key: 'portrait' })
  expect(portrait?.props.columns).toBe(WIDTH * 2)
  expect(portrait?.props.rows).toBe(HEIGHT)
  await row.unmount()
})

test('under the prompt the band draws the mascot beside the status bar, after the hint line', async ($, on) => {
  mock.clock(on)
  bandHost(on, '/home/me/.claude')
  on('turn.start', ($, e) => ({ turnId: e.turnId }))

  const idle = await $.ui.mount(HINT)
  expect(await idle.find({ type: 'Text', text: /\? for shortcuts/ })).toBeDefined()
  expect(await idle.find({ key: 'cat' })).toBeDefined()
  expect(await idle.find({ type: 'Text', text: /ctx/ })).toBeDefined()
  expect(await idle.find({ type: 'Text', text: /Opus 5\.5/ })).toBeDefined()
  await idle.unmount()

  await $.turn.start({ text: 'hi', turnId: 't1' })
  const busy = await $.ui.mount(HINT)
  expect(await busy.find({ type: 'Text', text: /»/ })).toBeDefined()
  await busy.unmount()
})

test("the wide band holds the sprite's rows, the quip on the last", async ($, on) => {
  mock.clock(on)
  hintLine(on)
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.cwd', () => ({ value: '/home/me/.claude' }))
  const band = await $.ui.mount(HINT)
  const column = (await band.findAll({ type: 'Box' })).find(b => b.props.justifyContent === 'space-between')
  expect(column?.props.height).toBe(HEIGHT / 2)
  expect(textOf(column?.children.at(-1))).toMatch(/^» /)
  await band.unmount()
})

test('a narrow band drops the cat and keeps two lines, the 5h quota on the second', async ($, on) => {
  mock.clock(on)
  hintLine(on)
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.cwd', () => ({ value: '/home/me/.claude' }))
  on('session.measure', ($, e) => ({ changed: e.changed }))
  await $.session.measure({ context: { window: 200_000, percent: 42 }, rateLimits: [{ kind: 'five_hour', percentUsed: 28 }], changed: ['context', 'rateLimits'] })
  const narrow = await $.ui.mount({ ...HINT, viewport: { columns: 50, rows: 40 } })
  expect(await narrow.find({ key: 'cat' })).toBeUndefined()
  expect(await narrow.find({ type: 'Text', text: /ctx/ })).toBeDefined()
  expect(await narrow.find({ type: 'Text', text: / 5h ━━━╸─/ })).toBeDefined()
  await narrow.unmount()
})

test('the 5h window has the time to its reset and when; the week shares its row, and gets a gauge once it warns', async ($, on) => {
  const clock = mock.clock(on)
  bandHost(on, '/home/me/.claude')
  on('session.measure', ($, e) => ({ changed: e.changed }))
  const inHours = (h: number) => new Date(clock.now() + h * 3_600_000).toISOString()
  const measure = (weekly: number) =>
    $.session.measure({
      context: { window: 200_000, percent: 42 },
      rateLimits: [{ kind: 'five_hour', percentUsed: 85, resetsAt: inHours(1) }, { kind: 'seven_day', percentUsed: weekly, resetsAt: inHours(60) }],
      changed: ['context', 'rateLimits'],
    })
  await measure(11)
  const quiet = await $.ui.mount(HINT)
  expect(await quiet.find({ type: 'Text', text: /^ 5h .* 85% {2}↻ in 1h 0m · \d+:\d\d[ap]m · 7d 11%$/ })).toBeDefined()
  await quiet.unmount()
  await measure(80)
  const warned = await $.ui.mount(HINT)
  expect(await warned.find({ type: 'Text', text: /^ 5h .* 85% {2}↻ in 1h 0m · 7d ━+╸?─* {2}80% ↻ 2d 12h$/ })).toBeDefined()
  await warned.unmount()
})

test('reset times read as /usage writes them, in the local time zone', async () => {
  const now = Date.parse('2026-10-19T20:52:00Z')
  expect(resetTime('2026-10-19T21:50:00.000Z', now, 'Asia/Kolkata')).toBe('3:20am')
  expect(resetTime('2026-10-22T11:00:00.000Z', now, 'Asia/Kolkata')).toBe('Oct 22, 4:30pm')
})

test('in a short terminal the band under the prompt folds to two lines', async ($, on) => {
  mock.clock(on)
  hintLine(on)
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.cwd', () => ({ value: '/home/me/.claude' }))
  const short = await $.ui.mount({ ...HINT, viewport: { columns: 105, rows: 20 } })
  expect(await short.find({ key: 'cat' })).toBeUndefined()
  expect(await short.find({ type: 'Text', text: /ctx/ })).toBeDefined()
  await short.unmount()
})

test('with position above the band is drawn over the prompt and the hint line is left alone', { options: { position: 'above' } }, async ($, on) => {
  mock.clock(on)
  bandHost(on, '/home/me/.claude')
  const above = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await above.find({ key: 'cat' })).toBeDefined()
  await above.unmount()
  const hint = await $.ui.mount(HINT)
  expect(await hint.find({ type: 'Text', text: /\? for shortcuts/ })).toBeDefined()
  expect(await hint.find({ key: 'cat' })).toBeUndefined()
  await hint.unmount()
})

test('a survey takes the band, and the cat stops drawing', { options: { position: 'above' } }, async ($, on) => {
  const clock = mock.clock(on)
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.cwd', () => ({ value: '/home/me/.claude' }))
  // The engine's survey, drawn once the plugin passes.
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>How is Claude doing?</Text>
  })
  let blits = 0
  on('ui.blit', () => ((blits += 1), { value: {} }))
  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await clock.advance(10_000)
  expect(blits).toBeGreaterThan(0)
  await band.unmount()

  const survey = await $.ui.mount({ ...BAND, props: { ...BAND.props, hasSurvey: true }, surface: 'terminal' })
  const before = blits
  await clock.advance(10_000)
  expect(blits).toBe(before)
  await survey.unmount()
})

test('the theme comes from /config', { options: { theme: 'chibi' } }, async ($, on) => {
  mock.clock(on)
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200_000 }, rateLimits: [] } }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.cwd', () => ({ value: '/home/me/.claude' }))
  on('command.register', () => ({ value: { command: 'awesome-hud' } }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  hintLine(on)
  await $.session.start({ cwd: '/home/me/.claude', surface: 'terminal', isInteractive: true })
  const narrow = await $.ui.mount({ ...HINT, viewport: { columns: 50, rows: 40 } })
  expect(await narrow.find({ type: 'Text', text: /\(•ᴗ•\)/ })).toBeDefined()
  await narrow.unmount()
})

test('the model chip reads <model> | <effort>, and /effort <level> moves it before the next request', async ($, on) => {
  mock.clock(on)
  bandHost(on)
  on('command.run', () => ({ text: 'Set effort level to max' }))
  const typed = { command: 'effort', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } } as const

  const idle = await $.ui.mount(HINT)
  expect(await idle.find({ type: 'Text', text: / Opus 5\.5 \| / })).toBeUndefined()
  await $.command.run({ ...typed, args: 'max' })
  expect(await idle.find({ type: 'Text', text: / Opus 5\.5 \| ● max / })).toBeDefined()
  await $.command.run({ ...typed, args: 'sideways' })
  expect(await idle.find({ type: 'Text', text: / Opus 5\.5 \| ● max / })).toBeDefined()
  await idle.unmount()
})

test('/awesome-hud <theme> switches and keeps the choice in /config', async ($, on) => {
  mock.clock(on)
  const saved: unknown[] = []
  on('config.set', ($, e) => (saved.push([e.key, e.value]), { value: e.value }))
  on('ui.blit', () => ({ value: {} }))
  const typed = { command: 'awesome-hud', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } } as const
  expect((await $.command.run({ ...typed, args: 'Chibi' })).text).toBe('Theme: chibi')
  expect(saved).toEqual([['awesome-hud.theme', 'chibi']])
  expect((await $.command.run({ ...typed, args: 'dog' })).text).toMatch(/^No theme "dog"/)
  // Nor what every object inherits.
  expect((await $.command.run({ ...typed, args: 'constructor' })).text).toMatch(/^No theme "constructor"/)
  expect(saved).toHaveLength(1)
})

test('/awesome-hud files: one line for the model, and under it each file Claude edited as git has it now', async ($, on) => {
  mock.clock(on)
  linuxHost(on, { status: STATUS('main', '1 .M N... 100644 100644 100644 x y src/a.ts', '? src/new.ts'), env: { HOME: '/home/me' } })
  on('session.cwd', () => ({ value: '/p' }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.render', { component: 'CommandOutput' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>{e.props.text}</Text>
  })
  const commit = ranBash('[main 1a2b3c4] x', { gitOperation: { commit: { sha: '1a2b3c4d5e', kind: 'committed', branch: 'main' } } })
  const answers: ToolCallResult[] = [patchOf(['-a', '+b', '+c']), created('x\ny\n'), patchOf(['-b', '+d']), patchOf(['-x', '+y']), commit, created('note\n')]
  on('tool.call', () => answers.shift()!)
  await $.tool.call({ tool: 'Edit', file_path: '/p/src/a.ts', old_string: 'a', new_string: 'b' })
  await $.tool.call({ tool: 'Write', file_path: '/p/src/new.ts', content: 'x\ny\n' })
  await $.tool.call({ tool: 'Edit', file_path: '/p/src/a.ts', old_string: 'b', new_string: 'd' })
  await $.tool.call({ tool: 'Edit', file_path: '/p/README.md', old_string: 'x', new_string: 'y' })
  await $.tool.call({ tool: 'Bash', command: 'git commit -am x' })
  await $.tool.call({ tool: 'Write', file_path: '/home/me/.claude/projects/p/memory/MEMORY.md', content: 'note\n' })

  const typed = { command: 'awesome-hud', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } } as const
  const { text = '' } = await $.command.run({ ...typed, args: 'files' })
  expect(text).toMatch(/^Claude edited 3 files in the project this session \(\+6 −3\), 2 not yet committed; 1 outside it; 1 commit made\. As of \d+:\d\d:\d\d[ap]m\.$/)
  const row = await $.ui.mount({ plugin: 'awesome-hud', component: 'CommandOutput', surface: 'terminal', props: { command: 'awesome-hud', args: 'files', text, isErrored: false } })
  const lines = (await row.findAll({ type: 'Text' })).map(t => t.text)
  expect(lines).toContain(text)
  expect(lines).toContain('README.md   ×1  +1  −1  clean')
  expect(lines).toContain('src/a.ts    ×2  +3  −2  changed')
  expect(lines).toContain('src/new.ts  ×1  +2  −0  new')
  expect(lines).toContain('outside the project')
  expect(lines).toContain('~/.claude/projects/p/memory/MEMORY.md  ×1  +1  −0')
  expect(lines).toContain('1a2b3c4  main')
  await row.unmount()
})

test('the spinner takes a theme word', async ($, on) => {
  on('ui.render', { component: 'Spinner' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>{e.props.word}</Text>
  })
  const spinner = await $.ui.mount(SPINNER)
  expect(await spinner.find({ type: 'Text', text: /Sauteing/ })).toBeUndefined()
  await spinner.unmount()
})

test('on the desktop the spinner keeps the step it names', async ($, on) => {
  on('ui.render', { component: 'Spinner' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>{e.props.word}</Text>
  })
  const spinner = await $.ui.mount({ ...SPINNER, surface: 'desktop', props: { ...SPINNER.props, word: 'Creating notes.md' } })
  expect(await spinner.find({ type: 'Text', text: /Creating notes\.md/ })).toBeDefined()
  await spinner.unmount()
})

test('the turn line reads its own turn when another ended within a second of it', async ($, on) => {
  mock.clock(on)
  linuxHost(on)
  on('session.cwd', () => ({ value: '/home/me/project' }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('tool.call', () => ({ isError: true, result: 'Exit code 1', text: 'Exit code 1' }))
  on('ui.render', { component: 'TurnDuration' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>{e.props.word}</Text>
  })
  // A turn with a failed tool, then a clean one 400ms longer.
  await $.turn.start({ text: 'a', turnId: 't1' })
  await $.tool.call({ tool: 'Bash', command: 'false' })
  await $.turn.complete({ ...ANSWERED, durationMs: 3_000 })
  await $.turn.start({ text: 'b', turnId: 't2' })
  await $.turn.complete({ ...ANSWERED, turnId: 't2', durationMs: 3_400 })
  const lineOf = (durationMs: number) => $.ui.mount({ plugin: 'awesome-hud', component: 'TurnDuration', surface: 'terminal', props: { word: 'Baked', durationMs } })
  const failed = await lineOf(3_000)
  expect(await failed.find({ type: 'Text', text: /Knocked over 1 cup/ })).toBeDefined()
  await failed.unmount()
  const clean = await lineOf(3_400)
  expect(await clean.find({ type: 'Text', text: /cup/ })).toBeUndefined()
  await clean.unmount()
})

test('the turn line keeps the latest turns, not the longest', async ($, on) => {
  mock.clock(on)
  linuxHost(on)
  on('session.cwd', () => ({ value: '/home/me/project' }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('tool.call', () => ({ isError: true, result: 'Exit code 1', text: 'Exit code 1' }))
  on('ui.render', { component: 'TurnDuration' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>{e.props.word}</Text>
  })
  for (const durationMs of [60_000, 50_000, 45_000, 40_000]) {
    await $.turn.start({ text: 'a', turnId: `t${durationMs}` })
    await $.turn.complete({ ...ANSWERED, turnId: `t${durationMs}`, durationMs })
  }
  // A short turn with a failed tool, then one more long one.
  await $.turn.start({ text: 'b', turnId: 'short' })
  await $.tool.call({ tool: 'Bash', command: 'false' })
  await $.turn.complete({ ...ANSWERED, turnId: 'short', durationMs: 3_000 })
  await $.turn.start({ text: 'c', turnId: 'last' })
  await $.turn.complete({ ...ANSWERED, turnId: 'last', durationMs: 41_000 })
  const line = await $.ui.mount({ plugin: 'awesome-hud', component: 'TurnDuration', surface: 'terminal', props: { word: 'Baked', durationMs: 3_000 } })
  expect(await line.find({ type: 'Text', text: /Knocked over 1 cup/ })).toBeDefined()
  await line.unmount()
})

test('a search that found nothing is no error', async ($, on) => {
  const clock = mock.clock(on)
  const { played } = linuxHost(on)
  bandHost(on)
  on('tool.call', () => ({ isError: true, result: 'Exit code 1', text: 'Exit code 1' }))
  await $.tool.call({ tool: 'Bash', command: 'grep -rn TODO src' })
  await clock.advance(0)
  expect(played).toEqual([])
  const band = await $.ui.mount(HINT)
  expect((await band.find({ type: 'Text', text: /^» $/ }))?.props.color).toBe(THEMES.cat!.accent)
  await band.unmount()
})

test('a search that found nothing: exit 1 from a search last in its pipeline, alone on its line', async () => {
  const miss = 'Exit code 1'
  expect(isMiss('grep -rn TODO src', miss)).toBe(true)
  expect(isMiss('cat a.log | rg error', miss)).toBe(true)
  expect(isMiss('LC_ALL=C grep x f', miss)).toBe(true)
  expect(isMiss('[ -f build/out ]', miss)).toBe(true)
  expect(isMiss('grep x f', 'Exit code 2')).toBe(false)
  expect(isMiss('grep x f | head -5', miss)).toBe(false)
  expect(isMiss('npm run build && grep x f', miss)).toBe(false)
  expect(isMiss('npm test', miss)).toBe(false)
  expect(isMiss('grepper x', miss)).toBe(false)
})

test('a session whose usage fails to read still sets up', async ($, on) => {
  mock.clock(on)
  linuxHost(on)
  bandHost(on)
  on('session.usage', () => ({ deny: 'unavailable' }))
  const registered: string[] = []
  on('command.register', ($, e) => (registered.push(e.name), { value: { command: e.name } }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/home/me/project', surface: 'terminal', isInteractive: true })
  expect(registered).toEqual(['awesome-hud'])
})

test('/clear starts the session clock again', async ($, on) => {
  const clock = mock.clock(on)
  linuxHost(on)
  bandHost(on)
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200_000 }, rateLimits: [] } }))
  on('command.register', () => ({ value: { command: 'awesome-hud' } }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.end', ($, e) => ({ sessionId: e.sessionId }))
  await $.session.start({ cwd: '/home/me/project', surface: 'terminal', isInteractive: true })
  await clock.advance(2 * 3_600_000)
  const before = await $.ui.mount(HINT)
  expect(await before.find({ type: 'Text', text: /^2h 0m$/ })).toBeDefined()
  await before.unmount()
  await $.session.end({ reason: 'clear', sessionId: 's1', resume: { id: 's1' } })
  const after = await $.ui.mount(HINT)
  expect(await after.find({ type: 'Text', text: /^0m$/ })).toBeDefined()
  await after.unmount()
})

test('a turn the person interrupted shows no error', async ($, on) => {
  const clock = mock.clock(on)
  linuxHost(on)
  bandHost(on)
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  await $.turn.start({ text: 'a', turnId: 't1' })
  await $.turn.complete({ ...ANSWERED, reason: 'aborted', isAborted: true })
  await clock.advance(0)
  const band = await $.ui.mount(HINT)
  expect((await band.find({ type: 'Text', text: /^» $/ }))?.props.color).toBe(THEMES.cat!.accent)
  await band.unmount()
})

test('tests party only on a summary that passed, and the band shows the last run', async ($, on) => {
  const clock = mock.clock(on)
  linuxHost(on)
  bandHost(on)
  const toasts: string[] = []
  on('ui.toast', ($, e) => (toasts.push(e.text), { value: undefined }))
  // Core's Bash, answering each call with the next of these.
  const answers: ToolCallResult[] = [
    { result: { stdout: '', stderr: '', interrupted: false, backgroundTaskId: 'b1' }, text: 'Command running in background with ID: b1' },
    { result: { stdout: ' 3 pass\n 0 fail', stderr: '', interrupted: true }, text: ' 3 pass\n 0 fail' },
    { deny: 'git push is blocked here' },
    { result: { stdout: 'all good', stderr: '', interrupted: false }, text: 'all good' },
    { result: { stdout: 'Tests:  2 failed, 10 passed, 12 total', stderr: '', interrupted: false }, text: 'Tests:  2 failed, 10 passed, 12 total' },
    { result: { stdout: ' 24 pass\n 0 fail', stderr: '', interrupted: false }, text: ' 24 pass\n 0 fail' },
  ]
  on('tool.call', () => answers.shift()!)

  // In the background, interrupted, refused, with no summary, and failing behind a pipe that exits 0.
  for (const command of ['npm test', 'npm test', 'git push', 'npm test', 'npm test 2>&1 | tail -3']) await $.tool.call({ tool: 'Bash', command })
  await clock.advance(0)
  expect(toasts).toEqual([])
  const failing = await $.ui.mount(HINT)
  expect(await failing.find({ type: 'Text', text: /^✗ 2 failed \(0m ago\)$/ })).toBeDefined()
  await failing.unmount()

  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  await clock.advance(180_000)
  expect(toasts).toEqual([THEMES.cat!.party.tests])
  const passing = await $.ui.mount(HINT)
  expect(await passing.find({ type: 'Text', text: /^✓ 24 passed \(3m ago\)$/ })).toBeDefined()
  await passing.unmount()
})

test("a commit and a pull request Claude Code saw a command make: their parties, and the PR a link in the repo row", async ($, on) => {
  const clock = mock.clock(on)
  const { ran } = linuxHost(on, { files: { '/p/.git/HEAD': 'ref: refs/heads/feat\n' }, status: STATUS('feat', '# branch.upstream origin/feat', '# branch.ab +0 -0') })
  bandHost(on, '/p')
  const toasts: string[] = []
  on('ui.toast', ($, e) => (toasts.push(e.text), { value: undefined }))
  const answers: ToolCallResult[] = [
    ranBash('[feat 1a2b3c4] fix', { gitOperation: { commit: { sha: '1a2b3c4', kind: 'committed', branch: 'feat' } } }),
    ranBash('https://github.com/o/r/pull/42', { gitOperation: { push: { branch: 'feat' }, pr: { number: 42, url: 'https://github.com/o/r/pull/42', action: 'created' } } }),
    ranBash('now git push'),
  ]
  on('tool.call', () => answers.shift()!)
  // A commit made by a script, which only Claude Code's reading names; gh opening a PR; an echo that names a push.
  await $.tool.call({ tool: 'Bash', command: './scripts/ship.sh' })
  await $.tool.call({ tool: 'Bash', command: 'gh pr create --fill' })
  await $.tool.call({ tool: 'Bash', command: 'echo "now git push"' })
  await clock.advance(0)
  expect(toasts).toEqual([THEMES.cat!.party.commit, THEMES.cat!.party.push])
  const band = await $.ui.mount(HINT)
  expect((await band.find({ type: 'Link' }))?.props.href).toBe('https://github.com/o/r/pull/42')
  expect((await band.find({ type: 'Text', text: /^PR #42$/ }))?.props.color).toBe('suggestion')
  await band.unmount()
  // With PR status off, gh is never asked.
  expect(ran.some(argv => argv[0] === 'gh')).toBe(false)
})

test('the repo row: the branch and its upstream, the tree, the files Claude edited and their lines, under both plan windows', async ($, on) => {
  const clock = mock.clock(on)
  const status = STATUS('main', '# branch.upstream origin/main', '# branch.ab +2 -1', '1 .M N... 100644 100644 100644 x y src/a.ts', '1 M. N... 100644 100644 100644 x y src/b.ts', '? notes.md')
  linuxHost(on, { status })
  bandHost(on, '/p')
  on('session.measure', ($, e) => ({ changed: e.changed }))
  const answers: ToolCallResult[] = [patchOf(['-a', '+b', '+c']), patchOf(['-b', '+d']), created('x\ny\n'), { deny: 'no' }]
  on('tool.call', () => answers.shift()!)
  // One file twice, another written new, and a write refused.
  await $.tool.call({ tool: 'Edit', file_path: '/p/a.ts', old_string: 'a', new_string: 'b' })
  await $.tool.call({ tool: 'Edit', file_path: '/p/a.ts', old_string: 'b', new_string: 'c' })
  await $.tool.call({ tool: 'Write', file_path: '/p/b.ts', content: 'x\ny\n' })
  await $.tool.call({ tool: 'Write', file_path: '/p/c.ts', content: 'x' })
  await $.turn.complete(ANSWERED)
  await clock.advance(0)
  const rateLimits = [{ kind: 'five_hour', percentUsed: 10 }, { kind: 'seven_day', percentUsed: 5 }]
  await $.session.measure({ context: { window: 200_000, percent: 42 }, rateLimits, changed: ['context', 'rateLimits'] })
  const band = await $.ui.mount(HINT)
  expect(await band.find({ type: 'Text', text: /^⎇ main ↑2 ↓1 +│ ● 1  ✚ 1  \? 1 new$/ })).toBeDefined()
  expect(await band.find({ type: 'Text', text: /^✎ 2 files \+5 −2$/ })).toBeDefined()
  expect(await band.find({ type: 'Text', text: /^ 5h .* 10% · 7d 5%$/ })).toBeDefined()
  await band.unmount()
})

test('what Claude did and ran takes the row under git, the tests marked stale once an edit follows them', async ($, on) => {
  const clock = mock.clock(on)
  linuxHost(on, { status: STATUS('main', '# branch.upstream origin/main', '# branch.ab +2 -1', '1 .M N... 100644 100644 100644 x y src/a.ts', '1 M. N... 100644 100644 100644 x y src/b.ts', '? notes.md') })
  bandHost(on, '/p')
  on('ui.toast', () => ({ value: undefined }))
  const answers: ToolCallResult[] = [patchOf(['-a', '+b', '+c']), patchOf(['-b', '+d']), created('x\ny\n'), ranBash(' 3 pass\n 0 fail')]
  on('tool.call', () => answers.shift()!)
  await $.tool.call({ tool: 'Edit', file_path: '/p/a.ts', old_string: 'a', new_string: 'b' })
  await $.tool.call({ tool: 'Edit', file_path: '/p/a.ts', old_string: 'b', new_string: 'c' })
  await $.tool.call({ tool: 'Write', file_path: '/p/b.ts', content: 'x\ny\n' })
  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  await $.turn.complete(ANSWERED)
  await clock.advance(0)
  const band = await $.ui.mount({ ...HINT, viewport: { columns: 105, rows: 40 } })
  expect(await band.find({ type: 'Text', text: /^✎ 2 files \+5 −2 │ ✓ 3 passed \(0m ago\)$/ })).toBeDefined()
  await band.unmount()
})

test('mid-rebase the repo row says where it stands, and at rest the quip line names the conflicts', async ($, on) => {
  const clock = mock.clock(on)
  const conflicts = ['u UU N... 100644 100644 100644 100644 x y z src/a.ts', 'u AA N... 100644 100644 100644 100644 x y z src/b.ts']
  linuxHost(on, {
    status: STATUS('(detached)', ...conflicts),
    files: {
      '/p/.git/HEAD': '9091f7b7a09d414d635f49b0cf3842ae592d0b17\n',
      '/p/.git/rebase-merge/msgnum': '2\n',
      '/p/.git/rebase-merge/end': '5\n',
      '/p/.git/rebase-merge/head-name': 'refs/heads/main\n',
    },
  })
  bandHost(on, '/p')
  await $.turn.complete(ANSWERED)
  await clock.advance(10_000)
  const band = await $.ui.mount(HINT)
  expect(await band.find({ type: 'Text', text: /^⎇ main\|REBASE 2\/5 +│ 2 conflicts$/ })).toBeDefined()
  expect(await band.find({ type: 'Text', text: /^⎇ rebasing 2\/5, 2 conflicts$/ })).toBeDefined()
  await band.unmount()
})

test('a status that runs out of time keeps the branch and its last counts, dim, and the next leaves untracked files out', async ($, on) => {
  const clock = mock.clock(on)
  let isSlow = false
  const { ran } = linuxHost(on, { status: () => (isSlow ? undefined : STATUS('main', '1 .M N... 100644 100644 100644 x y a.ts', '? b.txt')) })
  bandHost(on, '/p')
  await $.turn.complete(ANSWERED)
  await clock.advance(0)
  isSlow = true
  await $.turn.complete(ANSWERED)
  await clock.advance(0)
  const slow = await $.ui.mount(HINT)
  expect(await slow.find({ type: 'Text', text: /^⎇ main +│ ✚ 1  \? 1 new$/ })).toBeDefined()
  expect((await slow.find({ type: 'Text', text: /^✚ 1$/ }))?.props.dimColor).toBe(true)
  await slow.unmount()
  isSlow = false
  await $.turn.complete(ANSWERED)
  await clock.advance(0)
  expect(ran.filter(argv => argv.includes('status')).at(-1)).toContain('--untracked-files=no')
  const quick = await $.ui.mount(HINT)
  expect(await quick.find({ type: 'Text', text: /^⎇ main +│ ✚ 1$/ })).toBeDefined()
  await quick.unmount()
})

test('git moving outside Claude reaches the band within the minute', async ($, on) => {
  const clock = mock.clock(on)
  const files: Record<string, string> = {}
  const times: Record<string, number> = { '/p/.git/HEAD': 1 }
  linuxHost(on, { files, times })
  bandHost(on, '/p')
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200_000 }, rateLimits: [] } }))
  on('command.register', () => ({ value: { command: 'awesome-hud' } }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/p', surface: 'terminal', isInteractive: true })
  await clock.advance(0)
  const before = await $.ui.mount(HINT)
  expect(await before.find({ type: 'Text', text: /^⎇ main$/ })).toBeDefined()
  await before.unmount()
  // Another terminal checks out a branch.
  files['/p/.git/HEAD'] = 'ref: refs/heads/other\n'
  times['/p/.git/HEAD'] = 2
  await clock.advance(60_000)
  const after = await $.ui.mount(HINT)
  expect(await after.find({ type: 'Text', text: /^⎇ other$/ })).toBeDefined()
  await after.unmount()
})

test('a folder made a repository outside Claude reaches the band within the minute', async ($, on) => {
  const clock = mock.clock(on)
  let isRepo = false
  linuxHost(on, { isRepo: () => isRepo })
  bandHost(on, '/p')
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200_000 }, rateLimits: [] } }))
  on('command.register', () => ({ value: { command: 'awesome-hud' } }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/p', surface: 'terminal', isInteractive: true })
  await clock.advance(0)
  const before = await $.ui.mount(HINT)
  expect(await before.find({ type: 'Text', text: /^⎇ / })).toBeUndefined()
  await before.unmount()
  // `git init` in another terminal.
  isRepo = true
  await clock.advance(60_000)
  const after = await $.ui.mount(HINT)
  expect(await after.find({ type: 'Text', text: /^⎇ main$/ })).toBeDefined()
  await after.unmount()
})

test('in a linked worktree the folder is the project, the worktree after it', async ($, on) => {
  const clock = mock.clock(on)
  const gitDir = '/p/.git/worktrees/brave-fox'
  linuxHost(on, { gitDir, top: '/p/.claude/worktrees/brave-fox', files: { [`${gitDir}/HEAD`]: 'ref: refs/heads/feat\n', [`${gitDir}/commondir`]: '../..\n' } })
  bandHost(on, '/p/.claude/worktrees/brave-fox')
  await $.turn.complete(ANSWERED)
  await clock.advance(0)
  const band = await $.ui.mount(HINT)
  expect(await band.find({ type: 'Text', text: /^ Opus 5\.5  p ↳ brave-fox · 0m$/ })).toBeDefined()
  expect(await band.find({ type: 'Text', text: /^⎇ feat$/ })).toBeDefined()
  await band.unmount()
})

test("with PR status on, the repo row reads the branch's pull request from gh: its checks and its review", { options: { prStatus: true } }, async ($, on) => {
  const clock = mock.clock(on)
  const view = {
    number: 7,
    url: 'https://github.com/o/r/pull/7',
    state: 'OPEN',
    isDraft: false,
    reviewDecision: 'APPROVED',
    statusCheckRollup: [{ status: 'COMPLETED', conclusion: 'SUCCESS' }, { status: 'IN_PROGRESS', conclusion: null }, { state: 'FAILURE' }],
  }
  const { ran } = linuxHost(on, { gh: JSON.stringify(view) })
  bandHost(on, '/p')
  await $.turn.complete(ANSWERED)
  await clock.advance(0)
  const band = await $.ui.mount(HINT)
  expect((await band.find({ type: 'Link' }))?.props.href).toBe('https://github.com/o/r/pull/7')
  expect((await band.find({ type: 'Text', text: /^ ✗1$/ }))?.props.color).toBe('error')
  expect((await band.find({ type: 'Text', text: /^ approved$/ }))?.props.color).toBe('success')
  await band.unmount()
  expect(ran.find(argv => argv[0] === 'gh')).toEqual(['gh', 'pr', 'view', '--json', 'number,url,state,isDraft,reviewDecision,statusCheckRollup'])
})

test('with PR status on, a push while gh still reads the branch has it read again after', { options: { prStatus: true } }, async ($, on) => {
  const clock = mock.clock(on)
  const view = (status: string) =>
    JSON.stringify({ number: 7, url: 'https://github.com/o/r/pull/7', state: 'OPEN', isDraft: false, statusCheckRollup: [{ status, conclusion: status === 'COMPLETED' ? 'SUCCESS' : null }] })
  let answerFirst = () => {}
  const answers = [new Promise<string>(resolve => (answerFirst = () => resolve(view('IN_PROGRESS')))), Promise.resolve(view('COMPLETED'))]
  const { ran } = linuxHost(on, { gh: () => answers.shift()! })
  bandHost(on, '/p')
  on('ui.toast', () => ({ value: undefined }))
  on('tool.call', () => ranBash('', { gitOperation: { push: { branch: 'main' } } }))
  await $.turn.complete(ANSWERED)
  await clock.advance(0)
  // The push lands while the first gh still runs.
  await $.tool.call({ tool: 'Bash', command: 'git push' })
  await clock.advance(0)
  answerFirst()
  await clock.advance(0)
  await clock.advance(0)
  expect(ran.filter(argv => argv[0] === 'gh').length).toBe(2)
  const band = await $.ui.mount(HINT)
  expect((await band.find({ type: 'Text', text: /^ ✓$/ }))?.props.color).toBe('success')
  await band.unmount()
})

test('with flavorText off the spinner keeps its own word', { options: { flavorText: false } }, async ($, on) => {
  on('ui.render', { component: 'Spinner' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>{e.props.word}</Text>
  })
  const spinner = await $.ui.mount(SPINNER)
  expect(await spinner.find({ type: 'Text', text: /Sauteing/ })).toBeDefined()
  await spinner.unmount()
})

test('cost shows off a plan, hides on one under auto, and never reads $0.00', async () => {
  const plan = { startedAt: 0, costUsd: 1.5, limits: [{ kind: 'five_hour', percentUsed: 10 }] }
  const api = { ...plan, limits: [] }
  expect(costOf(api, 'auto')).toBe('$1.50')
  expect(costOf(plan, 'auto')).toBe('')
  expect(costOf(plan, 'show')).toBe('$1.50')
  expect(costOf(api, 'hide')).toBe('')
  expect(costOf({ ...api, costUsd: 0 }, 'show')).toBe('')
  expect(costOf(null, 'show')).toBe('')
})

test('gauges keep their columns whatever the label and percent', async () => {
  for (const [label, pct] of [['ctx', 0], ['5h', 100], ['$', 7.5]] as const) {
    const [head, used, free, tail] = gauge(label, pct)
    expect([head.length, used.length + free.length, tail.length]).toEqual([4, 12, 5])
  }
  expect(gauge('5h', 28).join('')).toBe(' 5h ━━━╸────────  28%')
  // Auto-compact's mark, hidden once the bar reaches it.
  expect(gauge('ctx', 40, 92).join('')).toBe('ctx ━━━━━──────┊  40%')
  expect(gauge('ctx', 95, 92).join('')).toBe('ctx ━━━━━━━━━━━╸  95%')
  expect(limitLabel('seven_day')).toBe('7d')
  expect(limitLabel('weekly_opus')).toBe('wee')
})

test('a row too wide drops what keeps least, whole and rightmost first, and never what always stays', async () => {
  const seg = (key: string, text: string, keep: number): Segment => ({ key, sep: ' ', keep, runs: [{ text }] })
  const segments = [seg('a', 'aaaa', Infinity), seg('b', 'bb', 10), seg('c', 'cc', 50), seg('d', 'dd', 10)]
  expect(fit(segments, 13).map(s => s.key)).toEqual(['a', 'b', 'c', 'd'])
  expect(fit(segments, 10).map(s => s.key)).toEqual(['a', 'b', 'c'])
  expect(fit(segments, 7).map(s => s.key)).toEqual(['a', 'c'])
  expect(fit(segments, 2).map(s => s.key)).toEqual(['a'])
  // An unknown width keeps it all.
  expect(fit(segments, 0)).toHaveLength(4)
  expect(cells('⎇ 日本')).toBe(6)
  expect(middle('feature/JIRA-1234-add-oauth-login', 24)).toBe('feature/JIRA…oauth-login')
  expect(middle('main', 24)).toBe('main')
})

test('model ids read as claude-hud reads them', async () => {
  expect(prettyModel('claude-opus-5-5')).toBe('Opus 5.5')
  expect(prettyModel('claude-opus-5-5[1m]')).toBe('Opus 5.5')
  expect(prettyModel('claude-haiku-4-5-20251001')).toBe('Haiku 4.5')
  expect(prettyModel('claude-3-5-sonnet-20241022')).toBe('Sonnet 3.5')
  expect(prettyModel('my-gateway-model')).toBe('my-gateway-model')
})

test('turns left comes from recent growth and waits for history', async () => {
  expect(turnsLeft([10], 10, 92)).toBe(null)
  expect(turnsLeft([10, 20, 30], 30, 92)).toBe(6)
  expect(turnsLeft([30, 20, 10], 10, 92)).toBe(null)
})

test("tests, commits and pushes are worth a party; Claude Code's reading of a git command decides, else its text with quotes and dry runs aside", async () => {
  expect(partyOf('npm test')).toBe('tests')
  expect(partyOf('git commit -m x')).toBe('commit')
  expect(partyOf('git push origin main')).toBe('push')
  expect(partyOf('ls -la')).toBe(undefined)
  expect(partyOf('git -C repo commit -m x')).toBe('commit')
  expect(partyOf('git add . && git commit -m "x" && git push')).toBe('push')
  expect(partyOf('echo "remember to git push"')).toBe(undefined)
  expect(partyOf('git commit -m "fix; git push later"')).toBe('commit')
  expect(partyOf('git push --dry-run')).toBe(undefined)
  expect(partyOf('git push -n origin main')).toBe(undefined)
  expect(partyOf('git commit -n -m x')).toBe('commit')
  expect(partyOf('gh pr create --fill', { push: { branch: 'feat' }, pr: { number: 4, action: 'created' } })).toBe('push')
  expect(partyOf('git commit -m x', { branch: { ref: 'main', action: 'rebased' } })).toBe(undefined)
})

test('test runs read as passed and failed counts from their summary', async () => {
  expect(testsOf('npx vitest run', ' Test Files  1 failed | 3 passed (4)\n      Tests  2 failed | 40 passed | 1 skipped (43)\n')).toEqual({ passed: 40, failed: 2 })
  expect(testsOf('npm test', 'Test Suites: 1 failed, 2 passed, 3 total\nTests:       2 failed, 10 passed, 12 total\n')).toEqual({ passed: 10, failed: 2 })
  expect(testsOf('pytest -q', '..F.\n=== 1 failed, 3 passed, 1 error in 0.12s ===\n')).toEqual({ passed: 3, failed: 2 })
  expect(testsOf('go test ./...', '--- FAIL: TestAdd (0.00s)\nFAIL\nFAIL\tex.com/a\t0.01s\nok  \tex.com/b\t0.02s\n')).toEqual({ passed: 1, failed: 1 })
  expect(testsOf('go test -v ./...', '--- PASS: TestA (0.00s)\n--- PASS: TestB (0.00s)\nPASS\nok  \tex.com/a\t0.01s\n')).toEqual({ passed: 2, failed: 0 })
  expect(testsOf('cargo test', 'test result: FAILED. 38 passed; 2 failed; 0 ignored\ntest result: ok. 4 passed; 0 failed; 0 ignored\n')).toEqual({ passed: 42, failed: 2 })
  expect(testsOf('claude plugin test .', '(pass) a [1ms]\n\n 24 pass\n 0 fail\nRan 24 tests across 1 file.\n')).toEqual({ passed: 24, failed: 0 })
  expect(testsOf('npx mocha', '  5 passing (20ms)\n  2 failing\n')).toEqual({ passed: 5, failed: 2 })
  expect(testsOf('npx playwright test', '  1 failed\n    [chromium] › a.spec.ts:3:1 › has title\n  3 passed (5.2s)\n')).toEqual({ passed: 3, failed: 1 })
  expect(testsOf('bundle exec rspec', 'Finished in 0.5 seconds\n10 examples, 2 failures, 1 pending\n')).toEqual({ passed: 7, failed: 2 })
  const dotnet = 'Failed!  - Failed:     2, Passed:    10, Skipped:     0, Total:    12, Duration: 1 s - a.dll (net8.0)\nPassed!  - Failed:     0, Passed:     4, Skipped:     0, Total:     4, Duration: 1 s - b.dll (net8.0)\n'
  expect(testsOf('dotnet test', dotnet)).toEqual({ passed: 14, failed: 2 })
  expect(testsOf('dotnet test', 'Test summary: total: 12, failed: 2, succeeded: 10, skipped: 0, duration: 1.2s\n')).toEqual({ passed: 10, failed: 2 })
  expect(testsOf('vendor/bin/phpunit', 'FAILURES!\nTests: 12, Assertions: 30, Errors: 1, Failures: 2, Skipped: 1.\n')).toEqual({ passed: 8, failed: 3 })
  expect(testsOf('vendor/bin/phpunit', 'OK (12 tests, 30 assertions)\n')).toEqual({ passed: 12, failed: 0 })
  const maven = '[INFO] Tests run: 3, Failures: 0, Errors: 0, Skipped: 0, Time elapsed: 0.1 s - in a.FooTest\n[ERROR] Tests run: 12, Failures: 2, Errors: 1, Skipped: 1\n'
  expect(testsOf('mvn test', maven)).toEqual({ passed: 8, failed: 3 })
  expect(testsOf('deno test', 'FAILED | 10 passed | 2 failed (1s)\n')).toEqual({ passed: 10, failed: 2 })
  expect(testsOf('python -m unittest', 'Ran 12 tests in 0.010s\n\nFAILED (failures=2, errors=1, skipped=1)\n')).toEqual({ passed: 8, failed: 3 })
  expect(testsOf('python manage.py test', 'Ran 5 tests in 0.2s\n\nOK\n')).toEqual({ passed: 5, failed: 0 })
  expect(testsOf('mix test', 'Finished in 0.1 seconds\n1 doctest, 12 tests, 2 failures\n')).toEqual({ passed: 11, failed: 2 })
  expect(testsOf('swift test', "Test Suite 'All tests' failed.\n\t Executed 12 tests, with 2 failures (0 unexpected) in 0.5 (0.6) seconds\n")).toEqual({ passed: 10, failed: 2 })
  // Task runners: their runner's summary counts.
  expect(testsOf('make test', '=== 2 failed, 40 passed in 1.2s ===')).toEqual({ passed: 40, failed: 2 })
  expect(testsOf('turbo run test --filter web', ' Tests  1 failed | 9 passed (10)')).toEqual({ passed: 9, failed: 1 })
  expect(testsOf('just test', ' 24 pass\n 0 fail\n')).toEqual({ passed: 24, failed: 0 })
  // Colors a runner forced on.
  expect(testsOf('npx jest', '\x1b[1mTests:       \x1b[22m\x1b[1m\x1b[32m3 passed\x1b[39m\x1b[22m, 3 total')).toEqual({ passed: 3, failed: 0 })
  // Not a test command, no summary, nothing run.
  expect(testsOf('ls', ' 24 pass\n')).toBe(undefined)
  expect(testsOf('npm test', 'Error: Cannot find module')).toBe(undefined)
  expect(testsOf('pytest', '=== 3 deselected in 0.01s ===')).toBe(undefined)
})

test('git status v2 reads as the head, the upstream, the paths by kind, and the stashes', async () => {
  const records = [
    '# branch.upstream origin/main',
    '# branch.ab +1 -2',
    '# stash 3',
    '1 M. N... 100644 100644 100644 x y staged.ts',
    '1 .M N... 100644 100644 100644 x y changed file.ts',
    '1 MM N... 100644 100644 100644 x y both.ts',
    '2 R. N... 100644 100644 100644 x y R100 new.ts',
    'old.ts',
    'u UU N... 100644 100644 100644 100644 x y z conflict.ts',
    '? scratch.txt',
  ]
  expect(parseStatus(STATUS('main', ...records), true)).toEqual({
    head: 'main',
    oid: 'a'.repeat(40),
    upstream: 'tracking',
    ahead: 1,
    behind: 2,
    staged: 3,
    unstaged: 2,
    untracked: 1,
    conflicts: 1,
    stashes: 3,
    paths: { 'staged.ts': 'staged', 'changed file.ts': 'modified', 'both.ts': 'modified', 'new.ts': 'staged', 'conflict.ts': 'conflict', 'scratch.txt': 'new' },
  })
  // An upstream with no counts is gone, and with none at all there is none; a detached HEAD; no commits yet.
  expect(parseStatus(STATUS('feat/x', '# branch.upstream origin/feat/x'))?.upstream).toBe('gone')
  expect(parseStatus(STATUS('feat/x'))?.upstream).toBe('none')
  expect(parseStatus(STATUS('(detached)'))?.head).toBe('(detached)')
  expect(parseStatus(z('# branch.oid (initial)', '# branch.head main'))?.oid).toBe(null)
  expect(parseStatus('fatal: not a git repository')).toBe(null)
  expect(headOf('ref: refs/heads/feat/x\n')).toEqual({ branch: 'feat/x', oid: null })
  expect(headOf('9091f7b7a09d414d635f49b0cf3842ae592d0b17\n')).toEqual({ branch: null, oid: '9091f7b7a09d414d635f49b0cf3842ae592d0b17' })
})

test('the branch cluster says what git is in the middle of, the commits to push and pull, and an upstream gone or never set', async () => {
  const branchOf = (git: Partial<Git>) => rowText(branchSegments({ ...GIT, ...git }))
  expect(branchOf({})).toBe('⎇ main')
  expect(branchOf({ ahead: 2, behind: 1 })).toBe('⎇ main ↑2 ↓1')
  expect(branchOf({ op: { kind: 'rebase', step: 2, of: 5 } })).toBe('⎇ main|REBASE 2/5')
  expect(branchOf({ op: { kind: 'merge' } })).toBe('⎇ main|MERGING')
  expect(branchOf({ branch: null, oid: '9091f7b7a09d' })).toBe('⎇ @9091f7b')
  expect(branchOf({ upstream: 'gone' })).toBe('⎇ main upstream gone')
  expect(branchOf({ upstream: 'none', ahead: 3 })).toBe('⎇ main ↑3 unpublished')
  expect(branchOf({ branch: 'feature/JIRA-1234-add-oauth-login' })).toBe('⎇ feature/JIRA…oauth-login')
  // Behind as of a fetch over a day old: dim, not a warning.
  const [, sync] = branchSegments({ ...GIT, behind: 4, isFetchStale: true })
  expect(sync?.runs[0]).toEqual({ text: '↓4', color: undefined, dim: true })
  expect(rowText(treeSegments({ ...GIT, conflicts: 2, staged: 1, unstaged: 3, untracked: 4, stashes: 1 }))).toBe('2 conflicts │ ● 1  ✚ 3  ? 4 new │ ≡ 1 stash')
  expect(rowText(treeSegments({ ...GIT, unstaged: 3, untracked: null }))).toBe('✚ 3')
  // Clean is said only when the status said so: not of an earlier one, nor with untracked files left out.
  expect(rowText(treeSegments({ ...GIT, untracked: 0 }))).toBe('✓ clean')
  expect(rowText(treeSegments({ ...GIT, untracked: 0, isStale: true }))).toBe('')
  expect(rowText(treeSegments({ ...GIT, untracked: null }))).toBe('')
  // The cluster is padded to a fixed width, so the tree starts in one column.
  expect(rowText(branchSegments({ ...GIT, ahead: 2 }, 20))).toBe('⎇ main ↑2'.padEnd(20))
  expect(rowText(branchSegments({ ...GIT, branch: 'a-branch-name-longer-than-it' }, 8)).length).toBeGreaterThan(8)
})

test('a test run an edit followed is marked stale', async () => {
  const run = { passed: 3, failed: 0, at: 1_000, command: 'npm test' }
  const text = (editedAt: number) => rowText([testSegment(run, editedAt, 61_000)])
  expect(text(0)).toBe('✓ 3 passed (1m ago)')
  expect(text(2_000)).toBe('✓ 3 passed (1m ago, stale)')
})

test('tool targets are short and free of control characters', async () => {
  expect(targetOf({ file_path: '/home/me/project/src/auth.ts' })).toBe('auth.ts')
  expect(targetOf({ command: 'echo \u001b[31mhi' })).toBe('echo [31mhi')
  expect(shortTool('mcp__github__create_issue')).toBe('create_issue')
})
