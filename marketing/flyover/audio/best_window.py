"""Find a track's best 14.5 s for the film: inside its main hook, with a bar's downbeat on the landing (9.97 s).

    python best_window.py FILE [FILE ...]

A 14-second film should play the best part of a song from its first frame, not its intro or a build. Per track:
beats and tempo (librosa), bar downbeats (the beat phase whose low-end onsets are strongest), loudness, a repetition
score per beat (how closely the next 8 beats recur elsewhere in the song: hooks and choruses repeat, intros and
bridges don't), and a structural novelty curve (where sections change). Every downbeat b gives a candidate window
[b − 9.97, b + 4.53]. It scores by how loud and repeated its first 12 s are against the song's own peak, minus a
penalty for any dip (a breakdown or an intro) during the glide. A section change or a strong low hit on b scores a
bonus. The window starts exactly on a beat: the music is nudged by at most ±3.5 % (`stretch`, pitch kept) so that a
whole number of beats spans the 9.97 s to the landing.
Prints the best windows per track; `mix.mjs` takes the start and the landing downbeat.
Needs numpy, scipy, librosa, ffmpeg.
"""

import sys

import librosa
import numpy as np

HIT = 9.97
DUR = 14.5
SR = 22050


def analyse(path, top=3):
    y, sr = librosa.load(path, sr=SR, mono=True)
    dur = len(y) / sr
    hop = 512
    onset = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop)
    low_onset = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop, fmax=200, n_mels=32)
    tempo, beats = librosa.beat.beat_track(onset_envelope=onset, sr=sr, hop_length=hop)
    tempo = float(np.atleast_1d(tempo)[0])
    bt = librosa.frames_to_time(beats, sr=sr, hop_length=hop)
    # Bar phase: the beat phase (of 4) with the strongest low-end onsets is the downbeat.
    phase = max(range(4), key=lambda p: low_onset[beats[p::4]].mean())
    downbeats = bt[phase::4]

    rms = librosa.feature.rms(y=y, frame_length=2048, hop_length=hop)[0]
    db = librosa.amplitude_to_db(rms, ref=np.max)
    t_rms = librosa.frames_to_time(np.arange(len(db)), sr=sr, hop_length=hop)
    k = int(0.5 * sr / hop)
    db_s = np.convolve(db, np.ones(k) / k, mode="same")
    peak = np.percentile(db_s, 95)

    # Beat-synchronous chroma + MFCC: repetition and novelty.
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr, hop_length=hop)
    mfcc = librosa.feature.mfcc(y=y, sr=sr, hop_length=hop, n_mfcc=13)
    feat = np.vstack([librosa.util.normalize(chroma, axis=0), librosa.util.normalize(mfcc, axis=0)])
    sync = librosa.util.sync(feat, beats, aggregate=np.median)
    sync = sync / (np.linalg.norm(sync, axis=0, keepdims=True) + 1e-9)
    S = sync.T @ sync
    n = S.shape[0]
    L = 8
    rep = np.zeros(n)
    for i in range(n - L):
        diag = [np.mean([S[i + d, j + d] for d in range(L)]) for j in range(n - L) if abs(i - j) >= 16]
        rep[i] = max(diag) if diag else 0
    # Foote novelty with a 2·8-beat checkerboard kernel.
    K = np.kron(np.array([[1, -1], [-1, 1]]), np.ones((L, L)))
    nov = np.zeros(n)
    for i in range(L, n - L):
        nov[i] = (S[i - L : i + L, i - L : i + L] * K).sum()
    nov = np.maximum(nov, 0)
    nov = nov / (nov.max() + 1e-9)
    beat_of = lambda t: int(np.clip(np.searchsorted(bt, t), 0, n - 1))

    cands = []
    for b in downbeats:
        ib = int(np.argmin(np.abs(bt - b)))
        # Start exactly on a beat: the beat that makes the stretch to 9.97 s smallest (at most ±3.5 %, inaudible).
        best = None
        for nb in range(int(HIT * tempo / 60) - 1, int(HIT * tempo / 60) + 3):
            if ib - nb < 0:
                continue
            s = bt[ib - nb]
            f = (b - s) / HIT
            if best is None or abs(f - 1) < abs(best[1] - 1):
                best = (s, f, nb)
        if best is None or abs(best[1] - 1) > 0.035:
            continue
        s, f, nb = best
        if b + (DUR - HIT) * f > dur:
            continue
        m = (t_rms >= s) & (t_rms < s + 12 * f)
        glide = (t_rms >= s + 0.3) & (t_rms < s + 9.2 * f)
        level = db_s[m].mean() - peak
        dip = max(0, peak - 6 - db_s[glide].min())
        i0, i1 = beat_of(s), beat_of(s + 12 * f)
        repeated = rep[i0:i1].mean()
        lift = nov[beat_of(b)]
        hit = low_onset[librosa.time_to_frames(b, sr=sr, hop_length=hop)] / (low_onset.max() + 1e-9)
        score = 1.0 * level + 8 * repeated - 0.8 * dip + 3 * lift + 2 * hit
        cands.append((score, s, b, level, dip, repeated, lift, hit, f, nb))
    cands.sort(reverse=True)
    picked = []
    for c in cands:
        if all(abs(c[1] - p[1]) > 6 for p in picked):
            picked.append(c)
        if len(picked) == top:
            break
    print(f"{path.split('/')[-1]}: {dur:.1f}s, {tempo:.1f} BPM, downbeat phase {phase}, 95th-pct level {peak:.1f} dB")
    for score, s, b, level, dip, repeated, lift, hit, f, nb in picked:
        print(
            f"   start {s:7.3f}s  landing downbeat {b:7.3f}s ({nb} beats)  stretch x{f:.4f}  level {level:+5.1f} dB vs peak  "
            f"glide dip {dip:4.1f} dB  repeated {repeated:.2f}  section change {lift:.2f}  low hit {hit:.2f}"
        )
    return picked


if __name__ == "__main__":
    for p in sys.argv[1:]:
        analyse(p)
