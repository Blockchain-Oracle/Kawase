# Gaps and bugs (money and safety first)

Purpose: what is wrong or missing today against `capability-matrix.md`, with file:line, in fix order. Each row closes in the slice named.
Sources: the explorer surveys and fact sheets of 2026-10-02, the Release simulator repro.
Verified: 2026-10-02

## Money and safety
| # | Gap / bug | Where | Fix | Slice |
|---|---|---|---|---|
| G1 | **Earn can steer deposits into vaults you can't exit.** Galaxy/Keyrock USDC have $0 / $392 withdrawable out of $90M / $75M; the code filters by asset and sorts by APY | `packages/integrations/app-kit/src/earn.ts` (filter at :54) | filter and rank by withdrawable liquidity; surface `low_liquidity`; show "withdrawable now" | A0 |
| G2 | **Sign-in fails in every Release build** (TestFlight 4/5): the code stage fails in 29 ms, a local JS error before any network call; likely polyfill order (LiveKit `registerGlobals` creates `global.crypto` without `getRandomValues` before `react-native-get-random-values` loads) | `apps/mobile/src/app/_layout.tsx` import order; `wallet/wallet-provider.native.tsx:2` | polyfill-first native entry; a single `TurnkeyError` copy; the error chain logged; `POST /client-events` beacon | Phase 0 (`signin-fix`) |
| G3 | Across is hard-coded `not_on_arc`, but it routes Arc both ways | `apps/api/src/bridge/compare.ts` (`across()`) | real quotes + execution | A0 / B6 |
| G4 | deBridge receives `0x3600…` for Arc USDC; it needs native `0x000…0` | `apps/api/src/bridge/compare.ts` | address mapping per provider | A0 |
| G5 | Assets are hard-coded to USDC/EURC everywhere | `packages/money/src/assets.ts:10`, `apps/api/src/swap/routes.ts:11`, `swap/service.ts:74`, requests, the incoming watcher | the asset registry + discovery (R1) | A0 |
| G6 | Bridges and rules send to the user's own address on other chains, which Kawase can't see or move (stranded funds) | `apps/api/src/bridge/service.ts:198-253`; rules | the portfolio reads every supported chain; Bring to Arc | A1 / B6 |
| G7 | No withdraw flow at all; "withdraw" means only the Earn vault exit | `screens/earn-screen.tsx` | Withdraw hub (`surfaces.md`) | A2 |
| G8 | Pause all is enforced by policy, but nothing can set it | `paused_all_at` (policy) | route + tool + Wallet & limits switch | A3 |
| G9 | The audit table exists but is never written | `packages/db` audit schema | the audit writer on every write | B10 |
| G10 | The receive QR encodes a bare address; the request QR has no amount or asset | `screens/receive-screen.tsx:120` | the request QR as EIP-681 with amount, asset and chain | A2 |

| G22 | Aave V4's ERC-4626 USDC wrapper holds only ~4,040 USDC (live read), too shallow as the default yield path | `0x42EAB6…eB83` | supply through the Main Spoke by `reserveId` | B1 |
| G23 | MASTER-PLAN gate 12 assumes plain EIP-3009 x402 payments, which reach only 76 of 2,136 Arc listings | `plan/MASTER-PLAN.md` (gate 12) | Gateway nanopayments via `@circle-fin/x402-batching` from a per-user agent wallet | B2 (x402) |
| G24 | Apple Pay / Google Pay / debit in Onramp Kit need our domain in Circle KYB `web_url`; Onramp Kit has no sandbox, so every session is real | external (Circle Console) | Codex prompt: register the hosted onramp domain in KYB; test with small real amounts | B1 |
| G25 | Census figures are out of date: 687 → 2,136 x402 listings; ~332 → 1,373 ERC-8004 agents | `01-arc-ecosystem-census/apps-and-protocols.md` §11–12 | update the census | docs |

## Experience
| # | Gap | Where | Fix | Slice |
|---|---|---|---|---|
| G11 | Onboarding swipe hitch: `setDragging` re-renders at swipe start; `Gesture.Pan()` is recreated on every render; Drift remounts the art; the copy cross-fades instead of travelling | `ui-native/.../story-shell.tsx:278-314`, `screens/story-screen.tsx:103`, `onboarding/story-panels.tsx:93-99,218,245` | plan §1.1 | Phase 1 |
| G12 | Chat is a plain ScrollView with no markdown; the 10-row capabilities dump; tiny chips | `chat/conversation.tsx:191-325`, `chat/tool-cards.tsx` | plan §1.2–1.3 | Phase 1 |
| G13 | Voice: plugin default ElevenLabs voice, no tuning, only the agent's last line shown, orb driven by React state per volume tick | `apps/voice-agent/src/main.ts:272-286`, `voice/voice-session.tsx:158-214` | GPT-Live (plan §1.4) | Lane C |
| G14 | One haptic in the whole app; one sound | `apps/mobile/src/feedback/*` | the sound and haptics kit (§1.5) | Phase 1 |
| G15 | The dock has no trading home; Contacts and Automations are only reachable through Settings | `dock/dock-tab-bar.tsx`, `screens/settings-screen.tsx` | `surfaces.md` shell | Phase 1 |
| G16 | Settings shows 7 "Coming" rows | `screens/settings-screen.tsx` | each becomes real in its slice | various |
| G17 | Web voice says "Voice is on its way" | `voice/voice-session.web.tsx` | the LiveKit web client | Lane C |

## Docs and process
| # | Gap | Fix |
|---|---|---|
| G18 | Telegram/Discord still appear in F12, F22, F28, F45 and SMART-PRECONDITIONS after D31 | remove |
| G19 | Three default allowance numbers across docs and code | one rule (`decisions.md` X3) |
| G20 | F17–F33 were never written step by step | superseded by `cards/*` |
| G21 | A concurrent Codex session wrote untracked files after its handoff (`apps/api/test/capability-reply-eval.ts`) | Abu to stop Codex on this repo; the files are left untouched |
