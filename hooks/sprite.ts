// Sprites: one character per pixel, '.' transparent, drawn two pixels a cell
// with half blocks, so a WIDTH x HEIGHT frame fills WIDTH x HEIGHT/2 cells.
// A theme draws its face in columns 0-13. Columns 14-17 hold its emotes and, at
// rest, a prop of its own (a tail, hair, weather), so no gap opens beside the stats.

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

/** A multi-row stamp as patches, its top-left corner at x, y; its '.' keep what is beneath, so it never erases the face. */
export const stamp = (x: number, y: number, rows: readonly string[]): Patch[] =>
  rows.map((row, i) => [x, y + i, row.replaceAll('.', ' ')] as const)

/** The frame moved dx columns right and dy rows down, what leaves the grid dropped: a bounce, a breath, a shiver. */
export const shift = (px: readonly string[], dx: number, dy: number): string[] =>
  px.map((row, y) => row.split('').map((_, x) => px[y - dy]?.[x - dx] ?? '.').join(''))

/** `front` over `back`, its '.' see-through: snow or confetti behind the mascot. */
export const layer = (back: readonly string[], front: readonly string[]): string[] =>
  front.map((row, y) => row.split('').map((p, x) => (p === '.' ? back[y]![x]! : p)).join(''))

/** A frame with nothing in it, to paint what goes behind the mascot on. */
export const BLANK: readonly string[] = Array<string>(HEIGHT).fill('.'.repeat(WIDTH))

export const frame = (px: string[], ms: number): Frame => ({ px, ms })

const DEFAULT = 0x01000000

/**
 * Whether the terminal draws half blocks from its font, not itself. Apple Terminal does, and its font sets them in the
 * font's own box, not the cell's, which the line spacing makes taller: in its screenshots a 44px cell has `▀` at 9-26 and
 * `▄` at 26-44, a 28px one `▀` at 4-16, so `▀` sits low and short and the cell's other color shows above and below it.
 */
export const isFontBlocks = (env: { TERM_PROGRAM?: string }): boolean => env.TERM_PROGRAM === 'Apple_Terminal'

// One frame as Raster cells: `▀` with the top pixel as foreground and the
// bottom pixel as background, `▄` where only the bottom one is painted.
// With `isLow`, for a font that sets its blocks low, `▅` carries the pair instead, the bottom pixel as foreground and
// the top as background. `▀` there is a sliver of the top pixel between two strips of the bottom's, pixels merged into
// the rows around them. `▅` is five eighths of the font's box, so its top edge lands near the middle of the cell (22
// of 44, 13 of 28) where `▄`'s lands at 26. A terminal that draws blocks itself would put `▅` at 3/8 of the cell, so it gets `▄`.
export const encode = (px: readonly string[], palette: Readonly<Record<string, number>>, isLow = false): string => {
  const color = (p: string) => (p === '.' ? undefined : palette[p])
  const lower = isLow ? 0x2585 : 0x2584
  const words: number[] = []
  for (let y = 0; y < px.length; y += 2) {
    for (let x = 0; x < px[y]!.length; x++) {
      const top = color(px[y]![x]!)
      const bottom = color(px[y + 1]![x]!)
      if (top === undefined && bottom === undefined) words.push(0x20, DEFAULT, DEFAULT)
      else if (top === undefined) words.push(lower, bottom!, DEFAULT)
      else if (bottom === undefined) words.push(0x2580, top, DEFAULT)
      else if (!isLow) words.push(0x2580, top, bottom)
      else if (top === bottom) words.push(0x20, DEFAULT, top)
      else words.push(lower, bottom, top)
    }
  }
  // toBase64 is in the runtime (ES2026), not yet in TypeScript's lib
  const bytes = new Uint8Array(Uint32Array.from(words).buffer) as Uint8Array & { toBase64(): string }
  return bytes.toBase64()
}

// Shared emotes, at most 4 columns wide, for columns 14-17.
export const QUESTION = ['.yy.', 'y..y', '...y', '..y.', '..y.', '....', '..y.']
export const BANG = ['.rr.', '.rr.', '.rr.', '.rr.', '....', '.rr.']
export const BIG_Z = ['gggg', '..g.', '.g..', 'gggg']
export const SMALL_Z = ['gg.', '.g.', '.gg']
export const SPARKLE = ['.y.', 'yyy', '.y.']
export const DROP = ['.b.', 'bbb', 'bbb', '.b.']

/** A rainbow's colors as R O Y G B V, for a palette that paints one. */
export const RAINBOW: Record<string, number> = {
  R: 0xff4444,
  O: 0xffaa44,
  Y: 0xffdd44,
  G: 0x44dd44,
  B: 0x44aaff,
  V: 0xaa44ee,
}
