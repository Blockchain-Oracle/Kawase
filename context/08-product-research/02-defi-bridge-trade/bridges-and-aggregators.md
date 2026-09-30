# Bridges and bridge aggregators that reach Arc

Purpose: which bridges and aggregators support Arc mainnet (5042) and testnet (5042002) today, which tokens and routes they carry, and whether an agent can get a machine-readable quote from each.

Sources (all raw responses saved under `.firecrawl/product/02-defi/`, fetched 2026-09-29 ~01:50–02:10 UTC; referred to below as `E/`):
- LI.FI: `https://li.quest/v1/chains`, `/v1/tokens`, `/v1/tools`, `/v1/quote`, `/v1/advanced/routes` → `E/lifi-*.json`
- Relay: `https://api.relay.link/chains`, `https://api.testnets.relay.link/chains`, `POST https://api.relay.link/quote` → `E/relay-*.json`
- Across: `https://app.across.to/api/available-routes`, `https://testnet.across.to/api/available-routes`, `/api/suggested-fees` → `E/across-*.json`
- deBridge DLN: `https://dln.debridge.finance/v1.0/supported-chains-info`, `/token-list`, `/dln/order/create-tx` → `E/debridge-*.json`
- Socket (formerly Bungee): `https://public-backend.socket.tech/v3/swap/supported-chains`, `/v3/swap/quote`; https://docs.socket.tech/about/chain-support.md → `E/socket-*.json|md`; old Bungee host → `E/bungee-*.json` (HTTP 410)
- Squid: `https://v2.api.squidrouter.com/v2/chains` → `E/squid-chains.json` (needs `x-integrator-id`)
- LayerZero / Stargate: `https://metadata.layerzero-api.com/v1/metadata/deployments`, `https://transfer.layerzero-api.com/v1/chains|tokens|quotes` → `E/lz-*.json`; `https://stargate.finance/api/v1/chains` → `E/stargate-chains.json` (deprecated)
- Wormhole: `wormhole-foundation/wormhole-sdk-ts` constants (`E/wormhole-sdk-*.ts`)
- Hyperlane: `hyperlane-xyz/hyperlane-registry` `chains/arc/*`, `deployments/warp_routes/USDC/mainnet-cctp-v2-*-config.yaml` → `E/hyperlane-*.yaml`
- Axelar: `https://api.axelarscan.io/api/getChains` → `E/axelar-chains.json`
- Chainlink CCIP: `https://docs.chain.link/api/ccip/v1/chains?environment=mainnet|testnet`, `/tokens` → `E/ccip-*.json`
- Circle CCTP V2 Iris fees: `https://iris-api.circle.com/v2/burn/USDC/fees/{src}/{dst}` → `E/cctp-fees-*.json`
- Circle Gateway: `https://gateway-api.circle.com/v1/info` → `E/gateway-info-mainnet.json`
- App Kit / Bridge Kit npm packages (`@circle-fin/bridge-kit@1.15.1`, `@circle-fin/app-kit@1.15.3`), unpacked and grepped
- Arc launch blog partner list: https://www.arc.io/blog/arc-economic-os-internet
- 0x cross-chain table: https://docs.0x.org/docs/introduction/supported-chains.md → `E/0x-supported-chains.md`
- `eth_getCode` checks: `E/onchain-checks-2026-09-29.txt`
- Existing library: `context/03-circle-platform/cctp.md`, `gateway.md`, `context/01-arc/app-kit.md`

Verified: 2026-09-29

## Summary matrix

"Lists 5042 / 5042002" means the provider's own chain API or registry returns that chain ID. Contract code was checked with `eth_getCode` (`E/onchain-checks-2026-09-29.txt`).

