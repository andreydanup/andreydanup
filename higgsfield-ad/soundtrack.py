"""Synthesises the 15 s soundtrack for the Higgsfield ad (120 BPM, E minor -> E major lift).

Every hit is placed on the same timeline as motion.js, so cuts, explosions and the logo lock land on sound.
Usage: python3 soundtrack.py [out.wav]
"""
import sys
import wave

import numpy as np
from scipy.signal import butter, istft, sosfilt, stft

SR = 48000
DUR = 15.0
N = int(SR * DUR)
rng = np.random.default_rng(7)

dry = np.zeros((2, N))
send = np.zeros((2, N))       # reverb bus
music = np.zeros((2, N))      # side-chained by the kick
delay_bus = np.zeros((2, N))  # ping-pong delay (arp)


# ------------------------------------------------------------------ helpers
def ts(dur):
    return np.arange(int(dur * SR)) / SR


def noise(dur):
    return rng.standard_normal(int(dur * SR))


def filt(x, kind, f, order=2):
    return sosfilt(butter(order, f, btype=kind, fs=SR, output='sos'), x)


def place(bus, sig, t0, gain=1.0, pan=0.0):
    """Mix a mono signal into a stereo bus at time t0 with constant-power panning."""
    i0 = int(round(t0 * SR))
    if i0 >= N or len(sig) == 0:
        return
    if i0 < 0:
        sig, i0 = sig[-i0:], 0
    sig = sig[: N - i0]
    th = (pan + 1) * np.pi / 4
    bus[0, i0:i0 + len(sig)] += sig * gain * np.cos(th) * np.sqrt(2)
    bus[1, i0:i0 + len(sig)] += sig * gain * np.sin(th) * np.sqrt(2)


def add(sig, t0, gain=1.0, pan=0.0, rev=0.0, bus=None):
    place(dry if bus is None else bus, sig, t0, gain, pan)
    if rev:
        place(send, sig, t0, gain * rev, pan)


def sweep_noise(dur, f0, f1, width=0.6):
    """Noise through a band that glides from f0 to f1 (log-frequency Gaussian mask in the STFT domain)."""
    n = noise(dur + 0.1)
    f, tt, Z = stft(n, fs=SR, nperseg=1024, noverlap=768)
    k = np.clip(tt / dur, 0, 1)
    fc = f0 * (f1 / f0) ** k
    M = np.exp(-0.5 * ((np.log2(np.maximum(f, 20))[:, None] - np.log2(fc)[None, :]) / width) ** 2)
    _, y = istft(Z * M, fs=SR, nperseg=1024, noverlap=768)
    y = y[: int(dur * SR)]
    return y / (np.max(np.abs(y)) + 1e-9)


def saw(freq, t, phase=0.0):
    ph = phase + np.cumsum(np.broadcast_to(freq, t.shape)) / SR
    return 2 * (ph % 1) - 1


def sine_glide(f, t):
    return np.sin(2 * np.pi * np.cumsum(np.broadcast_to(f, t.shape)) / SR)


def note(name):
    names = {'C': -9, 'C#': -8, 'D': -7, 'D#': -6, 'E': -5, 'F': -4, 'F#': -3, 'G': -2, 'G#': -1, 'A': 0, 'A#': 1, 'B': 2}
    return 440.0 * 2 ** ((names[name[:-1]] + 12 * (int(name[-1]) - 4)) / 12)


# ------------------------------------------------------------------ instruments
def kick():
    t = ts(0.45)
    body = sine_glide(45 + 115 * np.exp(-t * 28), t) * np.exp(-t * 7.5)
    click = noise(0.45) * np.exp(-t * 900) * 0.4
    return np.tanh((body + click) * 1.5)


def clap():
    t = ts(0.4)
    e = sum((t >= d) * np.exp(-np.clip(t - d, 0, None) * 70) for d in (0, 0.011, 0.022))
    e = e + (t >= 0.03) * np.exp(-np.clip(t - 0.03, 0, None) * 13) * 0.7
    return filt(noise(0.4), 'band', [900, 5000]) * e


def hat(open_=False):
    t = ts(0.3 if open_ else 0.06)
    return filt(rng.standard_normal(len(t)), 'high', 7000) * np.exp(-t * (14 if open_ else 70))


def snare(pitch=1.0):
    t = ts(0.25)
    tone = np.sin(2 * np.pi * 185 * pitch * t) * np.exp(-t * 30)
    return filt(noise(0.25), 'band', [300, 9000]) * np.exp(-t * 18) * 0.8 + tone * 0.5


