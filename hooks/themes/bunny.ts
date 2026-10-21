import { BIG_Z, BLANK, DROP, SMALL_Z, SPARKLE, frame, layer, paint, shift, stamp } from '../sprite'
import type { Patch } from '../sprite'
import type { Theme } from '../theme'

// A white bunny: tall ears lined in pink, a mauve outline that holds on dark and light terminals alike, tall eyes with a
// pink glint, a pink nose, blushing cheeks. A carrot stands in columns 14-17 below the emotes.
const FACE = [
  '...kk....kk...',
  '..kppk..kppk..',
  '..kppk..kppk..',
  '..kppkkkkppk..',
  '.kwwwwwwwwwwk.',
  'kwweewwwweewwk',
  'kwwpewwwwpewwk',
  'kwweewPPweewwk',
  'kppwwwwwwwwppk',
  '.kkkkkkkkkkkk.',
]

// The ears are the four top rows, whole: a pose replaces them.
const ears = (...rows: string[]): Patch[] => rows.map((row, y) => [0, y, row] as Patch)
// One ear bent at its tip, the other standing.
const TWITCH_LEFT = ears('..kk.....kk...', '.kppk...kppk..', '..kppk..kppk..', '..kppkkkkppk..')
const TWITCH_RIGHT = ears('...kk.....kk..', '..kppk...kppk.', '..kppk..kppk..', '..kppkkkkppk..')
// Both tips thrown outward: a thump.
const SPLAY = ears('..kk......kk..', '.kppk....kppk.', '..kppk..kppk..', '..kppkkkkppk..')
// Folded over and low, as a lop's are.
const LOP = ears('..............', '..kkk....kkk..', '.kpppk..kpppk.', '.kpppkkkkpppk.')

// Both eyes at once, two pixels wide and dx columns along: their rows from y 5, over the open eyes wiped.
const eyes = (dx: number, ...rows: string[]): Patch[] => [
  ...rows.flatMap((_, i) => [[3, 5 + i, 'ww'], [9, 5 + i, 'ww']] as Patch[]),
  ...rows.flatMap((r, i) => [[3 + dx, 5 + i, r], [9 + dx, 5 + i, r]] as Patch[]),
]

const BLINK = eyes(0, 'ww', 'ww', 'ee')
// A bead eye looks by sliding along the face, its pink glint with it.
const LOOK_LEFT = eyes(-1, 'ee', 'pe', 'ee')
const LOOK_RIGHT = eyes(1, 'ee', 'pe', 'ee')
// Eyes gone big, three pixels wide, the mouth a small O.
const WIDE: Patch[] = [[2, 5, 'eee'], [2, 6, 'epe'], [2, 7, 'eee'], [9, 5, 'eee'], [9, 6, 'epe'], [9, 7, 'eee'], [6, 8, 'ee']]
// Closed and smiling, ^ ^.
const HAPPY: Patch[] = [...eyes(0, 'ww', 'ww', 'ww'), [3, 6, 'e'], [2, 7, 'e'], [4, 7, 'e'], [10, 6, 'e'], [9, 7, 'e'], [11, 7, 'e']]
// Lids half down.
const TIRED = eyes(0, 'ww', 'pe', 'ee')
// The nose, twitching to a single pixel.
const SNIFF: Patch[] = [[6, 7, 'wP']]

// Shorter than the shared ones, so the carrot keeps the rows below.
const QUESTION = ['.yy.', 'y..y', '..y.', '....', '..y.']
const BANG = ['.rr.', '.rr.', '.rr.', '....', '.rr.']

const CARROT = stamp(14, 5, ['.vv.', '.oo.', '.oO.', '..o.', '..O.'])

// Confetti behind, a row lower a step.
const CONFETTI: Patch[] = [[15, 0, 'p'], [17, 2, 'y'], [14, 3, 'l'], [16, 4, 'v'], [0, 0, 'y'], [13, 1, 'P'], [17, 0, 'v'], [0, 3, 'l']]
const confetti = (phase: number) => paint(BLANK, CONFETTI.map(([x, y, c]) => [x, (y + 2 * phase) % 5, c] as const))

const face = (...groups: (readonly Patch[])[]) => paint(FACE, ...groups)
const asleep = face(LOP, BLINK, CARROT)
// Breathing out: the head sinks a pixel.
const sunk = paint(shift(face(LOP, BLINK), 0, 1), CARROT)

const IDLE: [readonly Patch[], number][] = [
  [[], 2400], [TWITCH_LEFT, 200], [[], 200], [TWITCH_RIGHT, 200], [[], 1500], [BLINK, 130], [[], 1800], [SNIFF, 150], [[], 150], [SNIFF, 150], [[], 2000], [BLINK, 110], [[], 110], [BLINK, 110],
]

