# Card: The marketplace (x402): how it comes into play

Purpose: the how-ladder for the agent finding and paying for services on Arc. Rules: R2, R3, R5, R7. D14: the agent only *uses* the marketplace (D26: no selling).
Sources: the x402 fact sheet (live 2026-10-02):
- Circle Discovery `GET https://api.circle.com/v2/x402/discovery/resources?network=eip155:5042&limit=200` (no key, `limit` ≤ 200);
- probes of BlockRun and AIsa endpoints (HTTP 402 with valid requirements);
- facilitator `/supported` checks;
- npm `@x402/*` 2.28.0 and `@circle-fin/x402-batching` 3.5.0;
- `context/02-circle-agent-stack/{x402,nanopayments}.md`;
- `plan/MASTER-PLAN.md:53,233`.

Verified: 2026-10-02

## What is there
- **2,136 Arc mainnet listings** (2,117 unique URLs); **0 on testnet**.
- **Providers:** AIsa 1,581, Orthogonal 293, QuickNode 132, BlockRun 114, Goldsky 11, Vangrid 3, Exa 2.
- **Categories:** social 1,009 · web search/research 591 · financial analysis 194 · data enrichment 173 · infrastructure 94 · prediction markets 62 · creative 13.
- **Price:** median $0.10, range $0–$50.
- **Two rails:**
  - **2,060 listings take only Circle Gateway nanopayments** (`GatewayWalletBatched`: a one-time USDC deposit into the GatewayWallet, then off-chain EIP-3009 signatures by an EOA);
  - **76 take plain EIP-3009 USDC** (BlockRun `arc.*`, Vangrid), settled one by one through Circle's facilitator, which pays the gas.
- **Useful for a money agent:**
  - prediction-market odds and smart money (BlockRun, $0.005–0.0085);
  - news and web search (Exa $0.007, Orthogonal Serper $0.002, Grok search $0.71);
  - DefiLlama yields, prices and protocols ($0.002–0.006);
  - stock prices ($0.003);
  - candles ($0.0085).
- **Nothing is sold for token security**, so that stays on free GoPlus.
- Many listings are paid copies of free data (CoinGecko at $0.10), so free built-ins always come first.

## How it comes into play (the user's view)
1. **The agent decides.** Mid-task, when its free tools can't answer, e.g.:
   - "Will the Fed cut? Keep USDC or move to EURC?" → prediction-market odds;
   - "Why did ARGUS dump today?" → a news search;
   - "Best yield for $500 across chains?" → DefiLlama yields.
2. **The user sees it:**
   - a **service card** (provider mark, what it returns, price, which rail);
   - under the marketplace budget and the per-call cap → it pays and says so ("Paid $0.009 to Exa for news");
   - above the cap → a consent card.
3. **The answer** cites the paid source; a receipt goes to Activity (Marketplace filter).
4. **Controls** (Settings → Marketplace):
   - budget per day, max per call;
   - allowed categories;
   - blocked sellers;
   - "ask me first" mode;
   - spending history;
   - "return unused budget".

## The Agent wallet page (Abu, 10-02: "x402 was supposed to have their page … user can fund their x402 wallet … if they don't have balance … top up your x402 wallet")
- **Route:** `/agent-wallet`. Reached from Settings → Marketplace, the "For you" marketplace card, the chat card "Top up your agent wallet", and Home → Positions ("Agent wallet: $4.20").
- **Top to bottom:**
  1. balance (USDC; the portion deposited in Gateway vs on hand);
  2. **Top up** (from my Kawase balance, or Buy with Apple Pay straight into it);
  3. **Return to my wallet**;
  4. budget: daily cap and per-call cap (tighten instant, loosen Face ID);
  5. allowed categories and blocked sellers;
  6. spending history (service, price, time, receipt).
- **When empty or too low:** the agent never fails silently. It shows the **"Top up your agent wallet" card** (amount presets, one approval) and resumes the same request after the top-up (R12).
- **One agent:** the same chat/voice agent uses this wallet automatically whenever a task needs a paid service.

## How it pays (decision X24)
- **A per-user agent wallet** (a Circle developer-controlled EOA, as MASTER-PLAN:53 plans), funded through a **marketplace grant**: an on-chain delegation that lets the ops wallet move USDC only to *that user's* agent wallet, capped per day.
- The agent wallet makes **one Gateway deposit**, then signs each payment off-chain. `@circle-fin/x402-batching` `CompositeEvmScheme` pays both rails (Gateway and plain EIP-3009).
- The backend checks amount ≤ per-call cap before signing.
- **Why not the user's own EOA:** a prompt on every call, or server signing power over the main wallet.
- **Why not the shared ops wallet:** it mixes users' money.
- **Trade-off:** Circle holds the agent wallet key, but only the small budget is at risk. Refunds need a "return budget" action (Gateway withdraw → user).

## What if
- The seller times out or errors after payment → the receipt says "No refund: <seller> kept the payment" (x402 has no refund standard yet: the refund extension is an unmerged proposal, x402-foundation/x402 PR #3640, and does not cover Gateway batches; checked 10-02). A Gateway payment Circle reports as failed (`GET /v1/x402/transfers/{id}`) shows "Not charged" and leaves the day's spend.
- The response is untrusted data: quarantined from instructions (prompt-injection rule) and never moves money by itself.
- Over budget → policy refusal with the cap named.
- Testnet: no listings, so **our own demo seller** (Express with `@x402/express` paymentMiddleware, Circle facilitator on 5042002) with an explicit allowlist exception (MASTER-PLAN:233).

## Discovery beyond the catalog
- **ERC-8004** via 8004scan (`/api/v1/agents?chain_id=5042`): 1,373 agents, mostly spam, no prices or endpoints. Shown read-only as "agents on Arc".
- The **Arc Portal** marketplace has no API.

## Unverified (tested in the build)
- Can Circle DCW `signTypedData` sign the GatewayWalletBatched domain on mainnet?
- Does Gateway accept a 7702-delegated EOA?
- Does `@x402/evm` include Arc mainnet?
- Does the Discovery API support search?

## Acceptance
- [ ] Ask "why did ARGUS move today?" → the agent shows a service card ($0.009) → pays within budget → answers with citations → Activity row.
- [ ] Set the per-call cap to $0.005 → the same question → a consent card first.
- [ ] Testnet: the demo seller returns 402 → paid → response.
