# Component inventory and future-agent handoff

> **Reuse context:** This guide preserves the original Senryo example. Its D2/product decisions and existing-plan labels are historical, not rules for another app. Start with the [project handoff](PROJECT-HANDOFF.md).

[Study index](README.md) · [Evidence gallery](gallery.html) · [Machine ledger](reference-ledger.json)

Choose components by the flow they support and the states they preserve. A similar screenshot is insufficient if it cannot handle the captured sheet stack, keyboard, retained input, async validation or active navigation. No component registry was queried and no library was selected in this study; these are capability/search briefs for the next agent.

## Component catalog

IDs are stable handoff references. The evidence column points to readable screen captures or motion clips. All outcomes are limited to the recordings; gaps are listed separately.

### Onboarding, identity and security

| ID / component | Required anatomy and visible states | Evidence | Useful search terms / matching test |
|---|---|---|---|
| C01 Story onboarding shell | Rounded clipped colored hero, layered art, six-part progress, changing title/copy, persistent two-action footer | S01–S06, M01 | `onboarding story carousel fixed CTA`; candidate must clip moving panels and preserve the footer |
| C02 Animated hero composition | Independent illustration/3D layers, expression/material motion, stable button zone, pending-login coexistence | P01/M05, F01/M17, S18 | `layered animated onboarding hero`; actual asset quality and composition matter more than package name |
| C03 Wallet/auth method selector | Primary and secondary methods, OR divider, social provider rows, dimmed-parent sheet or page variant | S07/S08, P02 | `wallet onboarding method sheet`; support distinct create/import alternatives |
| C04 Provider authentication boundary | Pending button, native browser/consent, provider-return spinner, return to app | P03/P04, F02/F03 | `OAuth loading return state`; do not replace system browser with fabricated app UI |
| C05 Passcode setup + confirmation | Six masked dots, custom round keypad/delete, automatic advance, separate confirmation | S09/S10 | `six digit PIN confirm keypad`; text-password input is a different flow |
| C06 Biometrics education / system handoff | Animated lock, enable/skip, native Face ID permission/scan, return | S11/S12, P10 | `biometric opt in onboarding`; education is custom, scan/permission is OS owned |
| C07 Notification education | Illustration, enable/defer actions; native permission where captured | S14, P11, M17 | `notification permission primer`; keep primer separate from OS dialog |
| C08 Completion scene | Metallic waving flag, success copy, terms/acknowledgment and primary action | S13/M18 | `animated onboarding completion`; state is complete even with motion disabled |
| C09 Username field | Prefix/clear, help/progress, keyboard avoidance, checking/unavailable/invalid/available/pending | P05/P07/P08, F04/F05 | `async username availability input`; state slots must not cause layout jumps |
| C10 Optional referral form | Gift/context, field/Paste where shown, skip/no-code path, inactive/pending continuation | P09, F07 | `optional referral onboarding`; preserve no-code path and keyboard placement |
| C11 Follow selection list | Rank, avatar, identity, performance, check state, show more and Continue | F06 | `multi select follow onboarding`; checked selection is different from a Follow button |
| C12 Checkbox acknowledgment gate | Dimmed context, explanation/links, unchecked→checked→enabled/pending Continue | F08/F36, P17 | `consent checkbox bottom sheet`; content is product-specific and must be approved separately |

### Navigation, discovery, cards and social surfaces

