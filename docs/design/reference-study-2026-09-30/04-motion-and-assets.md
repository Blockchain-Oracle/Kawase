# Motion, materials, illustration and 3D assets

> **Reuse context:** This guide preserves the original Senryo example. Its D2/product decisions and existing-plan labels are historical, not rules for another app. Start with the [project handoff](PROJECT-HANDOFF.md).

[Study index](README.md) · [Evidence gallery](gallery.html) · [Motion index](motion-index.json)

This document describes **visible motion** first. Reconstruction recipes below are suggested starting points; they are not recovered source code. The original easing curves, spring constants, native APIs, rendering engines and asset formats are unknown.

## Replay catalog

Every excerpt is silent, resized to 402 × 874 and anchored to source-relative time. Its duration is the excerpt length, not automatically the animation duration. Open the gallery to loop at 0.25×, 0.5× or 1× and step through frames. Strips sample at eight frames per second; their labels are approximate. M06 also has a denser 30-sample-per-second inspection window.

| ID / source window | What to inspect | Visible motion contract | Replay / strip |
|---|---|---|---|
| M01 · R1 20.50–24.00 | Onboarding panel changes | Horizontal color/artwork travel inside a rounded clip; title/copy change during travel; CTA stays put. First displacement to settling is roughly 0.8–1.0 s in this window. This could include interaction-driven motion. | [Video](evidence/motion/M01.mp4) · [Strip](evidence/motion/M01.jpg) |
| M02 · R1 33.00–34.50 | Import sheet | Scrim appears while sheet rises from the bottom; rounded top and grab handle. Major rise is roughly 0.4–0.5 s; small settling follows. Background is dim, not strongly blurred. | [Video](evidence/motion/M02.mp4) · [Strip](evidence/motion/M02.jpg) |
| M03 · R1 69.00–72.50 | Cards first-use sequence | Page presentation followed by two tutorial states and arrival at moving card/consumer artwork. Distinguish tutorial navigation from ambient hero motion. | [Video](evidence/motion/M03.mp4) · [Strip](evidence/motion/M03.jpg) |
| M04 · R1 85.50–87.50 | Receive page and QR | Page slides from the right, then scattered white particles resolve into the dotted QR. QR assembly lasts approximately 0.6–0.8 s after it starts. | [Video](evidence/motion/M04.mp4) · [Strip](evidence/motion/M04.jpg) |
| M05 · R2 00.00–07.00 | Cartoon and page push | Ghost expressions, floating market/sports layers; welcome→More options→welcome. The hero is layered illustration rather than a single rotating 3D object. | [Video](evidence/motion/M05.mp4) · [Strip](evidence/motion/M05.jpg) |
| M06 · R2 136.00–137.50 | Quick-action fan | Background blur/dim enters; four controls scale/fade and stagger upward. Send leads and briefly overshoots. Settled controls form a vertical right column. Entrance approximately 0.2–0.3 s. | [Video](evidence/motion/M06.mp4) · [Strip](evidence/motion/M06.jpg) · [Dense 1](evidence/motion/M06-dense-1.jpg) / [2](evidence/motion/M06-dense-2.jpg) |
| M07 · R2 142.50–144.50 | Fan→Trade | Foreground fan and blur clear as a full-height trade surface raises. The underlying discovery page remains the return destination. | [Video](evidence/motion/M07.mp4) · [Strip](evidence/motion/M07.jpg) |
| M08 · R2 110.00–115.00 | Prediction detail and chart | Tall rounded sheet raises. The chart is initially empty; line appears later and gains its endpoint. Navigation and data arrival have separate timelines. | [Video](evidence/motion/M08.mp4) · [Strip](evidence/motion/M08.jpg) |
| M09 · R3 67.00–70.50 | Scrolling home | Expanded header/featured cards leave; compact logo/balance remains and primary tabs stay accessible. Floating dock stays at the bottom while content passes behind it. This is scroll-driven, not a fixed-duration transition. | [Video](evidence/motion/M09.mp4) · [Strip](evidence/motion/M09.jpg) |
| M10 · R3 101.00–105.00 | Dock→profile | Active glass-like bubble/icon changes; profile loads utilities and identity. Blue deposit content lies behind the translucent dock. Includes brief stale/skeleton profile state. | [Video](evidence/motion/M10.mp4) · [Strip](evidence/motion/M10.jpg) |
| M11 · R3 107.00–110.00 | Profile edit push | Full page travels from the right with rounded page corners, then form scrolls. Connected-account band obscured for privacy. | [Video](evidence/motion/M11.mp4) · [Strip](evidence/motion/M11.jpg) |
| M12 · R3 115.00–119.00 | Deposit sheet entrance | Short sheet raises over dim profile. Its final height follows menu content, unlike the tall cash/trade tickets. | [Video](evidence/motion/M12.mp4) · [Strip](evidence/motion/M12.jpg) |
| M13 · R3 202.00–205.00 | Gate→order ticket | Checkbox and enabled/pending Continue precede the tall trade sheet. Acceptance/loading is semantically distinct from the sheet animation. | [Video](evidence/motion/M13.mp4) · [Strip](evidence/motion/M13.jpg) |
| M14 · R3 208.00–212.00 | Leverage ruler | Ticks/values move horizontally behind the selected blue center region; surrounding ticks fade toward edges. Selected leverage updates while the ticket stays fixed. Gesture-driven; snap physics unknown. | [Video](evidence/motion/M14.mp4) · [Strip](evidence/motion/M14.jpg) |
| M15 · R3 240.00–243.50 | Risk sheet and keyboard | Nested SL/TP sheet appears; focusing its field brings native numeric keyboard and lifts/reflows sheet. Parent ticket remains behind it. | [Video](evidence/motion/M15.mp4) · [Strip](evidence/motion/M15.jpg) |
| M16 · R3 121.50–125.50 | Nested crypto selector | Short method sheet moves down/changes while taller network child raises, with explicit back. Visible exchange of panels spans roughly 0.5–0.8 s; dismissal restores profile. | [Video](evidence/motion/M16.mp4) · [Strip](evidence/motion/M16.jpg) |
| M17 · R3 00.80–05.80 | 3D login composition | Native permission over hero, glass/beveled mark, two stylized figures and violet atmosphere. Do not mistake the system dialog for custom welcome artwork. | [Video](evidence/motion/M17.mp4) · [Strip](evidence/motion/M17.jpg) |
| M18 · R1 62.40–63.80 | Completion flag | Metallic cloth flexes in waves; specular highlights move across the mark/folds. A flat logo wobble would lose the material effect. | [Video](evidence/motion/M18.mp4) · [Strip](evidence/motion/M18.jpg) |

