# Redesign opportunities — expressive identity attached to complete journeys

> **Reuse context:** This guide preserves the original Senryo example. Its D2/product decisions and existing-plan labels are historical, not rules for another app. Start with the [project handoff](PROJECT-HANDOFF.md).

[Study index](README.md) · [116-feature inventory](09-feature-inventory.md) · [Logos and identity](08-logos-and-identity.md) · [Motion and materials](04-motion-and-assets.md)

**Recommendation: keep Senryo's approved D2 Desk, give its entities real identity artwork, and improve the complete onboard → fund → trade → manage → spend journey with the observed motion and state patterns.** Use authored artwork to make important moments memorable. Add social mechanics only when they serve a chosen product purpose.

These are concrete design opportunities and candidate add-ons, not an approved new product specification or implementation. Existing-plan features are labelled accordingly. Competitor imagery supplies lessons about composition/materials; production Senryo artwork should be original and use Senryo identity.

## Three coherent ways to use the references

| Approach | What it emphasizes | What the user gains | Tradeoff / decision |
|---|---|---|---|
| **D2 journey polish — recommended foundation** | Actual asset/chain/venue marks, expressive first-use moments, crisp funding branches, leverage/risk hierarchy, context-preserving sheets | A recognizable account experience from first launch to a real outcome | Needs coordinated screens and states; an isolated attractive component cannot establish the journey |
| **D2 with a stronger illustrated story** | Solflare-style layered scenes and materials, Phantom-like living character behavior, Fomo-like atmospheric welcome | Product value and security feel tangible before the first transaction | Keep artwork out of the way once the user is entering money or reviewing risk; provide direct return/sign-in and static variants |
| **A social trading layer around D2** | Optional handles, curated follows, positions with thesis, friends discovery and eventual groups | People and instruments provide context for discovery and sharing | This changes product data and identity responsibilities: ranking definitions, visibility controls, follow behavior and the separation between a shared trade and the user's own position must be designed |

Use the first approach throughout and the second at meaningful milestones. The third is a candidate product direction, not an automatic inheritance of Fomo's feed, clans or leaderboard. Treat every candidate as a full journey rather than scattering social buttons into current screens.

## Opportunities by journey moment

Each row includes a source anchor, a specific idea and a completion criterion. “Existing” means already described in the current product plan; it does not mean shipped or verified live. All new visual compositions are proposals.

