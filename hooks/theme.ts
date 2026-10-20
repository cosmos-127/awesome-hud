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
  /** ASCII art drawn under `/awesome-hud <theme>`, in the accent: at most 48 columns. */
  banner: readonly string[]
  /** A WAV file per sound event, relative to the plugin's folder. */
  sounds: Record<SoundEvent, string>
  /** The model chip's background, and the color of the quip's `»` and of the banner, hex. */
  accent: string
  /** Text drawn on the accent. */
  onAccent: string
  palette: Record<string, number>
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
