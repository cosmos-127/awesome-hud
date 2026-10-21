import type { Mood } from '../types'
import type { Frame } from './sprite'

export type SpinnerMode = 'requesting' | 'responding' | 'thinking' | 'tool-input' | 'tool-use'

export type PartyCause = 'tests' | 'commit' | 'push' | 'summoned'

/** The moments a theme has a sound for: a turn answered, a failure, Claude waiting on you, a party. */
export type SoundEvent = 'done' | 'error' | 'waiting' | 'party'

/** Everything a theme brings: its art, its colors, its voice and its sounds. */
export type Theme = {
  /** One line for `/awesome-hud`'s list. */
  description: string
  /** A WAV file per sound event, relative to the plugin's folder. */
  sounds: Record<SoundEvent, string>
  /** The model chip's background, and the color of the quip's `»`, hex. A safe color, as `palette`'s are. */
  accent: string
  /** Text drawn on the accent: a safe color that reads on it at 4.5:1 or better, in 256 colors too. */
  onAccent: string
  /**
   * A color per pixel character. Claude Code snaps each channel to a multiple of 0x11 and paints 24-bit; a terminal
   * without 24-bit color (an older Apple Terminal, tmux, SSH) maps that onto the xterm palette, and the two
   * usual formulas disagree on most colors. A safe color is on the 0x11 grid and lands on the same 256-color either
   * way: any gray is, and so is a color whose channels are each one of 00 11 33 44 77 aa cc dd ee ff, unless it is
   * nearly gray. The tests say which of yours are not, and the nearest that is.
   */
  palette: Record<string, number>
  /** Each mood's frames, looped; idle's first is the portrait `/awesome-hud <theme>` draws at twice the size. */
  moods: Record<Mood, Frame[]>
  /** A one-line text face per mood, for a band too small for the sprite. */
  faces: Record<Mood, string>
  quips: Record<Mood, readonly string[]>
  party: Record<PartyCause, string>
  /** What the quip line says a tool is doing: `<verb> <target>`; `default` for any other tool. */
  verbs: Record<string, string>
  /** The spinner's word, by what the turn is doing. */
  spinner: Record<SpinnerMode, readonly string[]>
  /** The turn-closing line's word, drawn before ` for 3s`. */
  turn: { plain: readonly string[]; errors: (n: number) => string; party: string }
  /** The toast once context nears auto-compact. */
  compactNudge: string
}
