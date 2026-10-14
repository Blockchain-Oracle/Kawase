# Docs pack: routes lane (swap and bridge venues on Arc 5042)

Checked live 2026-10-14 with keyless read-only calls (5 USDC `0x3600…0000` to EURC `0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1`, and Arc to Base USDC, placeholder wallet). "UNVERIFIED" means I could not confirm it. `node_modules` is not installed in this checkout, so no `.d.ts` was read; everything below comes from docs, live responses and the repo's adapters.

## 1. Versions
No new package is needed. All venues are plain `fetch` from `apps/api` (Hono) plus viem 2.57.0. Pinned in `packages/integrations/app-kit`: `@circle-fin/app-kit` 1.15.3, `@circle-fin/adapter-viem-v2` 1.18.0. Existing adapters to extend: `packages/integrations/kyberswap/src/index.ts`, `packages/integrations/bridges/src/{across,relay,debridge,lifi}.ts`, `apps/api/src/swap/venues.ts`.

## 2. Venue matrix (Arc 5042, mainnet)

| Venue | Arc | Auth | Recipient | Min-out | Executes from an EOA |
|---|---|---|---|---|---|
| KyberSwap | swap yes | keyless, `x-client-id: kawase`, 3 rps | `recipient` in build body | `slippageTolerance` bps (max 2000) | approve router `0x6131B5fa…37b5`, then router call |
| LI.FI | swap + bridge yes | keyless 75 `/quote` per 2 h | `toAddress` | `slippage` decimal (0.005), `estimate.toAmountMin` | approve `estimate.approvalAddress`, send `transactionRequest` |
| Circle App Kit | USDC, EURC, cirBTC only | `apiKey` optional | `to.recipientAddress` | `slippageBps` (default 300) or `stopLimit` | repo captures kit calls (see below) |
| Uniswap Trading API | yes, router `0x8702463e73f74d0b6765aBceb314Ef07aCb92650` | key, 6 rps | `recipient` | `slippageTolerance` percent or `autoSlippage` | Permit2 flow |
| 0x v2 | swap yes (cross-chain via Across, Relay, Circle) | key, ~5 rps | `recipient` | `slippageBps`; `minBuyAmount` in reply | AllowanceHolder |
| Socket v3 | yes, 3 swap routes + 6 bridge routes seen | keyless `public-backend.socket.tech`, shared limit | `receiverAddress` | `slippage` percent; `minAmountOut` | approve, then `txData.object` |
| Gas.zip | Arc as source only | keyless | `to` | guaranteed 60 s with `from`+`to` | one native-value tx |
| Across | yes | keyless today | `recipient` | `minOutputAmount` | approve + SpokePool deposit |
| Relay | yes | `x-api-key` optional | `recipient` | `slippageTolerance` bps (swaps) | `steps[].items[].data` |
| deBridge DLN | chain listed, USDC not accepted (below) | keyless | `dstChainTokenOutRecipient` | fixed by order | approve `allowanceTarget` + `tx` |

Live sanity (5 USDC to EURC, base units): Kyber 4,461,703; Socket 4,453,654 (after a 20 bps fee); LI.FI 4,450,549 (after its 0.25% fixed fee). Arc to Base 5 USDC: Across 4,996,076 in 2 s; LI.FI 4,986,502; Socket 4,985,989; Relay 4,976,487.

## 3. Per venue

**KyberSwap** (done, keep): `GET https://aggregator-api.kyberswap.com/arc/api/v1/routes?tokenIn&tokenOut&amountIn` then `POST /arc/api/v1/route/build {routeSummary, sender, recipient, slippageTolerance, deadline, source}`. Replies `{code:0,data}`. Re-quote when `Date.now()` is old; build re-prices. Fee params (do not use; `checkKyberSwap` rejects any `feeAmounts`): `feeAmount, chargeFeeBy, isInBps, feeReceiver`. A bad token returns code 4011 "token not found".

