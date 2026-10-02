# Card: Trade (any token, meme coins, long/short)

Purpose: the how-ladder for buying, selling and swapping any token (meme coins included), and going long or short. Rules: R1–R3, R5 (slide to confirm), R6–R7, D12 token rules.
Sources (live 2026-10-02; raw JSON in the session scratchpad `meme/`):
- quotes for 10 USDC → ARGUS/TOLLY: KyberSwap routes and build, LI.FI quote, Circle `stablecoinKits` quote and swap;
- lift.fun API; load.fun about page;
- GeckoTerminal `networks/arc` endpoints; GoPlus `token_security/5042`;
- Hibachi docs, terms and `data-api.hibachi.xyz/market/exchange-info`; edgeX docs and metadata;
- Aave V4 Spoke ABI (`aave/aave-v4` ISpoke) and live reads (rails fact sheet);
- Senryo trading design (`metropolis/apps/mobile/src/features/trade/*`).

Verified: 2026-10-02

## Swap / buy / sell any token (meme coins included)
| Lens | Answer |
|---|---|
| Entry | Token page Buy/Sell · Swap (Home action, fan) · Markets row · chat ("buy $10 of ARGUS") · price alert → ticket · DCA/limit automation · "Buy with Apple Pay" (onramp → this ticket) |
| Which | Pay with any held asset (picker); receive any token (search by name/symbol/address). Copycats are flagged (see Safety) |
| Venues | Fan-out: **KyberSwap** (keyless; `/arc/api/v1/routes` + `/route/build` → router `0x6131B5…37b5`, EOA calldata: approve + call in one 7702 batch) · **Circle App Kit Swap** (same price; execution through Circle's Adapter `0x7FB8c7…a845` via App Kit encoding; 2 bps fee) · **LI.FI** (calldata to diamond `0xA40725…d40b`; +0.25% fee). Today Kyber ≈ Circle > LI.FI. Later: 1inch, 0x (keys) |
| How much | Amount or 25/50/Max; quote shows you get, minimum (slippage), price impact, fee, venue mark; "3 routes" disclosure |
| How | Review → **slide to confirm** (resets on any change) → one batch → execution trace → receipt |
| How long | Seconds; re-quote at 30 s, expire at 60 s |
| What if | No route (pre-graduation or illiquid) → see pre-graduation below; price impact over the rule (default 5%) → blocked with the rule named; token rules exceed (unverified $50/trade, $200/day) → the agent cites the rule and offers to change it (Face ID); swap reverted → failed, not sent; unknown → checking |
| After | Holdings update; P&L from my own trades on the token page; Activity "Bought 654 ARGUS"; a sound only on confirmed |
| Testnet | USDC↔EURC (App Kit); memes are "mainnet only — switch?" |

## Pre-graduation (launchpad curves)
- **Tolly:** no curve (straight to Uniswap v3), so always routable.
- **lift.fun:** the public API `api.lift.fun/api/v1/tokens/{addr}` gives `graduated`, `progress_bps`, factory `0x1ca37b…d3da`, a v4 hook, `pool_id`. The token page shows a **graduation progress bar**.
- **load.fun:** USDC curve → locked Uniswap v3 at a 10k raise.
- **Argus:** v4-hook pools that aggregators already see.
- **Rule:** if an aggregator routes it, trade normally. Otherwise the token page shows "On the {launchpad} curve: X% to graduation", offers a **graduation alert**, and links to the launchpad. In-app curve trading is added per launchpad once its verified source is decoded on the explorer (no published ABIs today; LIFT first, since its API exposes pool data).

## Discovery (Markets tab)
- **GeckoTerminal** (`trending_pools`, `new_pools`, `tokens/{addr}`, `/pools/{addr}/info` with `gt_score`): ~10 calls/min, so **cached server-side** (60 s) and served to all clients.
- **Prices:** LI.FI token list `priceUSD`, CoinGecko `arc` platform.
- **Segments:** Trending · Meme · New · Long/Short · Stocks & FX (where a venue lists them).

## Safety (every token page and every buy)
- **GoPlus** `token_security/5042`, live: honeypot, taxes, mintable, owner renounced, holders, open source. Missing fields show "not checked".
- **Kawase copycat rule** (GoPlus can't catch copycats on Arc; a fake "USDC" pool was trending today):
  - the canonical registry = LI.FI list + CoinGecko id + our verified list;
  - **hard-block any token using a stablecoin symbol at a non-canonical address**;
  - symbol collisions (two ARGUS) → rank by reserves, holders and age; label the rest "lookalike"; always show the short address.
- **Sell-simulation check:** `eth_call` a sell of the quoted amount through the Kyber build, with a balance state override, before buying an unverified token ("you could sell this back").
- **Token rules (D12)** apply to every buy, including by voice and automations.

## Long / short
**Decision X23 (revised 10-02):** shorting must work for every Kawase user, programmatically. Hibachi and edgeX can't onboard users in code (API keys only via their web UIs; Hibachi blocks the US/UK interface). So:

1. **Kawase Margin: long/short through Aave V4 on Arc** (non-custodial, one batch, real liquidity). This is the default.
   - **Long X with leverage:** supply X as collateral → borrow USDC → swap to X → supply (loop to the target leverage, within max LTV). Close = unwind in one batch.
   - **Short X:** supply USDC as collateral → **borrow X** → swap X to USDC → supply (repeat for leverage). Close = buy back X and repay.
   - **Markets:** the assets Aave V4 lists on Arc (cirBTC, WETH, EURC; EURC short/long = euro vs dollar FX), widening as Aave or Morpho lists more.
   - **Ticket (Senryo design):** margin hero, LeverageRuler capped by LTV, **liquidation price = the health-factor threshold**, TP/SL as automations on executable quotes, slide to confirm.
   - **Position:** P&L (price / borrow interest), health gauge, close 25/50/75/All.
   - **Spike first:** confirm borrow is enabled for cirBTC/WETH/EURC on the Main Spoke (`getReserve(i)`), the max LTV and the flash-free loop (iterative within one 7702 batch).
2. **Connect Hibachi** (optional, for users who have an account in an allowed country):
   - the user creates a read-write API key in Hibachi (withdraw permission off) and pastes it; Kawase stores it encrypted;
   - markets (15 contracts), market/limit/stop/TWAP, **TP/SL**, positions, close;
   - deposits: an ERC-20 USDC transfer from Arc to the Hibachi deposit address (the 7702 batch);
   - withdrawals stay in Hibachi's UI (its security verification).
   - Shown with the Hibachi mark and its restrictions.
3. **Practice:** Senryo's perps engine on **Arc testnet** (paper money, clearly labelled), so the long/short UX can be practised without risk. Optional, after 1 and 2.

**Not shortable:** meme coins and any token with no lending market or perp → "No market lets you short this token" (R2), offering an alert or a sell instead.

| Lens | Answer (Kawase Margin) |
|---|---|
| Entry | Token page Long/Short · Markets "Long/Short" segment · chat ("short ETH 2x with $20") |
| Which | The listed collateral/borrow assets; margin from any held asset (converted on the way) |
| How much | Margin + leverage (ruler, capped by LTV); shows size, liquidation price, borrow APR, fees |
| How | Review → slide → one 7702 batch (supply, borrow, swap, supply…) → trace → position |
| What if | Health falls → push (1.5, 1.2) with Add margin / Reduce; liquidation → explained with the Aave event; a swap leg fails → the whole batch reverts (atomic) |
| After | Position page, Activity rows (open, adjust, close), share card |

## Launching a token (additive, later)
Possible via the LIFT or Load factory once decoded, or a self-built ERC-20 + single-sided Uniswap v3 position on factory `0xf0db…3918`. It goes behind token rules and an explicit risk explainer.

## Acceptance (mainnet, small amounts)
- [ ] Buy $5 of ARGUS: the card shows Kyber vs Circle vs LI.FI with Kyber best → slide → holdings show ARGUS with the GoPlus result.
- [ ] Search "USDC" in Markets: the fake-USDC pool is blocked as an impersonator.
- [ ] A LIFT pre-graduation token shows its progress bar + graduation alert.
- [ ] Short WETH 2x with $10 via Kawase Margin: the ticket shows the liquidation price → slide → position with the health gauge → close all.
- [ ] Connect Hibachi with a key (if available): place a $5 long with TP/SL → it appears in Positions.
