# Cheapest-route design for bridges and swaps

Purpose: an [INFERENCE] design for "check the bridge aggregators and pick the cheapest fee", built only from APIs verified to work for Arc today (see `bridges-and-aggregators.md`, `swaps-and-dexes.md`).

Sources: every endpoint below was called on 2026-09-29, and the responses are saved under `.firecrawl/product/02-defi/` (`E/`). Numbers come from the 100 USDC Base↔Arc samples in `bridges-and-aggregators.md`.

Verified: 2026-09-29 (inputs). The design itself is [INFERENCE].

## 1. Which providers can join a keyless comparison today [VERIFIED]

| Provider | Arc mainnet | Arc testnet | Quote call | Output field to compare |
|---|---|---|---|---|
| Circle CCTP V2 (App Kit Bridge) | yes | yes | `GET iris-api(.sandbox).circle.com/v2/burn/USDC/fees/{src}/{dst}?forward=true` or `kit.estimateBridge()` | `amount − minimumFee·amount/1e4 − forwardFee.med` (if forwarding) |
| Circle Gateway (App Kit Unified Balance) | yes | yes | documented formula (0.5 bps + per-source burn gas) or `POST /v1/estimate` | only when the user already has a finalized Gateway balance |
| Across | yes | **no** | `GET app.across.to/api/suggested-fees` | `amount − totalRelayFee.total`; check `limits` |
| Relay | yes | **no** | `POST api.relay.link/quote` | `details.currencyOut.amount` (+ `fees.gas` on source) |
| LI.FI | yes | yes (intents only) | `POST li.quest/v1/advanced/routes` (`order: CHEAPEST`) | `routes[].toAmount`, `gasCostUSD` |
| Socket V3 | yes | no | `GET public-backend.socket.tech/v3/swap/quote` | `routes[].output.amount` |
| deBridge DLN | yes | no | `GET dln.debridge.finance/v1.0/dln/order/create-tx` | `estimation.dstChainTokenOut.recommendedAmount` **minus `fixFee` in source native** |
| Squid, LayerZero VT/Stargate, 0x cross-chain, 1inch | – | – | need keys or integrator IDs | excluded until onboarded |

Swaps on Arc (same chain): App Kit `estimateSwap` (LI.FI/Fly underneath), KyberSwap `/arc/api/v1/routes`, and LI.FI `/v1/quote` all work without a key [VERIFIED].

## 2. Algorithm

1. **Normalize the request:** `{srcChain, dstChain, tokenIn, tokenOut, amountIn, recipient, speedPreference}`. Map token addresses per provider:
   - deBridge needs native `0x000…0` (18 dp) for Arc USDC.
   - Everyone else uses `0x3600…` (6 dp).
2. **Fan out** quotes in parallel with a ~3 s timeout. Include only providers that list both chains; see the §1 table for testnet.
3. **Compute net received in USD for each quote:**
   `net = outAmount·price(tokenOut) − sourceGasUSD − destinationGasUSD (if the user must mint/claim) − extraFixedFees (e.g. deBridge fixFee × native price)`.
   Use Chainlink (mainnet) or LI.FI/Circle rates for prices (`prices-and-oracles.md`).
4. **Filter:**
   - Drop routes outside provider limits (e.g. Across `minDeposit`) and quotes that expired.
   - Drop routes that need a destination wallet the user doesn't have, unless the route has forwarding.
   - Drop time estimates above the user's speed preference. CCTP Standard from Base is ~13–19 min, while intents are seconds.
5. **Rank** by `net`, tie-breaking on time. Present at most 3 options as a generative UI card: provider, you receive, total fee, ETA, and a trust label ("Circle native burn/mint" vs "third-party solver/intent").
6. **Execute** via the chosen provider's own tx data:
   - App Kit for CCTP and Gateway.
   - `txData` / `steps` for Socket, Relay, LI.FI, and deBridge.
   - Track status with the provider's status API. For CCTP, poll Iris `/v2/messages`.

## 3. Expected outcome today (from the samples)

| Direction (100 USDC) | Cheapest | Runner-up | Worst sampled |
|---|---|---|---|
| Base → Arc | CCTP Fast (~$0.003 fee + ~$0.016 if forwarded) or CCTP Standard ($0, slow) | Across direct (~$0.013) | deBridge (~$2.74 incl. 0.001 ETH fixFee) |
| Arc → Base | CCTP ($0 protocol fee; + ~$0.054 forward fee or Base gas to self-mint) | Across direct (~$0.014) | deBridge (~$1.08) |

Implications:
- For plain USDC, the comparison will almost always pick CCTP or Across. The value of an aggregator comparison is **transparency**, plus coverage of non-USDC and crosschain-swap cases (e.g. Arc USDC → Solana USDC or Base ETH via Relay/LI.FI).
- Call **Across and Relay directly** rather than through LI.FI or Socket, whose default fees (0.25% and 20 bps) wiped out the difference in the samples. Keep LI.FI and Socket for routes the direct APIs don't cover.
- Monetization: App Kit custom fees (90/10 with Arc) apply to CCTP routes. LI.FI and Socket support integrator fees (`feeBps`, integrator string). Direct Across and Relay app-fee options were not checked [UNKNOWN].

## 4. Testnet demo reality

Only CCTP, Gateway, and LI.FI intents list Arc Testnet. A testnet demo can show a real comparison between App Kit Bridge (CCTP) and LI.FI, with other providers rendered as "mainnet only". Alternatively, show mainnet quotes read-only next to a testnet execution, labelled clearly.

## 5. Risks and open questions
- Quote freshness: Socket quotes carry `expiresAt`, and Gateway attestations expire in 10 min. Re-quote before signing.
- Solver and intent routes (Relay, Across, Socket RFQ, LI.FI intents) add counterparty trust assumptions that CCTP burn/mint does not. Show this on the card.
- Rate limits: keyless LI.FI, Socket, and GeckoTerminal will throttle. Cache per `(pair, size bucket)` for ~15 s.
- Unknown: LayerZero/Stargate, Squid, 0x, and 1inch pricing without keys.
