"""Synthesizes every theme's sounds into sounds/<theme>/<event>.wav, from nothing but math.

Run from anywhere: python3 scripts/sounds.py. Standard library only. Each sound is short
(well under a second or two) and peaks at about -7 dBFS.
"""
import math
import os
import random
import struct
import wave

RATE = 22050
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def osc(shape, phase):
    if shape == 'sine':
        return math.sin(phase)
    if shape == 'soft':  # a few harmonics: warmer than a sine, rounder than a square
        return math.sin(phase) + 0.5 * math.sin(2 * phase) + 0.25 * math.sin(3 * phase)
    if shape == 'square':
        return sum(math.sin(k * phase) / k for k in (1, 3, 5, 7)) * 4 / math.pi
    if shape == 'brass':
        return sum(math.sin(k * phase) / k ** 1.3 for k in range(1, 12))
    raise ValueError(shape)


def voice(dur, freq, shape='sine', attack=0.005, release=0.04, decay=None, vibrato=(0, 0), tremolo=None, gain=1.0):
    """One oscillator; `freq` is Hz or a function of the time in seconds."""
    out, phase = [], 0.0
    for i in range(int(dur * RATE)):
        t = i / RATE
        f = freq(t) if callable(freq) else freq
        if vibrato[0]:
            f *= 1 + vibrato[1] * math.sin(2 * math.pi * vibrato[0] * t)
        phase += 2 * math.pi * f / RATE
        env = min(1.0, t / attack) if attack else 1.0
        env *= min(1.0, (dur - t) / release) if release else 1.0
        if decay:
            env *= math.exp(-t / decay)
        if tremolo and tremolo(t) is not None:
            env *= tremolo(t)
        out.append(osc(shape, phase) * env * gain)
    return out


def bell(dur, freq, decay=0.35, gain=1.0):
    """Inharmonic partials, the way a struck bar or glass rings."""
    parts = ((1, 1.0, 1.0), (2.76, 0.45, 0.6), (5.4, 0.25, 0.35), (8.93, 0.12, 0.2))
    return mix(*[(0, voice(dur, freq * r, decay=decay * d, gain=gain * a)) for r, a, d in parts])


def noise(dur, attack=0.002, release=0.05, decay=None, smooth=0.0, bright=False, gain=1.0, seed=1):
    """White noise; `smooth` (0..1) low-passes it, `bright` keeps only what the low-pass removes."""
    rng, low, out = random.Random(seed), 0.0, []
    for i in range(int(dur * RATE)):
        t = i / RATE
        x = rng.uniform(-1, 1)
        low += (1 - smooth) * (x - low)
        s = x - low if bright else low
        env = min(1.0, t / attack) * min(1.0, (dur - t) / release)
        if decay:
            env *= math.exp(-t / decay)
        out.append(s * env * gain)
    return out


def mix(*tracks):
    """`(start in seconds, samples)` pairs laid over one another."""
    out = []
    for start, samples in tracks:
        at = int(start * RATE)
        out.extend([0.0] * max(0, at + len(samples) - len(out)))
        for i, s in enumerate(samples):
            out[at + i] += s
    return out


def lowpass(samples, smooth):
    low, out = 0.0, []
    for s in samples:
        low += (1 - smooth) * (s - low)
        out.append(low)
    return out


def glide(*points):
    """Frequency through (time, Hz) points, straight between them."""
    def f(t):
        for (t0, f0), (t1, f1) in zip(points, points[1:]):
            if t <= t1:
                return f0 + (f1 - f0) * (t - t0) / (t1 - t0)
        return points[-1][1]
    return f


def notes(freqs, step, make):
    return mix(*[(i * step, make(f, i == len(freqs) - 1)) for i, f in enumerate(freqs)])


