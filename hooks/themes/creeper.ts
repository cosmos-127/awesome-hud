import { BANG, QUESTION, SMALL_Z, SPARKLE, frame, paint, shift, stamp } from '../sprite'
import type { Patch } from '../sprite'
import type { Theme } from '../theme'

// A blocky green Creeper-inspired face, drawn from the provided pixel-art reference.
// Its dark eyes and H-shaped mouth sit in a shaded green head.
const FACE = [
  '.kGggGGggGgGk.',
  '.kggGgGGgGggk.',
  '.kGgGggGgGgGk.',
  '.kggGGgGggGGk.',
  '.kgGgGGggGgGk.',
  '.kGGggGgGGggk.',
  '.kgGGggGGgGgk.',
  '.kGGgGggGGgGk.',
  '.kgGgGGgGggGk.',
  '.kGggGgGGggGk.',
]

// Both eyes at once, three pixels wide, beginning at row 2.
const eyes = (...rows: string[]): Patch[] => rows.flatMap((r, i) => [[2, 2 + i, r], [9, 2 + i, r]] as Patch[])

const OPEN_EYES = eyes('nnn', 'nnn')
const MOUTH: Patch[] = [[5, 4, 'nnnn'], [3, 5, 'nnnnnnnn'], [3, 6, 'nnnnnnnn'], [3, 7, 'nn    nn'], [3, 8, 'nn    nn'], [3, 9, 'nn    nn']]
const BLINK = eyes('ggg', 'ggg')
const LOOK_LEFT = eyes('dnn', 'dnn')
const LOOK_UP = eyes('nnd', 'nnd')
const WIDE: Patch[] = eyes('nnnn', 'nnnn')
const HAPPY = eyes('GGG', 'ggg')
const ALARM_MOUTH: Patch[] = [[5, 4, 'nnnn'], [3, 5, 'nnnnnnnn'], [3, 6, 'nnnnnnnn'], [3, 7, 'nnnnnnnn'], [3, 8, 'nnnnnnnn'], [3, 9, 'nnnnnnnn']]
const GRIN: Patch[] = [[5, 5, 'nnnn'], [3, 6, 'nnnnnnnn'], [3, 7, 'nn    nn'], [3, 8, 'nn    nn'], [3, 9, 'nn    nn']]
const face = (...groups: (readonly Patch[])[]) => paint(FACE, OPEN_EYES, MOUTH, ...groups)
const PROP = stamp(14, 2, ['.k.', 'kgk', 'knk', '.k.'])

const moods: Theme['moods'] = {
  idle: [frame(face(PROP), 1800), frame(face(PROP, BLINK), 140), frame(face(PROP), 900)],
  working: [frame(face(LOOK_LEFT), 520), frame(face(), 520), frame(face(LOOK_LEFT), 520), frame(face(BLINK), 140)],
  waiting: [
    frame(paint(face(), stamp(14, 0, QUESTION)), 650),
    frame(face(LOOK_UP), 300),
  ],
  error: [frame(paint(face(WIDE, ALARM_MOUTH), stamp(14, 1, BANG)), 420), frame(face(WIDE, ALARM_MOUTH), 160)],
  done: [frame(paint(face(HAPPY, GRIN), stamp(15, 0, SPARKLE)), 500), frame(paint(face(HAPPY, GRIN), stamp(14, 5, SPARKLE)), 500)],
  party: [0, 1, 2, 3].map(t => frame(paint(shift(face(HAPPY, GRIN, PROP), 0, t % 2), stamp(14, 2, SPARKLE)), 140)),
  sweat: [0, 1, 2].map((y, i) => frame(paint(face(LOOK_LEFT), stamp(14, y, ['.c.', 'ccc', '.c.'])), [700, 450, 350][i]!)),
  asleep: [0, 1, 2].map(t => frame(paint(face(BLINK), t < 2 ? stamp(15, 4 - 2 * t, SMALL_Z) : []), 1100)),
}

export const creeper: Theme = {
  description: 'a green Creeper-inspired pixel mascot with square eyes and a blocky mouth',
  sounds: { done: 'sounds/creeper/done.wav', error: 'sounds/creeper/error.wav', waiting: 'sounds/creeper/waiting.wav', party: 'sounds/creeper/party.wav' },
  accent: '#77aa44',
  onAccent: '#111111',
  palette: {
    k: 0x333333,
    g: 0x77aa77,
    G: 0xaacc77,
    d: 0x44aa44,
    n: 0x111111,
    c: 0x44aaff,
    r: 0xff4444,
    y: 0xffdd44,
  },
  moods,
  faces: {
    idle: '[|*|]',
    working: '[*>*]',
    waiting: '[|*|]?',
    error: '[x_x]!',
    done: '[^_^]',
    party: '[^o^]~',
    sweat: '[;_;]',
    asleep: '[-_-] z',
  },
  quips: {
    idle: [
      'standing very still. very',
      'not hissing. just breathing',
      'admiring your house. up close',
      'quietly guarding your blocks',
      'waiting for a redstone signal',
    ],
    working: [
      'sneaking up on the answer',
      'mining for the bug',
      'digging straight down. bold',
      'crafting. need more sticks',
      'following the redstone trail',
    ],
    waiting: [
      'shall I make it go boom?',
      'standing close. say the word',
      'approve it, or I get closer',
      'fuse is ready. your OK?',
    ],
    error: [
      'ssss... boom. sorry about the roof',
      'that was a hug. a very loud one',
      'well, that escalated quickly',
      'there is a hole where the build was',
    ],
    done: [
      'nothing exploded. a good day',
      'a fine build. so tempting',
      'finished. fighting the urge to boom',
      'all blocks in place',
    ],
    party: ['ssss... confetti!'],
    sweat: [
      'the fuse is getting short',
      'the hissing is getting louder',
      'swelling slightly. please step back',
      'careful, I might pop',
    ],
    asleep: [
      'do not wake the creeper. seriously',
      'zzz... still standing',
      'sleeping in a dirt hut',
      'dreaming of your living room',
    ],
  },
  party: {
    tests: 'tests green! everything is lit',
    commit: 'committed! another block placed',
    push: 'pushed! build sent to the server',
    summoned: 'ssss... you called?',
  },
  verbs: {
    Read: 'inspecting {}',
    Edit: 'placing a block in {}',
    MultiEdit: 'placing blocks in {}',
    NotebookEdit: 'crafting {}',
    Write: 'building {}',
    Bash: 'igniting {}',
    Grep: 'mining {}',
    Glob: 'scouting for {}',
    WebFetch: 'fetching {} from the server',
    WebSearch: 'searching the wiki for {}',
    Agent: 'sending a helper to {}',
    TodoWrite: 'checking the build list',
    Skill: 'learning how to craft {}',
    default: 'working on {}',
  },
  spinner: {
    thinking: ['Crafting', 'Mining', 'Following redstone', 'Checking the recipe'],
    requesting: ['Hissing at the server', 'Sending a block'],
    responding: ['Building the reply', 'Placing the final block'],
    'tool-input': ['Lighting the fuse', 'Gathering blocks'],
    'tool-use': ['Mining', 'Crafting', 'Building'],
  },
  turn: {
    plain: ['Built', 'Crafted', 'Mined', 'Placed', 'Explored', 'Gathered blocks'],
    errors: n => `Survived ${n} blast${n === 1 ? '' : 's'}, then rebuilt`,
    party: 'Lit the fuse',
  },
  compactNudge: 'context almost full: /compact before the fuse gets short',
}
