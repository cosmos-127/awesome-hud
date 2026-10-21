// The band's marks. A terminal whose font lacks one draws a box or a blank in its place (the old Windows console,
// the Linux console), so a plain-ASCII set stands in there. Claude Code's own symbols make the same choice by the
// same test (`isUnicodeTerminal`), so the band falls back where Claude Code's own rows do.

export type Symbols = {
  /** Set when these are the plain-ASCII marks: the text faces are written down to ASCII too. */
  isAscii: boolean
  /** Between the parts of a row, as in `12m · $0.40`. */
  dot: string
  /** Between a row's groups, in the accent's color. */
  bar: string
  /** Opens the quip line. */
  quip: string
  /** Before a branch's name, and before what git is stuck in. */
  branch: string
  /** Before a linked worktree's name. */
  worktree: string
  /** Commits ahead of and behind the upstream. */
  up: string
  down: string
  /** Before the time to a plan window's reset. */
  reset: string
  /** Files staged and changed, each followed by a space and its count. */
  staged: string
  changed: string
  /** What a clean tree reads, and the stash count's lead (with its space). */
  clean: string
  stash: string
  /** Before the count of files Claude edited. */
  edited: string
  /** Before a test run's counts, a failing check's, a pending check's and an agent's. */
  pass: string
  fail: string
  pending: string
  agent: string
  /** Lines removed, and the multiplication in `×3`. */
  minus: string
  times: string
  /** What stands for the part of a name or a target that was cut. */
  ellipsis: string
  /** A gauge: its used cell, the odd half cell after them (none where a cell has no half), its free cell, and the auto-compact tick. */
  used: string
  half: string
  free: string
  tick: string
  /** The marker before the effort level on the model chip, by level; none in ASCII, where the level's name stands alone. */
  effort: Record<string, string>
}

export const UNICODE: Symbols = {
  isAscii: false,
  dot: '·',
  bar: '│',
  quip: '»',
  branch: '⎇',
  worktree: '↳',
  up: '↑',
  down: '↓',
  reset: '↻',
  staged: '●',
  changed: '✚',
  clean: '✓ clean',
  stash: '≡ ',
  edited: '✎',
  pass: '✓',
  fail: '✗',
  pending: '◌',
  agent: '◐',
  minus: '−',
  times: '×',
  ellipsis: '…',
  used: '━',
  half: '╸',
  free: '─',
  tick: '┊',
  effort: { low: '○', medium: '◔', high: '◑', xhigh: '◕', max: '●' },
}

export const ASCII: Symbols = {
  isAscii: true,
  dot: '-',
  bar: '|',
  quip: '>',
  branch: 'git',
  worktree: '>',
  up: '^',
  down: 'v',
  reset: 'resets',
  staged: '+',
  changed: '*',
  clean: 'clean',
  stash: '',
  edited: 'edited',
  pass: 'ok',
  fail: 'x',
  pending: '~',
  agent: '~',
  minus: '-',
  times: 'x',
  ellipsis: '~',
  used: '#',
  half: '',
  free: '-',
  tick: '|',
  effort: {},
}

/**
 * The marks the band draws with now. It is one object filled in place, so every reader sees a change at once; the
 * band sets it from the session's state each time it draws, and a test that wants the ASCII set puts the other back.
 */
export const sym: Symbols = { ...UNICODE }

export const useSymbols = (isAscii: boolean) => void Object.assign(sym, isAscii ? ASCII : UNICODE)

/** The terminal's environment that decides whether its font can be trusted with the marks. */
export type TerminalEnv = Partial<Record<'OS' | 'TERM' | 'TERM_PROGRAM' | 'WT_SESSION' | 'TERMINUS_SUBLIME' | 'ConEmuTask' | 'TERMINAL_EMULATOR', string>>

/**
 * Whether the terminal draws Unicode marks, by the rule Claude Code's own `figures` uses (is-unicode-supported):
 * everywhere but the Linux console, and on Windows only in Windows Terminal, VS Code, a few others, and anything that
 * says it is an xterm. The old Windows console, which is what a bare PowerShell window is, has none of them.
 */
export const isUnicodeTerminal = (env: TerminalEnv): boolean => {
  if (env.OS !== 'Windows_NT') return env.TERM !== 'linux'
  return (
    Boolean(env.WT_SESSION) ||
    Boolean(env.TERMINUS_SUBLIME) ||
    env.ConEmuTask === '{cmd::Cmder}' ||
    env.TERM_PROGRAM === 'Terminus-Sublime' ||
    env.TERM_PROGRAM === 'vscode' ||
    env.TERM === 'xterm-256color' ||
    env.TERM === 'alacritty' ||
    env.TERM === 'rxvt-unicode' ||
    env.TERM === 'rxvt-unicode-256color' ||
    env.TERMINAL_EMULATOR === 'JetBrains-JediTerm'
  )
}

// A theme's text face is drawn from characters no plain font has: each becomes the ASCII that looks most like it.
const FACE_ASCII: Record<string, string> = {
  '•': 'o', 'ᴗ': 'u', 'ᴥ': 'w', 'ᵔ': '^', 'ಠ': '0', 'و': '/', '≧': '>', '≦': '<', '□': 'O', '▽': 'v', '°': 'o', 'ò': '>', 'ó': '<',
}

/** A face as ASCII: `(òᴗó)و` reads `(>u<)/`. A character with no stand-in is `?`, and a test keeps a theme from having one. */
export const asciiFace = (face: string) => [...face].map(ch => (ch.charCodeAt(0) < 128 ? ch : (FACE_ASCII[ch] ?? '?'))).join('')
