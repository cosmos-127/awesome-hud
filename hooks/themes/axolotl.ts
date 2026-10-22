import { BIG_Z, DROP, SMALL_Z, SPARKLE, frame, paint, shift, stamp } from '../sprite'
import type { Patch } from '../sprite'
import type { Theme } from '../theme'

// A pink axolotl: bead eyes with a glint, blushing cheeks, a wide smile, and three gill fronds fanned off each side. Seaweed
// sways in columns 14-17 below the emotes.
const FACE = [
  'G..G......G..G',
  'GG.GG....GG.GG',
  '.GGGG....GGGG.',
  '.GGkkkkkkkkGG.',
  'GGkseawwasekGG',
  '.GkeeaaaaeekG.',
  '.kPPkaaaakPPk.',
  '.kaaakkkkaaak.',
  '.kAAAAAAAAAAk.',
  '..kkkkkkkkkk..',
]

// Both eyes at once: their top row, then their bottom row.
const eyes = (top: string, bottom: string): Patch[] => [[3, 4, top], [9, 4, top], [3, 5, bottom], [9, 5, bottom]]

const BLINK = eyes('aa', 'kk')
// A bead eye looks by where its glint sits.
const LOOK_LEFT = eyes('se', 'ee')
const LOOK_RIGHT = eyes('es', 'ee')
// Eyes gone round and dark, three rows tall, the mouth a round O.
const WIDE: Patch[] = [...eyes('ee', 'se'), [3, 6, 'ee'], [9, 6, 'ee'], [6, 6, 'kk'], [5, 7, 'a'], [8, 7, 'a']]
// Closed and smiling, ^ ^.
const HAPPY: Patch[] = [...eyes('aa', 'aa'), [4, 4, 'e'], [3, 5, 'e'], [5, 5, 'e'], [9, 4, 'e'], [8, 5, 'e'], [10, 5, 'e']]
const WORRIED: Patch[] = [[3, 4, 'k'], [9, 4, 'ek']]
// The smile gone to a wobble.
const WOBBLE: Patch[] = [[4, 6, 'aakaka'], [5, 7, 'kaka']]

// The gills at rest stand up; down, each frond has dropped a row.
const GILLS_DOWN: Patch[] = [[0, 0, '..............'], [0, 1, 'G..G......G..G'], [0, 2, 'GG.GG....GG.GG']]
// A gill lost: the left one gone, then a stub of it, then grown back.
const GILL_STUB: Patch[] = [[0, 0, '....'], [0, 1, '.....'], [3, 2, '..']]
const GILL_GONE: Patch[] = [...GILL_STUB, [1, 2, '..'], [1, 3, '..']]

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
    a: 0xffccdd,
    A: 0xffaacc,
    G: 0xff4477,
    P: 0xff77aa,
    e: 0x441144,
    s: 0xffffff,
    w: 0xffeeff,
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
    idle: ['smiling at nothing', 'regenerating, just in case', 'technically a salamander', 'never grew up. no plans to', 'waiting in the tank'],
    working: ['wiggling toward the answer', 'smiling and working. mostly smiling', 'swimming in circles. productively', 'thinking in bubbles'],
    waiting: ['regrowing a limb while I wait', 'floating until you answer', 'blup? your turn', 'smiling at the glass. hello?'],
    error: ['lost a limb. regrowing it.', 'still smiling. it is just my face', 'that fell off. it will grow back', 'blorp. try again', 'regenerating from that'],
    done: ['shipped. all limbs accounted for', 'smiled and shipped', 'done. nothing fell off this time', 'regrown and ready'],
    party: ['bubble party! limbs optional'],
    sweat: ['dropping a limb to make room', 'running out of tank', 'bubbles are piling up', 'the tank is crowded. staying calm'],
    asleep: ['asleep. or smiling. hard to tell', 'asleep. regrowing in the background', 'dreaming of bubbles', 'drifting in the tank'],
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
