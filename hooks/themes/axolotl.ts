import { BIG_Z, DROP, SMALL_Z, SPARKLE, frame, paint, shift, stamp } from '../sprite'
import type { Patch } from '../sprite'
import type { Theme } from '../theme'

// A pink axolotl: dot eyes, a wide smile, blushing cheeks, and frilled gills fanned off each side. Seaweed sways in
// columns 14-17 below the emotes.
const FACE = [
  'rr..........rr',
  'GGr........rGG',
  'rGGkkkkkkkkGGr',
  '.GGkalsslakGG.',
  'rGGaeaaaaeaGGr',
  '.GkGaaaaaaGkG.',
  '..kakaaaakak..',
  '...kakkkkak...',
  '...kaaaaaak...',
  '....kkkkkk....',
]

// Both eyes a pixel along: dots at x 4 and 9, y 4.
const look = (dx: number): Patch[] => [[4, 4, 'a'], [9, 4, 'a'], [4 + dx, 4, 'e'], [9 + dx, 4, 'e']]
const LOOK_LEFT = look(-1)
const LOOK_RIGHT = look(1)
// Eyes shut: a dash below where each dot was.
const BLINK: Patch[] = [[4, 4, 'a'], [9, 4, 'a'], [4, 5, 'k'], [9, 5, 'k']]
// Closed and content, each eye a small cup.
const HAPPY: Patch[] = [[4, 4, 'a'], [9, 4, 'a'], [3, 4, 'k'], [5, 4, 'k'], [4, 5, 'k'], [8, 4, 'k'], [10, 4, 'k'], [9, 5, 'k']]
// Eyes gone big and white, the mouth a round O.
const WIDE: Patch[] = [[4, 3, 'ss'], [4, 4, 'es'], [8, 3, 'ss'], [8, 4, 'se'], [4, 6, 'a'], [9, 6, 'a'], [5, 7, 'a'], [8, 7, 'a'], [6, 6, 'kk'], [6, 7, 'kk']]
const WORRIED: Patch[] = [[4, 3, 'k'], [9, 3, 'k']]
// The smile gone to a wobble.
const WOBBLE: Patch[] = [[4, 6, 'a'], [9, 6, 'a'], [5, 7, 'a'], [8, 7, 'a'], [5, 6, 'kk'], [7, 7, 'kk']]

// The gills at rest stand up; down, the top row has dropped a row.
const GILLS_DOWN: Patch[] = [[0, 0, '..'], [0, 1, 'rrG'], [0, 5, 'r'], [12, 0, '..'], [11, 1, 'Grr'], [13, 5, 'r']]
// Flared wide, with a stalk more.
const GILLS_FLARE: Patch[] = [[0, 3, 'r'], [0, 5, 'r'], [1, 5, 'G'], [1, 6, 'r'], [13, 3, 'r'], [13, 5, 'r'], [12, 5, 'G'], [12, 6, 'r']]

// Shorter than the shared ones, so the seaweed keeps the rows below.
const QUESTION = ['.yy.', 'y..y', '..y.', '....', '..y.']
const BANG = ['.rr.', '.rr.', '.rr.', '....', '.rr.']
// A hollow bubble with a glint, and a heart in whatever color.
const BUBBLE = ['.B.', 's.B', '.B.']
const heart = (c: string) => ['c.c', 'ccc', '.c.'].map(row => row.replaceAll('c', c))

// Seaweed, swaying between two poses.
const WEED_A = stamp(14, 5, ['.v..', '..v.', '.v.v', '..vv', '.VvV'])
const WEED_B = stamp(14, 5, ['..v.', '.v..', '.v.v', '.vv.', '.VvV'])
const weed = (t: number) => ((t >> 1) % 2 ? WEED_B : WEED_A)

const face = (...groups: (readonly Patch[])[]) => paint(FACE, ...groups)
// Breathing out: the whole axolotl sinks a pixel.
const sunk = (...groups: (readonly Patch[])[]) => shift(face(BLINK, GILLS_DOWN, ...groups), 0, 1)

const IDLE: [readonly Patch[], number][] = [
  [[], 1000], [GILLS_DOWN, 450], [[], 450], [GILLS_DOWN, 450], [[], 900], [BLINK, 130], [[], 900], [GILLS_DOWN, 450], [[], 450], [BLINK, 110], [[], 110], [BLINK, 110],
]

