# Gaps and unknowns in the Arc ecosystem census

Purpose: what I could not verify, what is surprisingly missing on Arc, and what to check next. Read this before building a feature on anything in this folder.

Sources: the other files in this folder and the raw evidence under `.firecrawl/product/census/`. Every item below says where I looked.

Verified: 2026-09-29

## Surprisingly absent (looked, not found)

| Missing | Where I looked | Consequence for the agent |
|---|---|---|
| **Official "Arc Academy"** | Web search, Arc House collections, events, and resources | None exists. Arc House courses are "coming soon". The Encode bootcamp is the closest thing. |
| **Official or ENS name service** | Arc docs, Circle PRs, arc.io ecosystem (186 entries), GitHub code search `repo:ensdomains 5042` | Only independent `.arc` registries exist (ArcNS, dotarc, arcname.io, arcnames.co), and they conflict. Use in-app contacts. |
| **Public Arc Portal API** | Portal pages, Circle docs | Our agent can't drive Portal. Portal's own agent-wallet feature is a direct first-party competitor. |
| **Explorer API usable server-side** | `explorer.arc.io/api/v2/*` via curl | Cloudflare challenge. Use RPC, HyperSync (token), Goldsky, Alchemy, or Zerion. |
| **Deep log history on public RPCs** | `eth_getLogs` on Circle, dRPC, QuickNode, and Blockdaemon mainnet RPCs | "range too large" or "pruned". Transaction history needs an indexer. |
| **Uniswap addresses in `@uniswap/sdk-core`** | `src/addresses.ts`, `src/chains.ts` on main | Supply factory and router addresses manually (V3 factory `0xf0db…3918` found via RPC). The router, quoter, and v4 PoolManager are **not captured**. |
| **Launchpad APIs** | DeFiLlama entries, site titles | Meme "launch a token" features need direct contract integration per launchpad. |
| **x402 services on Arc testnet** | Discovery API `network=eip155:5042002` → total 0 | Marketplace demos must use mainnet (small USDC amounts). |
| **ARC token / airdrop** | Circle PR, whitepaper page and PDF, Architects terms | Minted but not launched. No airdrop is announced, and points are explicitly not eligibility. |
| **Chainlink Data Feed addresses on Arc** | Chainlink docs repo (chain, CCIP, and LINK present); reference-data-directory guesses 404 | Use Pyth (verified contract) for prices. |
| **Coinbase Wallet native Arc support** | Circle wallet lists | Not named. Custom network add only [REPORTED]. |

## Unknowns (claims I could not confirm)

1. **Real vs wash volume.** The #1 and #2 pools by volume (BTC/USDB $43M/24h, USDB/ATC $18M) use non-Circle tokens with odd decimals (BTC 9 dp, USDB 8 dp). I labelled this suspicious [INFERENCE]. I could not check holder distribution because the explorer was blocked. Where: `gt-pools_page_1_*.json`, `rpc-token-probes.txt`.
2. **Morpho APYs of ~0.34%** on the $85M/$75M USDC vaults look implausibly low. I did not verify units against the Morpho UI. Where: `morpho-arc2.json`.
3. **ERC-8004 agent count (~332)** comes from an `ownerOf` binary search. It assumes sequential IDs and no burns. The canonical mainnet registry is not documented by Arc as official. Where: `rpc-8004-probe.txt`.
4. **Which CEXs actually support Arc deposits and withdrawals today.** Only Circle's list (20 named). Not checked per exchange.
5. **Wallets beyond MetaMask and Trust Wallet**: Phantom, Rabby, Rainbow, OKX, Ledger, and others are press-level only. Rabby's own chain API did not include 5042.
6. **Stargate**: listed on Portal Discover, but Stargate's `/api/v1/chains` did not return 5042.
7. **Aave V4 SDK or API coverage for Arc**, **Aero SDK**, **KyberSwap/1inch/0x direct APIs**: not tested.
8. **OpenSea Arc support** is from search results and nftcalendar only. The OpenSea API chain slug was not tested.
9. **Local stablecoins** (AUDD, BRLA, JPYC, MXNB, and others): Circle says "Arc supports" them. Only EURC, wARS, and GBPA were observed onchain or in APIs. Addresses are not collected.
10. **BUIDL, JAAA, JTRSY on Arc**: announced "launch natively". No addresses found.
11. **$222M ARC presale at $3B FDV**: secondary (Cryptonomist, citing Circle's Q1 2026 release). I did not open the Q1 release.
12. **Arc House chapter list and member-level data**: the chapter list loads client-side and member data needs sign-in. No API.
13. **Testnet-only apps** named by the airdrop guide (Tower Exchange, Zkcodex, Genesis Pad, InfinityName): not verified. `towerexchange.io` did not resolve (that URL was my guess).
14. **Arc X account (@arc)**: I only used search snippets (e.g. the Arc House launch tweet `x.com/arc/status/2039055536638067161`). I did not read the timeline.
15. **"CRCL — Circle Internet Group • Arc Token"** (two contracts, ~4.7k–5k supply, ~$84 price per LI.FI): it could be a tokenized-stock wrapper or an impersonation. [UNKNOWN]

## Suggested next checks (cheap)

- Open the Morpho UI for Galaxy USDC to confirm the APY units.
- Get an Envio HyperSync token and count ERC-8004 `Registered` events plus meme-token holder counts.
- Pull Uniswap's official Arc deployment addresses (Uniswap docs "deployments" page) for the v3 router and quoter and the v4 PoolManager.
- Test the Across, Relay, LI.FI, and deBridge quote endpoints for Base USDC → Arc USDC (500 USDC) and compare fees against App Kit CCTP. This feeds the "cheapest bridge" feature.
- Load Arc House chapters with a headless browser if regional-chapter features matter.
