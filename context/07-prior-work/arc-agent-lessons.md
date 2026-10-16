# Arc Copilot: hard-won lessons about Arc and Circle

Purpose: the gotchas, failures and limits Abu hit on Arc Testnet and the Circle stack in Jul–Aug 2026. Each one saves hours on a Tameion build. Every item cites its evidence.

Sources: `arc-agent/AGENTS.md:95-243`, `CLAUDE.md`, `docs/raw/{arc-wallet-policy-live-checks-2026-07-29.md, 2026-07-30-phase-2-disposable-accounts.md, 2026-07-31-phase-2-wallet-and-mandate-trial.md, 2026-07-31-phase-2-app-kit-swap-trial.md, 2026-08-04-first-arc-swap.md, 2026-07-30-app-kit-keyless-quote.md, 2026-07-30-browser-webrtc-voice-trial.md, proof-feasibility-live-checks-2026-07-29.md}`, `docs/research/{2026-08-08-phase8-wave3-crosschain-runtime.md, 2026-08-05-phase6-worker-runtime.md}`, `docs/wiki/{arc-network-and-native-primitives.md, circle-wallets-and-agent-stack.md, app-kit-cctp-and-gateway.md}`, `docs/verification/2026-08-04-agent-path-real.md`.
Verified: 2026-09-29. These are **observations from 2026-07-28 to 2026-08-11**. SDK versions, endpoints and Circle policy may have changed, so re-probe anything load-bearing.

All paths below are relative to `arc-agent/`.

---

## A. Arc chain quirks

1. **Native USDC *is* `msg.value`.** It has 18 decimals, and the ERC-20 view at `0x3600…0000` has 6 decimals. They are one balance with two interfaces, so never add or compare raw values across them. Rescale explicitly, and round debits **up** (`CLAUDE.md:25-31`, `docs/wiki/arc-network-and-native-primitives.md:10-19`, `packages/domain/src/money.ts:62-87`).
2. **Pay through the ERC-20 view, not native value.** A smart-session policy with `valueLimit: 0` blocks any funded native call on Arc. The ERC-20 path keeps `value=0` (`AGENTS.md:200-202`, `packages/integrations/src/adapters/arc-payment-adapter.ts:30-43`).
3. **EIP-7708 double-count.** A native movement emits an 18-decimal `Transfer` from the system address `0xfff…fffe`, separate from the 6-decimal contract's own event. Indexers and AR matchers must not count both (`AGENTS.md:203-204`, `packages/integrations/src/arc.ts:15-19`). The same log is a convenient way to **detect incoming payments** (`packages/integrations/src/arc-usdc-incoming-observer.ts`).
4. **`balanceOf()` truncates below 1e-6.** A zero ERC-20 balance is not a zero native balance. Floor checks must read the 6-dec view, not `getBalance`, when comparing with 6-dec limits (`AGENTS.md:205-206`, `adapters/arc-swap-adapter.ts:176-182`).
5. **Arc reverts** on a zero-address value transfer, value-bearing precompile calls, and drain-to-zero on a fresh account. `PREVRANDAO` is always 0. There are no blobs and no EIP-4788 (`AGENTS.md:207-208`, `docs/wiki/arc-network-and-native-primitives.md:7`).
6. **The public RPC rate-limits.** `rpc.testnet.arc.io` returned `request limit reached` during App Kit's pre-sign simulation. Use `rpc.drpc.testnet.arc.io` first and the public endpoint as fallback (`docs/raw/2026-08-04-first-arc-swap.md:58-61`, `packages/integrations/src/public-config.ts:7`).
7. **`getLogs` range limits.** Wide log queries fail with `-32005` or "block range" errors. Bisect recursively (`packages/integrations/src/evm-log-range.ts:1-36`).
8. **A stale public RPC read caused a duplicate Gateway deposit**, which reverted with no value lost. Count only successful receipts and re-read before resuming (`docs/raw/2026-07-30-phase-2-disposable-accounts.md:65,70-73`).
9. **RIP-7212 (P256VERIFY at `0x100`) has no code on Arc**, so a passkey cannot sign or validate an account. Passkeys are login only (`docs/decisions/2026-08-04-per-owner-accounts-a04.md` evidence table).
10. **Explorer beats guessing.** Three guessed Nexus-factory addresses had zero code. The real factory `0x0000006648ED…f837` was found by asking the explorer who created a known account (`docs/decisions/2026-08-04-per-owner-accounts-a04.md` "What was believed").
11. **Memo data is public onchain.** Never put invoice or personal data in an Arc Memo without disclosure. Screening must also account for Memo and Multicall3From routing addresses (`docs/wiki/arc-network-and-native-primitives.md:27-38`).
12. **Registry contracts are EIP-1967 proxies.** ERC-8004 identity is a non-enumerable ERC-721 (`totalSupply()` reverts). Stork's staleness window on Arc is 3600 s. The ERC-8183 job ABI was recovered from bytecode selectors: `createJob`, `setBudget`, `fund`, `submit`, `complete`, `reject`, `claimRefund`. Platform and evaluator fees are 0 and `paymentToken` is USDC `0x3600…` (`docs/raw/2026-08-04-first-arc-swap.md:87-181`).