| Provider | Mainnet 5042 | Testnet 5042002 | Arc tokens / routes seen | Keyless quote API? | Status |
|---|---|---|---|---|---|
| **Circle CCTP V2** (domain 26) | Yes | Yes | USDC (+ EURC, WETH, cirBTC via CCTPx in App Kit) | Fee API yes (`/v2/burn/USDC/fees`), no key | [VERIFIED] |
| **Circle Gateway** (domain 26) | Yes (`/v1/info` lists `Arc`, domain 26) | Yes (existing `gateway.md`) | USDC only | Fees are documented; `POST /v1/estimate` exists (not called) | [VERIFIED] |
| **App Kit Bridge** | Yes | Yes | USDC, EURC, WETH, cirBTC | `kit.estimateBridge()` (SDK) | [VERIFIED] wraps CCTP V2 + CCTPx only |
| **LI.FI** | Yes (`key: "arc"`) | Yes (`key: "arct"`) | Mainnet: 41 tokens incl. memes. Testnet: USDC, EURC | Yes, no key | [VERIFIED] |
| **Relay** | Yes | **No** (testnet API lists only 84532, 11155111) | USDC (+ native USDC), cirBTC (solver currency, `supportsBridging:false`) | Yes, no key | [VERIFIED] |
| **Across** | Yes (41 routes touch 5042) | **No** (0 testnet routes) | USDC `0x3600…` ↔ USDC/USDC.e/USDbC/USDG/pathUSD on 18 chains | Yes, no key | [VERIFIED] |
| **deBridge DLN** | Yes (`chainId: 5042`) | No | Token list incl. EURC, WETH, memes; `0x3600…` rejected, native `0x000…0` accepted | Yes, no key | [VERIFIED] |
| **Socket** (Bungee rebranded) | Yes (`/v3/swap/supported-chains`) | Not listed | USDC via rfq-vault-executor, cctp-v2, cctp-v2-slow, across, relay, symbiosis | Yes, no key | [VERIFIED] |
| **Squid** | [UNKNOWN] | [UNKNOWN] | – | API requires `x-integrator-id` (no account created) | [UNKNOWN] |
| **LayerZero (Value Transfer API / Stargate)** | Yes (EID 30417, EndpointV2 has code) | Yes in deployments (EID 40434) | VT tokens on `arc`: USDC `0x3600…` (supported), weETH | Quote endpoint returned `{"error":"Unauthorized"}` | Chain [VERIFIED]; quotes need a key |
| **Wormhole** | Yes (Wormhole chain id 71; core `0xC8aD…F027` has code) | Yes in SDK (5042002); token bridge `0xCD6b…B798` has code on both | [UNKNOWN] which tokens | SDK only (no quote API checked) | [VERIFIED] contracts |
| **Hyperlane** | Yes (`domainId: 5042`, Mailbox has code) | No registry entry | USDC warp routes `mainnet-cctp-v2-standard/fast` include `arc` (router `0x16BF…1b71`) | No aggregator-style quote API checked | [VERIFIED] |
| **Axelar** | **No** (`getChains` has no 5042/"arc") | No | – | – | [VERIFIED] absent |
| **Chainlink CCIP** | Yes (`arc-mainnet`, selector `6370580034781731079`, router `0xB797…3A18`) | Yes (`arc-testnet`, selector `3034092155422581607`, router `0xdE4E…eab8`) | Mainnet token list with Arc entries: LINK, syrupUSDC, VIRTUAL, PST | No quote API (on-chain `getFee`) | [VERIFIED] |
| **0x (cross-chain API)** | Yes: Across V4, Relay, Circle Std, Circle Fast | – | – | Needs 0x API key (`{"message":"No API key found in request"}`) | [VERIFIED] docs |
| Others named at launch: Eco, Fast, Aleo (via xReserve) | – | – | – | – | [REPORTED] arc.io blog only |

LI.FI's `/v1/tools?chains=5042` lists these bridges on Arc: `across, symbiosis, gasZipBridge, relaydepository, polymer, polymerStandard, eco, lifiIntents, garden, smartDeposits, layerswap`. On testnet only `lifiIntents` (`E/lifi-tools-arc*.json`). LI.FI has no `cctp` tool key on Arc. Circle's own docs tell bridge integrators: "If your bridge aggregates routes, prefer the CCTP path for USDC and EURC transfers to and from Arc" (`.firecrawl/docs/arc-llms-full.txt:38748`).