Additional visible motion: reflective coins turn edge-on; Solflare's simple lock/bell silhouettes morph; Fomo's card artwork/price colors update; form spinners and skeleton states change independently; Phantom price digits and chart selection update; custom key press states appear; native Face ID rings/checks animate. Full sound, haptic and success choreography is not established.

## Overlay and navigation grammar

| Pattern | Background | Foreground / movement | Recorded examples |
|---|---|---|---|
| Full-page push | Prior page is briefly visible beside entering page | New page travels horizontally; some Fomo pages have rounded moving corners | Phantom More options, Solflare Receive, Fomo Edit profile/market detail |
| Compact selector sheet | Dim scrim; recognizable parent context | Content-sized rounded sheet rises, grab handle or back header | Solflare auth methods; Fomo deposit methods/exchanges |
| Tall data/detail sheet | Darkened parent, mostly covered | Near-full-height rounded sheet; internal scroll with sticky actions | Phantom prediction; Fomo position detail |
| Full-height transaction sheet | Parent largely covered | Context header, non-scrolling amount/controls and keypad/chart region | Phantom Buy Up/Trade; Fomo cash/perps ticket |
| Nested child sheet | Parent remains as the journey context | Different height/header with explicit back; child can replace parent panel | Fomo crypto networks, risk fields; Solflare bridge choices |
| Blur fan | Strong live-content blur plus dark tint | Crisp labels/circles at the right, short staggered expansion from FAB | Phantom quick actions |
| Native system surface | Controlled by OS | Permission dialog, Face ID scan, keyboard/browser | All recordings; never imitate these with misleading app HTML |

Blur is not a universal sheet treatment. Phantom's action fan intentionally obscures the page. The funding selectors mainly dim it. Moving screen corners are not evidence that the content itself follows an arc. Each layer must have an explicit job: retained page, scrim/material, sheet, sticky controls, keyboard/system surface.

