# Stage 2: three home-screen directions

**Superseded (2026-09-30, D34/D35):** after building Koe, Abu did not like the colours and design intention; the UI is being revamped as "Lime on Ink" from the reference study (`plan/design/REVAMP-PLAN.md`). This file and `directions/` stay as history.

**Decision (2026-09-30): Abu chose C, Koe, and said he likes its colours.** Claude's recommendation below (A as the base) was not taken. `DESIGN.md` and `packages/ui-tokens/tokens.json` now hold Koe only.

Purpose: the three design directions Abu chooses from, with what each one is, what differs, the risks, and Claude's recommendation.
Date: 2026-09-30
Sources: `DESIGN.md` (token values and fixed rules), `packages/ui-tokens/directions.json`, the 21st-ui-explore and premium-ui skills, 21st.dev search results (picks listed in `plan/stages/02-design-system-component-sourcing.md`).
See them: screenshots in `plan/design/directions/`. The preview page that rendered them is kept for reference at `plan/design/reference/directions-preview.web.tsx` (it is no longer a route in the app).

All three use the same content, the same installed 21st.dev components, the same token names and the same four themes (light, dark, and a testnet layer on each). They differ in what the home screen is, how much it shows, how you get around, and the look.

## A. Tegami (手紙, "letter"): conversation-first
- Idea: the home screen is the conversation. Money appears inside it as receipts.
- Effect on the user: nothing to learn; say or type what you want.
- References: Prompt Input (@ibelick), Chat Bubble Thread (@bundui), AI Suggested Actions (@elements-), Order Confirmation Card (@kavikatiyar); themes Vintage Paper and Vermilion Clay (@serafimcloud) as palette seeds.
- Differences: hierarchy (conversation first, balance is a small pill), low density, one thread with the rest in a drawer, light paper look with a serif display face.
- Risks: long threads need good search and pinned receipts; people who want to see their balance first have to look for it.
- Best for: first-time users and the "agent you just talk to" story.

## B. Chōba (帳場, "the ledger counter"): wallet-first
- Idea: the home screen is your money (balance, actions, activity). The agent is a command bar that is always one tap away.
- Effect on the user: familiar; everything is visible without asking.
- References: Wallet Card 2 (@beratberkayg), Activity Feed (@felipemenezes098), Segmented Control (@ddoemonn), Bottom Menu (@0xUrvish), Prompt Input (@ibelick); themes Indigo Mono and Graphite Mono (@serafimcloud).
- Differences: hierarchy (balance first, agent second), high density, five tabs, dark ledger look with mono numbers.
- Risks: it looks like other wallet apps, and the agent (the point of the hackathon) is the least visible of the three.
- Best for: small businesses and people who check balances and activity many times a day.

## C. Koe (声, "voice"): voice-first
- Idea: the home screen is the orb. You talk, captions show what was heard, and cards rise from the bottom to be confirmed.
- Effect on the user: hands-free; the strongest first impression.
- References: Voice Powered Orb (@isaiahbjork), Response Stream (@ibelick); theme Amber Mono (@serafimcloud).
- Differences: hierarchy (the orb first, everything else hidden), very low density, one stage instead of tabs, dark look with a single amber light.
- Risks: it depends on voice quality, and the voice spike (#5) has not run yet; it is weak in noisy places and for judges who open the web demo without a microphone; history, contacts and automations need a second navigation model anyway.
- Best for: the demo video and accessibility.

## Recommendation (Claude's, for Abu to accept or overrule)
**Tegami as the base, with Koe's orb stage as its voice mode.** Tapping the microphone in Tegami opens the orb stage; the rest of the app stays a conversation.
- Why: the conversation and its cards are the core of the build (Stage 4), so this direction has the least extra work; it works the same typed or spoken, so it does not depend on the unfinished voice spike; and a calm paper look is unlike the dark wallet apps the judges will see all week.
- Cost: balance and activity are one tap away instead of on the home screen. Chōba's dense activity list can still be used for the Activity screen.
- If Abu prefers Chōba or Koe as the base, the token names and components stay the same; only `tokens.json` and the home layout change.

## After the choice (done for steps 1–3 on 2026-09-30)
1. The chosen set in `directions.json` becomes `packages/ui-tokens/tokens.json`; the other two are deleted, along with `apps/mobile/src/dev/` and the temporary "Directions" tab.
2. `DESIGN.md` loses its "draft" label and the two unused directions.
3. The decision is recorded in `packages/ui-web/.21st/design.json` and `plan/STATUS.md`.
