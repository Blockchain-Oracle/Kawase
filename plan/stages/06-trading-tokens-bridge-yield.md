# Stage 6: Trading, tokens, bridge, yield

Purpose: a stage of the Kawase build. Source of truth for scope is `plan/MASTER-PLAN.md`; decisions are in `context/08-product-research/DECISIONS-FROM-ABU.md`.
Status: in progress — 6a (swap USDC ↔ EURC on Arc, screen + chat) done on testnet; 6b bridge next.

## Scope (from the master plan)
- Swap via App Kit (LI.FI underneath) + KyberSwap/LI.FI for arbitrary tokens.
- Token search, trending and safety (GoPlus, copycat detection); user token rules (D12) enforced by policy; price impact and slippage caps; the brake behavior.
- `compare_bridge_routes` across CCTP/App Kit, Across, Relay, LI.FI, deBridge and Socket (fresh quotes, net received, trust labels) + bridge execution and status + stuck-transfer recovery.
- Earn vaults (App Kit Earn / Morpho) with APY + TVL + liquidity warnings, deposit and withdraw, positions.
- Prices and charts; portfolio.
- **Exit:** a mainnet swap, a meme-token buy blocked by a default rule then allowed after a signed rule change, a bridge that picks the cheapest route and explains why, an earn deposit + withdraw; testnet shows the mock vaults and correct "mainnet-only" explanations.

## Build order (Claude's plan, 2026-10-01)
- **6a Swap (done on testnet):** USDC ↔ EURC on Arc through App Kit, one Face ID per swap, screen + chat card + agent tool, receipt witness, activity shows one "Swapped" row.
- **6b Bridge:** USDC Arc → Base/Ethereum Sepolia through App Kit's CCTP forwarder (approve + burn as one batch, the forwarder mints, no destination gas), status through attestation and mint, `compare_bridge_routes` with the providers that exist on testnet and honest "mainnet only" lines for the rest.
- **6c Tokens, prices, earn:** Circle token rates for prices and a portfolio value; token rules (D12) and safety on mainnet tokens; App Kit Earn vaults (explore on testnet, deposit/withdraw where a vault exists).

## Docs read
- `@circle-fin/app-kit@1.15.3` and `@circle-fin/adapter-viem-v2@1.18.0` type definitions and source (installed): `SigningStrategy` (`manifest.atomicBatch`, `broadcasts`), `kit.swap` / `estimateSwap` / `getTokenRates`, `StablecoinServiceSwapProvider.swap` (batched approve + swap via `adapter.batchExecute` when the strategy is atomic), the adapter contract's `execute(ExecutionParams, TokenInput[], bytes)` ABI, `assertBrowserSafeApiKey` ("hold the credential on the server, forward the prepared transaction to the client").
- `@metamask/smart-accounts-kit@2.0.0`: `DeleGatorCore.encode.executeWithMode`, `ExecutionMode.BatchDefault`, `createExecution`.
- Spike 3 (`plan/spikes/03-app-kit.md`).

## 21st.dev sourcing
- None for 6a: the swap ticket, review and exchange animation reuse the send grammar (amount ticket, review card, status) already sourced in Stage 2/5.