def impact(size=1.0):
    t = ts(2.2)
    sub = sine_glide(30 + 55 * np.exp(-t * 6), t) * np.exp(-t * 2.2 / size)
    body = filt(noise(2.2), 'low', 700) * np.exp(-t * 9)
    crash = filt(noise(2.2), 'high', 3500) * np.exp(-t * 2.4 / size) * 0.35
    click = noise(2.2) * np.exp(-t * 300) * 0.5
    return np.tanh((sub * 1.2 + body * 0.6 + crash + click) * 1.2)


def whoosh(dur, f0=500, f1=6000, shape=0.65):
    k = ts(dur) / dur
    return sweep_noise(dur, f0, f1, 0.5) * np.sin(np.pi * k ** shape) ** 2


def riser(dur, f0=300, f1=9000, tone=(110, 880)):
    t = ts(dur)
    k = t / dur
    nz = sweep_noise(dur, f0, f1, 0.55) * k ** 2
    tn = filt(saw(tone[0] * (tone[1] / tone[0]) ** k, t), 'low', 3000) * k ** 2.5 * (0.6 + 0.4 * np.sin(2 * np.pi * (6 + 18 * k) * t))
    return nz * 0.8 + tn * 0.35


def reverse_cymbal(dur):
    t = ts(dur)
    return filt(noise(dur), 'high', 2500) * np.exp((t - dur) / (dur * 0.28))


def click(freq):
    t = ts(0.04)
    return filt(noise(0.04), 'high', 2000) * np.exp(-t * 420) + np.sin(2 * np.pi * freq * t) * np.exp(-t * 260) * 0.3


def blip(f0, f1, dur=0.09):
    t = ts(dur)
    return sine_glide(f0 * (f1 / f0) ** (t / dur), t) * np.exp(-t * 28)


def pings(dur, count, fmin, fmax, spread, decay=(0.02, 0.12)):
    t = ts(dur)
    out = np.zeros(len(t))
    for _ in range(count):
        on = spread * rng.random() ** 2.2
        f = fmin + (fmax - fmin) * rng.random()
        d = decay[0] + (decay[1] - decay[0]) * rng.random()
        m = t >= on
        out[m] += np.sin(2 * np.pi * f * (t[m] - on)) * np.exp(-(t[m] - on) / d) * (0.3 + 0.7 * rng.random()) * np.exp(-on * 3)
    return out / (np.max(np.abs(out)) + 1e-9)


def supersaw(freqs, dur, cutoff=3200, detune=(-0.12, 0, 0.12)):
    t = ts(dur)
    out = np.zeros(len(t))
    for f in freqs:
        for d in detune:
            out += saw(f * 2 ** (d / 12), t, rng.random())
    return filt(out / (len(freqs) * len(detune)), 'low', cutoff)


def stab(freqs):
    t = ts(0.45)
    return supersaw(freqs, 0.45) * np.minimum(1, t / 0.003) * np.exp(-t * 7)


def bass_note(f, dur=0.25):
    t = ts(dur)
    s = filt(saw(f, t), 'low', 900) * 0.7 + np.sin(2 * np.pi * f / 2 * t) * 0.6
    return s * np.minimum(1, t / 0.004) * np.clip(1 - t / dur, 0, 1) ** 0.5


def pluck(f, dur=0.14):
    t = ts(dur)
    sq = np.sign(np.sin(2 * np.pi * f * t)) * 0.5 + np.sin(2 * np.pi * f * 2 * t) * 0.3
    return filt(sq, 'low', 4200) * np.exp(-t * 16)


def bell(f, dur=2.5):
    t = ts(dur)
    parts = [(1, 1, 1.6), (2.76, 0.5, 0.8), (5.4, 0.25, 0.4), (8.93, 0.12, 0.2)]
    return sum(a * np.sin(2 * np.pi * f * r * t) * np.exp(-t / d) for r, a, d in parts) * np.minimum(1, t / 0.002)


# ------------------------------------------------------------------ arrangement
BEAT = 0.5
CHORDS = [  # one per 2 s bar from 4 s: Em - C - G - D
    (4.0, 'E2', ['E4', 'G4', 'B4']), (6.0, 'C2', ['C4', 'E4', 'G4']),
    (8.0, 'G2', ['G4', 'B4', 'D5']), (10.0, 'D2', ['D4', 'F#4', 'A4']),
]


def chord_at(t):
    cur = CHORDS[0]
    for c in CHORDS:
        if t >= c[0]:
            cur = c
    return cur


