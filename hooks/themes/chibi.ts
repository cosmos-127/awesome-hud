import { SMALL_Z, frame, paint, shift, stamp } from '../sprite'
import type { Patch } from '../sprite'
import type { Theme } from '../theme'

// Big violet eyes under swept bangs, an ahoge, and a side ponytail tied low on the right.
const FACE = [
  '........h.....',
  '...kkhhhhkk...',
  '.khhHHhhhhhhk.',
  'khhhhhhhhhhhhk',
  'khshhssssshhhk',
  'khseesssseeshk',
  'khswessssweshk',
  'khsiissssiishk',
  'khppssMMsspphk',
  '.khSssssssShk.',
]

// Both eyes at once, each two pixels wide: their rows from y 5.
const eyes = (...rows: string[]): Patch[] => rows.flatMap((r, i) => [[3, 5 + i, r], [9, 5 + i, r]] as Patch[])

const BLINK = eyes('ss', 'ss', 'ee')
const LOOK_LEFT = eyes('ee', 'ew', 'ii')
const LOOK_RIGHT = eyes('ee', 'we', 'ii')
const SLEEPY = eyes('ss', 'ee', 'ss')
// Closed and smiling, ^ ^, each a pixel wider than the eye.
const HAPPY: Patch[] = [...eyes('ss', 'ss', 'ss'), [2, 5, 'ses'], [2, 6, 'ese'], [9, 5, 'ses'], [9, 6, 'ese']]
// A cat-mouth smile: the corners up, the middle kept.
const SMILE: Patch[] = [[5, 8, 'M  M'], [6, 9, 'MM']]
// Eyes gone white with pinpoint pupils, mouth open.
const SHOCK: Patch[] = [...eyes('ww', 'we', 'ww'), [6, 8, 'MM'], [6, 9, 'MM']]
// Gloom lines down the bangs.
const GLOOM: Patch[] = [[4, 2, 'b b b'], [4, 3, 'b b b']]
const WOBBLE: Patch[] = [[5, 8, 'MssM']]
const AHOGE_SWAY: Patch[] = [[7, 0, 'h.']]

// The ponytail, tied low behind the right side lock so the corner above it stays free for emotes.
const TAIL = stamp(12, 3, ['.nn.', 'nkn.', '.khk', '.khk', '..khk', '..khk', '..kHk'])
const TAIL_SWAY = stamp(12, 3, ['.nn.', 'nkn.', '.khk', '..khk', '..khk', '...khk', '...kH'])

const QUESTION = ['yyy', '..y', '.y.', '...', '.y.']
// The anger vein: four corners about a cross.
const VEIN = ['.r.r.', 'rr.rr', '.....', 'rr.rr', '.r.r.']
const SPARKLE = ['.y.', 'yYy', '.y.']
// The big sweat drop, with a glint.
const DROP = ['.b.', 'bbb', 'bwb', '.b.']
// A bubble from the nose, growing, then popped.
const BUBBLES = [['b'], ['bw', 'bb'], ['bw', 'bb'], ['w.', '.w']]

// A one-pixel glow on every see-through pixel touching the mascot: a power-up.
const aura = (px: readonly string[], glow: string) =>
  px.map((row, y) =>
    row
      .split('')
      .map((p, x) => (p === '.' && [row[x - 1], row[x + 1], px[y - 1]?.[x], px[y + 1]?.[x]].some(q => q !== undefined && q !== '.') ? glow : p))
      .join(''),
  )

const face = (...groups: (readonly Patch[])[]) => paint(FACE, ...groups)

const moods: Theme['moods'] = {
  idle: [
    frame(face(TAIL), 2600),
    frame(face(BLINK, TAIL), 130),
    frame(face(TAIL), 1600),
    frame(face(TAIL_SWAY, AHOGE_SWAY), 300),
    frame(face(TAIL), 300),
    frame(face(TAIL_SWAY, AHOGE_SWAY), 300),
    frame(face(TAIL), 2200),
    frame(face(BLINK, TAIL), 110),
    frame(face(TAIL), 110),
    frame(face(BLINK, TAIL), 110),
  ],
  working: [
    frame(face(LOOK_LEFT, TAIL), 520),
    frame(face(LOOK_RIGHT, TAIL_SWAY), 520),
    frame(face(LOOK_LEFT, TAIL), 520),
    frame(face(LOOK_RIGHT, TAIL_SWAY), 520),
    frame(face(BLINK, TAIL), 140),
  ],
  waiting: [frame(face(LOOK_RIGHT, TAIL, stamp(15, 0, QUESTION)), 650), frame(face(LOOK_RIGHT, TAIL), 300)],
  // The vein throbs: whole, then its middle rows alone.
  error: [frame(face(SHOCK, GLOOM, TAIL, stamp(13, 0, VEIN)), 420), frame(face(SHOCK, GLOOM, TAIL, stamp(13, 1, VEIN.slice(1, 4))), 160)],
  done: [frame(face(HAPPY, SMILE, TAIL, stamp(14, 0, SPARKLE)), 500), frame(face(HAPPY, SMILE, TAIL_SWAY, stamp(15, 1, SPARKLE)), 500)],
  // Powering up: a bounce, and a golden aura pulsing about the whole silhouette.
  party: [0, 1, 2, 3].map(t =>
    frame(aura(shift(face(HAPPY, SMILE, t % 2 ? TAIL : TAIL_SWAY, t % 2 ? AHOGE_SWAY : []), 0, t % 2), t % 2 ? 'y' : 'Y'), 140),
  ),
  sweat: [
    frame(face(WOBBLE, TAIL, stamp(10, 0, DROP)), 700),
    frame(face(WOBBLE, TAIL, stamp(10, 1, DROP)), 450),
    frame(face(WOBBLE, TAIL, stamp(10, 1, DROP), BLINK), 350),
  ],
  asleep: BUBBLES.map((bubble, i) => frame(face(SLEEPY, TAIL, stamp(7, 7, bubble), i % 2 ? stamp(15, 0, SMALL_Z) : []), [900, 900, 700, 300][i]!)),
}

