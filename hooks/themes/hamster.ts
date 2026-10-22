import { BIG_Z, BLANK, DROP, SMALL_Z, SPARKLE, frame, layer, paint, shift, stamp } from '../sprite'
import type { Patch } from '../sprite'
import type { Theme } from '../theme'

// A cream hamster with a tan cap: round ears, wide-set bead eyes, a pink nose over buck teeth, and cheeks that fill. Its
// wheel stands in columns 14-17 below the emotes, and turns when it works.
const FACE = [
  '..kk......kk..',
  '.kPPk....kPPk.',
  '.kPPkkkkkkPPk.',
  '.kttttttttttk.',
  'kttttttttttttk',
  'kccseccccsecck',
  'kcceecccceecck',
  'kppcccppcccppk',
  '.kccckwwkccck.',
  '..kkkkkkkkkk..',
]

// Both eyes at once: their top row, then their bottom row.
const eyes = (top: string, bottom: string): Patch[] => [[3, 5, top], [9, 5, top], [3, 6, bottom], [9, 6, bottom]]

const BLINK = eyes('cc', 'kk')
// A bead eye looks by where its glint sits.
const LOOK_LEFT = eyes('se', 'ee')
const LOOK_RIGHT = eyes('es', 'ee')
// Eyes gone round and bright, the mouth open.
const WIDE: Patch[] = [...eyes('ss', 'se'), [6, 8, 'ee']]
// Closed and smiling, ^ ^.
const HAPPY: Patch[] = [[2, 5, 'cec'], [2, 6, 'ece'], [9, 5, 'cec'], [9, 6, 'ece']]
const WORRIED: Patch[] = [[3, 4, 'kk'], [9, 4, 'kk']]
// Chewing: the teeth gone.
const NIBBLE: Patch[] = [[6, 8, 'ee']]

// Cheeks full: the jaw a pixel wider each side.
const STUFFED: Patch[] = [[0, 8, 'kcccckwwkcccck'], [0, 9, '.kkkkkkkkkkkk.']]

// Shorter than the shared ones, so the wheel keeps the rows below.
const QUESTION = ['.yy.', 'y..y', '..y.', '....', '..y.']
const BANG = ['.rr.', '.rr.', '.rr.', '....', '.rr.']

// The wheel, a ring on its side with two spokes that swap a step, and a bright pip that goes round it.
const WHEEL = stamp(14, 5, ['.hh.', 'h..h', 'h..h', 'h..h', '.hh.'])
const SPOKES = [stamp(14, 6, ['.j..', '.jj.', '..j.']), stamp(14, 6, ['..j.', '.jj.', '.j..'])]
const RING = [[15, 5], [16, 5], [17, 6], [17, 7], [17, 8], [16, 9], [15, 9], [14, 8], [14, 7], [14, 6]] as const
const wheel = (step: number): Patch[] => {
  const [x, y] = RING[step % RING.length]!
  return [...WHEEL, ...SPOKES[step % 2]!, [x, y, 'H']]
}

// Seeds and sprinkles behind it, a row lower a step.
const SPRINKLES: Patch[] = [[15, 0, 'y'], [17, 2, 'p'], [14, 3, 'b'], [16, 4, 'y'], [0, 0, 'p'], [13, 1, 't'], [17, 0, 'y']]
const sprinkles = (phase: number) => paint(BLANK, SPRINKLES.map(([x, y, c]) => [x, (y + 2 * phase) % 5, c] as const))

const face = (...groups: (readonly Patch[])[]) => paint(FACE, ...groups)
const asleep = face(BLINK, wheel(0))
// Breathing out: the head sinks a pixel.
const sunk = paint(shift(face(BLINK), 0, 1), wheel(0))

const moods: Theme['moods'] = {
  idle: [
    frame(face(wheel(0)), 2400),
    frame(face(BLINK, wheel(0)), 130),
    frame(face(wheel(0)), 1600),
    frame(face(NIBBLE, wheel(0)), 200),
    frame(face(wheel(0)), 200),
    frame(face(NIBBLE, wheel(0)), 200),
    frame(face(wheel(0)), 2000),
    frame(face(BLINK, wheel(0)), 110),
    frame(face(wheel(0)), 110),
    frame(face(BLINK, wheel(0)), 110),
  ],
  // Running the wheel: the head bobs a pixel a step and glances either way, the pip racing round.
  working: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(t =>
    frame(paint(shift(face(t % 4 < 2 ? LOOK_RIGHT : LOOK_LEFT), t % 4 < 2 ? 1 : 0, t % 2), wheel(t + 1)), 90),
  ),
  waiting: [frame(face(LOOK_RIGHT, wheel(0), stamp(14, 0, QUESTION)), 650), frame(face(LOOK_RIGHT, wheel(0)), 300)],
  error: [frame(face(WIDE, wheel(3), stamp(14, 0, BANG)), 420), frame(face(WIDE, wheel(3)), 160)],
  done: [frame(face(HAPPY, wheel(0), stamp(14, 0, SPARKLE)), 500), frame(face(HAPPY, wheel(0), stamp(15, 2, SPARKLE)), 500)],
  // Wheel party: a bounce, the wheel a blur, sprinkles behind.
  party: [0, 1, 2, 3, 4, 5].map(t => frame(layer(sprinkles(t % 2), paint(shift(face(HAPPY), 0, t % 2), wheel(t * 3))), 140)),
  // Cheeks full: stuffed, worried, a drop running down.
  sweat: [0, 1, 1].map((y, i) =>
    frame(face(STUFFED, WORRIED, i === 2 ? BLINK : [], wheel(0), stamp(14, y, DROP)), [700, 450, 350][i]!),
  ),
  asleep: [
    frame(paint(asleep, stamp(15, 2, SMALL_Z)), 1100),
    frame(paint(sunk, stamp(15, 0, SMALL_Z)), 1100),
    frame(paint(asleep, stamp(14, 0, BIG_Z)), 1100),
    frame(sunk, 1100),
  ],
}