const moods: Theme['moods'] = {
  idle: IDLE.map(([pose, ms], t) => frame(face(pose, weed(t)), ms)),
  // Thinking in bubbles: a glance either way, the gills fluttering, a bubble up and gone.
  working: [0, 1, 2, 3, 4, 5, 6, 7].map(t =>
    frame(face(t % 4 < 2 ? LOOK_RIGHT : LOOK_LEFT, t % 2 ? GILLS_DOWN : [], weed(t), t % 4 < 3 ? stamp(14, 2 - (t % 4), BUBBLE) : []), 140),
  ),
  waiting: [frame(face(LOOK_RIGHT, weed(0), stamp(14, 0, QUESTION)), 650), frame(face(LOOK_RIGHT, weed(2)), 300)],
  error: [
    frame(face(WIDE, GILLS_FLARE, weed(0), stamp(14, 0, BANG)), 420),
    frame(face(WIDE, GILLS_FLARE, weed(2)), 160),
  ],
  done: [frame(face(HAPPY, weed(0), stamp(14, 0, SPARKLE)), 500), frame(face(HAPPY, GILLS_DOWN, weed(2), stamp(15, 2, SPARKLE)), 500)],
  // Bubble party: a bounce, the gills in a flutter, hearts floating up.
  party: [0, 1, 2, 3, 4, 5].map(t =>
    frame(paint(shift(face(HAPPY, t % 2 ? GILLS_DOWN : []), 0, t % 2), weed(t), stamp(14, 2 - (t % 3), heart(t < 3 ? 'G' : 'r'))), 140),
  ),
  sweat: [0, 1, 1].map((y, i) =>
    frame(face(WORRIED, WOBBLE, GILLS_DOWN, i === 2 ? BLINK : [], weed(i * 2), stamp(14, y, DROP)), [700, 450, 350][i]!),
  ),
  asleep: [
    frame(paint(sunk(), weed(0), stamp(15, 2, SMALL_Z)), 1100),
    frame(paint(face(BLINK, GILLS_DOWN), weed(2), stamp(15, 0, SMALL_Z)), 1100),
    frame(paint(sunk(), weed(0), stamp(14, 0, BIG_Z)), 1100),
    frame(paint(face(BLINK, GILLS_DOWN), weed(2)), 1100),
  ],
}

export const axolotl: Theme = {
  description: 'a smiling axolotl that regrows what breaks',
  sounds: { done: 'sounds/axolotl/done.wav', error: 'sounds/axolotl/error.wav', waiting: 'sounds/axolotl/waiting.wav', party: 'sounds/axolotl/party.wav' },
  accent: '#ff77aa',
  onAccent: '#441144',
  palette: {
    k: 0xcc4477,
    a: 0xffaacc,
    l: 0xffddee,
    G: 0xff77aa,
    e: 0x222222,
    s: 0xffffff,
    v: 0x44dd44,
    V: 0x117711,
    y: 0xffaa11,
    r: 0xee4444,
    g: 0xaaaaaa,
    b: 0x77ccff,
    B: 0x44aaff,
  },
  moods,
  faces: {
    idle: '}(o.o){',
    working: '}(o.o){~',
    waiting: '}(o.o){?',
    error: '}(O.O){!',
    done: '}(^u^){',
    party: '}(^u^){~',
    sweat: '}(o.o){;',
    asleep: '}(-.-){ z',
  },
  quips: {
    idle: ['floating and smiling', 'gills swaying', 'smiling at nothing', 'regenerating a little', 'waiting in the tank', 'wiggling gently'],
    working: ['wiggling toward the answer', 'gills fluttering', 'thinking in bubbles', 'swimming through your code', 'smiling and working'],
    waiting: ['needs your OK, blup', 'gills perked, waiting on you', 'floating until you answer', 'blup? your turn'],
    error: ['lost a limb. regrowing it.', 'that fell off. it will grow back', 'gills flared', 'blorp. try again', 'regenerating from that'],
    done: ['regrown and ready', 'blup! done', 'smiled and shipped', 'the tank is tidy', 'fully regenerated'],
    party: ['bubble party!'],
    sweat: ['running out of tank', 'context is up to my gills', 'the tank is crowded', 'bubbles are piling up'],
    asleep: ['zzz', 'floating off', 'dreaming of bubbles', 'drifting in the tank'],
  },
  party: {
    tests: 'tests green! blup blup!',
    commit: 'committed! it will grow back anyway',
    push: 'pushed! swim free',
    summoned: 'blup? you called?',
  },
  verbs: {
    Read: 'gazing at {}',
    Edit: 'regrowing {}',
    MultiEdit: 'regrowing {}',
    NotebookEdit: 'regrowing {}',
    Write: 'growing {}',
    Bash: 'swimming through {}',
    Grep: 'sifting the sand for {}',
    Glob: 'sifting through {}',
    WebFetch: 'bubbling up {}',
    WebSearch: 'swimming the web for {}',
    Agent: 'hatching a helper: {}',
    TodoWrite: 'counting the pebbles',
    Skill: 'reading the tank manual: {}',
    default: 'nudging {}',
  },
  spinner: {
    thinking: ['Floating', 'Blowing bubbles', 'Wiggling', 'Smiling thoughtfully', 'Regenerating'],
    requesting: ['Blupping at the server', 'Bubbling the API'],
    responding: ['Blowing a reply', 'Wiggling it out', 'Bubbling'],
    'tool-input': ['Fanning gills', 'Stretching'],
    'tool-use': ['Paddling', 'Nosing around', 'Sifting sand'],
  },
  turn: {
    plain: ['Floated', 'Wiggled', 'Bubbled', 'Paddled', 'Smiled', 'Regrew', 'Drifted', 'Fluttered'],
    errors: n => `Lost ${n} limb${n === 1 ? '' : 's'}, regrew ${n === 1 ? 'it' : 'them'}`,
    party: 'Did a bubble dance',
  },
  compactNudge: 'context almost full: /compact, then regrow',
}
