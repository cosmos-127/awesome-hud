import { DROP, frame, moodsOf, paint, stamp } from '../sprite'
import type { Patch } from '../sprite'
import type { Theme } from '../theme'

// A direwolf of the North: pointed ears, icy eyes, a white muzzle.
const FACE = [
  '.g..........g.',
  '.gg........gg.',
  '.gdg......gdg.',
  '.gdgkkkkkkgdg.',
  'kggggggggggggk',
  'kgieggggggeigk',
  'kgddggwwggddgk',
  '.kggwwwwwwggk.',
  '..kgwwnnwwgk..',
  '...kkkkkkkk...',
]

// Both eyes at once: one row, two pixels each.
const eyes = (left: string, right: string): Patch[] => [[2, 5, left], [10, 5, right]]

const HAPPY: Patch[] = [[1, 5, 'gkg'], [1, 6, 'kgk'], [10, 5, 'gkg'], [10, 6, 'kgk'], [6, 9, 'pp']]
const WORRIED: Patch[] = [[3, 4, 'k'], [10, 4, 'k']]
// Dragonfire, flickering between two shapes.
const FLAME = [
  ['.r..', '.ry.', 'rryr', 'ryyr', 'oyyo', '.oo.'],
  ['..r.', '.yr.', 'ryrr', 'ryyr', 'oyyo', '.oo.'],
]

export const got: Theme = {
  description: 'a direwolf of the North; winter is always coming',
  banner: [
    '::::::::::::::::::::::::::-:::::::::::::::::::::',
    '::+::::::::::::::::::=+#%@@@%@%#*+-:::::::::::::',
    ':::::::::::::::::::*%@@@%%@@:-@@@#+.:::::--:::::',
    '::---::::::::::::+@@@@@@%%@+  ..   +@#::::::::::',
    '::::::::-:::::::*@@@@@@@@@*     :*@@@@%-::::::::',
    ':::::::::::::::+@@@@@@@@@*     -@@@%%%@#::::::::',
    ':::::::::::::::%@@@@@@@@+      +@%####%@-:::::::',
    ':::::::::::::::@@@@@@@@=       =@@%##%@@=:::::::',
    '::--:=-::::::::#@@@@@@+        .@@@@@@@@-:::::::',
    '::::::-::::::-:-@@@@%*          @@@@@@@*::::::::',
    '::::::::::::::::=@@@%.         :%##%@@*:::::::::',
    ':::::::::::::::::-#@*          -@%%@%=::::::::::',
    ':::::::::::::::::::-:          :@@#=::::::::::::',
    '::::::::::::::::::::.        =  -:::::::::::::::',
    ':::-::...........           ..  ........::::::::',
  ],
  sounds: { done: 'sounds/got/done.wav', error: 'sounds/got/error.wav', waiting: 'sounds/got/waiting.wav', party: 'sounds/got/party.wav' },
  accent: '#a9c7e8',
  onAccent: '#0d1b2a',
  palette: {
    k: 0x1b1e24,
    g: 0x9aa3ad,
    d: 0x5c6670,
    w: 0xeef3f8,
    i: 0x7fd4ff,
    e: 0x0b0f14,
    n: 0x111111,
    p: 0xff8fa3,
    r: 0xe8452a,
    o: 0xff9f1a,
    y: 0xffd84a,
    b: 0xe8f4ff,
  },
  moods: {
    ...moodsOf(FACE, {
      blink: eyes('kk', 'kk'),
      lookLeft: eyes('ei', 'ei'),
      lookRight: eyes('ie', 'ie'),
      shock: [...eyes('ii', 'ii'), [2, 6, 'ii'], [10, 6, 'ii'], [6, 9, 'rr']],
      happy: HAPPY,
      worried: WORRIED,
    }),
    // Dragonfire for a party, so the palette needs no rainbow, and snow that falls the sprite's whole height.
    party: FLAME.map(f => frame(paint(FACE, HAPPY, stamp(14, 2, f)), 140)),
    sweat: [0, 3, 6].map((y, i) => frame(paint(FACE, WORRIED, stamp(14, y, DROP)), [700, 450, 350][i]!)),
  },
  faces: {
    idle: '(•ᴥ•)',
    working: '(•̀ᴥ•́)',
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