## B. Circle App Kit

13. **App Kit's default Arc transport fails** with "Network connection failed for Arc Testnet" and the nonce unchanged. Inject your own viem public and wallet clients through `@circle-fin/adapter-viem-v2`'s `getPublicClient` and `getWalletClient` (`AGENTS.md:212-213`, `docs/raw/2026-07-31-phase-2-app-kit-swap-trial.md:44-53`, `packages/integrations/src/circle-crosschain-viem.ts`).
14. **Swap works keyless.** The docs conflict: the install guide says keyless and rate-limited, while the FAQ says a Kit Key is required. A live server-side `estimateSwap` succeeded **without** a Kit Key (`docs/raw/2026-07-30-app-kit-keyless-quote.md:7-8`, `docs/wiki/app-kit-cctp-and-gateway.md:62-67`).
15. **Swap is Arc-only among testnets**, for USDC, EURC and cirBTC (`docs/wiki/app-kit-cctp-and-gateway.md:41`).
16. **`validateToken` is wrong.** It reports USDT valid and cirBTC invalid. Use explicit USDC and EURC address constants (`AGENTS.md:214-215`).
17. **`SwapEstimate` has no `transaction`, no deadline and no gas** in App Kit 1.11.0. A quote cannot be signed elsewhere, and its TTL is yours to set. The project used 60 s fresh and 15 s "expiring" (`AGENTS.md:216-217`, `packages/integrations/src/limits.ts:102-109`).
18. **Fees at small size are brutal.** On 0.01 USDC the gas was about 0.031 USDC (2.7×). On 1 USDC total fees were 0.023 (about 2.3%). Demo with at least 1 USDC (`docs/raw/2026-08-04-first-arc-swap.md:67-72`, `docs/raw/2026-07-31-phase-2-app-kit-swap-trial.md:25-42`).
19. **App Kit gas precision exceeds 6 decimals.** Round each fee **up** to raw USDC units before comparing it with caps (`docs/raw/2026-07-31-phase-2-app-kit-swap-trial.md:39-42`).
20. **Circle returned HTTP 500** (`code 8001`, `SERVICE`, `RETRYABLE`) on a first swap attempt. Make every step idempotent: re-read balances and skip legs that already confirmed. Never retry blindly after the nonce changes (`docs/raw/2026-08-04-first-arc-swap.md:52-65`).
21. **The Unified Balance Kit deposit hides the approval hash.** It runs `increaseAllowance` then `deposit` as two transactions, and on failure it attempts a best-effort revoke. There is **no `estimateDeposit`**. Instrument the viem adapter to capture both hashes (`docs/research/2026-08-08-phase8-wave3-crosschain-runtime.md:147-172`).
22. **`estimateSpend` returns no source allocations.** Supply and freeze allocations yourself, or the provider can pick different source chains after the user accepted the economics (`docs/research/2026-08-08-phase8-wave3-crosschain-runtime.md:100-105`).
23. **The App Kit signer matrix is limited.** The Circle Wallet adapter supports **developer-controlled** wallets only; user-controlled and modular wallets were "in progress", and Agent Wallet compatibility was unknown. Circle Wallet SCAs cannot sign their own Unified Balance spends, so a delegate EOA signs (`docs/wiki/app-kit-cctp-and-gateway.md:57-69`).

## C. CCTP and Gateway

