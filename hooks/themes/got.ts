import { BANG, BLANK, HEIGHT, QUESTION, SMALL_Z, WIDTH, frame, layer, paint, shift, stamp } from '../sprite'
import type { Patch } from '../sprite'
import type { Theme } from '../theme'

// A direwolf pup of the North: tall ears pink inside, a pale blaze down to a white muzzle and a black nose, big amber
// eyes, ruff at the cheeks. Snow falls behind it.
const FACE = [
  '.k..........k.',
  'kgk........kgk',
  'kgpk......kpgk',
  'kgppkkGGkkppgk',
  'kgaagGGGGgaagk',
  'kgseggGGggsegk',
  'kgaaggGGggaagk',
  '.kgggwwwwgggk.',
  'kgkgwwnnwwgkgk',
  '.k.kkwwwwkk.k.',
]

// Both eyes at once, two pixels wide: their rows from y 4, amber around a glint and a pupil.
const eyes = (...rows: string[]): Patch[] => rows.flatMap((r, i) => [[2, 4 + i, r], [10, 4 + i, r]] as Patch[])

const BLINK = eyes('gg', 'gg', 'dd')
// A pupil looks by which side of the glint it sits.
const LOOK_LEFT = eyes('aa', 'es', 'aa')
const LOOK_UP = eyes('se', 'aa', 'aa')
// Eyes gone round and white, the pupils pinpricks.
const WIDE = eyes('ww', 'we', 'ww')
// Closed and smiling, ^ ^, each a pixel wider than the eye.
const HAPPY: Patch[] = [...eyes('gg', 'gg', 'gg'), [1, 5, 'gdg'], [1, 6, 'dgd'], [10, 5, 'gdg'], [10, 6, 'dgd']]
// One ear flicked, tip out.
const FLICK_LEFT: Patch[] = [[0, 0, 'k.'], [0, 1, 'kk']]
const FLICK_RIGHT: Patch[] = [[12, 0, '.k'], [12, 1, 'kk']]
// Ears pinned back: the '.' erase their tips.
const EARS_BACK: Patch[] = [[0, 0, '..............'], [0, 1, '..............']]
const SNARL: Patch[] = [[5, 9, 'wkkw']]
const TONGUE: Patch[] = [[6, 8, 'nn'], [6, 9, 'pp']]
const PANT: Patch[] = [[5, 9, 'kppk']]
// Snow piled on the head and on the ears' tips.
const SNOWCAP: Patch[] = [[4, 3, 'wwwwww'], [1, 0, 'w'], [12, 0, 'w']]
// The King in the North.
const CROWN = stamp(4, 1, ['y.yy.y', 'yyyyyy'])
// A raven's three wing beats.
const RAVEN = [
  ['K...K', '.K.K.', '..K..'],
  ['.....', 'KKKKK', '..K..'],
  ['..K..', '.K.K.', 'K...K'],
]
const SPARKLE = ['.y.', 'yYy', '.y.']
// Dragonfire, flickering between two shapes.
const FLAME = [
  ['.r..', '.ry.', 'rryr', 'ryyr', 'oyyo', '.oo.'],
  ['..r.', '.yr.', 'ryrr', 'ryyr', 'oyyo', '.oo.'],
]

const FLAKES = [[15, 0], [17, 3], [14, 6], [16, 8], [0, 4], [12, 0], [2, 9], [11, 8], [6, 1]] as const
const FLURRY = [[13, 5], [17, 1], [15, 4], [4, 0], [9, 1]] as const
// Snow at step t: each flake a row lower a step, drifting a column right every third.
const snow = (t: number, isHeavy = false) =>
  paint(BLANK, [...FLAKES, ...(isHeavy ? FLURRY : [])].map(([x, y]) => [(x + Math.floor((t + y) / 3)) % WIDTH, (y + t) % HEIGHT, 'f'] as const))

const face = (...groups: (readonly Patch[])[]) => paint(FACE, ...groups)
// The wolf in the snow at step t.
const scene = (t: number, ...groups: (readonly Patch[])[]) => layer(snow(t), face(...groups))

