import type { Theme } from '../theme'
import { axolotl } from './axolotl'
import { bunny } from './bunny'
import { cat } from './cat'
import { chibi } from './chibi'
import { creeper } from './creeper'
import { duck } from './duck'
import { hamster } from './hamster'

export const THEMES: Record<string, Theme> = { cat, chibi, creeper, hamster, duck, axolotl, bunny }
export const DEFAULT_THEME = 'cat'