24. **The Gateway Base Sepolia→Arc mint worked**: 1.00 USDC delivered for a 0.01 fee, with a 0.125 max-fee reserve deposited separately. It confirmed only after Circle's *indexed* balance caught up (`docs/raw/2026-07-30-phase-2-disposable-accounts.md:52-73`).
25. **A mined Gateway deposit is not spendable yet.** It must wait for source-chain confirmation and indexing, so do not hide a fresh deposit inside a 3-minute demo. Pre-stage it and disclose that you did (`docs/raw/proof-feasibility-live-checks-2026-07-29.md:69-72`, `docs/research/2026-08-08-phase8-wave3-crosschain-runtime.md:166-172`).
26. **On Arc Testnet, CCTP is Standard-only** (no Fast source) and Arc is a Forwarding Service destination, domain 26. CCTP network gas can be in a native asset, so use **typed fee lines**, not one scalar max fee (`docs/research/2026-08-08-phase8-wave3-crosschain-runtime.md:72-76,107-109`).
27. **Crosschain is not atomic.** Approval, burn, attestation and mint can each stall. Record each as a checkpoint, reconcile before any retry, use `retryBridge` only for a step proved incomplete, and **never re-burn after a timeout**. Gateway attestations expire after 10 minutes, and trustless withdrawal has a 7-day delay (`docs/research/2026-08-08-phase8-wave3-crosschain-runtime.md:113-145`).
28. **Gateway `addDelegate` is a full account-level allowance**, not a scoped grant. Treat it as a custody decision (`AGENTS.md:218-219`).
29. **The Wave 3 CCTP and Gateway adapters were never run with funds.** Budget time for a first live run (`AGENTS.md:181-182`).

## D. Wallets, policy and custody

30. **Circle Agent Wallet spending policies are mainnet-only.** The CLI rejects Arc Testnet policy read and write before auth ("Policy limits are only available on mainnet chains"). Policy changes also need a human email OTP, which must never enter agent context (`docs/raw/arc-wallet-policy-live-checks-2026-07-29.md:31-47`, `docs/wiki/circle-wallets-and-agent-stack.md:23-34,56-59`). **For Tameion RFB 4, Circle-managed limits will not work on testnet**, so enforce limits in your own contract or smart session and say so.
31. **Biconomy Smart Sessions do enforce on Arc.** Target, selector and recipient, per-call cap, cumulative cap, usage count and time window were all verified. Over-cap and wrong-recipient calls were rejected with `PolicyViolation(bytes32,address)` **in simulation, not as mined reverts**. An independent bundler test was never done (`docs/raw/arc-wallet-policy-live-checks-2026-07-29.md:108-142`).
32. **Pin MEE 2.1.0 / Nexus 1.2.0.** MEE 2.2.1 with Nexus 1.3.1 enabled a permission, but the first session use failed with `Invalid signature` (`docs/raw/arc-wallet-policy-live-checks-2026-07-29.md:194-204`, `AGENTS.md:220`).
33. **Sponsorship needs explicit config.** `sponsorship: true` alone picked an incompatible gas tank. You must set the staging URL and staging gas tank explicitly, via `getDefaultMEENetworkUrl(true)` and friends (`docs/raw/arc-wallet-policy-live-checks-2026-07-29.md:206-213`, `docs/decisions/2026-07-30-mvp-integration-a02.md` "Phase 2 Implementation Clarification").
34. **Expiry is soft at the provider.** After `validUntil`, MEE still quoted and assigned an operation, then failed with "Execution deadline limit exceeded", while `isPermissionEnabled` stayed `true`. Re-check time immediately before submitting (`docs/raw/arc-wallet-policy-live-checks-2026-07-29.md:171-192`).
35. **Owner sovereignty.** The root signer bypasses every session policy. An autonomous agent must hold **only** the scoped session key, or the policy is theatre (`docs/raw/arc-wallet-policy-live-checks-2026-07-29.md:159-169`).
36. **A protected balance floor is application logic.** Nothing on Arc or Circle enforces it onchain, so never present it as unavoidable (`CLAUDE.md:94-99`, `docs/raw/2026-07-31-phase-2-wallet-and-mandate-trial.md:59-71`).
37. **Faucets are gated.**
    - The public Circle faucet needs reCAPTCHA.
    - The faucet API returned 401 without an upgraded (mainnet) account.
    - Agent Wallet `circle wallet fund` draws 20 USDC on testnet (the amount changes over time).
    - Fund manually early and keep a funded source EOA (`docs/raw/arc-wallet-policy-live-checks-2026-07-29.md:214-216`, `docs/wiki/circle-wallets-and-agent-stack.md:40-49,73-81`).
