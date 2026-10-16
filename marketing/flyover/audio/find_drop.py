"""Find where a generated two-section track really drops: the 50 ms step where the low end (< 500 Hz) over the next
second most outweighs the second before, searched between 8 and 20 s. Prints the drop time and the onset nearest it
(the downbeat the cut is aligned to), plus a coarse low-end and overall loudness envelope.

    python find_drop.py FILE [FILE ...]
"""
import sys

import numpy as np
from scipy.signal import butter, sosfilt

sys.path.insert(0, __file__.rsplit("/", 1)[0])
from analyze import SR, load  # noqa: E402


def drop(path):
    x = load(path)
    low = sosfilt(butter(4, 500, "low", fs=SR, output="sos"), x)
    hop = int(0.05 * SR)
    n = len(x) // hop
    e_low = np.array([np.mean(low[i * hop : (i + 1) * hop] ** 2) for i in range(n)])
    e_all = np.array([np.mean(x[i * hop : (i + 1) * hop] ** 2) for i in range(n)])
    best, at = 0, 0
    for i in range(int(8 / 0.05), min(n - 20, int(20 / 0.05))):
        ratio = (e_low[i : i + 20].mean() + 1e-12) / (e_low[i - 20 : i].mean() + 1e-12)
        if ratio > best:
            best, at = ratio, i
    # The strongest attack within ±0.25 s of the step: the 5 ms frame where the low end jumps most.
    h5 = int(0.005 * SR)
    a, b = int((at * 0.05 - 0.25) * SR), int((at * 0.05 + 0.25) * SR)
    seg = low[a:b]
    m = len(seg) // h5
    env = np.array([np.sqrt(np.mean(seg[j * h5 : (j + 1) * h5] ** 2)) for j in range(m)])
    jump = np.argmax(np.diff(env)) + 1
    attack = a / SR + jump * 0.005
    sec = lambda arr, s: 10 * np.log10(arr[int(s / 0.05) : int((s + 1) / 0.05)].mean() + 1e-12)
    print(f"{path.split('/')[-1]}: dur {len(x)/SR:.2f}s  drop step {at*0.05:.2f}s (x{best:.1f} low)  attack {attack:.3f}s")
    print("   low dB/s :", " ".join(f"{sec(e_low, s):.0f}" for s in range(0, int(len(x) / SR))))
    print("   all dB/s :", " ".join(f"{sec(e_all, s):.0f}" for s in range(0, int(len(x) / SR))))
    return attack


if __name__ == "__main__":
    for p in sys.argv[1:]:
        drop(p)
