# Security review — money paths (2026-10-03)

Read-only review at `19b65f9` (main moved to `27ab8bc` during it). Production has `MAINNET_ENABLED=true`, so the highs are fixed **before Abu funds the mainnet ops wallet and relayer**. Owner = the builder whose code it is; rows that span files are split so no two builders edit the same file. Status is updated as each fix merges.

## High

| # | Finding | Where | Fix | Owner | Status |
|---|---|---|---|---|---|
| H1 | x402 caps are checked on the cheapest option; a pricier option is what gets paid. Approved consent reused at any fresh 402 price; budget check and "paying" insert not locked together. | `apps/api/src/marketplace/service.ts` 655-660, 766, 781-798, 812-853 | Re-run every check on the chosen `option.amount`; require ≤ the approved amount; reserve spend under a per-user advisory lock | B2 | fixed in B2 branch: re-checked on the chosen option under `marketplace:<user>:<network>` lock; a yes is re-asked at a higher price (`test/security-x402.test.ts`) |
| H2 | The agent auto-sends to recipients the model picked (`@handle`/contact never checked against what the person typed); `pay_from_code` auto-pays; `remember_fact` lets "Mum is @mallory" be planted. | `apps/api/src/agent/context.ts:161-167`, `packages/agent/src/tools.ts:106-110`, `everyday-tools.ts:63-79`, `intelligence-tools.ts:37-42` | Auto-send only when the recipient appears in the person's own text and nothing untrusted was read in the thread; `pay_from_code` never auto-approves; same rule for `remember_fact` | A5 | open |
| H3 | TP/SL swap grant pins only the recipient: tokenIn/out, fee, `amountOutMinimum` free; router approve unlimited; every pool reserve; 180 days. A leaked ops credential drains the wallet, not "a poor price". | `packages/integrations/delegation/src/protect.ts:80-82`, `apps/api/src/margin/protection.ts:72` | One swap grant per position pair pinning tokenIn, tokenOut and fee; capped approve amounts | B1 | open |
| H4 | Revoke is a database change only: protection off, allowance raise, marketplace/protection supersede never disable the old delegation on-chain; revoke-all and exit kit only see `status='active'`. | `protection.ts:171-175,187-199`, `wallet/service.ts:403-437`, `marketplace/service.ts:427-433` | `disableDelegation` on-chain on every off/raise/supersede; revoke-all covers every signed, unexpired grant | A3 (allowance raise, revoke-all, exit kit) · B1 (protection off/supersede) · B2 (marketplace supersede) | A3 part fixed: a raise (and a widened automation edit) disables the old delegation on chain inside the same approval, relayer-paid, and refuses without it; revoke-all, exit kit and Delete account cover every signed, unexpired grant the chain still honours. Shared helper `WalletService.revokeGrantsRequest(userId, grantIds)` (+ `revokeFirst`). Testnet: `test/revoke-onchain-testnet.test.ts`. B2 part fixed in B2 branch: a new marketplace grant revokes every earlier one the chain still honours through the same helper, signed in the same yes (`test/marketplace-supersede-testnet.test.ts`, on chain). B1 open |
| H5 | The gas relayer can be drained: relayed payouts uncapped (EURC-only account loops 50-line dust payouts); setups relayed with no already-set-up/signer/nonce check, 120/min. Relayer hits its floor → gas-free sends and onboarding stop for everyone. | `business/payouts.ts:128` → `wallet/service.ts:280-310, 493-538` | One sponsored setup per wallet with signer + nonce check; per-person cap on relayed batches under a lock; global daily gas budget | B2 | fixed in B2 branch: setup skips a set-up wallet, checks the authorization signer and nonce, 2 relayed attempts per wallet; every relayed batch is simulated first, then counted (20/day shared with gas-free sends, 0.25 USDC gas/person/day) and charged against a 3 USDC/day mainnet budget under `<user>:<network>` then `relayer:<network>` locks, with the gas reserved on its `tx_attempts.gas_cost` row (migration 0049); refusals `relay_limit` / `relayer_budget_spent`, GAS_RELAY_LIMIT / GAS_RELAY_BUDGET_SPENT on cards (`test/security-relayer.test.ts`; `gasless-batch-testnet` still passes) |

## Medium