# --- 0-2 s SPARK: ignition zap, crackle, drone and riser into the cut
add(blip(4200, 300, 0.16), 0.04, 0.35, rev=0.3)
add(noise(0.01) * 0.6, 0.04, 0.4)
t = ts(2.0)
drone = (np.sin(2 * np.pi * note('E2') * t) * 0.7 + np.sin(2 * np.pi * note('B2') * t) * 0.3) * np.minimum(1, t / 1.2)
add(drone, 0.0, 0.22)
add(sweep_noise(2.0, 2000, 7000, 0.4) * np.minimum(1, t / 0.4) * 0.5, 0.0, 0.12)
for i in range(110):
    tc = 0.22 + 1.55 * rng.random()
    add(click(3000 + 3000 * rng.random()) * (0.3 + 0.7 * rng.random()), tc, 0.07, pan=rng.uniform(-0.6, 0.6))
add(riser(1.75, 300, 8000, (110, 660)), 0.22, 0.32)
add(reverse_cymbal(0.5), 1.5, 0.3)

# --- 2-4 s PROMPT: impact, UI pops, typing, button, slice, explosion
add(impact(1.0), 2.0, 0.85, rev=0.35)
add(blip(700, 1400), 2.05, 0.18, rev=0.3)
add(blip(1400, 2100, 0.07), 2.22, 0.12, rev=0.3)
for n in range(1, 33):
    add(click(1800 + 600 * rng.random()), 2.3 + n / 32 * 0.8, 0.24 * (0.7 + 0.3 * rng.random()), pan=rng.uniform(-0.25, 0.25))
thock = np.sin(2 * np.pi * 220 * ts(0.08)) * np.exp(-ts(0.08) * 35)
thock[: len(ts(0.04))] += click(2500) * 0.6
add(thock, 3.2, 0.35)
add(whoosh(0.16, 1200, 11000, 0.4), 3.42, 0.45, pan=0.2)
add(impact(0.8), 3.5, 0.8, rev=0.4)
add(pings(0.6, 70, 4000, 10000, 0.45, (0.01, 0.06)), 3.5, 0.18, rev=0.5)
for i, tt in enumerate(np.arange(3.75, 4.0, 0.0625)):
    add(snare(1 + i * 0.06), tt, 0.18 + 0.06 * i, rev=0.2)
add(riser(0.5, 800, 9000, (220, 880)), 3.5, 0.3)
add(whoosh(0.2, 600, 8000, 0.9), 3.82, 0.5)

# --- 4-11.5 s: the beat
for k in range(16):
    tk = 4.0 + k * BEAT
    if tk > 11.5:
        break
    add(kick(), tk, 0.95)
for tk in np.arange(4.5, 11.51, 1.0):
    add(clap(), tk, 0.42, rev=0.35)
for i, tk in enumerate(np.arange(4.0, 11.75, 0.125)):
    off = abs((tk - 4.0) / BEAT % 1 - 0.5) < 1e-6
    if off:
        add(hat(True), tk, 0.11, pan=0.3)
    else:
        add(hat(), tk, 0.1 if i % 2 else 0.06, pan=-0.25)
for tk in np.arange(4.0, 11.5, 0.25):
    add(bass_note(note(chord_at(tk)[1])), tk, 0.4, bus=music)
for tk in (4.0, 4.5, 5.0, 5.5, 6.0):                         # the five kinetic words
    add(stab([note(n) for n in chord_at(tk)[2]] + [note(chord_at(tk)[2][0]) * 2]), tk, 0.24, rev=0.45, bus=music)
for i, tk in enumerate(np.arange(7.0, 11.75, 0.125)):       # arp from the shatter onwards
    tones = [note(n) * 2 for n in chord_at(tk)[2]]
    seq = [tones[0], tones[1], tones[2], tones[0] * 2, tones[2], tones[1]]
    place(music, pluck(seq[i % len(seq)]), tk, 0.11 * min(1, (tk - 6.9) / 1.5), pan=0.35 if i % 2 else -0.35)
    place(delay_bus, pluck(seq[i % len(seq)]), tk, 0.05)

# --- scene transitions
add(whoosh(0.55, 300, 7000, 0.85), 5.95, 0.4)                 # crash zoom into the photo
add(impact(0.9), 6.5, 0.7, rev=0.35)
for i in range(26):                                           # glass cracking
    add(click(5000 + 3000 * rng.random()) * 1.5, 6.86 + 0.14 * rng.random() ** 0.6, 0.12, pan=rng.uniform(-0.4, 0.4))
add(impact(0.9), 7.0, 0.7, rev=0.4)
add(pings(1.2, 160, 2500, 9500, 0.6), 7.0, 0.35, rev=0.5)      # shatter
add(filt(noise(0.5), 'high', 4000) * np.exp(-ts(0.5) * 12), 7.0, 0.3)
add(whoosh(0.3, 400, 9000, 0.9), 8.72, 0.45)
add(impact(1.0), 9.0, 0.75, rev=0.35)
add(whoosh(0.3, 800, 7000, 0.4), 9.15, 0.22, pan=-0.3)          # CREATE
add(whoosh(0.3, 800, 7000, 0.4), 9.47, 0.22, pan=0.3)           # ANYTHING