export const hamster: Theme = {
  description: 'a cream hamster with a wheel and full cheeks',
  sounds: { done: 'sounds/hamster/done.wav', error: 'sounds/hamster/error.wav', waiting: 'sounds/hamster/waiting.wav', party: 'sounds/hamster/party.wav' },
  accent: '#aa7744',
  onAccent: '#111111',
  palette: {
    k: 0xaa7744,
    t: 0xddaa77,
    c: 0xffddaa,
    w: 0xffffff,
    p: 0xff77aa,
    P: 0xffaacc,
    e: 0x222222,
    s: 0xffffff,
    h: 0x77aadd,
    j: 0xaaccee,
    H: 0xffdd44,
    y: 0xffdd44,
    r: 0xee4444,
    g: 0xaaaaaa,
    b: 0x77ccff,
  },
  moods,
  faces: {
    idle: "(o'.'o)",
    working: '(o>.<o)',
    waiting: "(o'.'o)?",
    error: '(O.O)!',
    done: '(o^.^o)',
    party: '(o^o^o)~',
    sweat: '(oO.Oo)',
    asleep: '(o-.-o) z',
  },
  quips: {
    idle: ['ran 12 km. still in the cage', 'planning an escape. again', 'cheeks empty, spirits high', 'guarding the stash (one seed)'],
    working: ['running the wheel (it is going great)', 'sorting the seeds. it matters', 'hoarding tokens in my cheeks', 'digging a tunnel to your answer'],
    waiting: ['holding a seed hostage until you answer', 'standing on hind legs, hopeful', 'paws clasped, cheeks full. please', 'rattling the cage bars. politely'],
    error: [
      'chewed through the wrong cable',
      'the wheel fell off. still running',
      'dropped the seed. it rolled away',
      'spooked by my own shadow',
      'ran into the glass. again',
    ],
    done: ['stashed it. told no one where', 'all cheeks, no regrets', 'seed secured. nom', 'cheeks bulging with success'],
    party: ['wheel party! one at a time'],
    sweat: ['cheeks at 90%. still stuffing', 'just one more token. I swear', 'cannot speak. cheeks full', 'no room left in the cheeks'],
    asleep: ['asleep with the cheeks still full', 'sleeping all day, running all night', 'dreaming of a bigger wheel', 'asleep on a seed pile'],
  },
  party: {
    tests: 'tests green! extra seeds!',
    commit: 'committed! into the stash it goes',
    push: 'pushed! the stash is in the cloud now',
    summoned: 'squeak! a cat? hiding in the bedding',
  },
  verbs: {
    Read: 'inspecting {} for seeds',
    Edit: 'chewing on {}',
    MultiEdit: 'chewing on {}',
    NotebookEdit: 'chewing on {}',
    Write: 'building a nest of {}',
    Bash: 'running {} on the wheel',
    Grep: 'hoarding every {}',
    Glob: 'rummaging for {}',
    WebFetch: 'hauling in {}',
    WebSearch: 'tunneling the web for {}',
    Agent: 'recruiting a helper: {}',
    TodoWrite: 'sorting the seed list',
    Skill: 'consulting the burrow map: {}',
    default: 'poking at {}',
  },
  spinner: {
    thinking: ['Spinning the wheel', 'Stuffing cheeks', 'Burrowing', 'Counting seeds', 'Pondering the bedding'],
    requesting: ['Squeaking at the server', 'Rattling the cage'],
    responding: ['Chewing it over', 'Nibbling the reply', 'Squeaking'],
    'tool-input': ['Stretching little legs', 'Fluffing the bedding'],
    'tool-use': ['Scampering', 'Chewing cables', 'Stashing'],
  },
  turn: {
    plain: ['Scampered', 'Burrowed', 'Stashed', 'Ran the wheel', 'Hoarded', 'Stuffed cheeks', 'Chewed a cable'],
    errors: n => `Dropped ${n} seed${n === 1 ? '' : 's'}, kept running`,
    party: 'Ran laps',
  },
  compactNudge: 'context almost full: /compact before the cheeks pop',
}
