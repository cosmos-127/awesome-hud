import type { Theme } from '../theme'
import { axolotl } from './axolotl'
import { bunny } from './bunny'
import { cat } from './cat'
import { chibi } from './chibi'
import { duck } from './duck'
import { got } from './got'
import { hamster } from './hamster'

export const THEMES: Record<string, Theme> = { cat, chibi, got, hamster, duck, axolotl, bunny }
export const DEFAULT_THEME = 'cat'
