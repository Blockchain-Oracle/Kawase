# Kawase fly-over film

A 14.5 s, 60 fps, one-camera fly-over of [getkawase.xyz](https://getkawase.xyz), made in code: the live page is captured
as flat pictures, a WebGL2 page flies a camera over them (every frame computed from time in `seek(t)`), and headless
Chrome on the GPU renders it frame by frame into H.264. Built from Abu's reference prompt
(`plan/prompts/flyover-2026-10-16-reference-prompt.md`, kept out of git) and matched against its finished example.

| Cut | Size | Use |
| --- | --- | --- |
| master | 1440 × 1152 | the landing, X |
| 4:5 | 1080 × 1350 | X / Instagram feed |
| 16:9 | 1920 × 1080 | YouTube, the landing's wide slot |

## Make it

```bash
cd marketing/flyover
npm install                                   # playwright-core; renders with the installed Google Chrome
node capture.mjs                              # 1. the live page → capture/ (page tiles, 68 pieces, manifest.json)
node render.mjs --fps 30 --sub 4 --name preview30            # 2. a quick preview
python flowcheck.py out/preview30.mp4 out/preview30-cams.json # 3. the optical-flow gate (or --flat for the camera alone)
node render.mjs --stills 0,1.6,2.5,5,6.5,9.3,11              # 4. stills → out/stills/
node render.mjs --name picture-1440x1152                     # 5. the picture (≈75 s on an M1 Pro)
node render.mjs --w 1080 --h 1350 --name picture-1080x1350
node render.mjs --w 1920 --h 1080 --name picture-1920x1080
node audio/mix.mjs                                           # 6. the soundtracks → audio/out/*.wav, *.m4a
ffmpeg -i out/picture-1440x1152.mp4 -i audio/out/J1.m4a -c:v copy -c:a copy -shortest out/kawase-flyover.mp4
```

`flowcheck.py`, `audio/analyze.py` and `audio/find_drop.py` need Python with numpy and scipy
(`uv venv /tmp/fv && uv pip install -p /tmp/fv/bin/python numpy scipy`). `audio/generate.mjs` needs
`ELEVENLABS_API_KEY` (the repo's `.env`); its outputs live in `audio/work/` (git-ignored), so a fresh checkout must
regenerate the beds and effects before `mix.mjs` (generation is not deterministic: re-measure with `find_drop.py` and
update the drop times in `mix.mjs`).

## How it works

- **Capture** (`capture.mjs`): headless Chrome, 1440 px wide, device scale 2, light theme, reduced motion (the hero's
  devices flat, tapes still). The pinned tour is laid out at rest (every step at full strength, its scroll room taken
  out), the corner QR card hidden, the header put in place. The pieces that lift are marked and pictured alone on
  transparent backgrounds with 28 px padding, their own CSS shadows removed (the film draws every shadow). Nothing in
  the landing app changes; all of it is CSS and DOM set on the captured copy.
- **Camera** (`film/film.js`): one speed curve (a share of cruise: 0 → 0.5 by 0.6 s, 0.5 to 1.25 s, 1.0 by 1.6 s,
  held to 7.3 s, easing to 0.12 by 8.3 s) integrated into the page position; focal 1880 px, 56° off straight-down,
  distance easing out from 1600 to 1900 px (the reference's 1360 → 1700 cut Kawase's two-column hero; same ratio of
  ease) and never back in. Cruise is calibrated to the page (≈914 px/s) so "Kawase, in your pocket." crosses the centre
  at 8.0 s. The rise zooms out in log scale on a smooth trapezoid while the tilt flattens and a camera holding the page's
  bottom edge 42 px above the frame takes over; the overhead strip creeps 3.5 % closer; the dive pins the page's top edge
  then drops it to the card's top while everything below the hero fades into the floor and the mask morphs from the page
  (24 px corners) to the hero (38 px on screen).
- **Depth of field**: per pixel, 75·(focus−z)/z in front of the focus and 6·(z−focus)/z behind, capped at 120 px, 40
  golden-angle taps each read from the mip level matched to the tap spacing; nearer samples spread over farther ones.
  The focus follows whatever crosses the middle of the frame (pulled toward a lifted piece as it passes).
- **Pieces**: each lifted piece stands up about its middle line, top edge toward the lens; its shadow is the same
  picture in flat #1a2133, offset (0.10z, 4 + 0.36z), blurred 7 + 0.5z, 26 %. The weekly-budget card is the
  "testimonial" (22 → 112 px, 30°, a 34 px white edge). Two venue chips fly up to ~205 px at 54°.
- **Logo tiles**: the 為替 mark in four colourways (the app icon itself, magenta, paper, blush) start as 32 px tiles
  beside the hero's buttons, hang outside the page's top corners, trail the camera and drift out; one passes the left
  edge near the lens at 5.4 s; on the end card two sit on the card's top corners, one is crisp at the right edge and two
  soft ones drift into the bottom corners.
- **End card**: the badge pill (the app mark + "Kawase", Geist 500 21 px) at 10.02 s, "Money that moves," (Geist 500,
  74 px, a word every 0.06 s from 10.12) and "when you speak." (Instrument Serif italic, 82 px, #8b8b92, a word every
  0.05 s from 10.36, each rising 16 px out of a 12 px blur in 0.34 s); the card creeps 2 % closer to the end.
- **Motion blur**: 16 subframes across 0.7 of a frame, with a sub-pixel jitter per subframe (also anti-aliasing).
- **Render** (`render.mjs`): Chrome headless on Metal (`--use-angle=metal --enable-gpu --ignore-gpu-blocklist`); it
  refuses to run on a software renderer. Each frame is `seek(t)` then a PNG piped into ffmpeg (x264, CRF 14, yuv420p,
  BT.709, faststart).

## Sound

Real, licensed instrumentals (Abu's call after hearing the generated beds: ElevenLabs Music sounded generic). Eleven of
the most-downloaded human-made tracks on Pixabay Music in launch-film styles (AI-tagged tracks excluded), all under the
Pixabay Content License (commercial use, no attribution required), listed with source and page in
`audio/library.json`; the files live in `audio/library/` (git-ignored; re-download from the `src` URLs).
A 14.5 s film plays the best part of a song from its first frame, so `audio/best_window.py` (librosa) picks each
track's window inside its main hook: full level against the song's own peak, material that repeats elsewhere in the song
(hooks and choruses do, intros and bridges don't), no dip during the glide, a bar downbeat on the landing (9.97 s), the
cut starting on a beat (a tempo nudge of at most 2 %, pitch kept, makes a whole number of beats span the 9.97 s).
`audio/mix.mjs` cuts it: the track alone, a 50 ms click-free start, the reference's decay from 11.9 s, −14 LUFS. Four:

- **AMALGAM** (Rockot, future bass): 60.95 s → landing on the downbeat at 70.77 s.
- **Whip** (kontraa, afro dancehall, the most downloaded): 143.13 s → 153.25 s, a strong low hit on the landing.
- **Kulakovka** "No Copyright Music" (beats): 64.64 s → 74.63 s.
- **Kugelsicher** (TremoxBeatz, hip-hop): 58.12 s → 67.92 s, a section change on the landing.

(`audio/drops.py` finds a track's drops; the first real-track cuts used it to put each first drop on the landing, which
left the glide on intros. Abu: "you just started the sound from the beginning".)

To swap the track: add it to `LIBRARY` in `audio/mix.mjs` with its drop, `node audio/mix.mjs <name>`, then mux with the
ffmpeg line above (no re-render). The earlier ElevenLabs tooling (`generate.mjs`, `VARIANTS`) stays for reference only.
