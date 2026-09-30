# CCTP V2 (Cross-Chain Transfer Protocol)

Purpose: move native USDC (and EURC via CCTP expanded assets) between Arc and other chains by burn-and-mint — for sweeping customer receipts into the Arc treasury or paying vendors on their chain.
Sources: `.firecrawl/docs/circle-llms-full.txt` (`/cctp`, `/cctp/concepts/*`, `/cctp/references/contract-addresses`, `/cctp/references/technical-guide`, `/cctp/quickstarts/transfer-usdc-ethereum-to-arc`, `/api-reference/cctp/*`, `/release-notes/cctp-2026`); prior `arc-agent/docs/wiki/app-kit-cctp-and-gateway.md` (2026-07-30/08-08).
Verified: 2026-09-29

## Facts

- **Arc domain = 26** (mainnet and testnet). Others: Ethereum 0, Avalanche 1, OP 2, Arbitrum 3, Solana 5, Base 6, Polygon 7, Aptos 9, Unichain 10, Linea 11, Codex 12, Sonic 13, World Chain 14, Monad 15, Sei 16, BNB 17 (USYC only), XDC 18, HyperEVM 19, Ink 21, Plume 22, Starknet 25, Stellar 27, EDGE 28, Injective 29, Morph 30, Pharos 31, Cronos 32, Plasma 33, X Layer 37.
- Arc as source: Standard ✅, Fast **N/A** (Arc standard attestation is already ~0.5 s, 1 block), Upfront fees ✅, Forwarding Service ✅. Arc mainnet added **2026-09-16**; any listed mainnet implies its testnet.
- V1 is legacy; use V2 (Aptos/Noble/Sui still V1-only per index).
- Permissionless: no API key for Iris attestation API.
- Frontend alternative: Bridge Kit / Arc App Kit Bridge wraps this (covered in App Kit section).

## Fees and timing

- **Standard transfer: free.** Finality-based attestation; e.g., Ethereum/Base/Arbitrum sources ~13–19 min (~65 ETH blocks); Arc, Avalanche fast.
- **Fast transfer:** 0–13 bps by source (Ethereum 1, Base 1.3, Arbitrum 1.4, OP 1.3, Solana 1, Linea 13, Starknet 12…), deducted at mint; ~8–20 s. Always fetch live: `GET /v2/burn/USDC/fees/{src}/{dst}`; set `maxFee` with 10–20% buffer; if actual > maxFee → fast degrades to standard (or reverts).
- `minFinalityThreshold`: `<=1000` = Fast, `2000` = Standard (only two values honored).
- Upfront fees: pay fast/forwarding fees on source so recipient receives full amount (USDC only).
- **Forwarding Service:** `depositForBurnWithHook` with hookData `0x636374702d666f72776172640000000000000000000000000000000000000000` ("cctp-forward") → Circle submits the destination mint; poll `/v2/messages` for `forwardTxHash`. Fee: query `.../fees/{src}/{dst}?forward=true`, `maxFee = forwardFee.med + protocolFee`. Removes need for gas/wallet on destination.

## Contract addresses (EVM, V2)

| Contract | Arc mainnet (domain 26) | Testnet (Arc Testnet = Eth Sepolia = Base Sepolia, same address) |
|---|---|---|
| TokenMessengerV2 | `0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d` | `0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA` |
| MessageTransmitterV2 | `0x81D40F21F12A8F0E3252Bccb954D722d4c464B64` | `0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275` |
| TokenMinterV2 | `0xfd78EE919681417d192449715b2594ab58f5D002` | `0xb43db544E2c27092c107639Ad201b3dEfAbcF192` |
| MessageV2 | `0xec546b6B005471ECf012e5aF77FBeC07e0FD8f78` | `0xbaC0179bB358A8936169a63408C8481D582390C4` |
| TokenMessengerWithFees (upfront fees) | (not listed for Arc mainnet in fetched table) | `0x8745D906D67C346E5eb1aEEED38Eb87F34DF0C0A` |

USDC: Arc `0x3600000000000000000000000000000000000000` (both nets); Eth Sepolia `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`; Base Sepolia `0x036CbD53842c5426634e7929541eC2318f3dCF7e`.

## Iris attestation API

Base: testnet `https://iris-api-sandbox.circle.com`, mainnet `https://iris-api.circle.com`. **Rate limit 40 req/s; exceeding blocks you for 5 minutes (429).**

| Endpoint | Use |
|---|---|
| `GET /v2/messages/{sourceDomain}?transactionHash=0x…` | poll until `messages[0].status == "complete"` → `message`, `attestation` (also `forwardTxHash` when forwarded) |
| `GET /v2/burn/USDC/fees/{src}/{dst}` (`?forward=true`) | fee quote (bps; `minimumFee`) |
| `POST /v2/quote/burn/usdc/{src}/{dst}` | signed upfront-fee quote |
| `GET /v2/fastBurn/USDC/allowance` | remaining Fast Transfer allowance |
| `POST /v2/reattest/{nonce}` | re-attest pre-finality (fast) message |
| `GET /v2/publicKeys` | attester keys |

## Flow (EVM → Arc, direct mint)

```ts
// 1. approve TokenMessengerV2 on source for amount (+maxFee)
// 2. burn
tokenMessenger.depositForBurn(
  amount,                // uint256 base units (6 dp)
  26,                    // destinationDomain: Arc
  pad(recipient,{size:32}), // mintRecipient bytes32
  usdcOnSource,          // burnToken
  "0x" + "00".repeat(32),// destinationCaller: any
  maxFee,                // e.g. 500n
  2000                   // minFinalityThreshold: 2000 standard | 1000 fast
);
// 3. poll GET {IRIS}/v2/messages/{srcDomain}?transactionHash=burnTx  (5s interval)
// 4. on Arc: MessageTransmitterV2.receiveMessage(message, attestation)  (gas paid in USDC)
```
`depositForBurnWithHook(..., hookData)` carries arbitrary bytes to the destination (USDC V2 hooks; recipient contract must interpret them). For non-USDC "expanded assets" (EURC Eth→Arc, USYC Eth↔BSC) hooks use `crossChainTransfer(... hookData, autoExecuteHookData)` and receiver `executeWithCrossChainToken` returning `keccak256("circle-cctpx-execute-success")`.

With Circle dev-controlled wallets: do step 1–2 via `createContractExecutionTransaction` on the source chain wallet, step 4 via `createContractExecutionTransaction` with `abiFunctionSignature: "receiveMessage(bytes,bytes)"` on the Arc wallet (or use Forwarding Service and skip it).

## Agent use

- "Collect everywhere, settle on Arc": customer pays on Base; agent burns into Arc treasury (standard = free; forwarding = no Arc gas handling).
- Pay a vendor who wants funds on Ethereum/Solana: burn on Arc (≈0.5 s attestation, standard), mint on destination.
- Recovery playbooks exist: `/cctp/howtos/resolve-stuck-attestation`, `/cctp/howtos/retry-failed-mint`.
- For instant cross-chain spending without per-transfer finality waits, prefer Gateway (`gateway.md`).
