// Sprites: one character per pixel, '.' transparent, drawn two pixels a cell
// with half blocks, so a WIDTH x HEIGHT frame fills WIDTH x HEIGHT/2 cells.
// Every theme draws its face in columns 0-13 and its emotes in 14-17.

import type { Mood } from '../types'

export const WIDTH = 18
export const HEIGHT = 10

export type Frame = { px: string[]; ms: number }

/** [x, y, pixels]: written over the base from column x of row y; a space keeps the pixel beneath. */
export type Patch = readonly [number, number, string]

export const paint = (base: readonly string[], ...groups: (readonly Patch[])[]): string[] => {
  const rows = base.map(row => row.padEnd(WIDTH, '.').split(''))
  for (const [x, y, pixels] of groups.flat()) {
    const row = rows[y]!
    pixels.split('').forEach((p, i) => {
      if (p !== ' ') row[x + i] = p
    })
  }
  return rows.map(row => row.join(''))
}

/** A multi-row stamp as patches, its top-left corner at x, y. */
export const stamp = (x: number, y: number, rows: readonly string[]): Patch[] =>
  rows.map((row, i) => [x, y + i, row] as const)

export const frame = (px: string[], ms: number): Frame => ({ px, ms })

const DEFAULT = 0x01000000

// One frame as Raster cells: `▀` with the top pixel as foreground and the
// bottom pixel as background, `▄` where only the bottom one is painted.
export const encode = (px: readonly string[], palette: Readonly<Record<string, number>>): string => {
  const color = (p: string) => (p === '.' ? undefined : palette[p])
  const words: number[] = []
  for (let y = 0; y < HEIGHT; y += 2) {
    for (let x = 0; x < WIDTH; x++) {
      const top = color(px[y]![x]!)
      const bottom = color(px[y + 1]![x]!)
      if (top === undefined && bottom === undefined) words.push(0x20, DEFAULT, DEFAULT)
      else if (top === undefined) words.push(0x2584, bottom!, DEFAULT)
      else words.push(0x2580, top, bottom ?? DEFAULT)
    }
  }
  // toBase64 is in the runtime (ES2026), not yet in TypeScript's lib
  const bytes = new Uint8Array(Uint32Array.from(words).buffer) as Uint8Array & { toBase64(): string }
  return bytes.toBase64()
}

// Shared emotes, 4 columns wide, for the emote columns 14-17.
export const QUESTION = ['.yy.', 'y..y', '...y', '..y.', '..y.', '....', '..y.']
export const BANG = ['.rr.', '.rr.', '.rr.', '.rr.', '....', '.rr.']
export const BIG_Z = ['gggg', '..g.', '.g..', 'gggg']
export const SPARKLE = ['.y.', 'yyy', '.y.']
export const DROP = ['.b.', 'bbb', 'bbb', '.b.']

/** A nyan trail: rainbow columns, every other one a pixel lower, swapped on `phase`. */
export const rainbow = (x: number, y: number, phase: 0 | 1): Patch[] =>
  [0, 1, 2, 3].flatMap(i => stamp(x + i, y + ((i + phase) % 2), ['R', 'O', 'Y', 'G', 'B', 'V']))

export const RAINBOW: Record<string, number> = {
  R: 0xff4d4d,
  O: 0xff9f1a,
  Y: 0xffe14d,
  G: 0x4dd96b,
  B: 0x4da6ff,
  V: 0xa66bff,
}

/** How a face changes for each mood: patches over it for its eyes and mouth. */
export type Expressions = Record<'blink' | 'lookLeft' | 'lookRight' | 'shock' | 'happy' | 'worried', readonly Patch[]>

/**
 * All eight moods from a face and its expressions, with the shared emotes beside it: their palette keys are y, r, g
 * and b, and the party's nyan trail takes RAINBOW's. A theme spreads the result and replaces a mood to draw its own.
 */
export const moodsOf = (base: readonly string[], x: Expressions): Record<Mood, Frame[]> => {
  const face = (...groups: (readonly Patch[])[]) => paint(base, ...groups)
  return {
    idle: [
      frame(face(), 3200),
      frame(face(x.blink), 130),
      frame(face(), 2400),
      frame(face(x.blink), 110),
      frame(face(), 110),
      frame(face(x.blink), 110),
    ],
    working: [
      frame(face(x.lookLeft), 520),
      frame(face(x.lookRight), 520),
      frame(face(x.lookLeft), 520),
      frame(face(x.lookRight), 520),
      frame(face(x.blink), 140),
    ],
    waiting: [frame(face(stamp(14, 0, QUESTION)), 650), frame(face(), 300)],
    error: [frame(face(x.shock, stamp(14, 1, BANG)), 420), frame(face(x.shock), 160)],
    done: [
      frame(face(x.happy, stamp(15, 0, SPARKLE), [[14, 6, 'y']]), 500),
      frame(face(x.happy, stamp(14, 4, SPARKLE), [[17, 1, 'y']]), 500),
    ],
    party: [frame(face(x.happy, rainbow(14, 2, 0)), 160), frame(face(x.happy, rainbow(14, 2, 1)), 160)],
    sweat: [
      frame(face(x.worried, stamp(14, 0, DROP)), 700),
      frame(face(x.worried, stamp(14, 2, DROP)), 450),
      frame(face(x.worried, stamp(14, 4, DROP)), 350),
    ],
    asleep: [
      frame(face(x.blink, stamp(14, 6, BIG_Z)), 900),
      frame(face(x.blink, stamp(14, 3, BIG_Z)), 900),
      frame(face(x.blink, stamp(14, 0, BIG_Z)), 900),
    ],
  }
}
