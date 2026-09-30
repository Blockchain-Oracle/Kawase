# Reference UX inventory: arc-agent screens, flows and components (checklist only)

Purpose: a flat checklist of the screens, flows, overlays and components that arc-agent designed or built, so the new product's UX can be checked for coverage. **Checklist only, not a recommendation to reuse any of it.** Abu says arc-agent failed and its approach was wrong; see `what-was-learned.md`.

Sources (all under `/Users/abu/dev/hackathon/arc-agent/`):
- `docs/design/2026-07-29-product-surface-map.md:155-224` (screens S00–S37), `:226-247` (entry rules), `:256-277` (typed panels)
- `docs/design/2026-07-29-product-surface-states.md:8-90` (state grammar, overlays, mobile/desktop)
- `docs/design/2026-07-29-product-flow-maps.md` (six flow maps)
- `docs/design/2026-07-29-design-doc.md:438-450,518-531` (authority moments, voice stage)
- `docs/research/2026-07-30-voice-confirmation-semantics.md:1-40`
- `docs/decisions/2026-07-29-voice-modality-and-language-scope.md`, `docs/decisions/2026-08-09-authenticated-experience-a06.md:150-160`
- `docs/design/coverage-audit.md:1-60`, `fable-lab/README.md`
- `apps/web/src/app/**/page.tsx`, `apps/web/src/features/**/*.tsx`, `packages/ui/src/read-renderer-registry.ts`
- `git status --porcelain` and `git ls-files`, run 2026-09-29

Verified: 2026-09-29

Legend: **Built** = a route or component exists in the working tree (it may be uncommitted). **Designed only** = specified in docs, no code found. Nothing was ever deployed, so "built" means "ran on localhost" at best [VERIFIED: `docs/brief.md:88-90`; no hosting config found].

---

## 1. Screens (S00–S37)

