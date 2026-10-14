# Senryo flows and UX engineering — what Kawase should copy (2026-10-14)

Repo: /Users/abu/dev/hackathon/metropolis (read-only). Cost of everything below: nothing to run, nothing bought. Tags: VERIFIED (seen in code/docs just now), REPORTED, IDEA (mine).
Paths: `m/` = apps/mobile/src, `pc/` = packages/calls/src, `D/` = docs/product.

## 0. Read this first: what Senryo is today
- VERIFIED: Senryo pivoted on 8 Oct to one product, live Up/Down "calls" on price windows (docs/plan/pivot-2026-10-08.md). Swap, bridge, card, perps and Ramp were **deleted from code**. Their flows survive only as a spec: `D/flows/b-money.md`, `c-trading.md`, `d-earn.md`, `routes.md`. Treat those as the best written flow spec for Kawase's money journeys, not as running code.
- VERIFIED still in code: onboarding story, setup, Home, trade terminal, one-tap session, Withdraw, Receive, Earn, receipts, sheets, dock, live data, offline, intent journal, web app sharing the same logic.
- design/DIRECTIONS.md is marked SUPERSEDED (top of file). Do not take rules from it.

## 1. Flow inventory

**Onboarding (value first, sign last)** — m/features/onboarding/{Story,scenes}.ts, m/features/auth/WelcomeActions.tsx, m/features/setup/setup-order.ts
- Five full-screen story scenes (call, payout, passkey, pool, two modes), art in four parallax layers + one headline + one sentence each (scenes.ts). Swipe travels with the finger. Sound per settled scene (D/README.md §0.9 "Story").
- Fixed action area under the story: Create account (primary), I have an account, "Look around" (text). Returning phone: big avatar + @handle + "Continue with Face ID". Welcome is marked complete only after a real passkey success or "Look around", never on the tap (WelcomeActions.tsx header).
- Guests can trade first: a Practice guest's first tap makes a device key and signs in silently (pc/guest.ts); test dollars follow when they create a passkey (`useGuestSweep`). This is the strongest "value first" move in the repo.
- Setup after the passkey: handle, terms (over Home), test dollars, **first call in the live terminal** ("the first call is the celebration, no done page"), one-tap, notifications, Face ID primer (setup-order.ts). Setup is owed from the moment the passkey succeeds, so it resumes after a kill.
- Waiting: skeletons, never a fake $0 (D/README rule 9); "Signed in as @handle" moment then Home with skeletons.

**Home** — m/features/home/HomeScreen.tsx: balance as a rolling figure, one-tap chip, open positions live with Cash out, live markets, search launcher floating above the dock. Guests see the promise plus the same live markets.

**Trade open / close** — m/features/terminal/ActionPanel.tsx, pc/use-call-flow.ts, pc/trade-run.ts
- Tap UP/DOWN: a pending object appears at the tap ("Signing…", what was quoted), then "Waiting for the fill" with a short request id, then the position row replaces it. One toast per trade carries through the whole run by one id: "Opening Up…" becomes "Up BTC opened"; "Cashing out…" becomes "Realized +$1.24" (pc/toast-run.ts).
- One plain sentence explains why buttons are held (call in flight, lockout, stale price, no opening price) instead of a disabled button with no reason.
- Close: m/features/positions/usePositionClose.ts, fail path says "Couldn't cash out" + "Nothing changed." or "It's still open."

**Withdraw / send** — m/features/wallet/WithdrawSheet.tsx: recipient (paste/type, checked), exact amount with Max, a review that freezes the request, one Face ID, gasless EIP-3009 transfer via relay, receipt that stays. Full designed version (never built after pivot): D/flows/b-money.md B7/B8 — recipient search with Paste + Scan, recents, asset picker over all holdings, review with slide, receipt, Activity row.

