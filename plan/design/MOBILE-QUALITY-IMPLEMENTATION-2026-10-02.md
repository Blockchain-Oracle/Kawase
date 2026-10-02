# Kawase mobile quality implementation

Approved by Abu on 2026-10-02: implement the full plan presented in this chat. Extends MASTER-PLAN.md, REVAMP-PLAN.md and COVERAGE.md; dependencies do not reduce scope.

## Approved decisions
- Retain Lime on Ink, the five-panel onboarding, quick-action fan, history sheet, and tab/orb spatial transitions.
- Repair native access with stage-specific tracing and recovery. Preserve successful sign-in stages, guest data, drafts and the initiating destination. No payment submission merely because sign-in completed.
- Primary onboarding action: “Try first, sign in later”; secondary: existing-account sign-in.
- UI-thread swipe tracking/settling; coherent art/copy/progress; 260 ms swipe settle, 420 ms automatic travel, 4.5 s dwell. Release-device evidence governs tuning.
- Native compact input expands on focus/content, preserves drafts, shares keyboard clearance, hides the dock while typing, and exposes Stop during generation.
- Durable turn identities, per-thread execution serialization, incremental conversation persistence, and recovery without repeating money actions.
- Compare GPT-Live client delegation, Scribe + Eleven v4 Turbo, Scribe + OpenAI TTS, and the current Flash baseline. Do not select production voice from vendor claims. Financial wording/outcomes, ten languages, phone latency and naturalness are acceptance gates.
- Narration opt-in; quiet meaningful effects respecting silent mode; separate sound/haptic/narration controls. LiveKit owns communication audio. Raw audio is not retained by default.
- Finish all A–U coverage, all remaining platform/docs/landing deliverables and mainnet checks. Another project's feedback supplies design principles, not features.

## Execution and evidence
1. Access and guest recovery.
2. Onboarding/composer/keyboard/history quality.
3. Conversation execution/persistence integrity.
4. Measured voice comparison and audio preferences.
5. Remaining authority, money/contacts, notifications/automations, portfolio/routes, business/x402, intelligence, trust/history/privacy, and platform deliverables in MASTER-PLAN dependency order.

Record exact checks, revisions, build, platform and network. Implemented, simulator-checked, device-checked, deployed and accepted are separate. Native R08 and R11 are reopened by Abu's TestFlight recording; the authentication failure phase is not established yet. Keep pending items in COVERAGE.md rather than declaring completion from a build or screenshot.

## Acceptance
Targeted integration checks for uncertain authentication, persistence and provider behavior; manual recorded journeys for visuals. Include fresh/returning/social/email access, interrupted/reversed gestures, RTL/large text/readers/reduced motion, keyboard/drafts, duplicate/concurrent turns, cancellation after a submitted payment, voice interruptions/reconnect/headphones, and truthful pending/confirmed network-specific results. Simple warm voice response target: median 1.5 s to audible useful words; barge-in silence target: 300 ms. Filler does not count.

## Progress
- 2026-10-02: implementation started from clean revision 22388c9. No repaired behavior is device-accepted yet. Existing scope remains required.