**LI.FI**: `GET https://li.quest/v1/quote?fromChain=5042&toChain=8453&fromToken&toToken&fromAmount&fromAddress&toAddress&slippage=0.005&integrator=kawase` returns `transactionRequest {to,data,value}`, `estimate.approvalAddress`, `estimate.toAmountMin`. Arc swaps run through the diamond `0xA4072583658Fae592A3506A42431cb6316a8d40b` (verified: approval and `to` are the same). `POST /v1/advanced/routes {fromChainId, toChainId, fromTokenAddress, toTokenAddress, fromAmount, fromAddress, toAddress, options:{integrator, slippage, order:"CHEAPEST", fee, bridges:{allow}}}` returns routes with no calldata; call `/v1/advanced/stepTransaction` per step for it (50 per 2 h keyless). Key header `x-lifi-api-key` (portal.li.fi; price UNVERIFIED). `fee` (our integrator fee, 0 to 1) needs the integrator registered in the portal (UNVERIFIED).

**Circle App Kit** (`kit.swap`, 1.15.3): on Arc only USDC, EURC, cirBTC; docs say mainnet is supported and an API key only lifts the shared limit (`kitKey` is legacy, renamed `apiKey`; one key per environment). Provider fee is always 2 bps. Options: `config:{apiKey, slippageBps, stopLimit, customFee:{percentageBps, recipientAddress}}` (Arc keeps 10% of any custom fee); `to:{recipientAddress}` for a same-chain other recipient, `to:{chain, recipientAddress}` cross-chain. The repo's `prepareSwap` passes `allowanceStrategy:"approve"` and captures calls instead of signing; the repo comment says testnet only, so check whether `app_kit` is blocked on 5042 in code before listing it on mainnet. Bridge: `kit.bridge({from,to,amount,config:{transferSpeed:"FAST", maxFee}})`, CCTP V2 under the hood.

**Uniswap Trading API** (`https://trade-api.gateway.uniswap.org/v1`, headers `x-api-key`, `content-type`, `accept`, optional `x-universal-router-version`; key from developers.uniswap.org dashboard, cost UNVERIFIED). Flow, all confirmed in the OpenAPI at `/v1/api.json`:
```ts
const h = { "x-api-key": KEY, "content-type": "application/json", accept: "application/json" };
const q = await (await fetch(`${API}/quote`, { method: "POST", headers: h, body: JSON.stringify({
  type: "EXACT_INPUT", amount, tokenIn, tokenOut, tokenInChainId: 5042, tokenOutChainId: 5042,
  swapper: wallet, recipient: wallet, slippageTolerance: 0.5, routingPreference: "BEST_PRICE",
  generatePermitAsTransaction: true, permitAmount: "EXACT" }) })).json();
// q: { routing, quote (min out in quote.aggregatedOutputs), permitData, permitTransaction, swapTransaction }
const s = await (await fetch(`${API}/swap`, { method: "POST", headers: h, body: JSON.stringify({ quote: q.quote, permitData: q.permitData }) })).json(); // s.swap = {to,data,value}
```
First approve Permit2 (`/check_approval` returns `approval`). With `generatePermitAsTransaction:true` the permit is a transaction, so the whole thing batches in one 7702 call with no signature (shape of `permitTransaction` UNVERIFIED live). There is also `/swap_7702`. `slippageTolerance` is percent (0.5 = 0.5%). `routing` can be `DUTCH_*` (UniswapX): send those to `/order`, not `/swap`; restrict with `protocols:["V2","V3","V4"]` or refuse them. `integratorFees` adds our fee. Router 2.0 and 2.1.1 end 2026-10-21; Arc has only 2.1.2.

**0x v2**: `GET https://api.0x.org/swap/allowance-holder/quote?chainId=5042&sellToken&buyToken&sellAmount&taker&recipient&slippageBps=50` with headers `0x-api-key` and `0x-version: v2` (a keyless call returns "No API key found", confirmed). Reply: `transaction {to,data,value,gas}` (field names from the v2 docs, example truncated), `minBuyAmount`, `issues.allowance.spender` (the AllowanceHolder, `0x0000000000001fF3684f28c67538d4D072C22734`). Approve that spender for the sell amount, then send `transaction`. `swapFeeBps/swapFeeRecipient/swapFeeToken` for our fee (cap 1000 bps). `/swap/permit2/quote` is the advanced path; use AllowanceHolder.

