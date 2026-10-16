"""Find the drops in a real track: where it jumps up after a build or a break, with a hit right on the jump.

    python drops.py FILE [FILE ...]

For each file: its tempo, then the strongest drop candidates that leave room for the film (at least 9.97 s of music
before the drop and 3 s after it). A candidate's jump is the loudness of the 1.5 s after it against the 2 s before it,
its hit is the onset strength at that moment, and its low end is the share under 150 Hz after it. The attack is
refined to 5 ms so the cut can put it exactly on 9.97 s.
Needs numpy + scipy and ffmpeg.
"""

import sys

import numpy as np
from scipy.signal import butter, sosfilt, stft

sys.path.insert(0, __file__.rsplit("/", 1)[0])
from analyze import SR, load  # noqa: E402

HIT = 9.97


def tempo(x):
    f, t, z = stft(x[: int(60 * SR)], fs=SR, nperseg=2048, noverlap=2048 - 256)
    flux = np.maximum(np.diff(np.log1p(1000 * np.abs(z)), axis=1), 0).sum(0)
    flux -= flux.mean()
    ac = np.correlate(flux, flux, "full")[len(flux) - 1 :]
    fps = SR / 256
    best = max(np.arange(70, 180, 0.5), key=lambda b: ac[int(round(60 / b * fps))])
    return best


def drops(path, top=4):
    x = load(path)
    dur = len(x) / SR
    low = sosfilt(butter(4, 150, "low", fs=SR, output="sos"), x)
    hop = int(0.05 * SR)
    n = len(x) // hop
    e = np.array([np.mean(x[i * hop : (i + 1) * hop] ** 2) for i in range(n)]) + 1e-12
    el = np.array([np.mean(low[i * hop : (i + 1) * hop] ** 2) for i in range(n)]) + 1e-12
    f, t, z = stft(x, fs=SR, nperseg=1024, noverlap=1024 - hop)
    flux = np.maximum(np.diff(np.log1p(1000 * np.abs(z)), axis=1), 0).sum(0)
    flux = flux / flux.max()
    cands = []
    for i in range(int(HIT / 0.05), n - int(3 / 0.05)):
        after = 10 * np.log10(e[i : i + 30].mean())
        before = 10 * np.log10(e[i - 40 : i].mean())
        jump = after - before
        hit = flux[min(len(flux) - 1, i) : min(len(flux), i + 2)].max() if i < len(flux) else 0
        lowshare = el[i : i + 30].sum() / e[i : i + 30].sum()
        cands.append((jump + 6 * hit, jump, hit, lowshare, i * 0.05, after))
    cands.sort(reverse=True)
    picked = []
    for c in cands:
        if all(abs(c[4] - p[4]) > 4 for p in picked):
            picked.append(c)
        if len(picked) == top:
            break
    print(f"{path.split('/')[-1]}: {dur:.1f}s, ~{tempo(x):.1f} BPM (or half/double)")
    h5 = int(0.005 * SR)
    for score, jump, hit, lowshare, at, after in picked:
        a = int((at - 0.2) * SR)
        seg = x[a : a + int(0.4 * SR)]
        m = len(seg) // h5
        env = np.array([np.sqrt(np.mean(seg[j * h5 : (j + 1) * h5] ** 2)) for j in range(m)])
        attack = at - 0.2 + (np.argmax(np.diff(env)) + 1) * 0.005
        print(f"   drop at {attack:7.3f}s  jump {jump:+5.1f} dB  hit {hit:.2f}  low {lowshare:.0%}  level after {after:5.1f} dB  → window starts {attack - HIT:6.2f}s")
    return picked


if __name__ == "__main__":
    for p in sys.argv[1:]:
        drops(p)
