"""Optical-flow check of a preview render (the prompt's gate before the final render).

    python flowcheck.py out/preview30.mp4 out/preview30-cams.json

Speed: a thin template across the frame's centre row is block-matched into the next frame (normalised cross-correlation,
sub-pixel), in five patches across the width; the median shift is the glide's speed on screen at the centre, turned
into page px/s with the camera's scale there (F·cos(tilt)/d). Zoom: the page's width on a fixed screen row near the top,
measured from the page's side edges against the floor; while the camera never comes closer that width never grows.
Fails if, in the glide's steady part (1.6–7.3 s), page speed drops more than 3 % below its running peak, or if the
page's width on that row grows during the flight (0–8.2 s).
Needs numpy and ffmpeg.
"""

import json
import subprocess
import sys

import numpy as np

W, H = 1440, 1152


def frames(path):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-vf", "format=gray", "-f", "rawvideo", "-"], check=True, capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.uint8).reshape(-1, H, W).astype(np.float64)


def match(a, b, x0, x1, half=10, search=40):
    """Vertical shift (px, negative = up) of rows H/2±half of a, found in b."""
    t = a[H // 2 - half : H // 2 + half, x0:x1]
    t = (t - t.mean()) / (t.std() + 1e-9)
    scores = []
    for s in range(-search, 4):
        p = b[H // 2 - half + s : H // 2 + half + s, x0:x1]
        p = (p - p.mean()) / (p.std() + 1e-9)
        scores.append((t * p).mean())
    scores = np.array(scores)
    i = int(np.argmax(scores))
    if 0 < i < len(scores) - 1:
        l, m, r = scores[i - 1], scores[i], scores[i + 1]
        d = l - 2 * m + r
        off = 0.5 * (l - r) / d if abs(d) > 1e-12 else 0
    else:
        off = 0
    return i - search + off, scores[i]


def page_width(f, row):
    """The page's width on a screen row, from the page's edge shadow: the floor and the paper are nearly the same grey
    (#f2f3f6–#f9fbfb against #f5f5f5), the edge reads as the shadow's dip. Scanning in from each side, the first dip
    below 236 marks the edge; both must be found with floor outside them."""
    prof = np.convolve(f[row - 3 : row + 4].mean(axis=0), np.ones(5) / 5, mode="same")
    if prof[8:30].min() < 238 or prof[-30:-8].min() < 238:
        return None, False
    lefts = np.nonzero(prof[8 : W // 2] < 236)[0] + 8
    rights = np.nonzero(prof[W // 2 : W - 8] < 236)[0] + W // 2
    if not len(lefts) or not len(rights):
        return None, False
    return rights[-1] - lefts[0], True


def main(path, cam_json):
    f = frames(path)
    cams = json.load(open(cam_json))
    fps = 30.0
    rows = []
    for i in range(len(f) - 1):
        t = (i + 0.5) / fps
        shift, score = match(f[i], f[i + 1], 220, 1220)
        # Only rows with something to see: blank paper matches the static floor vignette at zero shift.
        texture = f[i][H // 2 - 10 : H // 2 + 10, 220:1220].std()
        c = cams[i]
        scale = c["F"] * np.cos(c["th"]) / c["d"]
        page = -shift * fps / scale if score > 0.5 and -39 < shift < 3 and texture > 6 else np.nan
        w, seen = page_width(f[i], 160)
        rows.append((t, page, c["d"], w if seen else None))
    t_ = np.array([r[0] for r in rows])
    page = np.array([r[1] for r in rows])
    smooth = np.array([np.nanmedian(page[max(0, i - 4) : i + 5]) if np.isfinite(page[max(0, i - 4) : i + 5]).any() else np.nan for i in range(len(page))])
    ok = True
    print("  t     page px/s (9-frame median)   camera d")
    for i, ((t, p, d, w), sp) in enumerate(zip(rows, smooth)):
        flag = ""
        # The 9-frame window must sit inside the steady part (the planned ease-off starts at 7.3 s).
        if 1.6 + 4 / fps <= t <= 7.3 - 4 / fps and np.isfinite(sp):
            before = smooth[(t_ >= t - 1.0) & (t_ < t) & (t_ >= 1.6)]
            before = before[np.isfinite(before)]
            if len(before) > 5 and sp < np.median(before) * 0.97:
                flag = f" DIP ({sp / np.median(before) - 1:+.1%} vs the second before)"
                ok = False
        if i and t <= 8.2 and d < rows[i - 1][2] - 1e-6:
            flag += " CAMERA-CLOSER"
            ok = False
        if i % 9 == 0 or flag:
            print(f"{t:5.2f}  {p:8.1f}  {sp:8.1f}   {d:8.1f}  {w if w else '-'}{flag}")
    seen = [(t, w) for t, _, _, w in rows if w is not None and t <= 8.2]
    ws = np.array([w for _, w in seen], dtype=float)
    med = np.array([np.median(ws[max(0, i - 3) : i + 4]) for i in range(len(ws))])
    # Skip the first frames after the edges come into the row (the shadow is still entering).
    grow = [seen[i][0] for i in range(8, len(med)) if med[i] > med[i - 3] + 2]
    if grow:
        ok = False
        print("ZOOM-IN (page width on row 160 growing) at:", ", ".join(f"{t:.2f}s" for t in grow[:10]))
    if len(med):
        print(f"page width on row 160: {med[0]:.0f} px at {seen[0][0]:.2f}s -> {med[-1]:.0f} px at {seen[-1][0]:.2f}s ({len(seen)} frames with both edges)")
    steady = smooth[(t_ >= 1.6) & (t_ <= 7.3)]
    print(f"steady glide 1.6-7.3 s: page speed {np.nanmin(steady):.0f}-{np.nanmax(steady):.0f} px/s (median {np.nanmedian(steady):.0f}), {np.isfinite(page[(t_ >= 1.6) & (t_ <= 7.3)]).mean():.0%} of frames measured")
    print("PASS" if ok else "FAIL")


if __name__ == "__main__":
    main(*sys.argv[1:])