SOUNDS = {
    'cat': {
        # mrrp: a rolled "mrr" rising into a chirp
        'done': lambda: voice(0.34, glide((0, 420), (0.13, 430), (0.3, 700)), 'soft', attack=0.02, release=0.08,
                              vibrato=(7, 0.02), tremolo=lambda t: 0.65 + 0.35 * math.sin(2 * math.pi * 28 * t) if t < 0.13 else None),
        # a hiss
        'error': lambda: noise(0.45, attack=0.03, release=0.18, smooth=0.6, bright=True, gain=0.9),
        # meow? rising at the end like a question
        'waiting': lambda: voice(0.5, glide((0, 520), (0.12, 480), (0.32, 640), (0.5, 900)), 'soft', attack=0.04, release=0.1,
                                 vibrato=(6, 0.025)),
        # an 8-bit arpeggio and a sparkle on top
        'party': lambda: mix(
            (0, notes([1047, 1319, 1568, 2093], 0.07, lambda f, last: voice(0.2 if last else 0.07, f, 'square', release=0.02,
                                                                          decay=0.12 if last else None, gain=0.35))),
            (0.3, voice(0.15, 4186, decay=0.05, gain=0.3)),
        ),
    },
    'chibi': {
        # kira: a quick bell arpeggio
        'done': lambda: notes([1319, 1661, 1976, 2637], 0.05, lambda f, last: bell(0.45, f, decay=0.3, gain=0.5)),
        # boing: a falling spring
        'error': lambda: voice(0.42, glide((0, 760), (0.42, 170)), 'sine', attack=0.005, release=0.06, decay=0.25,
                               vibrato=(16, 0.08)),
        # ding-dong
        'waiting': lambda: mix((0, bell(0.4, 1760, decay=0.3)), (0.22, bell(0.5, 1480, decay=0.35))),
        # a magical run up into a sparkling chord
        'party': lambda: mix(
            (0, notes([1047, 1175, 1319, 1568], 0.05, lambda f, last: voice(0.06, f, 'soft', release=0.02, gain=0.3))),
            (0.22, bell(0.6, 2093, decay=0.4, gain=0.4)),
            (0.22, bell(0.6, 2637, decay=0.4, gain=0.3)),
            (0.22, bell(0.6, 3136, decay=0.4, gain=0.25)),
        ),
    },
    'got': {
        # a war horn: a low brass note with its fifth, bending up as it sounds
        'done': lambda: lowpass(mix(
            (0, voice(1.1, glide((0, 140), (0.18, 147)), 'brass', attack=0.14, release=0.35, vibrato=(5, 0.006))),
            (0.05, voice(1.05, glide((0, 210), (0.18, 220)), 'brass', attack=0.16, release=0.35, gain=0.45)),
        ), 0.82),
        # a sword clang: bright inharmonic ring after a hard hit
        'error': lambda: mix(
            (0, noise(0.04, release=0.03, smooth=0.2, bright=True, gain=0.8)),
            (0, voice(0.7, 1180, decay=0.3)), (0, voice(0.7, 2470, decay=0.2, gain=0.6)),
            (0, voice(0.7, 3720, decay=0.13, gain=0.4)), (0, voice(0.7, 5260, decay=0.08, gain=0.25)),
        ),
        # a raven: two rough caws
        'waiting': lambda: mix(*[(start, mix(
            (0, voice(0.2, glide((0, 640), (0.2, 470)), 'square', attack=0.01, release=0.05, gain=0.35,
                      tremolo=lambda t: 0.6 + 0.4 * math.sin(2 * math.pi * 45 * t))),
            (0, noise(0.2, attack=0.01, release=0.06, smooth=0.75, gain=0.5, seed=seed)),
        )) for start, seed in ((0, 1), (0.3, 2))]),
        # a fanfare of horns over a drum
        'party': lambda: lowpass(mix(
            (0, voice(0.15, 294, 'brass', attack=0.02, release=0.04, gain=0.8)),
            (0.16, voice(0.15, 440, 'brass', attack=0.02, release=0.04, gain=0.8)),
            (0.32, voice(0.5, 587, 'brass', attack=0.02, release=0.2, vibrato=(6, 0.01), gain=0.8)),
            (0.32, voice(0.3, glide((0, 90), (0.3, 50)), decay=0.12, gain=1.2)),
            (0.32, noise(0.12, release=0.1, smooth=0.9, gain=1.5, seed=3)),
        ), 0.7),
    },
}


def write(path, samples):
    peak = max(abs(s) for s in samples) or 1.0
    frames = b''.join(struct.pack('<h', int(s / peak * 0.45 * 32767)) for s in samples)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with wave.open(path, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(frames)


if __name__ == '__main__':
    for theme, sounds in SOUNDS.items():
        for event, make in sounds.items():
            samples = make()
            path = os.path.join(ROOT, 'sounds', theme, f'{event}.wav')
            write(path, samples)
            print(f'{os.path.relpath(path, ROOT)}  {len(samples) / RATE:.2f}s')