**Socket v3** (the old Bungee v1 host `public-backend.bungee.exchange` returns 410): `GET https://public-backend.socket.tech/v3/swap/quote?userOps=tx&originChainId=5042&destinationChainId=8453&inputToken&outputToken&inputAmount&userAddress&receiverAddress&slippage=0.5`. Reply `result.routes[]`: `quoteId, expiresAt, output{amount,minAmountOut}, approval{spenderAddress,amount,tokenAddress}, txData{kind:"evm_tx", object{chainId,to,data,value}}, gasFee, statusCheck`. Status `GET /v3/swap/status?quoteId` until `COMPLETED|FAILED|EXPIRED|REFUNDED`. Providers include 0x, Kyber, Bitget, Across, CCTP V2, Relay, Symbiosis; filter with `includeProvider/excludeProvider`. Money-path catch: with no fee params every route carried a 20 bps fee to Socket's taker (`feeDetails.feeBps:20`), already netted in `output.amount`; `feeBps=0` is rejected with 400. Calldata is opaque (no decode), so verify `to == approval.spenderAddress`, value 0, `minAmountOut`, and witness the receipt. Tiers: public (no auth, shared limit), `backend.socket.tech` (domain whitelist), `dedicated-backend.socket.tech` (`x-api-key` + `affiliate`, 20 rps).

