#!/usr/bin/env python3
"""Draws preview.gif (the band, mascots acting out moods) and moods.gif (every theme's
every mood) from the themes' own frames, and the band's rows from the plugin's own
formatting, so neither can fall behind it. Needs bun and Pillow.

    python3 scripts/preview.py [outdir]    # outdir defaults to assets/
"""
import json
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'assets'
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf'
ITALIC = FONT.replace('Mono.ttf', 'Mono-Oblique.ttf')
BOLD = FONT.replace('Mono.ttf', 'Mono-Bold.ttf')
SYMBOLS = FONT.replace('Mono.ttf', '.ttf')  # the mono face lacks the branch glyph
NOT_IN_MONO = '⎇'
# What the band's color names look like: Claude Code's dark theme, near enough.
TOKENS = {'success': (78, 186, 101), 'error': (255, 107, 128), 'warning': (255, 193, 7), 'suggestion': (177, 185, 249), 'merged': (175, 135, 255)}
BG, FG, DIM, RULE = (22, 22, 22), (235, 235, 235), (128, 128, 128), (64, 64, 64)
MOODS = ['idle', 'working', 'waiting', 'error', 'done', 'party', 'sweat', 'asleep']
STORY = ['idle', 'working', 'waiting', 'error', 'done', 'party']  # the band's moods, in order
CELL_W, CELL_H = 20, 40

DUMP = """
import { THEMES } from './hooks/themes'
import { branchSegments, duration, effortMark, fileSegments, fit, gaugeRuns, planSegments, prSegment, prettyModel, testSegment, treeSegments } from './hooks/format'
import { sym } from './hooks/symbols'

// The band's rows as its own functions make them, for a session with something to show.
const now = Date.parse('2026-10-21T02:22:00Z')
const git = { branch: 'main', oid: 'a'.repeat(40), op: null, upstream: 'tracking', ahead: 2, behind: 1, isFetchStale: false, staged: 3, unstaged: 5, untracked: 1, conflicts: 0, stashes: 1, worktree: null, isStale: false }
const files = [
  { path: '/p/a.ts', edits: 3, added: 70, removed: 20, at: now, isInProject: true },
  { path: '/p/b.ts', edits: 2, added: 50, removed: 14, at: now, isInProject: true },
  { path: '/p/c.ts', edits: 1, added: 0, removed: 0, at: now, isInProject: true },
  { path: '/p/d.ts', edits: 1, added: 0, removed: 0, at: now, isInProject: true },
]
const run = { passed: 24, failed: 0, at: now - 3 * 60_000, command: 'npm test' }
const pr = { number: 42, state: 'open', branch: 'main', checks: { failed: 0, pending: 0, passed: 3 } }
const rowsOf = ({ accent, onAccent }) => {
  // As the band joins a row: each part after the first behind its separator, a bar's in the accent.
  const row = list => fit(list, 72).flatMap((s, i) => [...(i > 0 && s.sep ? [{ text: s.sep, ...(s.sep.includes(sym.bar) ? { color: accent } : { dim: true }) }] : []), ...s.runs])
  const chip = { key: 'chip', keep: Infinity, runs: [{ text: ` ${prettyModel('claude-opus-5-5')} | ${effortMark('high')} high `, bg: accent, color: onAccent, bold: true }] }
  return {
    top: row([chip, { key: 'folder', sep: ' ', keep: 80, runs: [{ text: 'my-app' }] }, { key: 'time', sep: ` ${sym.dot} `, keep: 45, runs: [{ text: duration(12 * 60_000), dim: true }] }]),
    ctx: [...gaugeRuns('ctx', 42, undefined, accent, 92)],
    plan: row(planSegments([{ kind: 'five_hour', percentUsed: 31, resetsAt: new Date(now + 58 * 60_000).toISOString() }, { kind: 'seven_day', percentUsed: 12 }], now, accent, 'UTC')),
    repo: row([...branchSegments(git, 20), ...treeSegments(git)]),
    work: row([...fileSegments(files), testSegment(run, 0, now), prSegment(pr)]),
  }
}
const pick = ({ palette, accent, onAccent, quips, moods }) => ({ palette, accent, onAccent, quips, moods, rows: rowsOf({ accent, onAccent }) })
console.log(JSON.stringify(Object.fromEntries(Object.entries(THEMES).map(([k, t]) => [k, pick(t)]))))
"""


def load():
    out = subprocess.run(['bun', '-e', DUMP], cwd=ROOT, capture_output=True, text=True, check=True).stdout
    return json.loads(out)


def rgb(n):
    """A sprite color as Claude Code paints it: each channel snapped to a multiple of 17, then drawn as 24-bit."""
    return tuple(round((n >> s & 255) / 17) * 17 for s in (16, 8, 0))


def hexrgb(s):
    return tuple(int(s[i:i + 2], 16) for i in (1, 3, 5))


def sprite(draw, theme, px, x0, y0, scale):
    for y, row in enumerate(px):
        for x, p in enumerate(row):
            if p != '.':
                draw.rectangle([x0 + x * scale, y0 + y * scale, x0 + (x + 1) * scale - 1, y0 + (y + 1) * scale - 1], fill=rgb(theme['palette'][p]))