38. **Gas Station is SCA-only.** The Paymaster docs conflict about Arc support (`AGENTS.md:221`, `docs/wiki/circle-wallets-and-agent-stack.md:61-71`).

## E. AI and agent safety

39. **The model fabricated a token address**: it copied USDC's address for EURC. Keep a post-parse allowlist (`assertKnownAssets`) plus strict json_schema, and never trust a model-supplied address (`docs/verification/2026-08-04-agent-path-real.md:27`, `packages/integrations/src/planner-contract.ts:26-42`).
40. **Pin the model snapshot** (`gpt-5.1-2025-11-13`), so the demo plans the same way on judging day as it did when verified (`packages/integrations/src/public-config.ts:103-109`).
41. **Voice UX.** The agent re-asked for confirmation after the user had already confirmed. A WebRTC track carries silence and never reports that it stopped, so derive speaking state from transcript events (`docs/raw/2026-07-30-browser-webrtc-voice-trial.md:36-44`, `docs/verification/2026-08-04-agent-path-real.md:33`).
42. **Policy producers must not emit blanket "allow".** An early baseline emitted ten unconditional `within_limits` checks. Persist "no producer exists" instead of a fake pass (`packages/domain/src/policy-producers.ts:3-13`).

## F. Worker and automation

43. **PostgreSQL is the queue.** Use `SKIP LOCKED` claims, unique occurrence keys and leases. Graphile Worker was rejected because it duplicates the financial ledger. Croner calculates next-run times only (`docs/research/2026-08-05-phase6-worker-runtime.md:30-66`).
44. **`skip_to_next` for missed slots.** A restart must never trigger catch-up spending. After a durable dispatch marker, pause or revoke cannot "cancel" the effect; you reconcile it instead (`docs/research/2026-08-05-phase6-worker-runtime.md:103-141`).

## G. Tooling and dev-loop traps

45. **`next dev` in `apps/web` does not read the root `.env.local`.** Load it with dotenv in `next.config.ts`. Next 16.2.9 Turbopack can keep a deleted route and loop `reloadPage`, so use `--webpack` in dev (`AGENTS.md:95-104`).
46. **A missing env var renders an error page that answers HTTP 200.** Readiness polls on the status code alone will lie (`AGENTS.md:106-108`).
47. **`database:verify` builds from scratch and never sees drift.** The dev DB sat two migrations behind and surfaced as a 500 during passkey registration (`AGENTS.md:110-113`).
48. **Unquoted test globs silently disable whole suites** once a subdirectory appears (`AGENTS.md:240-241`).
49. **Context7 returned `fetch failed`** for Biconomy and App Kit. Fall back to official docs, npm source and live RPC (`docs/raw/arc-wallet-policy-live-checks-2026-07-29.md:12-13`, `docs/raw/proof-feasibility-live-checks-2026-07-29.md:14-16`).

## H. Process lessons (inferred from the repo, stated carefully)

50. **Architecture churn ate the build window.**
    - Seven decision records (A-01 to A-07, plus A-08) were written in 11 days, with a full rebuild at A-05 (2026-08-05). A-07 was still "implementation active" on submission day, 2026-08-09 (`docs/state.json`).
    - 207 files were left uncommitted, last touched 2026-08-11.
    - The last push to GitHub was 2026-08-05 (`9eb4893`), four days before the final local commit.
    - The repo does not record what was actually submitted.
    - Same pattern as Sotto (see `canton-season3-notes.md`): **for Tameion, lock scope early, push daily, and keep the judged artifact deployable.**
51. **It was never deployed.** No hosting target was chosen, and passkeys bind to the RP domain (`docs/brief.md:88`). Tameion scores traction at 30% and "strongly encourages" a live link, so deploy in week 1.
52. **The honesty discipline is an asset.** Evidence docs separate "proves" from "does not prove", and every claim cites a tx hash. Canteen's "Agents and Ledgers" framing (right vendor, real invoice, no double-pay) rewards exactly this. Reuse the style in the Tameion README and demo.
