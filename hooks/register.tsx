import { atom, read, update } from 'claude-code'
import type { BuiltinToolResults, Elements, EngineInterface, Register, Timer } from 'claude-code'

import type { Activity, Eater, Git, Meter, Mood, TestRun, TurnNote } from '../types'
import {
  COMPACT_AT, CONTEXT_CRIT, CONTEXT_WARN, EFFORT_GLYPH, between, changesOf, clean, contextAlert, costOf, duration, fill, gauge, isHot,
  limitLabel, parseGit, partyOf, pick, prettyModel, quotaAlert, resetTime, shortTool, shown, targetOf, testsOf, toMeter, turnsLeft,
} from './format'
import { play } from './sound'
import { encode, HEIGHT, WIDTH } from './sprite'
import type { PartyCause, SoundEvent } from './theme'
import type { Theme } from './theme'
import { DEFAULT_THEME, THEMES } from './themes'

const themeName = atom({ plugin: 'awesome-hud', key: 'theme' } as const, DEFAULT_THEME)
const mood = atom({ plugin: 'awesome-hud', key: 'mood' } as const, 'idle' as Mood)
const quip = atom({ plugin: 'awesome-hud', key: 'quip' } as const, '')
const effort = atom({ plugin: 'awesome-hud', key: 'effort' } as const, null as string | null)
const meter = atom({ plugin: 'awesome-hud', key: 'meter' } as const, null as Meter | null)
const minute = atom({ plugin: 'awesome-hud', key: 'minute' } as const, 0)
const activity = atom({ plugin: 'awesome-hud', key: 'activity' } as const, { running: [] } as Activity)
const git = atom({ plugin: 'awesome-hud', key: 'git' } as const, null as Git | null)
const tests = atom({ plugin: 'awesome-hud', key: 'tests' } as const, null as TestRun | null)
const edited = atom({ plugin: 'awesome-hud', key: 'edited' } as const, [] as string[])
const editedAt = atom({ plugin: 'awesome-hud', key: 'editedAt' } as const, 0)
const eater = atom({ plugin: 'awesome-hud', key: 'eater' } as const, null as Eater | null)
const agents = atom({ plugin: 'awesome-hud', key: 'agents' } as const, [] as string[])
const contextHistory = atom({ plugin: 'awesome-hud', key: 'contextHistory' } as const, [] as number[])
const turnNotes = atom({ plugin: 'awesome-hud', key: 'turnNotes' } as const, {} as Record<string, TurnNote>)

const SLEEP_AFTER_MS = 5 * 60_000
// A quicker answer plays no done sound: it is there before you have looked away.
const LONG_TURN_MS = 30_000
// An agent yet to start, running, or waiting on something is at work; an idle teammate is not.
const AT_WORK = new Set(['pending', 'running', 'waiting'])
// The quip's `»` in the color of a mood that has one, so the state reads without the sprite.
const MOOD_COLOR: Partial<Record<Mood, string>> = { error: 'error', waiting: 'warning', done: 'success', party: 'success' }
const MIN_COLUMNS = 70
const MIN_ROWS = 6
// The sprite's height in rows, two pixels a cell; the status column is held to it.
const ROWS = HEIGHT / 2
// shortcut: under the prompt only the terminal's height is reported, not the room left there; on 2.1.303 the
// five rows fit from about 20 rows, and 24 leaves room for a status line or a notice. Re-measure if rows get cut.
const BELOW_MIN_TERMINAL_ROWS = 24

/** Where the band is drawn, and its room: cells across, and whether the sprite's rows fit. */
type Site = { requestId: string; columns: number; isTall: boolean }

// Own keys only: `/awesome-hud constructor` must not find what every object inherits.
const isTheme = (name: string) => Object.hasOwn(THEMES, name)
const themeOf = (name: string): Theme => THEMES[isTheme(name) ? name : DEFAULT_THEME]!

let theme = themeOf(DEFAULT_THEME)
// The `flavorText` option: theme words in Claude Code's own spinner and turn line, and the party toasts.
let isFlavored = true
// The `sounds` option.
let isSounding = true
// The `cost` option: auto, show or hide.
let costMode = 'auto'
// The `layout` option at `compact`: the stats alone, on two lines.
let isCompact = false
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