def save(name, frames, durations):
    path = OUT / name
    frames[0].save(path, save_all=True, append_images=frames[1:], duration=durations, loop=0, optimize=True, disposal=1)
    print(f'{path}: {len(frames)} frames, {path.stat().st_size // 1024} KiB')


def preview(themes):
    font, bold, italic = (ImageFont.truetype(f, 33) for f in (FONT, BOLD, ITALIC))
    symbols = ImageFont.truetype(SYMBOLS, 25)  # from a wider face: smaller, to stay in its cell
    w, h = 94 * CELL_W, 12 * CELL_H

    def text(d, col, row, s, fill=FG, f=font):
        d.text((col * CELL_W, row * CELL_H + 2), s, fill=fill, font=f)

    def line(d, ch, x, y, fill):
        """The gauge's marks drawn to fill their cell, as a terminal draws them: a font's would leave seams."""
        mid = y + 19
        if ch == '━':
            d.rectangle([x, mid - 2, x + CELL_W - 1, mid + 2], fill=fill)
        elif ch == '─':
            d.rectangle([x, mid, x + CELL_W - 1, mid + 1], fill=fill)
        elif ch == '╸':
            d.rectangle([x, mid - 2, x + CELL_W // 2 - 1, mid + 2], fill=fill)
        elif ch == '┊':
            for k in range(4):
                d.rectangle([x + 9, y + 3 + k * 9, x + 10, y + 7 + k * 9], fill=fill)
        else:
            return False
        return True

    def runs(d, col, row, rs):
        """The runs of one of the band's rows, a character to a cell."""
        for r in rs:
            name = r.get('color')
            color = hexrgb(name) if name and name.startswith('#') else TOKENS.get(name)
            if r.get('bg'):
                d.rectangle([col * CELL_W, row * CELL_H, (col + len(r['text'])) * CELL_W - 1, (row + 1) * CELL_H - 1], fill=hexrgb(r['bg']))
            fill = color or FG
            if r.get('dim'):
                fill = DIM if color is None else tuple(round(a * .5 + b * .5) for a, b in zip(color, BG))
            for ch in r['text']:
                x, y = col * CELL_W, row * CELL_H
                if ch != ' ' and not line(d, ch, x, y, fill):
                    if ch in NOT_IN_MONO:
                        d.text((x, y + 7), ch, fill=fill, font=symbols)
                    else:
                        d.text((x, y + 2), ch, fill=fill, font=bold if r.get('bold') else font)
                col += 1
        return col

    def band(name, mood, px):
        t = themes[name]
        accent = hexrgb(t['accent'])
        rows = t['rows']
        im = Image.new('RGB', (w, h), BG)
        d = ImageDraw.Draw(im)
        d.line([20, 60, w - 20, 60], fill=RULE, width=2)
        d.line([20, 140, w - 20, 140], fill=RULE, width=2)
        text(d, 1, 2, '❯')
        d.rectangle([60, 80, 79, 119], fill=FG)
        text(d, 3, 4, '▸▸ auto mode on (shift+tab to cycle)', DIM)
        sprite(d, t, px, 60, 200, 20)
        # Beside the sprite's five rows, one more for what Claude did and ran, and the quip last.
        for row, key in enumerate(('top', 'ctx', 'plan', 'repo', 'work'), 5):
            runs(d, 22, row, rows[key])
        text(d, 22, 10, '»', accent)
        text(d, 24, 10, t['quips'][mood][0], DIM, italic)
        return im

    frames, durations = [], []
    for name in themes:
        for mood in STORY:
            for fr in themes[name]['moods'][mood]:
                frames.append(band(name, mood, fr['px']))
                durations.append(min(fr['ms'], 1400))
    save('preview.gif', frames, durations)


def moods(themes):
    scale, pad, label_w, head_h, tick, total = 5, 12, 72, 34, 70, 8000
    cell_w, cell_h = 18 * scale + pad, 10 * scale + pad
    w, h = label_w + cell_w * len(MOODS), head_h + cell_h * len(themes)
    font = ImageFont.truetype(FONT, 14)

    def at(frames, t):
        t %= sum(f['ms'] for f in frames)
        for f in frames:
            if t < f['ms']:
                return f['px']
            t -= f['ms']

    frames = []
    for t in range(0, total, tick):
        im = Image.new('RGB', (w, h), BG)
        d = ImageDraw.Draw(im)
        for i, mood in enumerate(MOODS):
            d.text((label_w + i * cell_w + 6, 10), mood, fill=DIM, font=font)
        for r, (name, theme) in enumerate(themes.items()):
            d.text((8, head_h + r * cell_h + 22), name, fill=DIM, font=font)
            for i, mood in enumerate(MOODS):
                sprite(d, theme, at(theme['moods'][mood], t), label_w + i * cell_w + 6, head_h + r * cell_h + 6, scale)
        frames.append(im)
    save('moods.gif', frames, [tick] * len(frames))


if __name__ == '__main__':
    data = load()
    OUT.mkdir(parents=True, exist_ok=True)
    preview(data)
    moods(data)