## Reconstruction recipes — suggestions, not measurements

### Phantom quick actions

Build a test scene containing the exact recorded final geometry before tuning motion. At the inferred 402 × 874 scale, use a right column near x=358, four approximately 48-unit circles, roughly 72-unit vertical spacing, and labels to the left. Origin is the lower plus near the search dock. Use the dense strips for actual relative positions.

Suggested initial tuning: overall entrance 220–300 ms; per-item upward/scale movement with 20–35 ms staggering; Send first, followed by Receive, Add Cash, Trade. Start small and translucent near the origin; finish at full scale with a small vertical overshoot. Animate backdrop blur/scrim concurrently over about 120–200 ms. Rotate the plus into × and change its filled-disc treatment. These numbers are starting ranges, not recovered implementation constants. Compare early, middle and settled states, not just the end screenshot.

Keep action labels readable during motion and the backdrop above the page but below the actions. Make open/close interruption and selecting an action explicit. Dismissal/focus handling and reduced-motion support are target implementation requirements to decide; they are not fully demonstrated by the footage.

### Sheets and child transitions

Start with vertical translation and a concurrent scrim fade, with deceleration near the final position. Match each recorded height rather than assigning every sheet a 50% detent. Observe the short selector→tall network change separately from page pushes. Suggested initial durations for ordinary sheet work are about 300–500 ms, adjusted against the particular clip. Large onboarding art changes are visibly slower and should not be forced into the same timing scale.

When a child closes, restore its actual parent and retained field values. Keep sticky footer actions distinct from scrollable body content. Native keyboard avoidance must be tested with real viewport/keyboard changes; scaling an entire screenshot upward would be incorrect.

### Leverage ruler

Center the selected value and move the tick scale under it. Preserve edge fade, spacing, active blue value and legible neighbors. Couple selected leverage to leveraged-size display while preserving margin amount. Suggested implementation behaviors—continuous drag, controlled snapping, velocity-aware settling, keyboard/assistive alternatives—need a target decision; exact gesture/snap behavior cannot be recovered from the capture alone.

### Ambient art and chart loading

Ambient objects can use slow rotation/float loops with independent phase offsets. Avoid a single uniform bounce for every object: coins, cloth and cartoon expressions have different physical/visual behavior. Keep the app usable while art loops and while authentication is pending. Loop periods are not measured here.

Chart population should have its own data state. Preserve blank/skeleton→loaded path and live endpoint when demonstrated. A progressive line reveal can be used for the observed Phantom entrance, but should not replay on every live-price tick. Reduced motion can show the final path and a static poster instead; this is an additive accessibility choice, not a captured mode.

## Artwork / asset register

These are descriptive asset briefs for reconstruction or original inspired assets. Source geometry and rights are not supplied. Senryo-specific production art should use Senryo marks and its approved direction.

