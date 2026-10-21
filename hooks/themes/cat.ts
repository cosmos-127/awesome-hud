import { BIG_Z, BLANK, DROP, HEIGHT, QUESTION, RAINBOW, SMALL_Z, SPARKLE, frame, layer, paint, shift, stamp } from '../sprite'
import type { Patch } from '../sprite'
import type { Theme } from '../theme'

// An orange tabby kitten: big green eyes with a glint, a pink nose over a small smile, blushing cheeks, and a tail in
// columns 13-17 that acts out every mood.
const FACE = [
  '.kk........kk.',
  'kopk......kpok',
  'koppkkkkkkppok',
  'koooodoodooook',
  'kosiioooosiiok',
  'koieiooooieiok',
  'koieioppoieiok',
  'kppocdccdcoppk',
  '.kooccddccook.',
  '..kkkkkkkkkk..',
]

// Both eyes at once, three pixels wide: their rows from y 4.
const eyes = (...rows: string[]): Patch[] => rows.flatMap((r, i) => [[2, 4 + i, r], [9, 4 + i, r]] as Patch[])

const BLINK = eyes('ooo', 'ooo', 'kkk')
// A pupil looks by where it sits in the green; the glint stays up and left.
const LOOK_LEFT = eyes('sii', 'eii', 'eii')
const LOOK_RIGHT = eyes('sii', 'iie', 'iie')
const LOOK_UP = eyes('sei', 'iei', 'iii')
const LOOK_UP_RIGHT = eyes('sie', 'iie', 'iii')
const LOOK_DOWN = eyes('sii', 'iii', 'iei')
// Lids half down: the look that has seen your code.
const JUDGE = eyes('ooo', 'eee', 'iei')
// Eyes gone round and white, the pupils pinpricks.
const WIDE = eyes('sss', 'ses', 'sss')
// Closed and smiling, ^ ^.
const HAPPY = eyes('ooo', 'oko', 'kok')
// The hiss: a dark mouth with a fang at each corner.
const HISS: Patch[] = [[5, 7, 'eeee'], [5, 8, 'sees']]
// The smile with the tongue out, a little to one side.
const BLEP: Patch[] = [[7, 8, 'p']]
const WOBBLE: Patch[] = [[5, 7, 'cdcd'], [5, 8, 'cccc']]
const WORRIED: Patch[] = [[4, 3, 'k'], [9, 3, 'k']]
// Ears pinned flat: the '.' erase their tips.
const FLAT_EARS: Patch[] = [[0, 0, '..............'], [0, 1, 'kkk........kkk'], [0, 2, 'kppokkkkkkoppk']]

// The tail's poses, over the head's right edge where they meet it.
const TAIL = stamp(13, 1, ['..kk.', '.oook', '.ddk.', '.ook.', '.ddk.', '.ook.', 'ook..', 'ok...', 'k....'])
const TAIL_FLICK = stamp(13, 1, ['.kk..', '.ook.', '.ddk.', '.ook.', '.ddk.', '.ook.', 'ook..', 'ok...', 'k....'])
const TAIL_UP = stamp(13, 0, ['..kk.', '.oook', '.ook.', '.ddk.', '.ook.', '.ook.', '.ddk.', 'ook..', 'ok...', 'k....'])
const TAIL_LOW = stamp(13, 5, ['..kk.', '.oook', '.ddk.', 'ook..', 'k....'])
// Bristled like a bottle brush.
const TAIL_PUFF = stamp(13, 5, ['.kkk.', 'kodok', 'kdodk', 'kodok', 'kok..'])
const TAIL_CURLED = stamp(12, 7, ['.kkkkk', 'kodood', 'kkkkk.'])
// A shorter `!`, so the puffed tail fits beneath it.
const BANG = ['.rr.', '.rr.', '.rr.', '....', '.rr.']