export const chibi: Theme = {
  description: 'big eyes, sweat drops, anime feelings',
  sounds: { done: 'sounds/chibi/done.wav', error: 'sounds/chibi/error.wav', waiting: 'sounds/chibi/waiting.wav', party: 'sounds/chibi/party.wav' },
  accent: '#c084fc',
  onAccent: '#1b1030',
  palette: {
    k: 0x3a2366,
    h: 0x7048b8,
    H: 0xa883e8,
    s: 0xffe4cf,
    S: 0xd9987a,
    e: 0x2c1f5c,
    i: 0x8a6cf0,
    w: 0xffffff,
    p: 0xff9fb8,
    M: 0x8a3a4a,
    n: 0xff6b9a,
    b: 0x6ec6ff,
    y: 0xffd84a,
    Y: 0xfff3a0,
    r: 0xe84a4a,
    g: 0xb0b6be,
  },
  moods,
  faces: {
    idle: '(•ᴗ•)',
    working: '(òᴗó)و',
    waiting: '(•ᴗ•)? ',
    error: '(°□°)!',
    done: '(^ᴗ^)',
    party: '(≧▽≦)~',
    sweat: '(ó_ò;)',
    asleep: '(-ᴗ-) z',
  },
  quips: {
    idle: [
      'ready when you are, senpai',
      'doing a little stretch',
      'protagonist energy, pending',
      'listening very hard',
      'idle animation intensifies',
    ],
    working: [
      'power of friendship loading',
      'training arc in progress',
      'concentrating, with sparkles',
      'this is my true form',
      'plot armor engaged',
    ],
    waiting: ['senpai, please notice me', 'needs your approval, senpai', 'staring at you very politely', 'your move, protagonist'],
    error: ['nani?!', 'that was a filler arc', 'it was the villain all along', 'plot twist, and not a good one', 'I will not give up'],
    done: ['it is done, as foretold', 'victory pose!', 'ultimate technique: success', 'episode cleared'],
    party: ['bankai!'],
    sweat: ['context is almost out of episodes', 'sweat drop of doom', 'the final arc is near', 'nervous giggling'],
    asleep: ['zzz... five more minutes', 'dreaming of the next season', 'recharging chakra', 'sleeping through the recap'],
  },
  party: {
    tests: 'tests green! bankai!',
    commit: 'committed! character development',
    push: 'pushed! the saga continues',
    summoned: 'hai? you called?',
  },
  verbs: {
    Read: 'studying {}',
    Edit: 'rewriting the script of {}',
    MultiEdit: 'rewriting the script of {}',
    NotebookEdit: 'rewriting the script of {}',
    Write: 'drawing {}',
    Bash: 'casting {}',
    Grep: 'tracking down {}',
    Glob: 'scouting {}',
    WebFetch: 'summoning {}',
    WebSearch: 'investigating {}',
    Agent: 'sending a sidekick: {}',
    TodoWrite: 'planning the arc',
    Skill: 'learning the technique {}',
    default: 'channeling {}',
  },
  spinner: {
    thinking: ['Powering up', 'Charging the attack', 'Having a flashback', 'Concentrating'],
    requesting: ['Calling for backup', 'Sending a signal'],
    responding: ['Narrating', 'Monologuing'],
    'tool-input': ['Striking a pose', 'Gathering energy'],
    'tool-use': ['Using the technique', 'Attacking', 'Training'],
  },
  turn: {
    plain: ['Powered up', 'Trained', 'Monologued', 'Leveled up', 'Fought', 'Rested'],
    errors: n => `Survived ${n} plot twist${n === 1 ? '' : 's'}, then rested`,
    party: 'Struck a victory pose',
  },
  compactNudge: 'context almost full: /compact before the final arc',
}