| Asset family | Composition / material to preserve | Animation to preserve | Evidence |
|---|---|---|---|
| Solflare silver coins | Beveled/ridged discs, embossed marks, reflective silver; some partly cropped at panel edges | Spin to reveal thickness/edge; drifting highlights and layered depth | [S01](evidence/R1/screens/S01.jpg), [S03](evidence/R1/screens/S03.jpg) |
| Solflare shield | Heavy reflective silver shield with dark embossed brand mark over passcode mockup | Mild perspective/position change and reflections | [S02](evidence/R1/screens/S02.jpg) |
| Solflare piggy bank | Dark rounded pig, textured/stippled surface, floating wallet/reward labels | Subtle change of orientation/position | [S04](evidence/R1/screens/S04.jpg) |
| Solflare card / mirror | Black payment card with Solflare wordmark/Mastercard circles; freestanding circular reflective mirror with stand beside it | Perspective and specular movement | [S05](evidence/R1/screens/S05.jpg) |
| Solflare ownership stack | Pixel collectible next to stacked silver coins and dark UI rows | Layered object movement; contrasting pixel/metal textures | [S06](evidence/R1/screens/S06.jpg) |
| Solflare security/notification icons | Minimal white silhouettes for lock and bell | Morph/open/close changes rather than photoreal shading | [S11](evidence/R1/screens/S11.jpg), [S14](evidence/R1/screens/S14.jpg) |
| Solflare cloth flag | Reflective silver fabric on angled pole, printed/embossed dark mark | Waves/folds move with shifting highlights | [S13](evidence/R1/screens/S13.jpg), M18 |
| Solflare Cards hero | Tilted black card plus shopping/travel/consumer objects in dark space | Objects rotate/rearrange around the card; visible depth changes | [S18](evidence/R1/screens/S18.jpg) |
| Solflare purchase coin | Large dark-silver ridged dollar coin against black, bold yellow title | Rotation with edge/reverse-facing phases | [S28](evidence/R1/screens/S28.jpg) |
| Phantom welcome ghost | Purple illustrated character partially behind a black circular market field | Blink/expression changes and layered object motion | [P01](evidence/R2/screens/P01.jpg), M05 |
| Phantom orbiting badges | Crypto badges, candles, green arrow/chat, stars and sports form | Independent translation/rotation; sports shape changes | M05 |
| Phantom username avatar | Red/orange cartoon face inside round badge with sparkles | Expression/appearance detail; not a user photograph | [P05](evidence/R2/screens/P05.jpg) |
| Phantom Face ID lock | Purple body, softly shaded dimensional shackle, small rays/sparkles | Sculpted security emphasis; exact loop unknown | [P10](evidence/R2/screens/P10.jpg) |
| Phantom Send empty-state art | Green banknotes and lavender paper plane | Appears after skeleton state; no completed-send flight animation is shown | [P22](evidence/R2/screens/P22.jpg) |
| Fomo welcome mark | Beveled silver symbol, glass-like square rim, dark/violet environment | Subtle presentation/ambient motion | [F01](evidence/R3/screens/F01.jpg), M17 |
| Fomo welcome figures | Two dimensional human forms on lower opposing sides, inward-facing head/hand silhouettes with dark violet lighting; 3D-like appearance, underlying format unknown | Subtle entrance/ambient changes; rig, video origin and pose cycle unknown | F01, M17 |
| Fomo empty/search art | Faint oversized watermark; token-avatar cluster in Apple Pay card | Decorative presence and loading change, not a substitute for state copy | [F19](evidence/R3/screens/F19.jpg), [F31](evidence/R3/screens/F31.jpg) |

## Approximate visual measurements

Actual asset/company/provider marks and their observed variants are catalogued separately in the [identity guide](08-logos-and-identity.md). Keep identity artwork independent of UI action symbols and ambient illustration layers.

Colors below are sampled from compressed retained images; they can differ from original UI values. They are reference observations, not a proposed Senryo token replacement.

| App | Observed palette / shape language |
|---|---|
| Solflare | Dark near `#0D0E12`; yellow action approximately `#FAF543`; panels approximately periwinkle `#7690ED`, lime `#C4DA78`, pink `#F58CE1`, orange `#F1803A`, gray `#B7BBC6`. Large rounded hero, pill CTAs, illustrated rows and high material contrast. |
| Phantom | True/near black, dark gray cards, lavender actions, green/red market decisions. Large pill actions, compact white/gray secondary labels, circles for fan actions, rounded QR/card containers. |
| Fomo | Background approximately `#0A0911`, raised surface `#13121A`, blue action around `#414EF4`, subdued glass dock around `#201E2B`, bright green/red trade decisions. Dense rows, rounded rectangles, large numeric hierarchy. |

Exact font families are unknown. Observe hierarchy: welcome copy and amount figures are large; market metadata is compact; errors occupy predictable positions. Match line breaks, tabular alignment, truncation, corner radius and safe-area spacing through visual comparison at the reference aspect ratio. Do not declare an exact font from its resemblance to a system sans serif.

## Acceptance evidence for motion

For each implemented candidate, capture the same trigger and viewport, then compare: initial state, first visible movement, intermediate layout, overshoot/settling, final state, exit, and restored parent. Preserve entry order and z-order. Check that animations do not reset fields or move sticky controls into the keyboard. Inspect the final QR as an actual functional code, not the recorded private address. Provide static/reduced-motion alternatives as explicit additions. Any material change to trajectory, geometry, timing, background treatment or outcome belongs in the fidelity ledger.
