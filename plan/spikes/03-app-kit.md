# Spike 3: App Kit swap and bridge signed by the user's wallet

> **Partly superseded on 2026-09-30 (D33): the signer is no longer a Circle PIN wallet, so the "2 PINs per swap" finding no longer applies. Still valid: App Kit runs through the viem adapter with our own signing strategy for an EOA. To be re-run with the new wallet in spike #16.**

Purpose: prove that Circle App Kit can swap and bridge from the Kawase vault (a Circle UCW **EOA**, spike #2), with the owner approving each step. Measure the challenge count and the idempotency handling, and find out whether we can see or prepare the calldata ourselves.
Code: `plan/spikes/code/03-app-kit/` (`node run.mjs [--swap] [--bridge] [--earn]`; PINs go through the spike-02 relay page at `http://localhost:5199/`). Raw results: `results.testnet.json`, `run.log`.
Date: 2026-09-30
**Result: testnet PASS (4/4).** A swap of 0.5 USDC → EURC and a bridge of 2 USDC Arc Testnet → Base Sepolia both completed. Abu entered the PIN for each of the 4 challenges.

## Setup
- Packages: `@circle-fin/app-kit@1.15.3`, `@circle-fin/adapter-circle-wallets@1.8.0` (pulls `adapter-viem-v2@1.18.0`), `viem@2.57.1`.
- Vault: the spike-02 UCW EOA `0xb7eddcc7b3b8c8fd4c1f99d5e336023feec8efca`, funded with 4.5 test USDC from the ops DCW ([`0xca04…75ef`](https://testnet.arcscan.app/tx/0xca04271d8ceeb7ae48ecfdc05fb93d9a5208f8b32d55701c3568b383ff6975ef)).
- **Blocker found and worked around:** `createCircleUserWalletAdapter` throws *"supports only 'SCA' wallets"* (`ucw/server.mjs:13714`), because it batches calls through the SCA's own `executeBatch`. We assemble the same adapter Circle builds internally (`buildSingleWalletAdapter`) from public exports: `createViemAdapter` (`@circle-fin/adapter-viem-v2/next`) + `circleUserWalletSigning` (`@circle-fin/adapter-circle-wallets`), wrapped with `manifest.atomicBatch = false`. Single calls then go straight to UCW `contractExecution`, which an EOA supports.

## Results
| # | Test | Expected | Got | Evidence |
|---|---|---|---|---|
| 1 | `estimateSwap` 0.5 USDC → EURC | quote, no challenge | ✅ est. 0.412003 EURC, stop limit 0.407883, provider fee 0.0001 USDC | — |
| 2 | `swap` signed by the UCW EOA | pass | ✅ **+0.412003 EURC**, **2 challenges** (`token.increaseAllowance`, `swap.execute`) | approve [`0xb9ee…4cd1`](https://testnet.arcscan.app/tx/0xb9ee627e8bb5a4b7335ac513590f406962b83dbb69864cd5c0a7f661aa814cd1), swap [`0xc111…24ff`](https://testnet.arcscan.app/tx/0xc111f18687dad46e1ba5eb4a7994c84dec49da1c316fbfabd5edf02bd37724ff) |
| 3 | `estimateBridge` 2 USDC → Base Sepolia (forwarder) | quote, no challenge | ✅ forwarder fee 0.054585 USDC (gas simulation reverted "exceeds allowance" because nothing was approved yet; see finding 5) | — |
| 4 | `bridge` signed by the UCW EOA, Circle forwarder mints | pass | ✅ `state=success`, **+1.945415 USDC on Base Sepolia**, **2 challenges** (`token.increaseAllowance`, `cctp.v2.customBurnWithHook`); about 1 min end to end | approve [`0x23f8…890e`](https://testnet.arcscan.app/tx/0x23f8b6969797688e8a6f95b62aa82681d478f0767671d2086e5bd5495b7b890e), burn [`0x5b1d…edf9`](https://testnet.arcscan.app/tx/0x5b1d375c6d2333b105e91d762a6745bf9bf499b8303248a424f02cfa1a84edf9), mint [`0x02bd…f00f`](https://sepolia.basescan.org/tx/0x02bd639b8e4c93054d5dec8a842ec149b4f69d42a672c33403be9f98a043f00f) |

Earn was not run (`--earn` only lists vaults; deposits belong to Stage 6).

## Findings (these change the plan)
1. **App Kit's UCW adapter is SCA-only; our vault is an EOA.** The workaround uses only public exports and mirrors Circle's own composition, so it is not a fork. Cost: **2 PINs per swap and 2 per bridge** (approve + action). An SCA would batch these into 1, but K3 still holds: the DeleGator needs an ECDSA owner, and Memo/Multicall3From need EOA callers.
2. **App Kit hands every prepared call to a pluggable `SigningStrategy`** (`{ manifest, execute(payload, ctx) }`, where the payload is `evm-calls` with `to`/`data`/`value` or `evm-typed-data`). This answers the spike's question "can we get the calldata?": **yes, at the strategy boundary**, after the kit prepares and before Circle is called. [Claude's design, from the verified interface:] Kawase should ship its own strategy instead of `circleUserWalletSigning`. Per call it would:
   - run `policy.evaluate()` on the decoded call and reject anything that doesn't match the draft (the target is the expected router or TokenMessenger, the amount is within the draft);
   - insert `tx_attempts(prepared)` with **our** UUIDv4 idempotency key and `refId = {intentId}:v{n}:s{step}`;
   - create the UCW `contractExecution` challenge with that key and `refId`, and push it to the device through the outbox;
   - poll the challenge, then the transaction, and return `{ type: 'broadcasted', txHash }`.
3. **Circle's stock strategy mints its own idempotency key** (`crypto.randomUUID()` inside `executeEvmCalls`) and sets no `refId`. That breaks ARCHITECTURE §5 ("persist a v4 key before calling Circle; reconcile by key or refId"). Finding 2's strategy fixes it.
4. **Kit operations are multi-step and long-running,** so they run in the executor, not in an api request. The flow is approve → wait → act, and for a bridge also attest → mint, all inside one `kit.swap`/`kit.bridge` call that must stay alive while the owner approves each step. The README says the same ("run this flow in a durable server or worker process"). So the §4 "Otherwise" path becomes the design: a DBOS executor workflow runs the kit, and each challenge goes to the device via outbox → SSE. A crash mid-flow leaves at worst an unused allowance (swap) or a burned-but-unminted transfer (bridge), which `kit.retryBridge(result)` resumes from the persisted steps. Persist the kit's `steps` / `onProgress` updates as they arrive.
5. **Estimates before approval:** `estimateBridge` returns the provider/forwarder fees, but its gas simulation reverts ("ERC20: transfer amount exceeds allowance") until an allowance exists. The confirm card should show the fee from the estimate and treat gas as "about $0.0x on Arc", not as a precise number.
6. **Abandoning a challenge doesn't cancel it.** A first-run approve challenge (`036523d0-…`) was orphaned when the relay page restarted. It stays PENDING at Circle until it expires. It is harmless only because no device ever received it. The reconcile sweep must treat undelivered challenges as `not_sent` after expiry, as §5 already says.
7. **Forwarder bridging needs no wallet or gas on the destination:** the mint was paid out of the amount (0.054585 USDC here). This is the right default for "send my USDC to Base".
8. App Kit's explorer links use `testnet.arcscan.app`. Spike 04's `explorer.testnet.arc.io` also resolves; `packages/networks` should keep one canonical explorer per network.

## Not covered (still open)
- Mainnet (`Arc`) with the LIVE key (Circle LIVE 403). Swap on mainnet has real liquidity for more pairs.
- Bridging **into** Arc with a UCW source on another chain. The vault is one EOA per Circle blockchain, so the Base Sepolia address has to be created and funded first.
- Earn deposit/withdraw (Stage 6) and Unified Balance (the README notes that SCAs can't sign spends and an EOA delegate is needed, which our EOA vault already is).
- The custom Kawase strategy from finding 2 (built in Stage 6, `packages/integrations/circle`).

## Decision
**Pass → App Kit stays the engine for swap, bridge and earn, driving the UCW EOA vault through our own `SigningStrategy`** (policy check, our idempotency key and `refId`, outbox push), run as an executor DBOS workflow. Fallback not needed.
