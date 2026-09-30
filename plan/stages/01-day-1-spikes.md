# Stage 1: Day-1 spikes

Purpose: a stage of the Kawase build. Source of truth for scope is `plan/MASTER-PLAN.md`; decisions are in `context/08-product-research/DECISIONS-FROM-ABU.md`.
Status: in progress (#2, #3, #4, #6, #7, #8, #9, #10, #11, #13 testnet, #14 done; see STATUS.md)

## Scope (from the master plan)
Each spike is recorded in `plan/spikes/`, with evidence and a decision.

| # | Spike | Pass | Fallback |
|---|---|---|---|
| 1 | Circle UCW RN SDK 2.2.5 on an RN 0.87 / Expo 57 dev build (iOS + Android; Android Maven PAT) | PIN user created, challenge executed | Circle web SDK in a DOM component for challenges |
| 2 | UCW PIN user keyed by our id under the TEST and LIVE keys; EOA on ARC/ARC-TESTNET; **`signTypedData` challenge**; DCW entity secret per environment | typed-data signature verifies with viem | Webhook-verified tx-less challenge |
| 3 | App Kit `createCircleUserWalletAdapter` `onChallenge` for swap, bridge and earn: challenge count, idempotency keys, whether calldata can be prepared | a swap + bridge completes on testnet | Executor-run App Kit op with signal wait + `refId` reconcile |
| 4 | **Delegation** (the kickoff's "limits the agent can't exceed"): HybridDeleGator owned by the UCW EOA; delegation signed by the UCW; redeemed by the DCW. Tests: pass, pass, period-exceeded fail, wrong recipient fail, wrong token/method/native-value fail, expiry fail, `disableDelegation`, leaked-worker-key worst case. Testnet first, then **$1 on mainnet**; tx hashes recorded; verify the deployed source and audit scope | every negative test reverts on both networks | Architecture A (DCW allowance + app limits, labelled as such) |
| 5 | LiveKit RN 3.0.0 on RN 0.87; `llmNode` override streaming from the api; RPC round trip; p50 end-of-speech → first audio ≤ 1.5 s; barge-in ≤ 300 ms; en/fr/es/ar/zh test; 20-minute session with reconnect | all met on a real phone | GPT-Live direct → ElevenLabs Agents with a custom LLM → push-to-talk |
| 6 | DBOS 5.1.10: `DrizzleDataSource` on shared PG, `registerQueue` after launch, `createSchedule`, `DBOSClient.enqueue` from the api, app version across a Coolify rolling deploy | exactly-once occurrence under a crash | pg-boss + a hand-written state machine |
| 7 | AI SDK 7 `useChat` + `expo/fetch` → Hono via Traefik SSE; the current approval API name | a streamed tool approval round trip | Adapt to the docs |
| 8 | Uniwind + RNR + 21st `.web.tsx` under Expo web `output:"server"`, one token file for both | a web and a native card render from one spec | RNR on web too; 21st only in docs and landing |
| 9 | pnpm isolated linker + Expo 57 autolinking | builds on both platforms | `node-linker=hoisted` for mobile |
| 10 | Better Auth 1.7.6: email OTP + passkey + anonymous + expo on RN 0.87; guest → account data migration | a guest upgrades without losing data | — |
| 11 | Hermes Intl for the 10 locales; RTL reload | ar/ur render RTL correctly | formatjs polyfills |
| 12 | x402: one real mainnet Discovery purchase from a DCW EOA via EIP-3009; Facilitator status | the purchase settles and a receipt is stored | Read-only marketplace + our own testnet seller |
| 13 | Circle webhooks for UCW/DCW on Arc (both environments); Telegram webhook through Coolify | events arrive and are deduped | Reconcile polling only |
| 14 | TypeScript 5.9 vs 6.x across Expo, Drizzle, Hono and DBOS | typecheck green | Pin the lowest common version |

The **integration tests we keep** (D22) come from these spikes: the delegation caveats (#4), the challenge flow (#1–3), DBOS exactly-once (#6), the network-mismatch hard stop, and LiveKit RPC (#5).

## Docs to read first (Context7 / official docs)
- #8: Uniwind setup + theming (uni-stack/uniwind `skills/uniwind/references/`), RNR `minimal-uniwind` template + CLI, Expo SDK 57 `router/web/server-rendering` and `api-routes`, the 21st CLI skill.
- #10: Better Auth `plugins/{anonymous,email-otp,passkey}`, `integrations/{expo,hono}`, `adapters/drizzle`, `concepts/database`.
- #13: Circle "Webhooks" + "Verify webhook signatures" + the subscriptions API; Telegram `setWebhook`; the Coolify skill.
- Remaining spikes: list the docs in the spike write-up before starting (#1 Circle RN SDK, #5 LiveKit RN + agents, #12 x402).

## 21st.dev sourcing (surfaces, queries, picks: component · author · URL · why)
- (fill in when the stage touches UI)

## Progress log
- (dated entries: what was done, evidence such as tx hashes and URLs, blockers)
- 2026-09-30 · #2 PASS on testnet (13/13). UCW user `a3ca8196-…` keyed by our id; vault EOA `0xb7ed…efca`; UCW-owned DeleGator `0xb99b…Bd85`; revoke tx [`0xea48…4985`](https://explorer.testnet.arc.io/tx/0xea4818884a985d05689627822eb1155ba40bf8f98493c5e68708de33f85f4985). Abu entered the PIN via a local Web SDK relay page. Signer adapter rules added to ARCHITECTURE §4. LIVE untested (403).
- 2026-09-30 · #3 PASS on testnet (4/4). Swap [`0xc111…24ff`](https://testnet.arcscan.app/tx/0xc111f18687dad46e1ba5eb4a7994c84dec49da1c316fbfabd5edf02bd37724ff); bridge burn [`0x5b1d…edf9`](https://testnet.arcscan.app/tx/0x5b1d375c6d2333b105e91d762a6745bf9bf499b8303248a424f02cfa1a84edf9) → mint on Base Sepolia [`0x02bd…f00f`](https://sepolia.basescan.org/tx/0x02bd639b8e4c93054d5dec8a842ec149b4f69d42a672c33403be9f98a043f00f). UCW adapter is SCA-only → own SigningStrategy (ARCHITECTURE §4 updated).
- 2026-09-30 · #7 PASS: Node 7/7, iOS sim approval round trip (useChat + expo/fetch), and SSE through Coolify Traefik over HTTPS with gzip (throwaway app created, measured, deleted). No RN polyfills needed on 0.86.3.
- 2026-09-30 · #10 PASS: Better Auth 1.7.6 guest → email OTP upgrade keeps data (headless 18/18, Chrome passkey 4/4, iOS simulator incl. session restore after restart). Native passkey left open. `spikes/10-better-auth.md`.
- 2026-09-30 · #8 PASS: one card spec → RNR/Uniwind on iOS and a 21st.dev card on Expo web, one token file, 4 themes + RTL, `web.output:"server"` export. `react-native-web` pinned to 0.21.2. `spikes/08-ui-stack.md`.
- Earlier results without a log line here (#4, #6, #9, #11, #14) are in `plan/STATUS.md` and `plan/spikes/`.
- 2026-09-30 · #13 PASS on testnet: Circle v2 webhooks for DCW + UCW on ARC-TESTNET through a Coolify-deployed receiver; txs [`0x13e0…56e1`](https://testnet.arcscan.app/tx/0x13e0ab9b04c4645f65f2f8c6dfed9e5a3053c21bedfbe1e10348bc423d1c56e1) and [`0xf459…8c66`](https://testnet.arcscan.app/tx/0xf4597a132945e93e265e83571d79357062b5893d4ebc7d1cef658b1d254b8c66); retry + dedupe verified. LIVE and a real Telegram delivery are open. `spikes/13-webhooks.md`.