| ID / component | Required anatomy and visible states | Evidence | Useful search terms / matching test |
|---|---|---|---|
| C13 Four-tab wallet navigation | Icon+label, active yellow line above icon, fixed lower shell | S15/S19/S20 | `bottom tab bar top active indicator`; active marker belongs to the selected tab |
| C14 Horizontal top route pills | Avatar, selected filled pill, inactive labels, overflow | P12–P14 | `scrollable pill tab navigation`; preserve route selection and discovery dock |
| C15 Floating glass dock | Five icons/avatar, translucent capsule/rim, moving active region, background visibility | F12/F16, M09/M10 | `floating glass tab bar moving indicator`; visual material is unconfirmed, test actual content underneath |
| C16 Collapsing header + category rows | Expanded balance/promotions → compact header; main tabs retained; secondary horizontal filters | F09–F12/M09 | `collapsible sticky header nested tabs`; content scroll and category scroll have separate axes |
| C17 Search dock + action FAB | Bottom rounded search, adjacent plus, safe-area spacing, page content visible behind | P12/P19 | `bottom search bar floating action`; menu origin must match the plus |
| C18 Blurred quick-action fan | Live backdrop blur/dim, four labelled lavender circles, staggered ascent/scale, × close | P19/M06/M07 | `staggered expanding FAB backdrop blur`; reject final radial layouts when reproducing this reference |
| C19 Textured balance card | Wallet avatar/name, copy/ellipsis/new dot, large amount and change | S15 | `textured wallet balance card`; texture, zero state and utility controls are all part of anatomy |
| C20 Funding action / benefit tiles | Rich illustrated action rows; two pastel small benefits plus wider lower benefit | S15/S18 | `illustrated action row` / `benefit card grid`; distinguish route actions from informational cards |
| C21 First-use feature tutorial | Full-page education, next/got-it, product mockup, transition to normal tab | S16/S17/M03 | `first visit feature walkthrough`; tutorial illustration is not the live settings menu |
| C22 Asset/perp row and category chips | Actual asset/company artwork, compact instrument identity, leverage/volume, price/change, selection/loading | S20, P13, F10/F11 | `market asset list filters skeleton`; stable data columns/truncation and real entity marks matter |
| C23 Featured market / trader card | Horizontal previews, avatar/token, P&L or change, activity/chat/medals | P13, F09/F29 | `horizontal market cards live activity`; identify trader/market intent before reusing |
| C24 Prediction card families | BTC target/countdown/chart, Up/Down pills, two-by-two fast markets, sports outcomes | P14 and R2 timeline | `binary prediction market card`; preserve chart/target/time/probability hierarchy |
| C25 Tall market/position detail | Handle/header tools, loading chart, summary/about/social below, sticky actions | P15/P16, F13/F14 | `scrollable detail sheet sticky footer`; support full scroll range without hiding actions |
| C26 Price and chart control cluster | Live digits/change, period chips, path/live endpoint or candles/current-price line | P15/P16, F32–F35 | `live price chart range selector`; line and candle views are distinct reference families |
| C27 Social feed event / thesis | Avatar, verb/type, asset/time, threaded connectors, engagement, pinned/new activity | F15 | `trade activity feed thread card`; preserve trade events vs long-form thesis semantics |
| C28 Profile summary / utilities | Identity/edit, bio, metrics, period selector, utilities, empty positions, deposit promo | F16/F19 | `trader profile portfolio empty state`; loaded identity must replace skeleton cleanly |
| C29 Profile edit form | Banner/avatar edit, username/display name/bio count, connected providers, address/key controls, disabled Save | F17/F18/M11 | `profile edit connected accounts form`; unentered controls remain visible-only evidence |
| C30 Leaderboard / friends / clans | Rank/medals, P&L, time/context filters, Your rank, clan previews, Follow recommendations | F29/F30 | `leaderboard friends clan carousel`; preserve different ranking contexts |
| C31 Global search empty surface | Category tabs, Recents empty copy, watermark, bottom search/Paste, dock | F31 | `global search empty recent tabs`; result behavior is not captured |

### Funding, receive and transaction entry