const moods: Theme['moods'] = {
  idle: IDLE.map(([pose, ms]) => frame(face(pose, CARROT), ms)),
  // Ears swivelling, eyes following: it takes in all of it.
  working: [0, 1, 2, 3, 4, 5, 6, 7].map(t =>
    frame(face(t % 2 ? TWITCH_RIGHT : TWITCH_LEFT, t % 4 < 2 ? LOOK_RIGHT : LOOK_LEFT, t % 3 === 2 ? SNIFF : [], CARROT), 160),
  ),
  waiting: [frame(face(LOOK_RIGHT, CARROT, stamp(14, 0, QUESTION)), 650), frame(face(LOOK_RIGHT, CARROT), 300)],
  // The thump: ears thrown out, eyes wide, the whole bunny shaking.
  error: [
    frame(paint(shift(face(SPLAY, WIDE), 1, 0), CARROT, stamp(14, 0, BANG)), 420),
    frame(paint(face(SPLAY, WIDE), CARROT), 160),
    frame(paint(shift(face(SPLAY, WIDE), 1, 0), CARROT), 160),
  ],
  done: [frame(face(HAPPY, CARROT, stamp(14, 0, SPARKLE)), 500), frame(face(HAPPY, TWITCH_LEFT, CARROT, stamp(15, 2, SPARKLE)), 500)],
  // Binky: a hop a frame, the ears flicking, confetti behind.
  party: [0, 1, 2, 3, 4, 5].map(t =>
    frame(layer(confetti(t % 2), paint(shift(face(HAPPY, t % 2 ? TWITCH_RIGHT : TWITCH_LEFT), 0, t % 2), CARROT)), 140),
  ),
  sweat: [0, 1, 1].map((y, i) => frame(face(LOP, TIRED, i === 2 ? BLINK : [], CARROT, stamp(14, y, DROP)), [700, 450, 350][i]!)),
  asleep: [
    frame(paint(asleep, stamp(15, 2, SMALL_Z)), 1100),
    frame(paint(sunk, stamp(15, 0, SMALL_Z)), 1100),
    frame(paint(asleep, stamp(14, 0, BIG_Z)), 1100),
    frame(sunk, 1100),
  ],
}

export const bunny: Theme = {
  description: 'a white bunny with expressive ears and a carrot',
  sounds: { done: 'sounds/bunny/done.wav', error: 'sounds/bunny/error.wav', waiting: 'sounds/bunny/waiting.wav', party: 'sounds/bunny/party.wav' },
  accent: '#44dd44',
  onAccent: '#111111',
  palette: {
    k: 0xaa77aa,
    w: 0xffffff,
    l: 0xddccee,
    p: 0xffaacc,
    P: 0xff77aa,
    e: 0x222222,
    o: 0xff7711,
    O: 0xcc4411,
    v: 0x44dd44,
    y: 0xffaa11,
    r: 0xee4444,
    g: 0xaaaaaa,
    b: 0x77ccff,
  },
  moods,
  faces: {
    idle: '(\\o.o/)',
    working: '(\\o.o/)~',
    waiting: '(\\o.o/)?',
    error: '(\\O.O/)!',
    done: '(\\^.^/)',
    party: '(\\^o^/)~',
    sweat: '(\\o.o/);',
    asleep: '(\\-.-/) z',
  },
  quips: {
    idle: ['ears up', 'loafing on the grass', 'nose twitching', 'tidying a carrot', 'listening to the grass grow', 'doing a little flop'],
    working: ['ears swiveling, taking it all in', 'nibbling on the problem', 'hopping through the code', 'thinking, nose twitching', 'digging a burrow to your answer'],
    waiting: ['ears up, waiting on you', 'needs your OK, nose twitching', 'frozen mid-nibble, waiting', 'thump? your turn'],
    error: ['thump! thump!', 'ears out, something is wrong', 'startled! it hopped away', 'that carrot was not a carrot', 'froze and thumped'],
    done: ['binky!', 'carrot earned', 'hopped to the finish', 'ears up, job done', 'happy flop'],
    party: ['binky binky binky!'],
    sweat: ['ears drooping, context filling', 'the burrow is getting crowded', 'too many carrots, not enough hole', 'nervous nose twitch'],
    asleep: ['zzz', 'loafed and flopped', 'dreaming of clover', 'ears down, snoozing'],
  },
  party: {
    tests: 'tests green! binky!',
    commit: 'committed! carrot please',
    push: 'pushed! hop hop hooray',
    summoned: 'nose twitch? you called?',
  },
  verbs: {
    Read: 'sniffing {}',
    Edit: 'nibbling {}',
    MultiEdit: 'nibbling {}',
    NotebookEdit: 'nibbling {}',
    Write: 'digging {}',
    Bash: 'hopping through {}',
    Grep: 'foraging for {}',
    Glob: 'foraging through {}',
    WebFetch: 'carrying home {}',
    WebSearch: 'hopping the web for {}',
    Agent: 'sending a bunny: {}',
    TodoWrite: 'counting carrots',
    Skill: 'reading the burrow map: {}',
    default: 'nosing at {}',
  },
  spinner: {
    thinking: ['Twitching nose', 'Loafing', 'Listening', 'Munching on it', 'Pondering the clover'],
    requesting: ['Thumping at the server', 'Hopping to the API'],
    responding: ['Nibbling a reply', 'Munching', 'Whisper-thumping'],
    'tool-input': ['Stretching ears', 'Flopping'],
    'tool-use': ['Hopping', 'Digging', 'Foraging'],
  },
  turn: {
    plain: ['Hopped', 'Munched', 'Loafed', 'Foraged', 'Binkied', 'Flopped', 'Nibbled', 'Dug'],
    errors: n => `Thumped ${n} time${n === 1 ? '' : 's'}, then hid`,
    party: 'Binkied',
  },
  compactNudge: 'context almost full: /compact before the burrow floods',
}