| ID / moment | Concrete idea and reference | Fit | Evidence required when built |
|---|---|---|---|
| OP01 · Awareness | **An original Senryo hero with meaningful layers.** A lacquer/foil card, original gold and silver objects, and authentic supported collateral/chain marks occupy separate depth planes; controls stay anchored. Learn from S01–S06/M01 and F01/M17. | Existing onboarding; new art composition | Loop and still frame explain the actual product; logo geometry stays readable; CTA remains stable during entrance and pending auth |
| OP02 · Awareness | **Show real instrument identity from the first introduction.** Supported crypto keeps its actual logo; commodities get consistent original material artwork. Names and instrument type accompany imagery. S03/S20/F32. | Identity requirement across existing journeys | XAU is not pictured as Tether Gold; company-associated instruments keep their perp/tokenized distinction; unsupported logos never imply support |
| OP03 · Awareness | **Tell the one-balance story visually.** A small authored composition connects funds, risk availability and the Kinpaku card rather than displaying three unrelated feature icons. Learn from S05/S18/F09. | Existing core product; original teaching scene | Story agrees with actual Free-to-trade/Free-to-spend/holds rules and honestly labels sandbox versus real card routes |
| OP04 · Consideration | **Useful browsing before account creation.** Market rows carry real identity, venue/session, leverage and honest price freshness; selecting one preserves the destination when the user creates/signs in. P13/F11/F32. | Existing browse/market plan; continuity adaptation | Unauthenticated browse, account handoff, back and destination restoration tested; unavailable/stale prices remain explicit |
| OP05 · Consideration | **First-use education that dismisses into the actual feature.** A compact card/risk primer teaches the location and next action using real product visuals. S16/S17/F11. | Existing card and risk journeys | First visit, returning visit, skip/dismiss and re-entry lead to correct destinations; tutorial illustration is not mistaken for an interactive menu |
| OP06 · Consideration | **A market-context panel that answers practical questions.** Asset plus venue identity, session, leverage limit, price age and explanatory content sit together. F32–F35/F43. | Existing risk/market context | Limits and freshness derive from actual market data; About content remains distinct from social feed and trading actions |
| OP07 · Decision | **A blurred action fan fitted to Senryo destinations.** Preserve live-background blur, staggered rising circles and plus→close transformation; settle into an intentionally designed arrangement. P19/M06. | New navigation pattern for existing actions | Every labelled action opens its own proper route; close restores context; no unrequested fiat action; actual recorded geometry is vertical, not a literal radial arc |
| OP08 · Decision | **A ticket that makes margin versus exposure unmistakable.** Prominent margin, secondary leveraged size, centered ruler, liquidation context and existing risk gauge work together. F37–F43/M14. | Existing trade plan; adapted hierarchy | Changing leverage preserves margin and updates all dependent values coherently; target's risk calculations and limits are used; retain planned 500 ms hold confirmation |
| OP09 · Decision | **Preview outcomes without losing entry state.** Allow a compact price/chart view within the ticket while margin/leverage and chosen asset remain stable. F39/F40. | Candidate interaction within existing trading | Keypad↔chart↔risk↔back preserves values/focus; chart styling controls are only added if they serve a clear need; no invented chart data |
| OP10 · Onboarding | **Passkey education with living art while waiting.** Original security object or character reacts subtly, with clear create/returning/pending/cancel/error states. S02/S11/P01/P04/P10. | Existing passkey journey; art adaptation | Real passkey and returning sign-in work; Face ID is labelled according to its role; pending animation never masquerades as completed account creation |
| OP11 · Onboarding | **Optional handle/avatar identity after useful setup.** Distinctive authored default avatar, editable handle, clear/check/pending/error states and a deliberate skip path. P05–P09/F04–F07. | Candidate social/account feature | Validation rules chosen explicitly; unavailable/invalid/submission failure handled; skipping still reaches a useful account; no claim a handle is already supported |
| OP12 · Onboarding | **Funding that makes the network hard to misread.** Real chain mark, network/environment text, asset identity and warning accompany the QR/address; nested choices have explicit back. S21–S27/F20/F21/M16. | Existing deposits; current QR/address policy | Correct Monad deposit family and supported assets; real scannable QR; clipboard feedback; pending/failed/credited timeline; resumes after leaving; no wallet connector or launch fiat ramp |
| OP13 · Value realization | **A restrained branded completion moment.** Original foil/fabric/object movement can accompany a confirmed outcome, followed by a precise receipt. S13/M18. | Existing receipts; candidate art treatment | Completion occurs only after the actual target status threshold; Pending/Filled/Settled remain distinct; background retry cannot trigger a false success flourish |
| OP14 · Value realization | **Keyboard-aware SL/TP with retained parent context.** Native risk inputs lift the child, suggestions remain readable, and edits return to the same ticket/position. F44/F45/M15. | Existing SL/TP; interaction polish | Invalid prices/percentages, save failure, successful save and later edit tested; suggestions respect side/market rules; no value loss when keyboard or sheet closes |
| OP15 · Value realization | **A quiet watchlist/alert return loop.** Actual asset artwork, selected state, alerts and restored market context help users return to relevant instruments. S20/P13/F10. | Existing watchlist/alerts; presentation adaptation | Saved state persists; empty/loading/failure states stay useful; alert permission/creation/removal/delivery have honest results; no simulated live movement |
| OP16 · Advocacy | **A shareable trade/receipt card with real identity.** Asset artwork, venue where applicable, user identity if opted in, instrument/direction, amounts and actual status form one coherent composition. F13/F14/F29/F32. | Candidate sharing composition around real receipts | Share preview and output match the real receipt; sensitive account data is omitted by design; original Senryo styling; no fake P&L or rank |
| OP17 · Advocacy | **An optional follow-with-context journey.** Explain why a person is suggested using the selected product's actual discovery signal; let users choose and later undo follows. F06/F30/P13. | Candidate social product | Onboarding selection, empty friends state, follow/unfollow, identity loading and profile visibility all work; displayed performance definitions are clear |
| OP18 · Advocacy | **Groups or challenges only after a clear shared activity exists.** A clan/group identity and actual asset cluster can make collective activity recognizable; use F29 and S20 as references for group/campaign composition. | Candidate product decision | Joining/leaving, permissions, membership, scoring, date context and unavailable state are specified; rewards or payouts are never promised solely by a decorative banner |