| ID / component | Required anatomy and visible states | Evidence | Useful search terms / matching test |
|---|---|---|---|
| C32 QR receive surface | Large dotted code, chain center mark, identity/network row, copy/share, warning where shown | S21/M04, P21 | `wallet receive dotted QR`; animation must resolve to a valid target address, never reuse the recorded one |
| C33 Funding method sheet | Four rich rows, compact detent, parent dim, child navigation and back | F20/M12/M16 | `nested deposit method bottom sheet`; handle changing child heights |
| C34 Chain/asset chooser | Search/Paste where shown, actual chain/asset artwork, name, selected check, separate status badges, back and unresolved-image states | S24/S27, F21/F22 | `network asset picker bottom sheet`; distinguish chain logos, asset marks and blue check badges |
| C35 Bridge configuration + recovery | Source/destination, direction, supported assets, requirements, fee/time/QR loading, red error/retry | S22–S27 | `bridge form loading error retry`; successful transfer is a capture gap |
| C36 Fiat amount ticket / provider | Presets, large amount, keypad, minimum validation, payment method, verification/loading/return | F23–F27, S29/S30 | `deposit amount keypad identity verification`; retain entered amount after provider return |
| C37 Prediction / swap amount ticket | Context-specific header, big amount, percentage chips, balance/token skeletons, custom keypad | P18/P20 | `trade amount ticket custom keypad`; prediction Buy Up and swap pay/receive need separate anatomy |
| C38 Send empty state | Recipient skeleton→no recents, illustrated message, contact creation, bottom search/scan | P22 | `wallet send recipient search empty`; entered recipient/review not captured |
| C39 Perps order ticket | Actual asset and venue context, margin vs leveraged size, leverage, risk, keypad/chart switch, presets, available/quantity, disabled commit | F37–F42 | `perpetual order entry sheet`; identity, financial values and state dependencies must stay distinct |
| C40 Centered leverage ruler | Graduated horizontal ticks, center selection, fade edges, live selected multiple | F38/M14 | `centered snapping ruler leverage selector`; reject a plain dropdown as exact fidelity |
| C41 Keypad ↔ embedded chart | Fixed ticket identity; replace entry region, retain amount/leverage context, chart style surface | F39/F40 | `order ticket chart keypad toggle`; switching mode is not leaving the ticket |
| C42 Risk info / SL-TP child | Liquidation explanation; paired price/% fields, potential result, clear, save-disabled, native keyboard suggestions | F43–F45/M15 | `stop loss take profit bottom sheet keyboard`; keyboard focus must reflow the child |
| C43 Disabled slider-shaped commit | Chevrons, Enter amount / Insufficient funds, available balance context | F37/F41/F42 | `slide to confirm disabled reason`; successful drag/threshold/success is unobserved |
| C44 Async/empty/error primitives | Stable skeleton regions, button spinner, empty instruction, inline error + retry | S25/P12/F05/F26 | `skeleton to data` / `inline error recovery`; states must preserve surrounding flow |

Screen IDs are linked through [screen-index.json](screen-index.json) and searchable in the gallery. Motion IDs link through [motion-index.json](motion-index.json). This avoids ambiguous labels such as “the nice drawer.”

## Fidelity acceptance matrix

| Check | Evidence required from a future reconstruction |
|---|---|
| Screen geometry | Same reference aspect ratio; compare hierarchy, safe-area offsets, hero/card proportions, line breaks, radii, fixed footer and scroll extent. Original token values remain unknown. |
| Navigation | Trigger→destination→back/dismiss returns to the correct parent, preserving tabs, scroll and entered values where the recording demonstrates it. |
| Animation | Compare start, intermediate and settled frames plus exit; match z-order, blur/dim choice, stagger order, direction and overshoot. Timing changes must be declared. |
| Form state | Empty/typing/checking/invalid/unavailable/available/pending remain distinct; primary-action availability follows state, with reachable keyboard placement. |
| Funding | Each method follows its own child path. Below-minimum amount and verification return are reproducible. No unsupported success screen is passed off as recorded. |
| Trading | Margin and leveraged size differ correctly in the demo fixture; mode toggle preserves ticket; insufficient funds blocks commit; risk child manages keyboard and return. Calculations need separate product verification. |
| Loading/recovery | Chart/skeleton/provider states do not become generic full-page spinners. Bridge error, token failure and retry affordances remain attached to their contexts. |
| Artwork | Compare silhouette, composition, layer order, material/highlights and ambient movement. A stock icon with the same subject is not equivalent. |
| Accessibility additions | Focus, screen-reader labels, reduced motion, target sizes, contrast and alternate ruler/slider input are explicit additions to verify, not claimed observations. |
| Unknown branches | Report Blocked or obtain more footage. Do not invent passkeys, password recovery, trade success, share results or sheet gestures. |

