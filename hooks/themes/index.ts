import type { Theme } from '../theme'
import { cat } from './cat'
import { chibi } from './chibi'
import { got } from './got'

export const THEMES: Record<string, Theme> = { cat, chibi, got }
export const DEFAULT_THEME = 'cat'