| ID | Screen | Built or designed | Where |
|---|---|---|---|
| S00 | Access: pre-compose a request, passkey sign up/in, recover, resume a draft | Built | `apps/web/src/app/signin/page.tsx`; `features/auth/{signin-experience,recovery-experience,pre-auth-composer}.tsx` |
| S01 | Agent and wallet readiness (funding, gas, custody) | Partly: inside Settings › account | `apps/web/src/app/settings/[section]/page.tsx:39,63` |
| S02 | Conversation workspace with inline cards, conversation switcher | Built (chat routes **untracked**) | `app/chat/new/page.tsx`, `app/chat/[conversationId]/page.tsx` (both `??`); `features/agent/conversation-workspace.tsx`; `features/shell/conversation-switcher.tsx` |
| S03 | Voice session: speech-to-speech, captions, barge-in, reconnect | Built | `features/agent/{focused-voice-layer,voice-session-control,voice-session-status}.tsx`; API `app/api/realtime/*` |
| S04 | Clarify and correct intent (old/new diff) | Designed; A-07 replaced clarification cards with editable write cards | `docs/design/2026-07-29-product-surface-map.md:100-103` |
| S05 | Inline prompt catalogue (search A–P goals) | Designed only | surface map row S05 |
| S06 | Capability explanation (why unavailable, per chain) | Partly: capability read panel | `features/surfaces/capability-read-panel.tsx` |
| S07 | Editable composed plan | Built as per-category editable cards (payment, swap) | `features/surfaces/{editable-payment-proposal,editable-swap-proposal,management-action-editor}.tsx` |
| S08 | Policy check and plan consent | Built inside the write card frame | `features/surfaces/{write-operation-frame,financial-action-summary}.tsx` |
| S09 | Wallet or mandate authorization ("hold to authorize") | Built | `features/surfaces/hold-action-button.tsx` |
| S10 | Live execution timeline | Built | `app/operations/[id]/page.tsx`; `features/surfaces/operation-workspace.tsx` |
| S11 | Receipt and "why" | Built | `features/surfaces/operation-receipt-view.tsx`; `features/proof/counterfoil.tsx` |
| S12 | Recovery workspace | Partly (Gateway removal only) | `features/surfaces/{gateway-removal-panel,gateway-removal-summary}.tsx` |
| S13 | Conversation history | Built (**untracked**) | `app/history/page.tsx` (`??`) |
| S14 | Contacts list | Designed only (contacts exist as management cards, no page) | handler `contact.create.v1` in `packages/application/src/capability-profiles.ts:30-36` |
| S15 | Contact detail and address versions | Designed only | surface map row S15 |
| S16 | Address warning overlay (first use, changed, mismatch) | Designed only | surface map row S16 |
| S17 | Portfolio | Built in Phase 7, then **deleted** by A-06 | `docs/handoffs/2026-08-06-phase7-money-activity-explore.md`; `docs/decisions/2026-08-09-authenticated-experience-a06.md:152-156` |
| S18 | Wallet or asset detail | Designed only | surface map row S18 |
| S19 | Crosschain route comparison and transfer | Built | `features/surfaces/crosschain-route-comparison-summary.tsx`; `app/api/crosschain/comparisons/route.ts` |
| S20 | DeFi action and position (swap, DCA, LP, vaults, lending) | Swap card only | `features/surfaces/editable-swap-proposal.tsx` |
| S21–S22 | Policy center and policy editor | Designed only (only a protected-floor card exists) | handler `treasury.floor.v1`, `capability-profiles.ts:42-44` |
| S23 | Automation center | Built | `app/automations/page.tsx` |
| S24 | Automation or mandate detail | Built | `app/automations/[id]/page.tsx`; `features/automations/*` |
| S25 | Trigger and run evidence | Built | `app/automations/[id]/occurrences/[occurrenceId]/page.tsx` |
| S26 | Treasury pots, budgets, forecast | Designed only | surface map row S26 |
| S27–S28 | Marketplace and service purchase | Designed only | surface map rows S27–S28 |
| S29 | Agent identity and discovery | Identity marks only | `features/identity/identity-registry.tsx` |
| S30 | Agent job and escrow | Designed only | surface map row S30 |
| S31–S32 | Contract workspace, function, monitor | Designed only | surface map rows S31–S32 |
| S33 | Notification inbox | Built (in-app only) | `app/notifications/page.tsx`; `features/notifications/notification-inbox.tsx` |
| S34 | Notification routes (push, **Telegram**, email, mobile), reminders, quiet hours | Quiet hours only; no external channel | `features/notifications/quiet-hours-form.tsx`; S34 row lists Telegram at `product-surface-map.md:210` |
| S35 | Account and wallet authority, revoke, sessions | Partly: account selection, authority revoke, sign out | `features/settings/{account-selection-button,authority-revoke-button}.tsx`; `features/auth/sign-out-control.tsx` |
| S36 | Language, voice and accessibility settings | Designed only | surface map row S36 |
| S37 | Memory and data controls (export, delete) | Designed only | surface map row S37 |

Count: of 38 screens, roughly 15 have a route or component, about 6 are partial, and about 17 are design-only [INFERENCE from the table above].

## 2. Flows designed (`docs/design/2026-07-29-product-flow-maps.md`)

- [ ] 1. Whole product in five destinations: Agent, Activity, Money, Automations, Explore (lines 7-50). **Superseded** by A-06's single chat plus Automations plus History (`authenticated-experience-a06.md:152-160`).
- [ ] 2. Core loop: one instruction → one plan → one authority chain (line 51).
- [ ] 3. Voice session: speech-to-speech, not dictation (line 67).
- [ ] 4. Money movement "DC2" composed flow: one plan, several real outcomes (line 81).
- [ ] 5. Automations with bounded unattended authority "DC3" (line 95).
- [ ] 6. Proof journey DC1 → DC2 → DC3 (line 109).
- [ ] New-user path: signed-out draft → passkey → readiness → the draft resumes once (`product-surface-map.md:91-95`).
- [ ] Deep links from notifications to the exact record (`product-surface-map.md:230`).
- [ ] Payment request / QR scan → parsed terms → normal plan path (`product-surface-map.md:235-237`). Designed only.

## 3. Interruptions and overlays (`product-surface-states.md:67-78`)