// The red dot, darting about the corner above the stalking tail; the eyes follow it.
const DOT = [[16, 0], [14, 1], [17, 2], [15, 3], [14, 4]] as const
const dot = (t: number): Patch[] => [[...DOT[t % DOT.length]!, 'R'] as Patch]

// The raised tail in rainbow bands that climb a row a frame.
const rainbowTail = (phase: number): Patch[] =>
  TAIL_UP.map(([x, y, row]) => [x, y, row.replace(/[od]/g, () => 'ROYGBV'[(y + phase) % 6]!)] as const)

const CONFETTI: Patch[] = [[15, 0, 'R'], [17, 2, 'Y'], [14, 3, 'B'], [16, 5, 'G'], [0, 0, 'V'], [13, 1, 'O'], [17, 7, 'R'], [15, 8, 'Y']]
const confetti = (phase: number) => paint(BLANK, CONFETTI.map(([x, y, c]) => [x, (y + 2 * phase) % HEIGHT, c] as const))

const face = (...groups: (readonly Patch[])[]) => paint(FACE, ...groups)
const asleep = face(BLINK, TAIL_CURLED)
// Breathing out: the head sinks a pixel, the tail stays where it lies.
const sunk = paint(shift(face(BLINK), 0, 1), TAIL_CURLED)

const moods: Theme['moods'] = {
  idle: [
    frame(face(TAIL), 2400),
    frame(face(BLINK, TAIL), 130),
    frame(face(TAIL), 1500),
    // Judging you, the tail's tip twitching.
    frame(face(JUDGE, TAIL), 700),
    frame(face(JUDGE, TAIL_FLICK), 260),
    frame(face(JUDGE, TAIL), 260),
    frame(face(JUDGE, TAIL_FLICK), 260),
    frame(face(TAIL), 2000),
    frame(face(BLINK, TAIL), 110),
    frame(face(TAIL), 110),
    frame(face(BLINK, TAIL), 110),
  ],
  // Stalking the dot: the tail low, the eyes on it wherever it goes.
  working: [
    frame(face(LOOK_UP_RIGHT, TAIL_LOW, dot(0)), 260),
    frame(face(LOOK_UP, TAIL_LOW, dot(1)), 260),
    frame(face(LOOK_RIGHT, TAIL_LOW, dot(2)), 260),
    frame(face(LOOK_DOWN, TAIL_LOW, dot(3)), 260),
    frame(face(LOOK_RIGHT, TAIL_LOW, dot(4)), 260),
    frame(face(BLINK, TAIL_LOW, dot(0)), 140),
  ],
  // The tail tucked away, so the `?` has the corner.
  waiting: [frame(face(stamp(14, 0, QUESTION)), 650), frame(face(LOOK_RIGHT), 300)],
  error: [
    frame(face(WIDE, HISS, FLAT_EARS, TAIL_PUFF, stamp(14, 0, BANG)), 420),
    frame(shift(face(WIDE, HISS, FLAT_EARS, TAIL_PUFF), 1, 0), 160),
  ],
  done: [frame(face(HAPPY, TAIL_LOW, stamp(14, 0, SPARKLE)), 500), frame(face(HAPPY, BLEP, TAIL_LOW, stamp(15, 2, SPARKLE)), 500)],
  // Zoomies: a bounce, a rainbow climbing the raised tail, confetti behind.
  party: [0, 1, 2, 3, 4, 5].map(t => frame(layer(confetti(t % 2), shift(face(HAPPY, BLEP, rainbowTail(t)), 0, t % 2)), 140)),
  sweat: [0, 1, 2].map((y, i) => frame(face(WORRIED, WOBBLE, i === 1 ? LOOK_RIGHT : LOOK_LEFT, TAIL_LOW, stamp(13, y, DROP)), [700, 450, 350][i]!)),
  asleep: [
    frame(paint(asleep, stamp(15, 4, SMALL_Z)), 1100),
    frame(paint(sunk, stamp(15, 2, SMALL_Z)), 1100),
    frame(paint(asleep, stamp(14, 0, BIG_Z)), 1100),
    frame(sunk, 1100),
  ],
}

