# Fly-over film: handoff

Branch `claude/landing-flyover-film-77041f` (worktree `.claude/worktrees/landing-flyover-film-77041f`). The brief is
`plan/prompts/flyover-2026-10-16-reference-prompt.md` in the main checkout (Abu's prompt verbatim + the measured
reference track); the reference film is `/Users/abu/Downloads/sigh.mp4`.

## Done

- `capture.mjs`: the live page captured (1440 × 8045 CSS px, DPR 2, light, reduced motion), 4 page tiles + 68 pieces +
  `capture/manifest.json`. The tour is laid out at rest (no pinning), the corner QR hidden. Re-run: `node capture.mjs`.
- Found a landing bug while capturing (not fixed here, reported to the main session): under `prefers-reduced-motion`
  every `Reveal` block stays at `opacity:0` (server-rendered motion style survives hydration when the client renders a
  plain div). The capture works around it with CSS.
- Audio tooling: `audio/analyze.py` (profile + distance to the reference), `audio/find_drop.py` (where a generated
  track really drops), `audio/generate.mjs` (ElevenLabs beds and effects; the plan allows 2 requests in flight).
  Measured so far: one-shot 14.5 s plans (A–C) never put the drop where asked; two-section tracks G1 (+4–5 dB step at
  11.39 s, closest to the reference's +4 dB) and E1 (break, then a big drop at 11.24 s) have real drops; D1 and F1
  don't. First effects were wrong (whoosh_a is a thump, hits are bare 44 Hz sines peaking > 0 dBFS); second round
  (riser_a–c, swish_a, impact_a–b) generated, not measured yet.

## Left

1. `film/` page: WebGL2, `seek(t)` only, page tiles + pieces + logo tiles, per-pixel DOF, shadows, rise/overhead/dive,
   end card (Geist 500 + Instrument Serif italic), 16-subframe motion blur. Camera calibrated to this page: start
   look-at y ≈ 548, cruise ≈ 914 px/s (so the "Every money app" title crosses centre at 1.6 s and "Kawase, in your
   pocket." at 8.0 s).
2. `render.mjs`: static server + Chrome (`--use-angle=metal --enable-gpu --ignore-gpu-blocklist`), frames → ffmpeg.
   30 fps preview first, optical-flow check, stills at 0, 1.6, 2.5, 5, 6.5, 9.3, 11 s.
3. `audio/mix.mjs`: cut the bed window so its own drop lands on 9.97, riser from 8.66, swish at 9.80, impact on 9.97,
   decay 12 → 14.45, −14 LUFS / −1 dBTP. Measure 2–3 mixes, recommend one.
4. Final renders 1440×1152 (+ 1080×1350, 1920×1080), copy MP4s + stills to the main checkout's
   `docs/marketing/videos/`, send to Abu.

## Resume

```
cd marketing/flyover && npm install
node capture.mjs                      # only if the landing changed
uv venv /tmp/fv && uv pip install -p /tmp/fv/bin/python numpy scipy   # for the audio measurements
```