## Live fee comparison: 100 USDC, Base ↔ Arc mainnet (2026-09-29 ~02:00 UTC)

Dummy sender `0xd8dA…6045` (quotes only; no transactions sent). "Out" is USDC received on the destination.

### Base → Arc

| Route | Out (USDC) | Cost vs 100 | Time estimate | Evidence |
|---|---|---|---|---|
| CCTP V2 Standard (`finalityThreshold 2000`) | 100.00 minus Arc mint gas (self-mint) or minus forward fee 0.015638 | $0 protocol fee | Base finality, ~13–19 min (`cctp.md`) | `E/cctp-fees-base-to-arc*.json` |
| CCTP V2 Fast (`1000`) | minimumFee 0.325 bps → ~0.00325, + optional forward fee 0.015638 | ~$0.003–0.019 | ~8–20 s (`cctp.md`) | same |
| Across (direct API) | ~99.987 (totalRelayFee 13011 = 0.0130) | $0.013 + Base gas | `estimatedFillTimeSec: 0` | `E/across-fees-base-to-arc-100usdc.json` |
| Relay (direct API) | 99.968514 | $0.0315 relayer + $0.0038 Base gas | 1 s | `E/relay-quote-base-to-arc-100usdc.json` |
| Socket V3 (best route, "Socket Intents") | 99.797042 | $0.20 (includes default `feeBps: 20`) | 3 s | `E/socket-quote-base-to-arc.json` |
| LI.FI (best of 7 routes, `polymerStandard`) | 99.750000 | $0.25 (LI.FI 0.25% fee) | 1080 s | `E/lifi-routes-base-to-arc-100usdc.json` |
| LI.FI via Across | 99.737015 | $0.263 | ~0 s | same |
| deBridge DLN | 99.920015 (native USDC, 18 dp) **plus fixFee 0.001 ETH on Base** (~$2.66 at ETH $2,662) | ~$2.74 | ~1 s | `E/debridge-quote-base-to-arc-100usdc.json` |
| Gateway (unified balance spend) | 0.5 bps + Base burn gas $0.01 ≈ $0.015 (documented, `gateway.md`) | ~$0.015 | <500 ms after a finalized deposit | `gateway.md` |
| LayerZero VT | – | – | – | 401 Unauthorized |

### Arc → Base

| Route | Out (USDC) | Cost | Time | Evidence |
|---|---|---|---|---|
| CCTP V2 (both thresholds `minimumFee: 0`) | 100.00 minus Base mint gas (self) or minus forward fee 0.054358 | $0 protocol fee | Arc attestation ~0.5 s (`cctp.md`) | `E/cctp-fees-arc-to-base*.json` |
| Across | ~99.986 (totalRelayFee 13665) | $0.0137 | 2 s | `E/across-fees-arc-to-base-100usdc.json` |
| Relay | 99.926874 | $0.0731 relayer | 2 s | `E/relay-quote-arc-to-base-100usdc.json` |
| Socket V3 | rfq 99.796422 (3 s); cctp-v2 99.792409 (15 s); cctp-v2-slow 99.792770 (1205 s); across 99.786354; relay 99.726686 | includes `feeBps: 20` | – | `E/socket-quote-arc-to-base.json` |
| LI.FI best (`lifiIntents`) | 99.741719 | 0.25% fee | 6 s | `E/lifi-routes-arc-to-base-100usdc.json` |
| deBridge | 99.920017 plus fixFee 1.0 native USDC on Arc | ~$1.08 | – | `E/debridge-quote-arc-to-base-100usdc.json` |

Testnet: CCTP Arc Testnet → Base Sepolia shows `minimumFee: 0` for both thresholds (`E/cctp-fees-arct-to-basesep.json`). That supersedes the older "~1.4 USDC max fee out of Arc testnet" note in `app-kit.md` for the fee API [VERIFIED]. Whether the on-chain burn still enforces a minimum was not tested [UNKNOWN].

