# 08-product-research — the Arc AI agent app

Purpose: research for Abu's product, an AI agent for the whole Arc ecosystem (iOS, Android, desktop, web; mainnet and testnet; voice, multilingual, automations, contacts, notifications, generative UI). This is research only; architecture is decided later, in plan mode.
Sources: the folders below. Raw evidence is in `../../.firecrawl/product/`.
Verified: 2026-09-29

## Read in this order

0. `ABU-BRIEF-VERBATIM.md`: everything Abu said, word for word.
1. `DECISIONS-FROM-ABU.md`: binding decisions and open questions.
2. `00-SYNTHESIS.md`: the ten facts that shape everything, stream conflicts, constraints, options, risks.
2b. `SMART-PRECONDITIONS.md`: "resolve and resume" — the "very smart" handling of missing setup, limits and ambiguity (Abu's core UX rule), research-checked.
3. `FEATURE-INVENTORY.md`: the complete feature surface (groups A–R), with mainnet/testnet feasibility.
4. `USER-FLOWS-INDEX.md`: 16 written flows, 17 still to write, and 17 more from the reference studies (F34–F50).
5. `CODEX-REVIEW.md` (Codex's independent review) and `REVIEW-RECONCILIATION.md` (Claude's point-by-point response + fixes applied).
6. `CODEX-REVIEW-PROMPT.md`: paste into Codex for an independent review. It writes `CODEX-REVIEW.md` here.

## Research streams

| Folder | Question it answers |
|---|---|
| `01-arc-ecosystem-census/` | What exists on Arc: Arc House, apps, DEXes, bridges, launchpads, x402, tokens, wallets, infra |
| `02-defi-bridge-trade/` | What can actually be swapped, bridged, earned, and traded, per network, via which API (live quotes) |
| `03-wallets-custody-limits/` | Wallets, custody, delegated authority, and spending limits on Arc (on-chain verified) |
| `04-analogs-and-competitors/` | Bankr, AI crypto agents, Telegram bots, fintech UX; feature inventory; incidents |
| `05-voice-language-genui/` | Voice vendors, i18n, voice safety, generative UI, memory, LLM choice |
| `06-mobile-desktop-platform/` | Expo, desktop, store policy, mobile capabilities, backend jobs, notification channels |
| `07-automations-contacts-safety/` | Automations, contacts and names, limits, notifications, history, **user flows** |
| `08-arc-agent-baseline-and-fit/` | Reference projects (lessons, not templates) and hackathon fit |
| `09-voice-decision/` | Voice stack decision for major languages; keeperhub voice review |
| `10-reference-flows/` | Product flows from Abu's Shijima and Agari repos: onboarding, faucets/starter funds, practice mode, trust and exit |
| `11-blocked-actions-research/` | What the "can't do that yet" pattern is called and how UX standards, APIs, voice assistants and agent frameworks handle it |
| `12-network-toggle/` | Mainnet ↔ testnet toggle "like dark mode": UX precedents (MetaMask, Rainbow, Stripe), libraries (viem `arc`/`arcTestnet`, Circle TEST/LIVE keys), recommendation |
| `13-deployment-coolify/` | Coolify (v4.3.23) on Abu's server: read-only inspection, monorepo deploys (one app per service), DBOS for automations, LiveKit Cloud + voice worker on Coolify |
| `14-ui-and-docs/` | 21st.dev (web only) + React Native Reusables/Uniwind for native, shared shadcn tokens; Fumadocs 16 for docs |
| `15-existing-products-tour/` | What exists and how it looks: Arc Portal, Circle Agent Stack, Bankr, sample apps, past winners, 8004scan; the whitespace |
| `16-naming/` | 27 Japanese candidates, dictionary-checked; availability; shortlist (Kawase, Kanegura…) |
| `RESEARCH-RULES.md` | The evidence rules every file follows |