Awareness needs clarity and a reason to care; its friction is an abstract product story. Consideration needs enough truthful detail to evaluate, with browsing as the useful entry. Decision needs confidence about the action and its consequences. Onboarding needs successful account/funding setup without losing context. Value realization needs an actual outcome and a way to manage it. Advocacy needs something accurate and understandable to share. These are design hypotheses to validate, not personas measured from the screen recordings.

## Color, material and animation direction

Take **relationships** from the reference palette: Solflare's warm fields against black cards and silver art; Phantom's lavender foreground against blur; Fomo's cold raised surfaces, blue emphasis and bright directional states. The [sampled colors](04-motion-and-assets.md#approximate-visual-measurements) are compressed-frame estimates, not a replacement token file.

Apply those relationships within D2: lacquer surfaces, foil/metal artwork, generous contrast, an original softer field around onboarding art, and crisp transaction surfaces. Use authentic third-party identity colors or appropriate monochrome variants independently of app accent. A blue USDC mark and purple Monad identity should coexist with Senryo's gold; surrounding composition supplies unity.

Make the 3D/cartoon work specific. A hero brief should identify foreground/midground/background layers, silhouette, materials, shadows, reflected environment, mark placement, depth travel, expression and loop seam. A static image of “a crypto mascot” will not preserve the observed craft. For original assets, one designed scene can combine metallic gold/silver, matte surfaces and crisp token badges without copying Phantom's ghost or Fomo's figures.

Motion should explain state: source-to-child sheet, selected leverage, auth pending, verified completion and restored parent each have a different job. Use the [18 motion clips](04-motion-and-assets.md) to compare trajectory, stagger, settling and material changes. Proposed easing/durations remain proposals; network waits are not animation constants. Source sound/haptic behavior is unverified.

## Work packets for the next agent

1. **Identity packet:** canonical entity registry, authentic source assets/variants, provenance, small-size previews and loading/failure fallbacks; map every existing journey using the entity. Start with [38 registered identity/artwork entries](asset-identity-register.json).
2. **Journey packet:** chosen feature IDs, entry/return paths, state model, keyboard and data dependencies, actual target policies. Include happy, empty, pending, unavailable, error, retry and successful outcomes where applicable.
3. **Art/motion packet:** original approved composition with layer/material notes, loop/static version, trigger/dismissal, source clip IDs and declared adaptations. Keep it attached to the journey it serves.
4. **Acceptance packet:** actual viewport recordings, screenshot/motion comparisons, functional result and recovery evidence. Report reference fidelity separately from target live correctness.

## Copyable creative exploration prompt

The following uses the exact six-moment format from the local [brainstorming reference](source-context/journey-ideation-template.md) with this task's customer/product filled in. It is a reusable exploration prompt, not a requirement to add every generated idea.

```text
Map a crypto holder seeking gold exposure and daily spending's journey with Senryo:

Moment 1: Awareness - "I didn't know this problem existed"
- Generate 3 ideas for this moment: How do we create awareness?

Moment 2: Consideration - "I'm comparing options"
- Generate 3 ideas: How do we help them evaluate?

Moment 3: Decision - "I'm committing"
- Generate 3 ideas: How do we make decision easy?

Moment 4: Onboarding - "I'm getting started"
- Generate 3 ideas: How do we ensure success?

Moment 5: Value Realization - "I'm getting return on this"
- Generate 3 ideas: How do we amplify success?

Moment 6: Advocacy - "I'm telling others"
- Generate 3 ideas: How do we make them evangelize?

For EACH moment, consider:
- What does the customer actually need vs. what we think they need?
- What's the primary emotional state?
- What's the biggest friction point?
```

Attach source evidence to each result. Preserve D2 and current product rules. Actual entity marks/artwork are mandatory where known. Distinguish polish of an existing planned journey from a new product feature, and document unavailable/missing behavior rather than inventing it.