# --- 11-12 s build: snare roll, glitch blips, riser, reverse swell; beat drops out before the lock
roll = list(np.arange(11.0, 11.5, 0.125)) + list(np.arange(11.5, 11.75, 0.0625)) + list(np.arange(11.75, 11.95, 0.03125))
for i, tk in enumerate(roll):
    add(snare(1 + i * 0.02), tk, 0.12 + 0.2 * i / len(roll), rev=0.25)
for tk in np.arange(11.15, 11.95, 0.03125):
    if rng.random() < 0.15 + 0.6 * (tk - 11.15) / 0.8:
        t = ts(0.03)
        add(np.sign(np.sin(2 * np.pi * (300 + 1800 * rng.random()) * t)) * 0.5, tk, 0.08, pan=rng.uniform(-0.6, 0.6))
add(riser(1.0, 500, 10000, (220, 1760)), 10.95, 0.35)
add(reverse_cymbal(0.7), 11.3, 0.45)

# --- 12-15 s LOGO LOCK: big impact, ribbon whoosh, draw-on shimmer, chime, ringing E-major pad
add(impact(1.6), 12.0, 1.0, rev=0.5)
add(whoosh(0.14, 1000, 9000, 0.5), 11.99, 0.35, pan=-0.3)
t = ts(0.34)
add(sweep_noise(0.34, 1500, 9000, 0.35) * np.sin(np.pi * t / 0.34) * 0.5 + sine_glide(500 * 2.4 ** (t / 0.34), t) * np.sin(np.pi * t / 0.34) * 0.25, 12.1, 0.25)
add(bell(note('E6'), 2.5) * 0.7 + bell(note('B5'), 2.5) * 0.5, 12.42, 0.32, rev=0.6)
add(pings(0.4, 30, 5000, 11000, 0.15, (0.01, 0.05)), 12.42, 0.12, rev=0.6)
pad_dur = DUR - 12.0
t = ts(pad_dur)
pad = supersaw([note(n) for n in ('E3', 'B3', 'E4', 'G#4', 'B4', 'F#5')], pad_dur, 2400, (-0.1, -0.03, 0.04, 0.1))
pad *= np.minimum(1, t / 0.02) * np.clip((DUR - 0.08 - 12.0 - t) / 1.6, 0, 1)
add(pad, 12.0, 0.3, rev=0.6)
add(np.sin(2 * np.pi * note('E2') * t) * np.exp(-t * 0.9), 12.0, 0.3)

# ------------------------------------------------------------------ buses
# side-chain: duck the music bus after every kick
duck = np.ones(N)
tt = np.arange(N) / SR
for k in range(16):
    tk = 4.0 + k * BEAT
    if tk > 11.5:
        break
    m = tt >= tk
    duck[m] = np.minimum(duck[m], 1 - 0.75 * np.exp(-(tt[m] - tk) * 14))
dry += music * duck
send += music * duck * 0.25

# ping-pong dotted-eighth delay for the arp
d = int(0.375 * SR)
echo = np.zeros((2, N))
src = delay_bus.copy()
for rep in range(4):
    shifted = np.zeros((2, N))
    shifted[:, d:] = src[:, :-d]
    src = shifted[::-1] * 0.45          # swap channels each repeat
    echo += src
dry += echo
send += echo * 0.3

# reverb: stereo exponential-noise impulse response, convolved via FFT
ir_t = np.arange(int(1.8 * SR)) / SR
ir = np.stack([filt(rng.standard_normal(len(ir_t)), 'low', 5500) * np.exp(-ir_t / 0.45) for _ in range(2)])
ir[:, : int(0.012 * SR)] = 0
ir /= np.sqrt(np.sum(ir ** 2, axis=1, keepdims=True))
L = N + ir.shape[1]
nfft = 1 << (L - 1).bit_length()
wet = np.stack([np.fft.irfft(np.fft.rfft(send[c], nfft) * np.fft.rfft(ir[c], nfft), nfft)[:N] for c in range(2)])
mix = dry + wet * 0.55

# master: gentle drive, fade the tail, normalise to -1 dBFS
mix = np.tanh(mix * 1.15)
fade = np.clip((DUR - tt) / 0.9, 0, 1)
mix *= np.where(tt > DUR - 0.9, fade, 1)
mix *= 10 ** (-1 / 20) / np.max(np.abs(mix))
pcm = (np.clip(mix.T, -1, 1) * 32767).astype('<i2')

out = sys.argv[1] if len(sys.argv) > 1 else 'soundtrack.wav'
with wave.open(out, 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print('wrote', out, f'{DUR:.1f}s', 'peak', round(float(np.max(np.abs(mix))), 3))