Findings:
- For **USDC**, direct CCTP (App Kit Bridge) is the cheapest route in both directions: $0 protocol fee. Across direct is the cheapest third party (~$0.013) [VERIFIED, one sample at 100 USDC].
- **Aggregator APIs add their own default fees.** LI.FI adds 0.25% ("LI.FI charges a 0.25% service fee on each transaction", https://docs.li.fi/faqs/fees-monetization) and Socket adds `feeBps: 20`. Calling Across or Relay **directly** was 10–20× cheaper than the same bridge through LI.FI [VERIFIED]. Whether an integrator can set these defaults to 0 is [UNKNOWN].
- deBridge's fixed fee dominates at small sizes [VERIFIED].
- Bridging to **Solana** from Arc works through Relay (99.909886 USDC out, $0.090 relayer, `E/relay-quote-arc-to-solana-100usdc.json`) and LI.FI (`polymerStandard`, 99.73005, `E/lifi-quote-arc-to-solana-100usdc.json`). Arc USDC → Base **ETH** through Relay gave 0.037484 ETH for 100 USDC (`E/relay-quote-arc-usdc-to-base-eth-100.json`) [VERIFIED].

## Per-provider details an agent needs

### Circle CCTP V2 / App Kit Bridge
- App Kit Bridge depends only on `@circle-fin/provider-cctp-v2` and `@circle-fin/provider-cctpx` (bridge-kit 1.15.1 `package.json`), with classes `BridgingProvider`, `CCTPXBridgingProvider`, and `CustomBridgingProvider`. It does **not** wrap any third-party bridge or aggregator [VERIFIED].
- Fee API (no key): `GET https://iris-api.circle.com/v2/burn/USDC/fees/{srcDomain}/{dstDomain}[?forward=true]` returns `[{finalityThreshold, minimumFee (bps), forwardFee{low,med,high} (USDC base units)}]`. Sandbox: `iris-api-sandbox.circle.com` [VERIFIED].
- SDK: `kit.estimateBridge(params).fees` [VERIFIED docs, `app-kit.md`].

### Circle Gateway
- `GET https://gateway-api.circle.com/v1/info` works without a key and lists 13 mainnet domains including `{"domain":26,"chain":"Arc"}` [VERIFIED]. This confirms the mainnet host that `gateway.md` marked "unverified".
- USDC only. Needs a prior deposit and source finality before a spend, so it is a "pre-funded balance" rail, not a per-transfer bridge [VERIFIED docs].

### LI.FI
- Keyless: `GET /v1/quote` (single best), `POST /v1/advanced/routes` (all routes; `options.order: "CHEAPEST"|"FASTEST"`), `GET /v1/tools`, `GET /v1/tokens?chains=5042`. `GET /v1/connections` needs `toChain` [VERIFIED].
- Fee fields: `estimate.feeCosts[]{name, amountUSD, included}`, `estimate.gasCosts[].amountUSD`, `toAmount`, `toAmountMin`, `executionDuration`. `unavailableRoutes.filteredOut|failed` explain rejected paths [VERIFIED].
- Arc diamond `0xA4072583658Fae592A3506A42431cb6316a8d40b` (code 254 B, proxy-sized). Testnet diamond `0xFf70F4A1d11995621854F3692acF286d8aCd04b2` [VERIFIED].
- LI.FI's testnet chain entry still points at the legacy `rpc.testnet.arc.network` and `testnet.arcscan.app` [VERIFIED].

### Relay
- `POST https://api.relay.link/quote` with `{user, recipient, originChainId, destinationChainId, originCurrency, destinationCurrency, amount, tradeType}` works keyless. Fee fields: `fees.gas|relayer|relayerGas|relayerService|app|subsidized` (each with `amountUsd`), `details.currencyOut.amountFormatted`, `details.timeEstimate`, `steps[]` (approve, deposit) [VERIFIED].
- The Arc chain entry has `withdrawalFee: 5`, `depositFee: 0`, depository `0x4cD00E387622C35bDDB9b4c962C136462338BC31` (code present), and tag `"New"` [VERIFIED]. The units of `withdrawalFee` are not documented in the response [UNKNOWN].

### Across
- Route list: `GET https://app.across.to/api/available-routes`. Fee: `GET /api/suggested-fees?inputToken&outputToken&originChainId&destinationChainId&amount` → `totalRelayFee{pct,total}`, `lpFee`, `relayerCapitalFee`, `relayerGasFee`, `estimatedFillTimeSec`, `limits{minDeposit,maxDeposit,...}`. Base→Arc min deposit 0.500040 USDC; max instant 73,152 USDC [VERIFIED].
- Arc routes (all from/to Arc USDC `0x3600…`): chains 1, 10, 56, 130, 137, 143, 324, 480, 999, 1868, 4217, 4663, 8453, 42161, 43114, 57073, 59144 [VERIFIED].

### deBridge DLN
- `GET /v1.0/dln/order/create-tx?srcChainId&srcChainTokenIn&srcChainTokenInAmount&dstChainId&dstChainTokenOut&dstChainTokenOutAmount=auto&prependOperatingExpenses=true` (keyless). Fees: `fixFee` (source native, wei), `protocolFee`, `estimation.costsDetails[]` [VERIFIED].
- On Arc it accepts **native USDC `0x000…0` (18 dp)**, not `0x3600…` ("The token you provided as dstChainTokenOut is not supported") [VERIFIED].

### Socket (Bungee)
- Old `public-backend.bungee.exchange` returns HTTP 410 "Bungee API has been deprecated, migrate to Socket V3 APIs" [VERIFIED].
- `GET https://public-backend.socket.tech/v3/swap/quote?userOps=tx&originChainId&destinationChainId&inputToken&outputToken&inputAmount&receiverAddress&userAddress` works keyless. It returns multiple `routes[]` with `routeDetails.bridgeDetails.protocol.name`, `output.amount`, `minAmountOut`, `estimatedTime`, `feeDetails{feeBps,feeAmount}`, `approval`, and `txData` [VERIFIED].
- Arc gateway `0x50c4E75a512F2A14A7b304787Adf79C4531A5909` and executor `0x50cFe7c1938dB66A1a6D2e86D36F39FBef3d5c4a` (docs table; code present) [VERIFIED].

### LayerZero / Stargate
- `stargate.finance/api/v1/chains` returns "This API is deprecated. Please use the VT chains API at https://transfer.layerzero-api.com/v1/chains" [VERIFIED]. VT chains lists `{"name":"Arc","chainKey":"arc","chainId":5042}`. VT tokens on `arc`: USDC `0x3600…` (`isSupported: true`), weETH `0xA3D6…914b` [VERIFIED].
- `POST /v1/quotes` → `{"error":"Unauthorized"}`, so an API key is required [VERIFIED]. The agent cannot price it without onboarding.

### Hyperlane, Wormhole, CCIP
- These are messaging and token-transfer protocols, not consumer quote APIs. Hyperlane's Arc USDC routes are CCTP-V2-backed warp routes (`tokenType: collateralCctp`) connecting Arc with arbitrum, avalanche, base, ethereum, hyperevm, and others (`E/hyperlane-usdc-cctp-v2-standard-config.yaml:314-324`) [VERIFIED].
- CCIP fee tokens on Arc mainnet: LINK and USDC (testnet adds WUSDC) [VERIFIED]. Not useful for the consumer USDC case, since CCTP is native.

## Gaps
- Squid, Stargate/LayerZero VT, and 0x quotes all need keys or integrator IDs [UNKNOWN pricing].
- Only one size (100 USDC) and one pair (Base) were sampled. Fees vary by size and time.
- Testnet: only CCTP, Gateway, LI.FI (intents), and CCIP list Arc Testnet. **Relay and Across do not.** A testnet demo of "compare aggregators" can only compare CCTP vs LI.FI intents [VERIFIED].
