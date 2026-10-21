import { BIG_Z, BLANK, DROP, SMALL_Z, SPARKLE, WIDTH, frame, layer, paint, shift, stamp } from '../sprite'
import type { Patch } from '../sprite'
import type { Theme } from '../theme'

// A rubber duck in the bath: a round yellow head, a tuft, a wide orange beak between rosy cheeks, and two rows of water
// that never keep still. Bubbles rise in columns 14-17.
const FACE = [
  '.....kyyk.....',
  '...kkYYYYkk...',
  '..kYssYYYYYk..',
  '.kYseYYYYseYk.',
  '.kYeeYYYYeeYk.',
  '.kppooooooppk.',
  '..kYYoOOoYYk..',
  '...kkkkkkkk...',
  '',
  '',
]

// Squeezed: the crown's shine row gone, the head a row flatter.
const SQUASHED = ['', ...FACE.slice(0, 2), ...FACE.slice(3)]

// Both eyes at once: their top row, then their bottom row.
const eyes = (top: string, bottom: string): Patch[] => [[3, 3, top], [9, 3, top], [3, 4, bottom], [9, 4, bottom]]

const BLINK = eyes('YY', 'kk')
// A bead eye looks by where its glint sits.
const LOOK_LEFT = eyes('se', 'ee')
const LOOK_RIGHT = eyes('es', 'ee')
// Eyes gone round and bright, the beak wide open.
const WIDE: Patch[] = [...eyes('ss', 'se'), [5, 6, 'eeee']]
// Closed and smiling, ^ ^.
const HAPPY: Patch[] = [[2, 3, 'YeY'], [2, 4, 'eYe'], [9, 3, 'YeY'], [9, 4, 'eYe']]
const WORRIED: Patch[] = [[3, 2, 'kk'], [9, 2, 'kk']]

// Shorter than the shared ones: the bath keeps the rows below.
const QUESTION = ['.yy.', 'y..y', '..y.', '....', '..y.']
const BANG = ['.rr.', '.rr.', '.rr.', '....', '.rr.']

// A party hat, over the tuft.
const HAT = stamp(5, 0, ['.yy.', '.pp.', 'pBBp'])
// Water flung up by a squeak.
const SPLASH: Patch[] = [[0, 5, 'b'], [13, 4, 'b'], [1, 2, 'B'], [12, 1, 'b'], [15, 6, 'b'], [16, 3, 'B']]
const SPLASH_LOW: Patch[] = [[0, 6, 'b'], [13, 6, 'B'], [1, 4, 'b'], [12, 3, 'b'], [15, 7, 'B'], [16, 5, 'b']]

// The bath: two rows of ripples, each rolling a pixel a step, one way and the other.
const rolled = (row: string, by: number) => {
  const n = ((by % WIDTH) + WIDTH) % WIDTH
  return row.slice(n) + row.slice(0, n)
}
const water = (t: number) => paint(BLANK, [[0, 8, rolled('bbsbbb'.repeat(3), t)], [0, 9, rolled('BBbBBB'.repeat(3), -t)]])

// A hollow bubble with a glint, and a small one; each rises a row a step and sways.
const BUBBLE = stamp(14, 0, ['.B.', 's.B', '.B.'])
const bubbles = (t: number) => {
  const big = shift(paint(BLANK, BUBBLE), (t >> 1) % 2, 5 - (t % 6))
  const small = paint(BLANK, [[16 + ((t >> 1) % 2), 6 - ((t + 2) % 7), 'b']])
  return layer(big, small)
}

// Confetti, a row lower a step.
const CONFETTI: Patch[] = [[15, 0, 'p'], [17, 2, 'y'], [14, 3, 'b'], [16, 5, 'B'], [0, 0, 'y'], [13, 1, 'p'], [1, 4, 'b'], [12, 5, 'y']]
const confetti = (phase: number) => paint(BLANK, CONFETTI.map(([x, y, c]) => [x, (y + 2 * phase) % 8, c] as const))

// The water risen to `level` rows over the duck, and across the whole bath.
const flood = (level: number): Patch[] => [
  [0, 8 - level, 'bsbbbsbbbsbbbsbbbs'],
  ...Array.from({ length: level - 1 }, (_, i): Patch => [0, 9 - level + i, 'b'.repeat(WIDTH)]),
]

const bird = (...groups: (readonly Patch[])[]) => paint(FACE, ...groups)
const squashed = (...groups: (readonly Patch[])[]) => paint(SQUASHED, ...groups)
// The bird in the bath at step t: water, then bubbles, then the duck over them.
const pond = (t: number, hasBubbles = true) => layer(water(t), hasBubbles ? bubbles(t) : BLANK)
const scene = (t: number, front: readonly string[], hasBubbles = true) => layer(pond(t, hasBubbles), front)
// Floating: a pixel up and down.
const bob = (t: number) => (t >> 1) & 1

