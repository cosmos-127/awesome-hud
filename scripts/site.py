#!/usr/bin/env python3
"""Writes the themes' sprites, palettes and words into index.html, from the themes' own
frames, so the website cannot fall behind them. Needs bun.

    python3 scripts/site.py
"""
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PAGE = ROOT / 'index.html'
WIDTH, HEIGHT = 18, 10

DUMP = """
import { THEMES } from './hooks/themes'

const snap = n => [16, 8, 0].map(s => Math.round(((n >> s) & 255) / 17) * 17)
const hex = n => '#' + snap(n).map(v => v.toString(16).padStart(2, '0')).join('')

// Each distinct frame once, as one string; a mood is a list of [frame, ms].
console.log(JSON.stringify(Object.fromEntries(Object.entries(THEMES).map(([name, t]) => {
  const px = [], index = new Map()
  const moods = Object.fromEntries(Object.entries(t.moods).map(([mood, frames]) => [mood, frames.map(f => {
    const key = f.px.join('')
    if (!index.has(key)) index.set(key, px.push(key) - 1)
    return [index.get(key), f.ms]
  })]))
  return [name, {
    accent: t.accent,
    onAccent: t.onAccent,
    palette: Object.fromEntries(Object.entries(t.palette).map(([k, v]) => [k, hex(v)])),
    px,
    moods,
    quips: Object.fromEntries(Object.entries(t.quips).map(([k, v]) => [k, v[0]])),
    faces: t.faces,
  }]
}))))
"""


def load():
    out = subprocess.run(['bun', '-e', DUMP], cwd=ROOT, capture_output=True, text=True, check=True).stdout
    return json.loads(out)


def main():
    themes = load()
    for name, theme in themes.items():
        for frame in theme['px']:
            assert len(frame) == WIDTH * HEIGHT, f'{name}: a frame is not {WIDTH} x {HEIGHT}'
    # One theme to a line, so a change to one shows as a change to one.
    body = '{\n' + ',\n'.join(f'{json.dumps(name)}:{json.dumps(t, ensure_ascii=False, separators=(",", ":"))}' for name, t in themes.items()) + '\n}'
    page = PAGE.read_text()
    page, n = re.subn(r'(/\* theme-data:start \*/).*?(/\* theme-data:end \*/)', lambda m: m[1] + body + m[2], page, flags=re.S)
    assert n == 1, 'index.html has no theme-data markers'
    PAGE.write_text(page)
    print(f'{PAGE}: {len(themes)} themes, {len(body) // 1024} KiB of data')


if __name__ == '__main__':
    main()