async function refreshGit($: EngineInterface) {
  try {
    // --no-optional-locks: a status in the background must not take index.lock from the person's own git.
    const argv = ['git', '--no-optional-locks', 'status', '--porcelain=v1', '--branch']
    const r = await $.process.run(argv, { cwd: await $.session.cwd(), timeoutMs: 3_000 })
    await update($, git, () => (r.exitCode === 0 ? parseGit(r.stdout) : null))
  } catch {
    await update($, git, () => null)
  }
}

async function refreshAgents($: EngineInterface) {
  try {
    const all = await $.agent.list()
    await update($, agents, () => all.filter(a => AT_WORK.has(a.status)).map(a => clean(a.description)))
  } catch {
    await update($, agents, () => [])
  }
}

// `summary` counts the breakdown locally, with none of the token-count requests /context sends.
async function refreshEater($: EngineInterface) {
  try {
    const { context } = await $.session.usage({ breakdown: 'summary' })
    const top = (context.breakdown?.categories ?? []).filter(c => c.kind === 'used').sort((a, b) => b.tokens - a.tokens)[0]
    await update($, eater, () => (top ? { name: top.name, tokens: top.tokens } : null))
  } catch {
    await update($, eater, () => null)
  }
}

const agentOf = (e: object) => (e as { agentId?: string }).agentId