## Decision order for Senryo

First select an end-to-end journey, such as onboard→fund→market→ticket→risk controls. Choose its navigation/overlay grammar before a component package. Then map visual treatments into the approved D2 tokens. Use the hero/art direction as a separate asset task with an approved composition. Only after those decisions should an agent search a registry or select native/web libraries.

The reference brands, claims, networks, referral rewards, eligibility copy and market data are not target requirements. Interaction sequencing can be Exact while colors, copy, product policy and assets are Adapted. A faithful reference reconstruction and an inspired Senryo redesign are different acceptance targets; declare which is being built.

## Copyable agent brief

The [identity contract](08-logos-and-identity.md), [116-feature register](09-feature-inventory.md) and [18 redesign opportunities](10-redesign-opportunities.md) extend these component briefs. Review their entity roles and product boundaries before proposing additions. Known entity artwork is a required input to the design, not an optional finishing pass.

```text
Read docs/design/reference-study-2026-09-30/README.md and all linked app,
motion, component, identity, feature and gap guides before design or implementation.
Use screen-index.json, motion-index.json, asset-identity-register.json,
feature-inventory.json and reference-ledger.json to find
evidence. Watch the motion clips; do not design from only settled frames.

This is a behavior/fidelity reference. The repository's approved Senryo D2
direction and product rules remain authoritative until the user changes them.
Declare the selected target journey and reference app for each pattern.
Record Exact / Adapted / Additive / Blocked / Excluded decisions before edits.

Preserve navigation destinations, parent restoration, keyboard placement,
loading/error/disabled states, nested-sheet hierarchy, motion entry order,
blur versus dim treatments, and artwork composition. Component choice must
support those contracts. Link every fidelity claim to an evidence ID/time.

Known tokens, chains, venues, companies, exchanges and auth/payment providers
use their actual logos/artwork. Do not replace BTC/USDC/chain/provider identity
with a generic coin, dollar, wallet, letter-disc or UI-library icon. Use correct
surface variants, preserve mark geometry and bind artwork to canonical entity
IDs. Distinguish asset marks, chain/venue badges, avatars and status checks.
Use generic icons for actions such as search/share/back. Create original
commodity/FX art where there is no universal issuer mark. Acquire production
artwork with provenance; evidence crops are not a production logo pack.

Select feature IDs for the full journey, including leverage/margin/risk,
usernames/validation, funding branches, profiles and social state where chosen.
Separate existing Senryo plan features from candidate additions. D-041 keeps
QR/address funding and no launch fiat ramp; D-029 defines passkey onboarding;
D-037 refines Face ID defaults; keep the planned hold-to-confirm behavior.

Pay special attention to C18/M06 (blurred staggered fan, final vertical list),
C01/M01 (moving hero with stable CTA), C15/M09/M10 (glass dock and header),
C33/M16 (funding child sheets), C39/C40/M14 (margin/leverage ticket), and
C42/M15 (risk sheet plus native keyboard).

Do not invent original libraries/fonts/rigs, sounds/haptics, a literal radial
arc, passkey creation, text-password flow, deposit/trade success, or unrecorded
security recovery. Do not reuse private recording data as functional fixtures.
Mark missing behavior Blocked and use the capture-gap list.

Validate the chosen journey with matching viewport recordings, screenshot
comparisons, state checks, back/dismiss recovery and motion comparisons.
Report what was implemented, what was adapted, what was tested and what
remains unverified. A good-looking static card is not proof of a complete flow.
```
