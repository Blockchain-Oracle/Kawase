# Fly-over film: handoff

Branch `claude/landing-flyover-film-77041f` (worktree `.claude/worktrees/landing-flyover-film-77041f`). The brief is
`plan/prompts/flyover-2026-10-16-reference-prompt.md` in the main checkout (Abu's prompt verbatim + the measured
reference track); the reference film is `/Users/abu/Downloads/sigh.mp4`. How it all works and how to re-render: README.md.

## Done (2026-10-16)

- Capture (`capture.mjs`): 1440 × 8045 page, 4 tiles, 68 pieces. The tour laid out at rest, the corner QR hidden.
- Film page (`film/`): camera, DOF, shadows, pieces, logo tiles, rise/overhead/dive, end card, motion blur.
- Optical-flow gate (`flowcheck.py`) on a 30 fps preview without the lifted pieces (`--flat`): PASS. Steady glide
  883–920 px/s where the centre row has texture (design 914), the page's width on a fixed row shrinks the whole flight
  (1154 → 1022 px: zooming out only), the camera distance never decreases in the flight.
- Final pictures: 1440×1152, 1080×1350, 1920×1080 (60 fps, 16 subframes), soundtracks J1 (recommended), I1, G1 mixed
  and measured (−14.2…−14.5 LUFS, −1.4 dBTP). Deliverables copied to the main checkout's `docs/marketing/videos/`
  (untracked) and sent to Abu.
- Landing bug found and written up for the main session (not fixed here):
  `side-session-notes/…/flyover-2026-10-16-landing-reduced-motion-bug.md` (Reveal blocks stay invisible under
  `prefers-reduced-motion`).

## If Abu wants changes

- Different track: drop a licensed file in `audio/work/`, add a variant to `VARIANTS` in `audio/mix.mjs` with its drop
  time (measure with `audio/find_drop.py`, check at 20 ms resolution), `node audio/mix.mjs <name>`, then mux with the
  ffmpeg line in the README (no re-render needed).
- Timing/camera: `film/film.js` (`share`, `Y0`, `dFlight`, `motionFor`, the tile keys); re-render the picture (~75 s
  per format on the M1 Pro).
- The landing changed: `node capture.mjs`, check the anchors it prints, re-render.

## Not done / judgement calls

- Sound is ElevenLabs-generated and chosen by measurement only (no listening possible here). A licensed library track
  (Pixabay Music, Uppbeat) needs Abu (or a session he authorises) to download it; the mixer takes it as a variant.
- 4:5 keeps the master's horizontal field (focal 1410), so its opening shows more floor above and more near-lens blur
  below than the master; the end card is re-laid out for it.