// The band, for whichever site holds it: under the prompt after the hint line, or above the prompt.
async function band($: EngineInterface, ui: Elements['terminal'], site: Site) {
  const hasCat = !isCompact && site.columns >= MIN_COLUMNS && site.isTall
  if (hasCat) bandId = site.requestId
  else park()

  const [name, m, say, meterNow, effortNow, model, cwd, now, minuteNow, act, gitNow, history, testsNow, editedNow, eaterNow, agentsNow, editedAtNow] =
    await Promise.all([
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
      read($, contextHistory),
      read($, tests),
      read($, edited),
      read($, eater),
      read($, agents),
      read($, editedAt),
    ])
  theme = themeOf(name)
  const shownMood = shown(m, isHot(meterNow))
  if (hasCat) {
    lastBlit = cellsAt(shownMood, idx)
    if (!animation) animate($)
  }

  const { Box, Text, Raster } = ui

  // At rest the quip line says what needs you, failing tests first; a joke only when nothing does.
  const needs =
    !say && (m === 'idle' || m === 'asleep')
      ? [
          ...(testsNow && testsNow.failed > 0 ? [`✗ ${testsNow.failed} tests failed · ${duration(now - testsNow.at)} ago`] : []),
          ...(agentsNow.length > 0 ? [`◐ ${agentsNow.length} agent${agentsNow.length === 1 ? '' : 's'}: ${agentsNow.at(-1)}`] : []),
        ]
      : []
  const running = act.running.at(-1)
  // A tool past a minute says how long it has run, so one that hangs shows.
  const ranFor = running ? now - running.startedAt : 0
  const line =
    say ||
    (shownMood === 'working' && running
      ? fill(theme.verbs[running.name] ?? theme.verbs.default!, running.target) + (ranFor >= 60_000 ? ` · ${duration(ranFor)}` : '')
      : needs.join(' · ') || pick(theme.quips[shownMood], minuteNow))
  // A need is drawn plain, to stand out from the dim jokes.
  const quipLine = (
    <Text italic={needs.length === 0} dimColor={needs.length === 0}>
      {line}
    </Text>
  )

  // The bar in the theme's accent until it warns; then bar and percent both take the warning's color, as the accent
  // may be close to it (cat's orange).
  const gaugeOf = (label: string, pct: number, alert: string | undefined, tick?: number) => {
    const [head, used, free, tail] = gauge(label, pct, tick)
    return (
      <Text>
        <Text dimColor>{head}</Text>
        <Text color={alert ?? theme.accent}>{used}</Text>
        <Text dimColor>{free}</Text>
        <Text color={alert} bold={alert !== undefined}>
          {tail}
        </Text>
      </Text>
    )
  }

  const pct = Math.round(meterNow?.contextPercent ?? 0)
  const left = turnsLeft(history, meterNow?.contextPercent, COMPACT_AT)
  // `┊` marks where auto-compact starts.
  const contextGauge = gaugeOf('ctx', pct, contextAlert(pct), COMPACT_AT)
  const turnsNote = <Text dimColor>{left === null ? '' : `  ~${left} turn${left === 1 ? '' : 's'} left`}</Text>
  // From 70% full, what takes the most of the context, as the last turn end counted it.
  const eaterNote = <Text dimColor>{pct >= CONTEXT_WARN && eaterNow ? ` · ${eaterNow.name} ${Math.round(eaterNow.tokens / 1_000)}k` : ''}</Text>

  // Each plan window with how long until it resets, and when, in the person's own time as /usage shows it.
  const limits = (meterNow?.limits ?? []).map(l => {
    const untilReset = l.resetsAt ? Date.parse(l.resetsAt) - now : 0
    return {
      kind: l.kind,
      gauge: gaugeOf(limitLabel(l.kind), l.percentUsed, quotaAlert(l.percentUsed)),
      reset: l.resetsAt && untilReset > 0 ? `↻ in ${duration(untilReset)} · ${resetTime(l.resetsAt, now)}` : '',
    }
  })

  const glyph = effortNow ? ` ${EFFORT_GLYPH[effortNow] ?? ''} ${effortNow}` : ''
  const chip = (
    <Text backgroundColor={theme.accent} color={theme.onAccent} bold>
      {` ${prettyModel(model)}${glyph} `}
    </Text>
  )

  const cost = costOf(meterNow, costMode)
  const delta = changesOf(editedNow.length, gitNow)
  // A run older than the last edit no longer vouches for the code: it loses its color.
  const testColor = !testsNow || editedAtNow > testsNow.at ? undefined : testsNow.failed > 0 ? 'error' : 'success'
  // What changed: files edited and commits ahead and behind, then the last test run.
  const changes = between(
    [
      ...(delta ? [<Text key="delta">{delta}</Text>] : []),
      ...(testsNow
        ? [
            <Text key="tests">
              <Text color={testColor} dimColor={testColor === undefined}>
                {testsNow.failed > 0 ? `✗ ${testsNow.failed} failed` : `✓ ${testsNow.passed} passed`}
              </Text>
              <Text dimColor>{` · ${duration(now - testsNow.at)} ago`}</Text>
            </Text>,
          ]
        : []),
    ],
    i => <Text key={`sep${i}`} dimColor> · </Text>,
  )
  // Compact has no middle rows, and a plan's two windows fill them: what changed then closes the first row instead.
  const isChangesLast = isCompact || limits.length >= 2
  const topRow = (
    <Text wrap="truncate-end">
      {chip}
      <Text> {cwd.split(/[\\/]/).pop() || cwd}</Text>
      {gitNow ? <Text color="suggestion"> ⎇ {gitNow.branch}{gitNow.isDirty ? '*' : ''}</Text> : null}
      <Text dimColor>
        {' '}· {meterNow ? duration(now - meterNow.startedAt) : '0m'}
        {cost ? ` · ${cost}` : ''}
      </Text>
      {isChangesLast && changes.length > 0 ? (
        <Text>
          <Text dimColor> · </Text>
          {changes}
        </Text>
      ) : null}
    </Text>
  )

  // Two lines: compact's stats alone, or, with no room for the sprite, its text face and the quip over the gauges.
  if (!hasCat) {
    return (
      <Box flexDirection="column">
        {isCompact ? (
          topRow
        ) : (
          <Text wrap="truncate-end">
            {chip}
            <Text> {theme.faces[shownMood]} </Text>
            {quipLine}
          </Text>
        )}
        <Text wrap="truncate-end">
          {contextGauge}
          {limits.length === 0 ? turnsNote : limits.map(l => <Text key={l.kind}>{'  '}{l.gauge}</Text>)}
        </Text>
      </Box>
    )
  }

  // The status column is held to the sprite's rows, the quip on the last, so no row moves as others come and go.
  return (
    <Box flexDirection="row" columnGap={1}>
      <Raster key="cat" columns={WIDTH} rows={ROWS} cells={cellsAt(shownMood, idx)} />
      <Box flexDirection="column" height={ROWS} justifyContent="space-between">
        <Box flexDirection="column">
          {topRow}
          <Text wrap="truncate-end">
            {contextGauge}
            {turnsNote}
            {eaterNote}
          </Text>
          {/* The plan windows take the middle rows first; what changed takes one left free. */}
          {limits.slice(0, 2).map(l => (
            <Text key={l.kind} wrap="truncate-end">
              {l.gauge}
              <Text dimColor>{l.reset ? `  ${l.reset}` : ''}</Text>
            </Text>
          ))}
          {!isChangesLast && changes.length > 0 ? <Text wrap="truncate-end">{changes}</Text> : null}
        </Box>
        <Text wrap="truncate-end">
          <Text color={MOOD_COLOR[shownMood] ?? theme.accent}>» </Text>
          {quipLine}
        </Text>
      </Box>
    </Box>
  )
}

