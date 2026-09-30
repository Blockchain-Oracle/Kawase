# USDC & EURC (plus StableFX / on-chain FX)

Purpose: token facts an agent needs to move dollars/euros correctly on Arc, get test funds, and convert USDC↔EURC.
Sources: `.firecrawl/docs/circle-llms-full.txt` (`/stablecoins/*`, `/stablefx*`, `/api-reference/stablefx*`, release notes usdc-2026, eurc-2026, stablefx-2026), `.firecrawl/docs/arc-llms-full.txt` (stablecoin-native model, contract addresses); prior `arc-agent/docs/wiki/app-kit-cctp-and-gateway.md` (keyless App Kit USDC→EURC quote live on 2026-07-30).
Verified: 2026-09-29

## Arc addresses and decimals

| Token | Arc Testnet (chainId 5042002, `https://rpc.testnet.arc.io`) | Arc Mainnet (chainId 5042, `https://rpc.mainnet.arc.io`) | Decimals |
|---|---|---|---|
| USDC (ERC-20 interface to native balance) | `0x3600000000000000000000000000000000000000` | `0x3600000000000000000000000000000000000000` | 6 (native gas repr = **18**) |
| EURC | `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a` | `0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1` | 6 |
| USYC | `0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C` | `0x8a5D989Bbb96929F689B0200f435f53dA42bF490` | 6 |

Explorers: `https://explorer.testnet.arc.io`, `https://explorer.arc.io`. USDC and EURC on Arc mainnet were added 2026-09-16.

**Arc dual-decimal trap:** native USDC balance (gas, `msg.value`, `eth_getBalance`) uses 18 decimals; the ERC-20 at `0x3600…` uses 6 over the *same* balance. Always use the ERC-20 interface and `decimals()` for app logic; never mix. Circle Wallets `amount` fields are decimal strings ("5" = 5 USDC); contract calls (`abiParameters`) take base units ("5000000").

Other common testnet USDC: Ethereum Sepolia `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`, Base Sepolia `0x036CbD53842c5426634e7929541eC2318f3dCF7e`, Arbitrum Sepolia `0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d`, Avalanche Fuji `0x5425890298aed601595a70AB815c96711a31Bc65`, OP Sepolia `0x5fd84259d66Cd46123540766Be93DFE6D43130D7`, Polygon Amoy `0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582`, Solana Devnet `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`. Mainnet USDC: Ethereum `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48`, Base `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`, Arbitrum `0xaf88d065e77c8cC2239327C5EDb3A432268e5831`. Docs: never hardcode — check `/stablecoins/usdc-contract-addresses`, `/stablecoins/eurc-contract-addresses`.

## Facts

- USDC: 100% cash/cash-equivalent backed, 1:1 USD redeemable, monthly attestations (circle.com/transparency). EURC: euro-backed, **MiCA-compliant**. Both 6 decimals everywhere EVM.
- USDC (FiatToken) supports EIP-2612 `permit` and EIP-3009 `transferWithAuthorization`/`receiveWithAuthorization`; Paymaster uses permit, Gateway deposits and nanopayments/x402 use EIP-3009. Arc's system-level USDC is expected to behave the same, but that isn't verified here, so test `permit` on Arc before relying on it.
- Minting/redeeming for fiat: Circle Mint (institutional, see `other-apis.md`).
- Cross-chain: USDC via CCTP V2/Gateway; EURC via CCTP "expanded assets" (quickstart: transfer EURC Ethereum → Arc).

## Testnet faucets

- **https://faucet.circle.com** — select Arc Testnet; USDC and EURC available. Public faucet is rate-limited (Arc docs; exact quota not documented in fetched pages — prior research noted CLI `circle wallet fund` drips 20 USDC per request for Agent Wallets).
- Programmatic: `POST /v1/faucet/drips` / SDK `requestTestnetTokens({ address, blockchain: "ARC-TESTNET", usdc: true, eurc: true })` — docs say it **requires a mainnet-upgraded Circle account**.
- Gas on Arc = USDC, so faucet USDC covers gas.

## FX: USDC ↔ EURC

1. **StableFX** (Circle) — institutional RFQ FX engine **on Arc**, atomic escrow settlement in `FxEscrow` (Arc mainnet `0xe2E5F173576B513d994073CCbDaCBE027d43DFe6`, Arc testnet `0xd68256f4D69C6BbEcB873D8588AE0Dc6B8E22E10`). **Permissioned**: needs a Circle Hub account (`hub-sandbox.circle.com` / `hub.circle.com`) and StableFX API key; Arc mainnet since 2026-09-16. Pairs on Arc mainnet: USDC, EURC plus partner stablecoins AUDD, AUDF, BRLA, CADD, CHFAU, EURAU, GBPA, JPYC, KRW1, MXNB, QCAD, SEKAU, TRYB, ZARU (addresses in `/stablefx/references/supported-currencies`). API: `POST /v1/exchange/stablefx/quotes` → `POST /v1/exchange/stablefx/trades` → sign (`/signatures`, Permit2 allowance) → `POST /v1/exchange/stablefx/fund`; webhook events for trade confirmed/funded/completed/failed/refunded/breached (subscriptions under `/v2/stablefx/notifications/subscriptions`). Realistically inaccessible to hackathon teams unless Circle grants access.
2. **Arc App Kit Swap** (USDC/EURC/cirBTC on Arc Testnet; keyless server-side estimates worked in prior research) — the practical FX route; covered in App Kit section.
3. Circle Mint cross-currency (fiat-side FX, institutional).

## Agent notes

- Multi-currency AP: hold EURC for EU vendors; convert with App Kit Swap when EUR payables due; log rate used.
- Always store amounts as base-unit integers internally (6 dp) and render as decimals.