**Add money** — only a spec now: B4 (other chain: asset → source-chain grid filtered to valid routes with fee/ETA/min → quote → deposit address + QR → timeline Sent → Bridging → Arrived), B5 (card/bank: asset → fiat amount → provider page → "Arriving" row → push). "Cancelled in provider: silent return, nothing recorded." Arrival is detected by holdings, not provider status (b-money.md B5).

**History / receipts** — m/features/receipts/*, a slip per finished trade ("Just finished" until dismissed, pc/trade-run.ts), share image (ShareSlip, useSlipImage). Activity spec: All · Trades · Money segments, subject-mark rows, pending rows with spinner, tap opens receipt sheet (README §0.9 "Activity").

**Settings / session** — m/app/(sheets)/{session,step-up,network}.tsx. Step-up sheet says what is being approved, one fresh Face ID read, cancel is silent.

## 2. UX engineering techniques (all VERIFIED unless marked)
1. **Gate + resume, not login wall.** `useTermsGate()` wraps every money action: signed-in and terms accepted runs at once; guest gets the account sheet carrying `{verb, next}`; after the account exists it opens the original action once (m/lib/account/terms-gate.ts, m/app/(sheets)/account-required.tsx). New account first runs owed setup; the action waits as `PENDING_LINK` in storage and `DeferredLinkHost` opens it when setup ends (m/components/shell/DeferredLinkHost.tsx, m/lib/incoming-link.ts). Deep links needing an account use the same path; links in `next` must start with "/" (open-redirect guard).
2. **Sheet host + routes.** One root portal draws every sheet above the dock and headers (m/components/sheet/SheetHost.tsx); route sheets are native transparent modals rendered in place (`SheetRoute`, `SheetInPlace`); detents 0.62/0.88/1 (sheet/constants.ts); an open sheet holds the dock hidden through a holder set (shell/dock-context.tsx `SHEET_HOLD`); `leaveSheetRoute()` goes back or to `/` on a cold deep link. Web equivalent: URL-held drawers `?d=wallet|receive|withdraw|oneTap…`, lazy islands preloaded when idle, Back closes (apps/web/src/components/shell/DrawerHost.tsx).
3. **Intent journal (idempotent, crash-safe).** After signing and before sending, each trade writes digest + words + toast id to MMKV (pc/intent-journal.ts, max 20, 24 h). On next launch `useIntentRecovery` reads status **by digest only**, never resends: unknown → checking → filled/refused, with toasts like "it went through while the app was closed" / "never reached us" and a "Check status" action (pc/use-intent-recovery.ts). Reviewed intent is immutable; failures go back to review; unknown outcomes offer no new action (m/…/ui-agent-brief.md "Money truth").
4. **Draft in the tap.** Pending trade object appears instantly (optimistic) but is labelled as signing/pending, not as done; row replaces it only when the stream says filled (trade-run.ts).
5. **One live stream.** One SSE connection per app, 5 s silence kills a half-open socket, jittered backoff, `Last-Event-ID` replays missed fills/results, closes 60 s after backgrounding, reseeds from a ~1 KB `/latest` on reconnect (packages/live/src/sse.ts, live.ts). Prices never wait on the user ticket.
6. **Zero re-renders per tick.** `LiveText` drives a read-only TextInput from a shared value; `LiveOdometer` rolls digits in Skia on the UI thread; hidden balances show "••••" (m/components/kit/{LiveText,LiveOdometer}.tsx).
7. **Server clock.** NTP-style offset from `GET /v1/time`, best of last 5 samples, resampled each minute; countdowns and the 20 s lockout use it (packages/live/src/clock.ts, m/lib/use-clock-offset.ts).
8. **Prefetch/warm.** After launch, unvisited tabs mount one at a time 400 ms apart; hidden tabs sleep behind React `Activity`, terminal stays live (m/app/(tabs)/_layout.tsx `useWarmTabs`). Story scenes prefetch a ±2 window (README §0.9). Web: drawers preload on idle.
9. **Offline.** Banner "You're offline", cached values stay marked stale (not "failed"), TanStack `onlineManager` pauses/refetches, warn haptic once (m/components/shell/OfflineBanner.tsx); money slide shows an OFFLINE blocker (D/flows/g-system.md G3). Failure copy table with "why + what still works" (m/lib/copy/diagnosis.ts).
10. **One-tap session** (answers the owner's "no Face ID after every action"): one Face ID signs a grant naming a fresh device key plus a permit for the session cap; later calls need no prompt; caps enforced on chain; chip shows "One-tap on · 12 min · $76 left"; ending signs a Revoke (pc/one-tap.ts, m/features/home/OneTapChip.tsx). Above-cap actions still step up. Kawase's delegation allowance is the same idea; copy the **visible chip with time + amount left**.
11. **Web/native parity by construction.** All flow logic is in shared packages (`@senryo/calls`, `/query`, `/live`, `/config`); apps only draw. One nav source `DOCK_NAV`/`WEB_RAIL` in packages/config/src/nav.ts feeds the phone dock, web rail and the <768 px web dock; an invariant script checks nav routes exist (`node scripts/invariants/run.mjs`). Web has desktop rail + Everything drawer + keyboard shortcuts (apps/web/src/components/shell/{Rail,EverythingDrawer,ShortcutsModal}.tsx).
12. **Feedback.** One call site `fire("tick"|"filled"|"win"|…)` = haptic + optional cue, user-controlled volumes in MMKV (m/feedback/fire.ts). Slide-to-confirm commits once past 90 %, resets on background or changed reviewed intent (m/components/trade/SlideToConfirm.tsx).

## 3. Plus fan and dock
- Current dock (VERIFIED m/components/shell/Dock.tsx): icon-only glass rail Home · Markets · seal (centre, = Trade) · Calls · More, no labels (VoiceOver reads them). Hides when a sheet opens or the keyboard shows (slides 120 px, `TIMING.selection`). Tabs are retained stacks; tapping the focused tab does nothing; `fire("tick")` on change.
- **The plus fan no longer exists in code**: ActionFan.tsx and useFanActions.ts were deleted in commit ad694498 (UGLYCASH revamp, 7 Oct); still recoverable with `git show ad694498^:apps/mobile/src/components/shell/ActionFan.tsx`.
- How it worked (from that file, VERIFIED in history): a plus beside the dock; tap opens a strong live blur + scrim; four circles (Send · Receive · Add money · Swap) rise and scale from the plus into a right-hand column, 72 pt apart, labels to their left; plus rotates to ×; per item 200 ms, 25 ms stagger, spring with overshoot only on the lead item (Send); backdrop 160 ms; exit in reverse; Reduce Motion = ~100 ms crossfade; Reduce Transparency = opaque backdrop; dismiss by ×, backdrop or Android back restores the page untouched; picking an action closes the fan then opens the destination **over the same page**; every action passes the terms/account gate first; fan hides with the dock. Docs say the user liked it and kept labels (README §0.9 "Plus fan"); later "removes unnecessary duplication of fan actions" (current-product.md).

## 4. Their flow rules (docs)
- D/README.md §0.5 (12 cross-cutting rules): any holding any action (disabled rows say why in ≤4 words); any amount (units↔$, Max net of fee, "Available · locked ›" link); any destination (handle, address, scan, saved, chain picker filtered to valid routes); **one intent, one confirmation** (compose swap → move → act, journal each step, `partial` outcome offers Finish, never resends); every money action = review → slide → status → receipt → Activity → push; every list item opens a detail; real marks everywhere, unknown = monogram + "Unverified"; four states per screen (skeleton, empty with next action, error with reason + action, offline); everything async is trackable and resumes after kill; confirmation levels stated.
- docs/product/ui-agent-brief.md: copy budget (no sentences on primary screens; row = title + ≤1 short subtitle; explanations behind ⓘ), rows not boxes, one hero per screen, press scale 0.97, 30 ms stagger once per mount, never say "gas".
- Method `product-how-tree` (README §0.1): objects × verbs matrix with a symmetry rule, how-ladder lenses (Entry, Which, From→To, Who/When, How much, How, How long, What if, After, Consistency), surface pass "before → after → why", two-way trace. Kawase already has the skill listed.
- Owner rules in 00-context.md (one hero, value first, no scroll to action) match these.

## 5. Kawase journey → Senryo flow to copy
| Kawase | Copy this | How |
|---|---|---|
| Onboarding | `features/onboarding/*` + guest key (`pc/guest.ts`) + `setup-order.ts` | Scenes with art + one sentence; "Look around" first; let a guest ask the agent something and do a testnet action on a device key; sign-in only at the first real money step via gate/resume. Last setup step = first real agent action, not a done page. |
| Agent chat/home | `trade-run.ts` + `toast-run.ts` + `HomeScreen` | Every agent action becomes one object from tap: "Signing…" → "Waiting" → result, in place by one id; Home = live balance (LiveOdometer) + chip + open items; agent's blocked reason as one sentence above the input (ActionPanel `noticeOf`). IDEA: show the agent's step list as the same pending object. |
| Swap | D/flows/b-money.md B6 | You pay / flip / You receive cards, one line rate · impact, Details with **route marks**, impact >1 % amber, >5 % blocks and shows max; quote TTL ~30 s auto-requote; "Price moved · review again". Kawase already ranks 3 venues: put logos in Details and let tapping a row pick (spec shows marks only). |
| Bridge / move | B4 + B0.3 | Asset picker, destination chain grid **filtered to valid routes** with fee/ETA/min per tile, quote rows with provider logo, timeline Sent → Bridging → Arrived, journal record per route so it resumes after kill; degraded provider banner "X paused · using Y". |
| Buy | B5 + UGLYCASH U02 note | Method sheet → amount → provider → "Arriving" row → arrival from balance change + push. Cancel = silent return. Their own note: provider checkout "cannot be reskinned as an app-owned clone" — the owner wants our own look, so keep our shell (amount, method, arriving row, receipt) and let only the pay button/widget be the provider's. |
| Send | B7 + `WithdrawSheet.tsx` | Bottom search (handle/address) + Paste + Scan + recents; unknown name → inline "not found, paste address" state ("@kai isn't on this network"); checksum, contract, first-send warnings; review freezes; unknown outcome never resends. |
| Earn | D1 | Row per venue with logo + APY + arrow; deposit sheet with "Pay with ⌄" over all holdings, presets $10/$25/$50/Max, Details lists composed steps, "Cap left" blocks before slide, $1 floor. |
| Perps | `terminal/*` + web `terminal/*` | Side-by-side phone vs desktop: same `@senryo/calls` hook, two layouts; positions list with Cash out; pending object; lockout/stale sentence. Desktop: rail + drawers. |
| Marketplace (x402) | Markets list + Everything drawer pattern; D/README §0.9 "Markets" | Chips filter + search + row = mark, name, price; detail with sticky action; one dismissible intro card. IDEA: per-call price shown on the row, cap from the allowance chip. |
| Approval / no repeated Face ID | one-tap (`pc/one-tap.ts`, OneTapChip, step-up sheet) | Chip with time + amount left; step-up only above cap or for security changes; sheet states what is approved; cancel silent. |
| Resume / links | DeferredLinkHost + PENDING_LINK | Same pattern for "send $10 to Alex" asked before sign-in. |
| Web parity | packages/config nav + shared hooks | One nav array; keep logic in packages; web uses `?d=` drawers so Back works. |

## 6. Cautions
- No code here is cheap to lift verbatim: it is Reanimated 4 + Skia + MMKV + expo-router/ui. Kawase already runs Expo, so ports are mostly file copies plus token changes.
- Swap/bridge/buy flows are specs from 2 Oct; some sections say "Today → gap" and "UNDEFINED", so check each against Kawase's own routes.
- No prompt-injection text found in the files read.
