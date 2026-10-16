"""Measure a soundtrack against the reference fly-over's (sigh.mp4) and print one comparable profile.

    python analyze.py FILE [FILE ...]          # profile each file
    python analyze.py --ref REF FILE [FILE ...] # also score each against REF

What it measures (the numbers the brief describes the reference by): tempo from the onset envelope's
autocorrelation, the share of energy per band (sub < 120 Hz, low 120-500, mid 500-2k, upper 2-4k, top > 4k) over
the whole track and per phase of the film, the spectral centroid per phase, the loudness envelope, and the strongest
onsets. The score is a distance (lower = closer): band-share profile per phase, envelope shape, and how near the
strongest onsets fall to the film's cue points (whooshes 8.66 / 9.80, hit 9.97).
Needs numpy + scipy and ffmpeg on PATH.
"""

import json
import subprocess
import sys

import numpy as np
from scipy.signal import find_peaks, stft

SR = 48000
BANDS = [(0, 120), (120, 500), (500, 2000), (2000, 4000), (4000, 24000)]
BAND_NAMES = ["sub", "low", "mid", "upper", "top"]
# The film's phases: glide, whoosh rise, the hit, the hold, the decay.
PHASES = [("glide", 0.2, 8.6), ("rise", 8.6, 9.9), ("hit", 9.97, 10.4), ("hold", 10.4, 11.8), ("decay", 12.0, 14.4)]
CUES = [8.66, 9.80, 9.97]


def load(path: str) -> np.ndarray:
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"],
        check=True,
        capture_output=True,
    ).stdout
    return np.frombuffer(raw, dtype=np.float32).astype(np.float64)


def loudness(path: str) -> dict:
    out = subprocess.run(
        ["ffmpeg", "-v", "info", "-nostats", "-i", path, "-af", "ebur128=peak=true", "-f", "null", "-"],
        capture_output=True,
        text=True,
    ).stderr
    tail = out[out.rfind("Summary:") :]
    lufs = peak = None
    for line in tail.splitlines():
        line = line.strip()
        if line.startswith("I:"):
            lufs = float(line.split()[1])
        if line.startswith("Peak:"):
            peak = float(line.split()[1])
    return {"lufs": lufs, "true_peak_dbtp": peak}


def profile(path: str) -> dict:
    x = load(path)
    nper = 2048
    hop = 512
    f, t, z = stft(x, fs=SR, nperseg=nper, noverlap=nper - hop, boundary=None, padded=False)
    t = t  # frame centre times
    power = np.abs(z) ** 2
    total = power.sum(axis=0) + 1e-20

    def shares(mask):
        p = power[:, mask]
        e = np.array([p[(f >= lo) & (f < hi)].sum() for lo, hi in BANDS])
        return (e / max(e.sum(), 1e-20)).round(4)

    def centroid(mask):
        p = power[:, mask]
        return float((f[:, None] * p).sum() / max(p.sum(), 1e-20))

    whole = shares(np.ones_like(t, dtype=bool))
    phases = {}
    for name, a, b in PHASES:
        m = (t >= a) & (t < b)
        if m.sum() == 0:
            continue
        phases[name] = {"bands": dict(zip(BAND_NAMES, shares(m).tolist())), "centroid_hz": round(centroid(m))}

    # Loudness envelope: RMS in dB per 0.25 s.
    win = int(0.25 * SR)
    n = len(x) // win
    env = np.array([np.sqrt(np.mean(x[i * win : (i + 1) * win] ** 2)) for i in range(n)])
    env_db = 20 * np.log10(env + 1e-9)

    # Onsets: positive spectral flux on a log-magnitude spectrogram.
    logmag = np.log1p(1000 * np.abs(z))
    flux = np.maximum(np.diff(logmag, axis=1), 0).sum(axis=0)
    flux = np.concatenate([[0], flux])
    flux = flux / (flux.max() + 1e-12)
    peaks, props = find_peaks(flux, height=0.15, distance=int(0.12 * SR / hop))
    order = np.argsort(props["peak_heights"])[::-1][:10]
    onsets = sorted(round(float(t[peaks[i]]), 2) for i in order)

    # Tempo: autocorrelation of the onset envelope over 60-180 BPM.
    fe = flux - flux.mean()
    ac = np.correlate(fe, fe, mode="full")[len(fe) - 1 :]
    fps = SR / hop
    lags = np.arange(len(ac)) / fps
    valid = (lags > 60 / 130) & (lags < 60 / 70)
    best = lags[valid][np.argmax(ac[valid])]
    bpm = round(60 / best, 1)

    # Sub-band power around the hit: the share under 120 Hz in the 0.4 s after 9.97, and where the loudest 50 ms is.
    m50 = int(0.05 * SR)
    seg = x[int(8.0 * SR) : int(12.0 * SR)]
    k = len(seg) // m50
    loud = np.array([np.sqrt(np.mean(seg[i * m50 : (i + 1) * m50] ** 2)) for i in range(k)])
    loudest_at = round(8.0 + (np.argmax(loud) + 0.5) * 0.05, 2)

    return {
        "file": path,
        "duration_s": round(len(x) / SR, 2),
        "bpm": bpm,
        "bands": dict(zip(BAND_NAMES, whole.tolist())),
        "phases": phases,
        "onsets": onsets,
        "loudest_50ms_at": loudest_at,
        "env_db_quarter_s": env_db.round(1).tolist(),
        **loudness(path),
    }


def score(p: dict, ref: dict) -> dict:
    """Distance to the reference: lower is closer. Each part is roughly 0-1."""
    band = []
    for name in ref["phases"]:
        if name not in p["phases"]:
            band.append(1.0)
            continue
        a = np.array(list(p["phases"][name]["bands"].values()))
        b = np.array(list(ref["phases"][name]["bands"].values()))
        band.append(float(np.abs(a - b).sum() / 2))
    ea = np.array(p["env_db_quarter_s"][:58])
    eb = np.array(ref["env_db_quarter_s"][:58])
    m = min(len(ea), len(eb))
    ea, eb = ea[:m] - ea[:m].max(), eb[:m] - eb[:m].max()
    envelope = float(np.mean(np.abs(np.clip(ea, -40, 0) - np.clip(eb, -40, 0))) / 40)
    cue = float(np.mean([min([abs(o - c) for o in p["onsets"]] + [1.0]) for c in CUES]))
    hit = min(abs(p["loudest_50ms_at"] - 9.99), 1.0)
    tempo = min(abs(p["bpm"] - ref["bpm"]) / ref["bpm"], abs(p["bpm"] * 2 - ref["bpm"]) / ref["bpm"], abs(p["bpm"] / 2 - ref["bpm"]) / ref["bpm"])
    total = 0.35 * float(np.mean(band)) + 0.25 * envelope + 0.15 * cue + 0.15 * hit + 0.10 * min(tempo * 5, 1)
    return {"total": round(total, 3), "band": round(float(np.mean(band)), 3), "envelope": round(envelope, 3), "cue_s": round(cue, 3), "hit_s": round(hit, 3), "tempo": round(tempo, 3)}


def main(argv: list[str]) -> None:
    ref = None
    if argv and argv[0] == "--ref":
        ref = profile(argv[1])
        argv = argv[2:]
    for path in argv:
        p = profile(path)
        brief = {k: v for k, v in p.items() if k != "env_db_quarter_s"}
        if ref:
            brief["score"] = score(p, ref)
        print(json.dumps(brief, indent=1))


if __name__ == "__main__":
    main(sys.argv[1:])
