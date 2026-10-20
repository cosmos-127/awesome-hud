#!/usr/bin/env python3
"""Draws preview.gif (the band, mascots acting out moods) and moods.gif (every theme's
every mood) from the themes' own frames. Needs bun and Pillow.

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
SYMBOLS = FONT.replace('Mono.ttf', '.ttf')  # the mono face lacks the branch glyph
BG, FG, DIM, RULE = (22, 22, 22), (235, 235, 235), (128, 128, 128), (64, 64, 64)
MOODS = ['idle', 'working', 'waiting', 'error', 'done', 'party', 'sweat', 'asleep']
STORY = ['idle', 'working', 'waiting', 'error', 'done', 'party']  # the band's moods, in order
CELL_W, CELL_H = 20, 40

DUMP = """
import { THEMES } from './hooks/themes'
const pick = ({ palette, accent, onAccent, quips, moods }) => ({ palette, accent, onAccent, quips, moods })
console.log(JSON.stringify(Object.fromEntries(Object.entries(THEMES).map(([k, t]) => [k, pick(t)]))))
"""


def load():
    out = subprocess.run(['bun', '-e', DUMP], cwd=ROOT, capture_output=True, text=True, check=True).stdout
    return json.loads(out)


def rgb(n):
    return (n >> 16 & 255, n >> 8 & 255, n & 255)


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
    font, italic = ImageFont.truetype(FONT, 33), ImageFont.truetype(ITALIC, 33)
    w, h = 94 * CELL_W, 11 * CELL_H

    def text(d, col, row, s, fill=FG, f=font):
        d.text((col * CELL_W, row * CELL_H + 2), s, fill=fill, font=f)

    def bar(d, col, row, pct, accent):
        x, y = col * CELL_W, row * CELL_H + 19
        d.line([x, y, x + 12 * CELL_W - 1, y], fill=DIM, width=3)
        d.line([x, y, x + 12 * CELL_W * pct // 100, y], fill=accent, width=3)

    def band(name, mood, px):
        t = themes[name]
        accent = hexrgb(t['accent'])
        im = Image.new('RGB', (w, h), BG)
        d = ImageDraw.Draw(im)
        d.line([20, 60, w - 20, 60], fill=RULE, width=2)
        d.line([20, 140, w - 20, 140], fill=RULE, width=2)
        text(d, 1, 2, '❯')
        d.rectangle([60, 80, 79, 119], fill=FG)
        text(d, 3, 4, '▸▸ auto mode on (shift+tab to cycle)', DIM)
        sprite(d, t, px, 60, 200, 20)
        d.rectangle([22 * CELL_W, 200, 39 * CELL_W - 1, 239], fill=accent)
        text(d, 23, 5, 'Opus 5.5 ◑ high', hexrgb(t['onAccent']))
        text(d, 40, 5, 'my-app · 12m')
        text(d, 22, 6, 'ctx', DIM); bar(d, 26, 6, 42, accent); text(d, 40, 6, '42%  ~6 turns left')
        text(d, 23, 7, '5h', DIM); bar(d, 26, 7, 31, accent); text(d, 40, 7, '31%  ↻ in 58m · 3:20am · 7d 12%')
        text(d, 22, 8, '⎇', (170, 170, 255), ImageFont.truetype(SYMBOLS, 33)); text(d, 24, 8, 'main ↑2 ↓1', (170, 170, 255)); text(d, 36, 8, '│ ● 3  ✚ 5 │ ✎ 4 files +120 −34')
        text(d, 22, 9, '»', accent); text(d, 24, 9, t['quips'][mood][0], FG, italic)
        return im

    frames, durations = [], []
    for name in themes:
        for mood in STORY:
            for fr in themes[name]['moods'][mood]:
                frames.append(band(name, mood, fr['px']))
                durations.append(min(fr['ms'], 1400))
    save('preview.gif', frames, durations)


def moods(themes):
    scale, pad, label_w, head_h, tick, total = 5, 12, 60, 34, 70, 8000
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
