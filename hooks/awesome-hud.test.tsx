import type { On, ToolCallResult } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import { changesOf, costOf, gauge, limitLabel, parseGit, partyOf, prettyModel, resetTime, shortTool, targetOf, testsOf, turnsLeft } from './format'
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

// A turn long enough for the done sound.
const ANSWERED = { answer: 'ok', durationMs: 40_000, isAborted: false, turnId: 't1', reason: 'answer' } as const

// A Linux host with pw-play: records what it plays; git finds no repository unless given the status it prints.
const linuxHost = (on: On, gitStatus?: string) => {
  const played: string[][] = []
  const ran = (stdout: string, exitCode = 0) => ({ value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })
  on('env.get', () => ({ value: undefined }))
  on('process.run', ($, e) => {
    if (e.argv[0] === 'uname') return ran('Linux\n')
    if (e.argv[0] === 'git' && gitStatus !== undefined) return ran(gitStatus)
    if (e.argv[0] !== 'pw-play') return ran('', 128)
    if (e.argv[1] !== '--version') played.push([...e.argv])
    return ran('')
  })
  on('turn.complete', () => ({ text: '' }))
  return played
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

test('every theme has a banner that fits and a sound for every event', async () => {
  for (const [name, t] of Object.entries(THEMES)) {
    expect(t.banner.length).toBeGreaterThan(0)
    expect(Math.max(...t.banner.map(row => row.length))).toBeLessThanOrEqual(48)
    expect(Object.keys(t.sounds).sort()).toEqual(['done', 'error', 'party', 'waiting'])
    for (const path of Object.values(t.sounds)) expect(path).toMatch(new RegExp(`^sounds/${name}/[a-z]+\\.wav$`))
  }
})

test("a long turn answered plays the theme's done sound through the Linux host's player", async ($, on) => {
  const clock = mock.clock(on)
  const played = linuxHost(on)
  await $.turn.complete(ANSWERED)
  await clock.advance(0)
  expect(played).toHaveLength(1)
  expect(played[0]![0]).toBe('pw-play')
  expect(played[0]![1]).toMatch(/\/sounds\/cat\/done\.wav$/)
})

test('one error sound a turn, and none for a party turn, a quick turn or an interrupt; waiting on an ask', async ($, on) => {
  const clock = mock.clock(on)
  const played = linuxHost(on)
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
  expect(await heard()).toEqual(['waiting', 'waiting'])
})

test('at rest the quip line names failing tests and the agents at work instead of a joke', async ($, on) => {
  const clock = mock.clock(on)
  linuxHost(on)
  hintLine(on)
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.cwd', () => ({ value: '/home/me/project' }))
  on('ui.blit', () => ({ value: {} }))
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

test("from 70% full the context row names what takes the most of it, as the turn's end counted", async ($, on) => {
  mock.clock(on)
  linuxHost(on)
  hintLine(on)
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.cwd', () => ({ value: '/home/me/project' }))
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('ui.blit', () => ({ value: {} }))
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

test('bars take the theme accent until they warn, then their percent warns too; ┊ marks auto-compact', async ($, on) => {
  mock.clock(on)
  hintLine(on)
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.cwd', () => ({ value: '/home/me/project' }))
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('ui.blit', () => ({ value: {} }))
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
  hintLine(on)
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.cwd', () => ({ value: '/home/me/project' }))
  on('ui.blit', () => ({ value: {} }))
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
  hintLine(on)
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.cwd', () => ({ value: '/home/me/project' }))
  on('ui.blit', () => ({ value: {} }))
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

test('with sounds off nothing plays', { options: { sounds: false } }, async ($, on) => {
  const clock = mock.clock(on)
  const played = linuxHost(on)
  await $.turn.complete(ANSWERED)
  await clock.advance(0)
  expect(played).toHaveLength(0)
})

test('switching theme draws its banner under the command line', async ($, on) => {
  on('ui.render', { component: 'CommandOutput' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>{e.props.text}</Text>
  })
  const props = { command: 'awesome-hud', args: 'got', text: 'Theme: got', isErrored: false }
  const row = await $.ui.mount({ plugin: 'awesome-hud', component: 'CommandOutput', surface: 'terminal', props })
  const texts = (await row.findAll({ type: 'Text' })).map(t => t.text)
  expect(texts).toContain('Theme: got')
  expect(texts).toContain(THEMES.got!.banner[1])
  await row.unmount()
})

test('under the prompt the band draws the mascot beside the status bar, after the hint line', async ($, on) => {
  mock.clock(on)
  hintLine(on)
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.cwd', () => ({ value: '/home/me/.claude' }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('ui.blit', () => ({ value: {} }))

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

test('the 5h window and the week each get a row with the time left and the reset time', async ($, on) => {
  const clock = mock.clock(on)
  hintLine(on)
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.cwd', () => ({ value: '/home/me/.claude' }))
  on('session.measure', ($, e) => ({ changed: e.changed }))
  const inHours = (h: number) => new Date(clock.now() + h * 3_600_000).toISOString()
  const rateLimits = [{ kind: 'five_hour', percentUsed: 85, resetsAt: inHours(1) }, { kind: 'seven_day', percentUsed: 11, resetsAt: inHours(60) }]
  await $.session.measure({ context: { window: 200_000, percent: 42 }, rateLimits, changed: ['context', 'rateLimits'] })
  const band = await $.ui.mount(HINT)
  expect(await band.find({ type: 'Text', text: / 5h .* 85% {2}↻ in 1h 0m · \d+:\d\d[ap]m$/ })).toBeDefined()
  expect(await band.find({ type: 'Text', text: / 7d .* 11% {2}↻ in 2d 12h · [A-Z][a-z]{2} \d+, \d+:\d\d[ap]m$/ })).toBeDefined()
  await band.unmount()
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
  hintLine(on)
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.cwd', () => ({ value: '/home/me/.claude' }))
  on('ui.blit', () => ({ value: {} }))
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

test('tests party only on a summary that passed, and the band shows the last run', async ($, on) => {
  const clock = mock.clock(on)
  linuxHost(on)
  hintLine(on)
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.cwd', () => ({ value: '/home/me/project' }))
  on('ui.blit', () => ({ value: {} }))
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
  expect(await failing.find({ type: 'Text', text: /^✗ 2 failed · 0m ago$/ })).toBeDefined()
  await failing.unmount()

  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  await clock.advance(180_000)
  expect(toasts).toEqual([THEMES.cat!.party.tests])
  const passing = await $.ui.mount(HINT)
  expect(await passing.find({ type: 'Text', text: /^✓ 24 passed · 3m ago$/ })).toBeDefined()
  await passing.unmount()
})

test('files edited and commits ahead close the first row while both plan windows fill the middle', async ($, on) => {
  const clock = mock.clock(on)
  linuxHost(on, '## main...origin/main [ahead 2]\n')
  hintLine(on)
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.cwd', () => ({ value: '/home/me/project' }))
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('ui.blit', () => ({ value: {} }))
  const answers: ToolCallResult[] = [{ result: {} }, { result: {} }, { result: {} }, { deny: 'no' }]
  on('tool.call', () => answers.shift()!)
  // One file twice, another once, and a write refused.
  await $.tool.call({ tool: 'Edit', file_path: '/p/a.ts', old_string: 'a', new_string: 'b' })
  await $.tool.call({ tool: 'Edit', file_path: '/p/a.ts', old_string: 'b', new_string: 'c' })
  await $.tool.call({ tool: 'Write', file_path: '/p/b.ts', content: 'x' })
  await $.tool.call({ tool: 'Write', file_path: '/p/c.ts', content: 'x' })
  await $.turn.complete(ANSWERED)
  await clock.advance(0)

  const api = await $.ui.mount(HINT)
  expect(await api.find({ type: 'Text', text: /^✎2 ↑2$/ })).toBeDefined()
  await api.unmount()
  const rateLimits = [{ kind: 'five_hour', percentUsed: 10 }, { kind: 'seven_day', percentUsed: 5 }]
  await $.session.measure({ context: { window: 200_000, percent: 42 }, rateLimits, changed: ['context', 'rateLimits'] })
  const plan = await $.ui.mount(HINT)
  expect(await plan.find({ type: 'Text', text: /⎇ main · 0m · ✎2 ↑2$/ })).toBeDefined()
  await plan.unmount()
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

test('tests, commits and pushes are worth a party', async () => {
  expect(partyOf('npm test')).toBe('tests')
  expect(partyOf('git commit -m x')).toBe('commit')
  expect(partyOf('git push origin main')).toBe('push')
  expect(partyOf('ls -la')).toBe(undefined)
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
  // Colors a runner forced on.
  expect(testsOf('npx jest', '\x1b[1mTests:       \x1b[22m\x1b[1m\x1b[32m3 passed\x1b[39m\x1b[22m, 3 total')).toEqual({ passed: 3, failed: 0 })
  // Not a test command, no summary, nothing run.
  expect(testsOf('ls', ' 24 pass\n')).toBe(undefined)
  expect(testsOf('npm test', 'Error: Cannot find module')).toBe(undefined)
  expect(testsOf('pytest', '=== 3 deselected in 0.01s ===')).toBe(undefined)
})

test('git status reads as a branch, a dirty mark, and commits ahead and behind', async () => {
  expect(parseGit('## main...origin/main [ahead 1, behind 2]\n M a.ts\n')).toEqual({ branch: 'main', isDirty: true, ahead: 1, behind: 2 })
  expect(parseGit('## main...origin/main [behind 3]\n')).toEqual({ branch: 'main', isDirty: false, ahead: 0, behind: 3 })
  expect(parseGit('## feat/x\n')).toEqual({ branch: 'feat/x', isDirty: false, ahead: 0, behind: 0 })
  expect(parseGit('fatal: not a repo')).toBe(null)
  expect(changesOf(5, parseGit('## main...origin/main [ahead 2]\n'))).toBe('✎5 ↑2')
  expect(changesOf(0, null)).toBe('')
})

test('tool targets are short and free of control characters', async () => {
  expect(targetOf({ file_path: '/home/me/project/src/auth.ts' })).toBe('auth.ts')
  expect(targetOf({ command: 'echo \u001b[31mhi' })).toBe('echo [31mhi')
  expect(shortTool('mcp__github__create_issue')).toBe('create_issue')
})