- [ ] Microphone permission, audio unavailable, privacy notice, typed fallback
- [ ] Critical-slot clarification with read-back
- [ ] First-use contact, changed address, pasted-address mismatch, full-address inspector
- [ ] Quote expiry, material plan change, consent invalidation
- [ ] Pause, cancel or revoke with effective time and in-flight exposure
- [ ] Payment request / QR, camera permission, parse failure
- [ ] Export, restore and delete confirmation
- [ ] "Unavailable / gated" explanation with a recheck

## 4. State grammar every screen was meant to have (`product-surface-states.md:8-22`)

Loading · Empty · Error · Success · Disabled · Offline/stale · Unsupported/gated. A per-screen state matrix exists for all 38 screens (`product-surface-states.md:24-65`).

## 5. Voice semantics (what was decided)

- Voice is the agent **speaking aloud**, not dictation; language follows the speaker, English default; multilingual lives inside voice, not as its own pillar (`docs/decisions/2026-07-29-voice-modality-and-language-scope.md:12-20`).
- One visible plan gets one consent; no second spoken "are you sure" (`docs/research/2026-07-30-voice-confirmation-semantics.md:5-12`). The trial found the agent re-asking after the user confirmed.
- State machine: LISTENING → RESOLVING → PLAN_PRESENTED → CONSENTED → AUTHORIZATION_REQUIRED/EXECUTING → SUBMITTED → TERMINAL; a material correction invalidates consent (`voice-confirmation-semantics.md:17-35`).
- **Speech cannot authorize, grant, execute, retry, revoke or change authority**; a click on the current card is required (`docs/design/2026-07-29-design-doc.md:447-449,529-530`).
- Voice object: a circular cobalt core with state ring (listening, thinking, speaking, interrupted, reconnecting); reduced motion replaces the pulse (`design-doc.md:518-525`).

## 6. Generative UI

- The design lists typed panels for payments (single, batch, split, QR, invoice, recurring), crosschain, swap/LP/vault/lending, policy, triggers, treasury, marketplace, agent jobs, contracts, notifications, timelines and receipts (`product-surface-map.md:256-271`).
- The model may not choose a component, amount, destination or authority; the app picks the renderer from a closed registry (`product-surface-map.md:273-277`).
- **What exists in `packages/ui`**: a read-renderer registry with **two keys** (`read.authority-list.v1`, `read.balance.v1`), and both render a `Placeholder` that returns `null` (`packages/ui/src/read-renderer-registry.ts:10-28`) [VERIFIED]. The real cards live in `apps/web/src/features/surfaces/` (about 17 files, listed in §1).
- A-08 "typed read-tool results plus a premium component system" was accepted on 2026-08-09 but barely built (`context/07-prior-work/arc-agent-overview.md:95`).

## 7. Visual explorations (`fable-lab/`)

- Three competing "living samples" of one moment: **Counterfoil** (accepted), Marginalia and Flight Check (rejected, deleted) (`fable-lab/README.md:1-40`).
- Counterfoil laws: speech zone vs ledger zone; cobalt only for voice; "hold to approve"; red reserved for granting standing authority (`fable-lab/README.md`; `design-doc.md:438-446`).
- `fable-lab/authenticated-workbench/` (conversation-desk, object-index, thread-ledger, mobile harness) was a "pending taste gate" (`docs/design/README.md:17-18`).
- Light theme only after A-06; dark mode was deleted (`authenticated-experience-a06.md:152`).

## 8. Explicitly removed in A-06 (2026-08-09)

Agent, Money, Activity and Explore pages; standalone Send/Swap/Bridge pages; the separate Voice panel; Quick Actions; sidebar; theme switcher; dark tokens (`docs/decisions/2026-08-09-authenticated-experience-a06.md:152-156`). Empty `apps/web/src/app/actions/{send,swap,bridge}` directories are left in the tree [VERIFIED: `find apps/web/src/app/actions`].

## Gaps

- I did not run the app, so "built" means code exists, not that it works today.
- I did not open the `fable-lab` HTML files in a browser.
