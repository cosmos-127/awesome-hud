import { BIG_Z, DROP, SMALL_Z, SPARKLE, frame, paint, shift, stamp } from '../sprite'
import type { Patch } from '../sprite'
import type { Theme } from '../theme'

// A pink axolotl: big dark eyes, blushing cheeks, a wide smile, and frilled gills fanned off each side. Seaweed sways in
// columns 14-17 below the emotes.
const FACE = [
  'rr..........rr',
  'GGr........rGG',
  'rGGkkkkkkkkGGr',
  '.GGkaaaaaakGG.',
  'rGkseaaaasekGr',
  '.GkeeaaaaeekG.',
  '..kPakaakaPk..',
  '..kaaakkaaak..',
  '..kaaaaaaaak..',
  '...kkkkkkkk...',
]

// Both eyes at once: their top row, then their bottom row.
const eyes = (top: string, bottom: string): Patch[] => [[3, 4, top], [9, 4, top], [3, 5, bottom], [9, 5, bottom]]

const BLINK = eyes('aa', 'kk')
// A bead eye looks by where its glint sits.
const LOOK_LEFT = eyes('se', 'ee')
const LOOK_RIGHT = eyes('es', 'ee')
// Eyes gone round and white, the mouth a round O.
const WIDE: Patch[] = [...eyes('ss', 'se'), [5, 6, 'a'], [8, 6, 'a'], [6, 6, 'kk'], [6, 7, 'kk']]
// Closed and smiling, ^ ^, each a pixel wider than the eye.
const HAPPY: Patch[] = [...eyes('aa', 'aa'), [4, 4, 'k'], [3, 5, 'k'], [5, 5, 'k'], [9, 4, 'k'], [8, 5, 'k'], [10, 5, 'k']]
const WORRIED: Patch[] = [[4, 3, 'k'], [9, 3, 'k']]
// The smile gone to a wobble.
const WOBBLE: Patch[] = [[5, 6, 'akak'], [6, 7, 'aa']]

// The gills at rest stand up; down, the top fronds have dropped a row.
const GILLS_DOWN: Patch[] = [[0, 0, '..'], [0, 1, 'rrG'], [0, 4, '.'], [0, 5, 'r'], [12, 0, '..'], [11, 1, 'Grr'], [13, 4, '.'], [13, 5, 'r']]
// A gill lost: the left top frond gone, then a stub of it, then grown back.
const GILL_GONE: Patch[] = [[0, 0, '...'], [0, 1, '...'], [0, 2, '...'], [0, 3, '...']]
const GILL_STUB: Patch[] = [...GILL_GONE, [1, 3, 'rG']]

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
  // Lost a gill, and growing it back: the stub, then the whole.
  error: [
    frame(face(WIDE, GILL_GONE, weed(0), stamp(14, 0, BANG)), 420),
    frame(face(WIDE, GILL_STUB, weed(2)), 300),
    frame(face(WIDE, weed(0)), 300),
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
    G: 0xff77aa,
    P: 0xff77aa,
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