## Progress log
- **2026-10-01 — 6a swap, built and verified on Arc testnet.**
  - **One Face ID per swap.** With the D33 wallet (a Turnkey EOA running MetaMask's EIP-7702 StatelessDeleGator), a transaction the wallet sends *to itself* calling `executeWithMode(BatchDefault, [approve, swap])` runs both calls atomically from the wallet's own address. Spike 3 needed two PIN challenges for the same swap. New `encodeSelfBatch` in `packages/integrations/delegation/src/batch.ts`.
  - **App Kit builds, Kawase signs.** New `packages/integrations/app-kit` (server-only; the kit's API key is a server secret). `quoteSwap` (estimate), `prepareSwap` (runs `kit.swap` with a *capture* signing strategy, `atomicBatch: true`, `allowanceStrategy: "approve"`, that takes the prepared calls and stops the kit before anything is signed), `checkSwapCalls` (decodes the adapter's `execute`: every output's beneficiary is the wallet, it takes exactly `amountIn` of `tokenIn`, the approval names only the App Kit adapter for exactly the amount, no native value, the deadline has not passed, and the calls' own on-chain minimum is at least the minimum the person was shown), `marketPrices` (Circle's token rates).
  - **Findings that shaped it:** (1) Circle's service answers "No route available" (331001) intermittently for routes it finds seconds later, mostly after several calls in a row; quotes and builds retry with a growing pause. (2) A separately supplied `stopLimit` is refused unpredictably ("No route found that satisfies the requested stop limit", or "Unable to calculate slippage" when sent with `slippageBps`), so the route is built with a slippage and its minimum is read back from the calldata instead. (3) On Arc testnet no route builds below 1% slippage, so the minimum shown is 2% on testnet (1% on mainnet) and the route is built at half of it (`SWAP_ROUTE_SLIPPAGE_DIVISOR`), leaving room for the price to tick between quote and Face ID. (4) The testnet USDC→EURC pool quotes ~7% under Circle's market rate (EURC $1.1296, USDC $0.9993 on 2026-10-01); the card says so, with a policy cap (`maxRateGapBps`: 3% mainnet, 15% testnet).
  - **Api:** migration `0008` (intent kinds `swap`, `bridge`); `packages/intents/swap-draft.ts` (EIP-712 `SwapDraft`: chainId, from, tokenIn, tokenOut, amountIn, minOut, maxFee); `packages/policy/swap.ts` (`evaluateSwap`, `completePair`: naming one of two currencies names the other; new reasons `SWAP_SAME_TOKEN`, `SWAP_PAIR_UNSUPPORTED`, `QUOTE_UNAVAILABLE` (a precondition: try again), `PRICE_IMPACT_HIGH`, `RATE_BELOW_REFERENCE`); `apps/api/src/swap/` (`SwapService`: draft with a fresh quote + market rate → approve re-quotes, rebuilds the calls, checks them, hands out one self-batch transaction → the signed transaction must equal it byte for byte → broadcast → receipt witness: exactly `amountIn` out, at least `minOut` in; sweeper per kind); `/swaps` routes; the agent's `propose_swap` (always confirmed on the card; the allowance never covers swaps); the incoming watcher no longer reports a person's own transaction (a swap's output) as money received; activity folds a transaction with one currency out and another in into one "Swapped" item. `send` reads and the send sweeper now only see `kind = send`.
  - **App:** `/swap` (amount ticket with flip, review with the quote next to the market rate, fees to four places, one "Swap with Face ID" button, an exchange animation while it moves, the receipt amount at the end), the chat swap card, Swap in the plus fan (five circles now; DESIGN.md updated), one "Swapped USDC → EURC" activity row and receipt. Strings in all ten catalogs.
  - **Evidence:**
    - package script, fresh 7702 wallet: 0.5 USDC → 0.411403 EURC in one transaction [`0x9b56…b9f4`](https://testnet.arcscan.app/tx/0x9b56345d3fd1de50e48ea6629c26be20db96517134d6630159ff5a565f47b9f4) (551,419 gas);
    - `apps/api/test/swap-testnet.test.ts` passes: more than the balance → a fix, quote + market rate, a tampered signature refused (`security.draft_mismatch`), 0.5 USDC → 0.412533 EURC [`0xda61…338e`](https://testnet.arcscan.app/tx/0xda619c005ab46731463bad2a4611f939a8636ca2cd9f3ac2b292da0e2489338e), and the watcher does not report it as received;
    - on the simulator with the real Turnkey wallet and Face ID: 2.00 USDC → 1.648843 EURC from the swap screen [`0x4d95…ae39`](https://testnet.arcscan.app/tx/0x4d95c15a4031b125264cc87abb646dfac8d374e3ec19bc47ba3f00459dd3ae39), and "change 1 dollar to euros" in chat → card → Face ID → 0.82 EURC.
  - **Not done in 6a:** mainnet (needs the mainnet network enabled; keyless App Kit is wired as the fallback until Circle's LIVE key is approved), tokens other than USDC/EURC (6c), a live quote while typing the amount (the review re-quotes; a refresh chip shows the quote's time).