export const cat: Theme = {
  description: 'an orange cat with opinions',
  sounds: { done: 'sounds/cat/done.wav', error: 'sounds/cat/error.wav', waiting: 'sounds/cat/waiting.wav', party: 'sounds/cat/party.wav' },
  accent: '#eeaa44',
  onAccent: '#222222',
  palette: {
    k: 0xaa4400,
    o: 0xffaa44,
    d: 0xdd7700,
    c: 0xffddaa,
    p: 0xff77aa,
    i: 0x77dd44,
    e: 0x222222,
    s: 0xffffff,
    b: 0x77ccff,
    y: 0xffdd44,
    r: 0xee4444,
    g: 0xbbbbbb,
    ...RAINBOW,
  },
  moods,
  faces: {
    idle: '=^.^=',
    working: '=•.•=',
    waiting: '=o.o= ?',
    error: '=O.O= !',
    done: '=^w^=',
    party: '=^o^= ~',
    sweat: '=;.;=',
    asleep: '=-.-= z',
  },
  quips: {
    idle: [
      'loafing',
      'if it fits, I sits',
      'guarding the keyboard',
      'judging your code silently',
      'ceiling cat is watching',
      'waiting for treats (and prompts)',
    ],
    working: [
      'thinking very hard, for a cat',
      'plotting world domination',
      'chasing the red dot',
      'staring at nothing, intensely',
      'I can haz context?',
    ],
    waiting: ['needs your OK, hooman', 'pspsps... your turn', 'paws up, waiting on you', 'staring at you until you answer'],
    error: [
      'oops. knocked it off the table',
      'that was not me',
      'hiss!',
      'grumpy cat says: no',
      'it fell. I watched it fall.',
    ],
    done: ['nailed it', 'keyboard cat plays you off', 'purrfect', 'done. where is my treat?', 'mission accomplished, nap time'],
    party: ['zoomies!'],
    sweat: ['context getting tight. if it fits, I sits?', 'running out of box', 'too many tokens, not enough box', 'nervous purring'],
    asleep: ['zzz', 'dreaming of mice', 'do not disturb (unless treats)', 'charging nap batteries'],
  },
  party: {
    tests: 'tests green! zoomies!',
    commit: 'committed! treat please',
    push: 'pushed! the cat has shipped',
    summoned: 'mrrp? you called?',
  },
  verbs: {
    Read: 'sniffing {}',
    Edit: 'scratching {}',
    MultiEdit: 'scratching {}',
    NotebookEdit: 'scratching {}',
    Write: 'kneading {}',
    Bash: 'pawing at {}',
    Grep: 'hunting for {}',
    Glob: 'chasing {}',
    WebFetch: 'dragging in {}',
    WebSearch: 'stalking the web for {}',
    Agent: 'herding a kitten: {}',
    TodoWrite: 'batting at the todo list',
    Skill: 'reading the ancient scroll of {}',
    default: 'batting at {}',
  },
  spinner: {
    thinking: ['Contemplating the red dot', 'Staring at the wall', 'Plotting', 'Loafing thoughtfully', 'Pondering the box'],
    requesting: ['Meowing at the server', 'Knocking things off the API'],
    responding: ['Purring', 'Kneading the reply', 'Typing with paws'],
    'tool-input': ['Sharpening claws', 'Stretching'],
    'tool-use': ['Pouncing', 'Batting at things', 'Hunting'],
  },
  turn: {
    plain: ['Napped', 'Purred', 'Kneaded', 'Prowled', 'Loafed', 'Hunted', 'Pounced', 'Groomed'],
    errors: n => `Knocked over ${n} cup${n === 1 ? '' : 's'}, then napped`,
    party: 'Did zoomies',
  },
  compactNudge: 'context almost full: try /compact before the cat sits on it',
}