**Gas.zip**: `GET https://backend.gas.zip/v2/quotes/<depositChain>/<depositWei>/<outChains,...>?from=0x..&to=0x..` returns `quotes[{chain,expected,usd,speed}]`, `calldata`, `contractDepositTxn {to,data,value}`, `expires`. Arc to Base/Arbitrum worked (1 USDC = `1e18` wei, because Arc's native USDC has 18 decimals; reply `contractDepositTxn.to` `0x9E22…8390`, which I did not match to a documented forwarder). Base to Arc returned "Insufficient Liquidity", so use it only for "send gas to another chain". Limits for Arc from `/v2/chains`: min 0.015, max 750 USD. Track: `GET /v2/deposit/<hash>`.

**Across**: current adapter uses `GET https://app.across.to/api/swap/approval?tradeType=exactInput&amount&inputToken&outputToken&originChainId&destinationChainId&depositor&recipient` (returns `swapTx`, `expectedOutputAmount`, `minOutputAmount`, `expectedFillTime`). Direct alternative: `GET /api/suggested-fees` (`outputAmount`, `spokePoolAddress 0x9b4A302A548c7e313c2b74C461db7b84d3074A84`, `limits.minDeposit`, `estimatedFillTimeSec`) plus `depositV3`/`deposit`. Fees: `appFee` (0 to 1) + `appFeeRecipient`; `integratorId` 2-byte hex. Docs say an API key (`Authorization: Bearer`) and integratorId are required for production; keyless works today. `/api/available-routes` confirmed Arc to Base USDC and USDbC.

**Relay**: `POST https://api.relay.link/quote/v2 {user, recipient, originChainId:5042, destinationChainId, originCurrency, destinationCurrency, amount, tradeType:"EXACT_INPUT", slippageTolerance:"50", appFees:[{recipient,fee:"25"}], authorizationList?}`. Reply `steps` (`approve`, `deposit`; each `items[].data {to,data,value,chainId}`), `fees`, `details.timeEstimate`, `requestId`. Status `GET /intents/status/v3?requestId`. Keyless gave `x-ratelimit-limit: 30, 10` (reading UNVERIFIED); docs: 50 `/quote` per minute per key.

**deBridge DLN**: `GET https://dln.debridge.finance/v1.0/dln/order/create-tx?srcChainId&srcChainTokenIn&srcChainTokenInAmount&dstChainId&dstChainTokenOut&dstChainTokenOutAmount=auto&dstChainTokenOutRecipient&srcChainOrderAuthorityAddress&dstChainOrderAuthorityAddress&senderAddress&affiliateFeePercent&affiliateFeeRecipient`. Finding: Arc 5042 is listed, but Arc native USDC `0x3600…` was refused as both source and destination ("token is not supported"); its Arc token list (86 tokens) has EURC `0xbef5…` and two other USDC contracts (`0x8e98a62a…f8f9d9`, `0xb67f50fd…151ed5`), not ours. Untested with a real funded wallet (a placeholder was flagged by compliance). Treat deBridge as Arc-USDC unavailable until a real quote works.

## 4. Money-path defaults and performance
- Quote every venue in parallel with a per-venue timeout (repo: `SWAP_VENUE_TIMEOUT_MS`; App Kit 30 s); rank by `minOut`, not `expected`.
- Always send `recipient = user` and re-check it in calldata where decodable (Kyber, Across, Uniswap Universal Router); for opaque ones (LI.FI, Socket, 0x, Relay, deBridge) check target, spender, zero native value and witness the receipt.
- Approve exactly `amountIn`, never infinite; batch approve + call in one EIP-7702 transaction.
- Keyless budgets: LI.FI 75 quotes per 2 h is the real limit (one per swap preview). Cache 10 to 15 s, quote LI.FI only on review, or take a portal key. Kyber 3 rps per client id.
- Quote expiry: Socket `expiresAt`, Gas.zip `expires` (60 s), Across `quoteTimestamp`. Re-quote at confirm.

## 5. Logos (pipeline: `packages/identity/build.mjs`)
Drop `svg/<slug>.svg` and `svg/<slug>-mono.svg` (black/white fills become `currentColor` only for `-mono`), add a row to `PROVENANCE.md`, run `node packages/identity/build.mjs` (SVGR + SVGO, native + web, adds `MARKS["<slug>"]`). Present: kyberswap, lifi, across, relay, debridge, circle. Missing for this lane:
- uniswap: `@web3icons/core` `dist/svgs/exchanges/{background,mono}/uniswap` (MIT).
- 0x: `tokens/{background,mono}/ZRX`.
- cctp: reuse `circle` with label "CCTP".
- socket/bungee and gas.zip: no web3icons or simple-icons entry (simple-icons `socket` and `relay` are other companies). Only rasters found (gas.zip `/favicon/*.png`, socket.tech `/favicon.png`); wait for a vector, per PROVENANCE policy.
- Runtime fallback only (webp, not SVG): `https://icons.llamao.fi/icons/protocols/<slug>` with slugs `kyberswap`, `li.fi`, `uniswap`, `0x`, `matcha`, `bungee`, `socket-protocol`, `gas-zip`, `across`, `relay`, `debridge`, `circle-cctp` (all HTTP 200; `lifi`, `socket`, `relay-link` are 404).

## 6. Sources
Kyber docs (ctx7 `/kybernetwork/kyberswap-documentation`); LI.FI https://docs.li.fi/api-reference/rate-limits (ctx7 `/websites/li_fi`); Arc App Kit https://docs.arc.io/app-kit/swap.md and `/concepts/swap-fees.md`; Uniswap https://developers.uniswap.org/docs/trading/swapping-api/supported-chains and https://trade-api.gateway.uniswap.org/v1/api.json (ctx7 `/websites/developers_uniswap`); 0x https://docs.0x.org/docs/introduction/supported-chains.md and `/docs/developer-resources/rate-limits.md` (ctx7 `/websites/0x`); Socket https://docs.socket.tech/llms-full.txt; Gas.zip https://dev.gas.zip/gas/api/quote (ctx7 `/websites/dev_gas_zip`); Across https://docs.across.to/introduction/api-keys (ctx7 `/llmstxt/across_to_llms_txt`); Relay https://docs.relay.link/references/api/get-quote-v2 (ctx7 `/websites/relay_link`); deBridge https://docs.debridge.com (ctx7 `/websites/debridge`); Circle (ctx7 `/websites/developers_circle`).