const moods: Theme['moods'] = {
  idle: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(t => {
    if (t === 3 || t === 9) return frame(scene(t, BLINK), 160)
    // An ear flicks at a stray flake.
    if (t === 5) return frame(scene(t, FLICK_LEFT), 300)
    return frame(scene(t), 900)
  }),
  working: [...[0, 1, 2, 3].map(t => frame(scene(t, t % 2 ? [] : LOOK_LEFT), 520)), frame(scene(4, BLINK), 140)],
  // The raven awaits your answer.
  waiting: [
    ...[0, 1, 2, 3].map(i => frame(paint(scene(0, FLICK_RIGHT), stamp(13, 1 + (i % 2), RAVEN[i % 3]!)), 260)),
    frame(paint(scene(1, LOOK_UP), stamp(14, 0, QUESTION)), 650),
  ],
  error: [frame(paint(scene(0, WIDE, SNARL, EARS_BACK), stamp(14, 1, BANG)), 420), frame(scene(1, WIDE, SNARL, EARS_BACK), 160)],
  done: [frame(paint(scene(0, HAPPY, TONGUE), stamp(15, 0, SPARKLE)), 500), frame(paint(scene(1, HAPPY, TONGUE), stamp(14, 5, SPARKLE)), 500)],
  // Crowned, panting, with dragonfire beside: a bounce a frame.
  party: [0, 1, 2, 3].map(t => frame(paint(shift(face(HAPPY, PANT, CROWN), 0, t % 2), stamp(14, 2, FLAME[t % 2]!)), 140)),
  // Winter is here: heavy snow, and a shiver.
  sweat: [0, 1, 2, 3, 4, 5].map(t => frame(layer(snow(t, true), shift(face(t % 2 ? LOOK_LEFT : [], EARS_BACK), t % 2, 0)), 180)),
  asleep: [0, 1, 2].map(t => frame(paint(scene(t, BLINK, SNOWCAP), t < 2 ? stamp(15, 4 - 2 * t, SMALL_Z) : []), 1100)),
}

export const got: Theme = {
  description: 'a direwolf of the North; winter is always coming',
  sounds: { done: 'sounds/got/done.wav', error: 'sounds/got/error.wav', waiting: 'sounds/got/waiting.wav', party: 'sounds/got/party.wav' },
  accent: '#aaccee',
  onAccent: '#111111',
  palette: {
    k: 0x7777aa,
    g: 0xaaaaaa,
    G: 0xcccccc,
    d: 0x444477,
    w: 0xffffff,
    n: 0x222222,
    a: 0xffaa44,
    e: 0x222222,
    s: 0xffffff,
    p: 0xff77aa,
    f: 0x77aaff,
    K: 0x888888,
    y: 0xffdd44,
    Y: 0xffeeaa,
    r: 0xee4411,
    o: 0xffaa44,
  },
  moods,
  faces: {
    idle: '(•ᴥ•)',
    working: '(òᴥó)',
    waiting: '(•ᴥ•)?',
    error: '(ಠᴥಠ)!',
    done: '(^ᴥ^)',
    party: '(ᵔᴥᵔ)~',
    sweat: '(;ᴥ;)',
    asleep: '(-ᴥ-) z',
  },
  quips: {
    idle: [
      'keeping watch on the Wall',
      'the North remembers',
      'sharpening Valyrian steel',
      'winter is coming. so is your next prompt',
      'waiting by the weirwood tree',
      'a direwolf never sleeps (much)',
    ],
    working: [
      'marching south',
      'reading the old scrolls',
      'scheming with the small council',
      'forging steel in the smithy',
      'sending ravens',
    ],
    waiting: ['the raven awaits your answer, my lord', 'a decision for the king (you)', 'the council needs your seal', 'Hodor? (waiting on you)'],
    error: [
      'the night is dark and full of bugs',
      'that went full Red Wedding',
      'shame. shame. shame.',
      'you know nothing about this error',
      'a Lannister broke it',
    ],
    done: ['the realm is safe. for now', 'and now its watch is ended', 'victory in the North', 'a debt paid'],
    party: ['dracarys!'],
    sweat: ['the long night approaches (context)', 'the Wall is cracking', 'the dragons are getting hungry', 'winter is here'],
    asleep: ['sleeping in Winterfell', 'dreaming of dragons', "the Night's Watch dozed off", 'zzz... wake me when spring comes'],
  },
  party: {
    tests: 'tests green! dracarys!',
    commit: 'committed! the North remembers',
    push: 'pushed! ravens sent to every castle',
    summoned: 'AWOOO! you called, my lord?',
  },
  verbs: {
    Read: 'reading the scrolls of {}',
    Edit: 'reforging {}',
    MultiEdit: 'reforging {}',
    NotebookEdit: 'reforging {}',
    Write: 'carving {} in stone',
    Bash: 'commanding {}',
    Grep: 'hunting {} beyond the Wall',
    Glob: 'scouting {}',
    WebFetch: 'sending a raven for {}',
    WebSearch: 'asking the maesters about {}',
    Agent: 'sending a sworn sword: {}',
    TodoWrite: 'planning the campaign',
    Skill: 'learning the old ways of {}',
    default: 'wielding {}',
  },
  spinner: {
    thinking: ['Plotting', 'Scheming', 'Consulting the maesters', 'Reading the old scrolls'],
    requesting: ['Sending a raven', 'Riding south'],
    responding: ['Proclaiming', 'Writing to the council'],
    'tool-input': ['Sharpening steel', 'Saddling up'],
    'tool-use': ['Marching', 'Battling', 'Raiding'],
  },
  turn: {
    plain: ['Conquered', 'Ruled', 'Plotted', 'Feasted', 'Marched', 'Held the Wall'],
    errors: n => `Survived ${n} betrayal${n === 1 ? '' : 's'}, then feasted`,
    party: 'Breathed fire',
  },
  compactNudge: 'context almost full: /compact before the long night',
}