| # | Finding | Where | Fix | Owner | Status |
|---|---|---|---|---|---|
| M6 | The phone signs whatever typed data / 7702 authorization the server sends | `packages/wallet/src/turnkey.ts:68-71`, `apps/mobile/src/wallet/use-wallet-setup.ts:102` | Pin the DeleGator address and chain ID in the app; decode delegate and caveats on device | A3 | open |
| M7 | Payouts and cross-chain/bridge/earn/lend/margin skip the send rules; `pausedAll: false` hard-coded | `payouts.ts:56-97`, `crosschain/service.ts:478` and siblings | `evaluateSend` per payout line; read the real pause state | B2 (payouts) · A3 (cross-chain, bridge, earn, lend, margin pause state) | B2 part fixed in B2 branch: every payout line runs `evaluateSend` on fresh facts (real pause state; hold, blocked, issuer-blocked, token contract, look-alike, limits with each line counted on top of the ones before) when made and again before signing (a line resolving elsewhere now is "changed"); the batch's spend is reserved in `spend_ledger` (`payout_id`, migration 0080) under the person's lock at submit, committed or released with the outcome, and counted by sends (`test/security-payouts.test.ts`; `business-testnet`, `gasless-batch-testnet` pass). A3 part open |
| M8 | Quarantine gaps: thread digest puts raw tool output into the system prompt unfenced; `UNTRUSTED_FIELDS` misses token symbols and vault names; bridge/withdraw tools accept a model-supplied `0x` | `packages/agent/src/threads.ts:48-53,99-108`, `rails-tools.ts:118-127`, `money-out-tools.ts:35` | Fence by default; reuse the "address must be typed" check | A5 | open |
| M9 | `approvalThreshold` ($100) and `perRecipientWeekly` are documented but never read | `packages/config/src/limits.ts:41,44` | Enforce in `evaluateSend` | A3 | open |
| M10 | The 20-a-day gas-free cap can be raced (`relaysLeft` read outside the per-user lock) | `send/service.ts` ~1025-1030 | Count inside the transaction | B2 | fixed in B2 branch: `submitAuthorization` reserves the relay (`reserveRelay`: count, person's gas share, relayer budget) inside the lockIntent transaction with the attempt row; past it the send is redrafted with GAS_RELAY_LIMIT / GAS_RELAY_BUDGET_SPENT (`test/security-relayer.test.ts` M10; `gasless-send-testnet` passes) |
| M11 | Contact discovery is a bulk email lookup: 2,500 unsalted hashes × 120 req/min | `contacts/discovery.ts:16-48` | Cap hashes per request; daily quota | A5 | open |
| M12 | A leaked bearer token alone can spend within the allowance and delete the account | auth/session | Require a device Turnkey stamp for allowance sends and destructive account actions | B2 (after H1/H5/M10) | open |

## Low

- Practice mode's regex (`app.ts:345`) misses `/crosschain`, `/lend`, the withdrawal batch, `/business/payouts`, margin protection — A3.
- Automated margin closes ignore pause and practice mode (`protection.ts:256-302`) — B1.
- `pendingRelays`/`pendingTransactions` never expire; a double `submitRelayedBatch` makes the relayer pay for a reverted call — B2. **Fixed in B2 branch (with H5):** both expire (relay TTL / 15 min), a request is claimed before any await and a second submit gets the first answer, and every relayed batch is simulated before it is sent.
- A webhook with a random `X-Circle-Key-Id` triggers an authenticated Circle fetch with the live key (`onramp/service.ts:259-268`) — B1.
- Voice token key derived from the LiveKit secret; the token survives sign-out for 30 minutes — lane C (later).
- A renamed @handle is free to take immediately; registering someone's push token removes it from their device — B2.

## Plausible, verify

- **SSRF through x402 catalog listings** (`discovery.ts:54-79` accepts `http:`, private IPs, host templates; `pay.ts:86` fetches) — B2: require https, reject templates, block private addresses at connect time.
- **Rate limits keyed on the first `X-Forwarded-For`** — checked by the lead 10-03: Traefik replaces the spoofed header with the real peer IP, so not spoofable. The bucket map never shrank; fixed by sweeping idle buckets (`rate-limit.ts`).
- **Turnkey email trust** — if Turnkey allows an unverified email change, discovery returns the attacker's handle. Verify in Turnkey docs.
- **Whether models follow the injection in H2** — code path confirmed, model behaviour untested (OpenAI credit is out).

## What looks solid

Sessions/sign-in (hashed revocable tokens, atomic nonce, stamp verified on the claimed sub-org); no IDOR found; export link HMAC; tool-approval HMAC; allowance/automation/marketplace/save/bridge grants correctly pinned; relayed batch pins exact calls, single use, 10 min, relayer-only; onramp webhook verifies the raw body and the chain is the witness; secrets and CORS; automations and Needs-you re-check pause, cooldown, allowlist and the half-balance brake.