const moods: Theme['moods'] = {
  idle: [
    [[], 600], [[], 600], [[], 600], [BLINK, 130], [[], 600], [[], 600], [[], 600], [[], 600], [BLINK, 110], [[], 110], [BLINK, 110],
  ].map(([eyesNow, ms], t) => frame(scene(t, shift(bird(eyesNow as Patch[]), 0, bob(t))), ms as number)),
  // Listening: a nod a step, a glance either way, the bubbles hurrying.
  working: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(t => frame(scene(t, shift(bird(t % 4 < 2 ? LOOK_RIGHT : LOOK_LEFT), 0, t % 2)), 110)),
  // Head tilted, the bubbles gone: explain it to me.
  waiting: [
    frame(paint(scene(0, shift(bird(LOOK_RIGHT), 1, 0), false), stamp(14, 0, QUESTION)), 650),
    frame(scene(1, shift(bird(LOOK_RIGHT), 1, 0), false), 300),
  ],
  // A squeak: squeezed flat, the beak open, the water flung up.
  error: [
    frame(paint(scene(0, squashed(WIDE, SPLASH), false), stamp(14, 0, BANG)), 420),
    frame(scene(2, bird(WIDE, SPLASH_LOW), false), 160),
  ],
  done: [
    frame(paint(scene(0, bird(HAPPY)), stamp(14, 0, SPARKLE)), 500),
    frame(paint(scene(2, shift(bird(HAPPY), 0, 1)), stamp(15, 2, SPARKLE)), 500),
  ],
  // Bath party: a hat, a bounce, confetti, the ripples racing.
  party: [0, 1, 2, 3, 4, 5].map(t => frame(layer(layer(water(t * 2), confetti(t)), shift(bird(HAPPY, HAT), 0, t % 2)), 140)),
  // The bath rising: the water climbs the duck, a drop runs.
  sweat: [1, 2, 3].map((level, i) =>
    frame(paint(layer(water(i), bird(WORRIED)), flood(level), stamp(14, 0, DROP)), [700, 450, 350][i]!),
  ),
  asleep: [
    frame(paint(scene(0, shift(bird(BLINK), 0, 1), false), stamp(15, 2, SMALL_Z)), 1100),
    frame(paint(scene(1, shift(bird(BLINK), 0, 1), false), stamp(15, 0, SMALL_Z)), 1100),
    frame(paint(scene(2, shift(bird(BLINK), 0, 0), false), stamp(14, 0, BIG_Z)), 1100),
    frame(scene(3, shift(bird(BLINK), 0, 0), false), 1100),
  ],
}

export const duck: Theme = {
  description: 'a rubber duck that listens to your bugs',
  sounds: { done: 'sounds/duck/done.wav', error: 'sounds/duck/error.wav', waiting: 'sounds/duck/waiting.wav', party: 'sounds/duck/party.wav' },
  accent: '#ff7711',
  onAccent: '#111111',
  palette: {
    k: 0xcc7711,
    Y: 0xffdd44,
    y: 0xffaa11,
    o: 0xff7711,
    O: 0xcc4411,
    e: 0x222222,
    s: 0xffffff,
    p: 0xff77aa,
    b: 0x77ccff,
    B: 0x44aaff,
    r: 0xee4444,
    g: 0xaaaaaa,
  },
  moods,
  faces: {
    idle: '(o>)',
    working: '(o>)~',
    waiting: '(o>)?',
    error: '(O>)!',
    done: '(^>)',
    party: '(^>)/',
    sweat: '(o>);',
    asleep: '(->) z',
  },
  quips: {
    idle: ['floating, listening', 'ready to hear your bug', 'rubber side up', 'waiting for you to explain it', 'bobbing in the bath', 'all ears (no ears)'],
    working: ['listening to the whole story', 'nodding along', 'quietly judging your variable names', 'paddling through the stack trace', 'hearing you out'],
    waiting: ['go on, explain it to me', 'needs your OK (quack)', 'head tilted, waiting on you', 'still listening...'],
    error: ['quack! that was the bug', 'squeaked at the stack trace', 'something sank', 'the bath overflowed', 'explaining this one will take a while'],
    done: ['quack. you found it', 'solved it by explaining it to me', 'bug confessed', 'rubber duck debugging complete', 'quacked approval'],
    party: ['bath party!'],
    sweat: ['the water is rising', 'bath nearly overflowing', 'context up to my beak', 'treading water'],
    asleep: ['zzz', 'floating off', 'dreaming of clean diffs', 'drifting in the bath'],
  },
  party: {
    tests: 'tests green! quack!',
    commit: 'committed! explained and shipped',
    push: 'pushed! the duck approves',
    summoned: 'quack? you called?',
  },
  verbs: {
    Read: 'listening to {}',
    Edit: 'preening {}',
    MultiEdit: 'preening {}',
    NotebookEdit: 'preening {}',
    Write: 'laying out {}',
    Bash: 'paddling through {}',
    Grep: 'dabbling for {}',
    Glob: 'dabbling for {}',
    WebFetch: 'fetching {} from the pond',
    WebSearch: 'paddling the web for {}',
    Agent: 'calling a duckling: {}',
    TodoWrite: 'lining up the ducklings',
    Skill: 'reading the pond guide: {}',
    default: 'pecking at {}',
  },
  spinner: {
    thinking: ['Listening', 'Nodding along', 'Floating thoughtfully', 'Paddling', 'Quietly judging'],
    requesting: ['Quacking at the server', 'Splashing the API'],
    responding: ['Quacking it out', 'Explaining right back', 'Squeaking'],
    'tool-input': ['Preening', 'Shaking off water'],
    'tool-use': ['Dabbling', 'Pecking', 'Paddling'],
  },
  turn: {
    plain: ['Quacked', 'Paddled', 'Listened', 'Floated', 'Dabbled', 'Preened', 'Bobbed', 'Splashed'],
    errors: n => `Sank ${n} time${n === 1 ? '' : 's'}, bobbed back up`,
    party: 'Splashed around',
  },
  compactNudge: 'context almost full: /compact before the bath overflows',
}