export const register: Register = (on, options) => {
  isFlavored = options.flavorText !== false
  isSounding = options.sounds !== false
  costMode = String(options.cost ?? 'auto')
  isCompact = options.layout === 'compact'

  on('session.start', async ($, e, next) => {
    // The theme lives in /config: a change there reloads the mod, and this runs again with it.
    const configured = String(options.theme ?? DEFAULT_THEME)
    await update($, themeName, () => configured)
    theme = themeOf(configured)

    const usage = await $.session.usage()
    const m = toMeter(usage, usage.startedAt)
    hot = isHot(m)
    current = await read($, mood)
    lastActive = await $.clock.now()
    await update($, meter, () => m)
    // Not awaited: the first prompt waits on session.start, and git in a big repo takes seconds.
    void refreshGit($)

    $.clock.every(60_000, async () => {
      await update($, minute, n => n + 1)
      if (current === 'idle' && (await $.clock.now()) - lastActive > SLEEP_AFTER_MS) await setMood($, 'asleep')
      // An agent's end may land after its last turn's: look again while any is listed at work.
      if ((await read($, agents)).length > 0) void refreshAgents($)
    })

    await $.command.register({ name: 'awesome-hud', description: `Switch the theme: /awesome-hud ${Object.keys(THEMES).join('|')}` })

    return next(e)
  })

  on('command.run', { command: 'awesome-hud' }, async ($, e) => {
    const name = e.args.trim().toLowerCase()
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
    return { text: `${list.join('\n')}\n\n/awesome-hud <theme> switches, and keeps the choice in /config.` }
  })

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
    if (e.reason === 'clear') {
      await Promise.all([
        update($, contextHistory, () => []),
        update($, turnNotes, () => ({})),
        update($, activity, () => ({ running: [] })),
        update($, edited, () => []),
      ])
      isCompactWarned = false
    }
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    await touch($)
    if (/^\s*pspsps+\s*$/i.test(e.text)) await celebrate($, 'summoned')
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
    if (result.decision === 'ask' && agentOf(e) === undefined) {
      sound($, 'waiting')
      await setMood($, 'waiting')
    }
    return result
  }).catch(($, e, next) => next(e))

  on('tool.call', async ($, e, next) => {
    if (agentOf(e) !== undefined) return next(e)
    await touch($)
    const asks = e.tool === 'AskUserQuestion'
    if (asks) sound($, 'waiting')
    await setMood($, asks ? 'waiting' : 'working')

    const startedAt = await $.clock.now()
    const id = `${e.tool}:${startedAt}:${Math.random()}`
    const entry = { id, name: shortTool(e.tool), target: targetOf(e as unknown as Record<string, unknown>), startedAt }
    await update($, activity, a => ({ running: [...a.running, entry] }))
    const result = await next(e).finally(() => update($, activity, a => ({ running: a.running.filter(r => r.id !== id) })))
    // A background agent has started by now, a foreground one ended.
    if (e.tool === 'Agent') void refreshAgents($)

    // A command refused, sent to the background or interrupted has not ended: what it printed so far proves nothing.
    const bash = e.tool === 'Bash' && result.isError !== true ? (result.result as BuiltinToolResults['Bash'] | undefined) : undefined
    const hasEnded = result.deny === undefined && !bash?.interrupted && bash?.backgroundTaskId === undefined
    // shortcut: output too long to inline reaches the model cut short, maybe before the summary, and such a run then
    // counts as neither pass nor fail. Read the tail of the result's persistedOutputPath if long runs need it.
    const run = e.tool === 'Bash' && hasEnded ? testsOf(e.command, result.text ?? '') : undefined
    if (run) {
      const at = await $.clock.now()
      await update($, tests, () => ({ ...run, at }))
    }

    if (result.isError === true || (run?.failed ?? 0) > 0) {
      turnErrors += 1
      // One error sound a turn, however many tools fail in it.
      if (turnErrors === 1) sound($, 'error')
      await setMood($, 'error', { backMs: 3_000 })
    } else if (e.tool === 'Bash' && hasEnded) {
      const cause = partyOf(e.command)
      // Tests party on a summary that says they passed, not on an exit code: `npm test | tail` exits 0 either way.
      if (cause && (cause !== 'tests' || run)) {
        await celebrate($, cause)
        if (cause !== 'tests') void refreshGit($)
      } else await setMood($, 'working')
    } else await setMood($, 'working')
    return result
  }).catch(($, e, next) => next(e))

  // Every file an edit tool wrote, a subagent's too: the band's ✎ count.
  on('tool.call', { tool: ['Edit', 'Write', 'NotebookEdit'] }, async ($, e, next) => {
    const result = await next(e)
    const file = e.tool === 'NotebookEdit' ? e.notebook_path : e.file_path
    if (result.deny === undefined && result.isError !== true) {
      const at = await $.clock.now()
      await Promise.all([update($, edited, files => (files.includes(file) ? files : [...files, file])), update($, editedAt, () => at)])
    }
    return result
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    if (agentOf(e) === undefined) {
      isTurning = false
      const m = await read($, meter)
      const note: TurnNote = { errors: turnErrors, isParty: turnParty }
      await Promise.all([
        update($, turnNotes, notes => ({ ...Object.fromEntries(Object.entries(notes).slice(-4)), [String(e.durationMs)]: note })),
        update($, contextHistory, h => (m?.contextPercent === undefined ? h : [...h, m.contextPercent].slice(-10))),
      ])
      // A party already played its sound; an interruption is the person's own doing and plays none.
      if (e.reason === 'answer' && !turnParty && e.durationMs >= LONG_TURN_MS) sound($, 'done')
      else if ((e.reason === 'error' || e.reason === 'refusal') && turnErrors === 0) sound($, 'error')
      if (e.reason === 'answer') await setMood($, turnParty ? 'party' : 'done', { backMs: turnParty ? 4_000 : 6_000 })
      else await setMood($, 'error', { backMs: 4_000 })
      // Not awaited: Claude Code waits on this hook, and git in a big repo takes seconds.
      void refreshGit($)
      // The breakdown is work, so it is counted here alone, and only once the context is 70% full.
      if ((m?.contextPercent ?? 0) >= CONTEXT_WARN) void refreshEater($)
      else await update($, eater, () => null)
    }
    const result = await next(e)
    // An agent's turn, or the main loop's, can end the work of one.
    void refreshAgents($)
    return result
  })

  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    // On the desktop the word is the step the row is on (`Creating notes.md`), not one to theme.
    if (!isFlavored || e.props.message !== null || e.surface !== 'terminal') return next(e)
    const t = themeOf(await read($, themeName))
    return next({ ...e, props: { ...e.props, word: pick(t.spinner[e.props.mode], turnSeed + e.props.mode.length) } })
  })

  // A theme switched to draws its banner under the command's line; the model reads only the line.
  on('ui.render', { component: 'CommandOutput', props: { command: 'awesome-hud' } }, async ($, e, next) => {
    const name = e.props.args.trim().toLowerCase()
    if (!isTheme(name) || e.props.isErrored) return next(e)
    const t = themeOf(name)
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        {await next(e)}
        <Box flexDirection="column" paddingLeft={5}>
          {t.banner.map((row, i) => (
            <Text key={`row${i}`} color={t.accent} wrap="truncate-end" mono>
              {row || ' '}
            </Text>
          ))}
        </Box>
      </Box>
    )
  })

  on('ui.render', { component: 'TurnDuration' }, async ($, e, next) => {
    if (!isFlavored) return next(e)
    const t = themeOf(await read($, themeName))
    const notes = await read($, turnNotes)
    // The note saved under this duration, else the nearest within a second: two saved turns can be that close in length.
    const gap = (k: string) => Math.abs(Number(k) - e.props.durationMs)
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
