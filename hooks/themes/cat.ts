import { BIG_Z, BLANK, DROP, HEIGHT, QUESTION, RAINBOW, SMALL_Z, SPARKLE, frame, layer, paint, shift, stamp } from '../sprite'
import type { Patch } from '../sprite'
import type { Theme } from '../theme'

// An orange tabby: green slit eyes, the tabby M, and a tail in columns 13-17 that acts out every mood.
const FACE = [
  '.kk........kk.',
  'kopk......kpok',
  'koppkkkkkkppok',
  'koooodoodooook',
  'koooooddoooook',
  'koieiooooieiok',
  'koieioppoieiok',
  'kooccckkcccook',
  '.kocckcckccok.',
  '..kkkkkkkkkk..',
]

// Both eyes at once: their top row, then their bottom row.
const eyes = (top: string, bottom: string): Patch[] => [[2, 5, top], [9, 5, top], [2, 6, bottom], [9, 6, bottom]]

const BLINK = eyes('ooo', 'kkk')
const LOOK_LEFT = eyes('eii', 'eii')
const LOOK_RIGHT = eyes('iie', 'iie')
// Pupils blown wide, as a startled cat's are.
const WIDE = eyes('see', 'eee')
const HAPPY: Patch[] = [[2, 5, 'oko'], [2, 6, 'kok'], [9, 5, 'oko'], [9, 6, 'kok'], [1, 7, 'p'], [12, 7, 'p']]
const HISS: Patch[] = [[5, 7, 'kkkk'], [5, 8, 'kssk']]
// Ears pinned flat: the '.' erase their tips.
const FLAT_EARS: Patch[] = [[0, 0, '..............'], [0, 1, 'kkk........kkk'], [0, 2, 'kppokkkkkkoppk']]
const WORRIED: Patch[] = [[4, 4, 'k'], [9, 4, 'k']]

// The tail's poses, over the head's right edge where they meet it.
const TAIL = stamp(13, 1, ['..kk.', '.kook', '.kdk.', '.kok.', '.kok.', '.kdk.', 'kok..', 'ok...', 'k....'])
const TAIL_FLICK = stamp(13, 1, ['.kk..', 'kook.', '.kdk.', '.kok.', '.kok.', '.kdk.', 'kok..', 'ok...', 'k....'])
const TAIL_UP = stamp(13, 0, ['..kk.', '.kook', '.kok.', '.kdk.', '.kok.', '.kok.', '.kdk.', 'kok..', 'ok...', 'k....'])
const TAIL_LOW = stamp(13, 5, ['...k.', '..kok', '..kdk', '.kok.', 'kk...'])
// Bristled like a bottle brush.
const TAIL_PUFF = stamp(13, 5, ['.kkk.', 'kodok', 'kdodk', 'kodok', 'kok..'])
const TAIL_CURLED = stamp(12, 7, ['.kkkkk', 'kodood', 'kkkkk.'])
// A shorter `!`, so the puffed tail fits beneath it.
const BANG = ['.rr.', '.rr.', '.rr.', '....', '.rr.']

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
    frame(face(TAIL), 2600),
    frame(face(BLINK, TAIL), 130),
    frame(face(TAIL), 1800),
    frame(face(TAIL_FLICK), 260),
    frame(face(TAIL), 260),
    frame(face(TAIL_FLICK), 260),
    frame(face(TAIL), 2200),
    frame(face(BLINK, TAIL), 110),
    frame(face(TAIL), 110),
    frame(face(BLINK, TAIL), 110),
  ],
  working: [
    frame(face(LOOK_LEFT, TAIL), 520),
    frame(face(LOOK_RIGHT, TAIL_FLICK), 520),
    frame(face(LOOK_LEFT, TAIL), 520),
    frame(face(LOOK_RIGHT, TAIL_FLICK), 520),
    frame(face(BLINK, TAIL), 140),
  ],
  // The tail tucked away, so the `?` has the corner.
  waiting: [frame(face(stamp(14, 0, QUESTION)), 650), frame(face(LOOK_RIGHT), 300)],
  error: [frame(face(WIDE, HISS, FLAT_EARS, TAIL_PUFF, stamp(14, 0, BANG)), 420), frame(face(WIDE, HISS, FLAT_EARS, TAIL_PUFF), 160)],
  done: [frame(face(HAPPY, TAIL_LOW, stamp(14, 0, SPARKLE)), 500), frame(face(HAPPY, TAIL_LOW, stamp(15, 2, SPARKLE)), 500)],
  // Zoomies: a bounce, a rainbow climbing the raised tail, confetti behind.
  party: [0, 1, 2, 3, 4, 5].map(t => frame(layer(confetti(t % 2), shift(face(HAPPY, rainbowTail(t)), 0, t % 2)), 140)),
  sweat: [0, 1, 2].map((y, i) => frame(face(WORRIED, TAIL_LOW, stamp(13, y, DROP)), [700, 450, 350][i]!)),
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
  accent: '#f4a340',
  onAccent: '#2b1d14',
  palette: {
    k: 0x6b3612,
    o: 0xf4a340,
    d: 0xd2722a,
    c: 0xfff0dc,
    p: 0xff8fa3,
    i: 0xc8e04a,
    e: 0x1a1a1a,
    s: 0xffffff,
    b: 0x6ec6ff,
    y: 0xffd84a,
    r: 0xe84a4a,
    g: 0xb0b6be,
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
