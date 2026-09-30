# Circle Gateway (unified USDC balance)

Purpose: give the agent one chain-abstracted USDC balance it can spend on any supported chain in <500 ms — the "treasury sees all funds as one balance" primitive.
Sources: `.firecrawl/docs/circle-llms-full.txt` (`/gateway`, `/gateway/references/{technical-guide,contract-addresses,supported-blockchains,fees,webhook-events,erc-1271}`, `/gateway/howtos/*`, `/api-reference/gateway*`, `/gateway-nanopayments/*`, `/release-notes/gateway-2026`); prior `arc-agent/docs/wiki/app-kit-cctp-and-gateway.md` (a Base Sepolia→Arc Gateway deposit+mint was live-proven there on 2026-07-31).
Verified: 2026-09-29

## Model

1. **Deposit** USDC into the non-custodial `GatewayWallet` contract on any supported chain (`deposit(token, value)` after `approve`, or `depositWithPermit` / ERC-3009 auth). Balance credits after source finality (Arc ~0.5 s, 1 block; Ethereum/Base/Arbitrum ~13–19 min).
2. **Spend:** sign an EIP-712 **BurnIntent** (or BurnIntentSet, ≤16 intents, EVM only) → `POST /v1/transfer` → Gateway returns `{attestation, signature}` (expires 10 min) → call `GatewayMinter.gatewayMint(attestation, signature)` on destination. Gateway later burns on source.
3. Trustless exit: `initiateWithdrawal` then 7-day delay → withdraw on-chain without Circle.

Permissionless: no API key, no sign-up. Same domain IDs as CCTP (Arc = 26). Arc mainnet added 2026-09-16.

## Addresses

| | GatewayWallet | GatewayMinter |
|---|---|---|
| Testnets (Arc Testnet, and same on other testnets) | `0x0077777d7EBA4688BDeF3E311b846F25870A19B9` | `0x0022222ABE238Cc2C7Bb1f21003F0a260052475B` |
| Mainnets (Arc, and same on others) | `0x77777777Dcc4d5A8B6E418Fd04D8997ef11000eE` | `0x2222222d7164433c4C09B0b0D809a9b52C04C205` |

Chains (domain / mainnet name / testnet name): Arbitrum 3 `arbitrum`/`arbitrumSepolia`; **Arc 26 `arc`/`arcTestnet`**; Avalanche 1 `avalanche`/`avalancheFuji`; Base 6 `base`/`baseSepolia`; Ethereum 0 `ethereum`/`sepolia`; HyperEVM 19; OP 2 `optimism`/`optimismSepolia`; Polygon 7 `polygon`/`polygonAmoy`; Sei 16 `sei`/`seiAtlantic`; Solana 5; Sonic 13; Unichain 10; World Chain 14. Nanopayments on all except Solana.

## API

Base: testnet `https://gateway-api-testnet.circle.com` (the only host that appears in the fetched docs). Mainnet is presumably `https://gateway-api.circle.com`; this is **unverified**, so check the OpenAPI spec at https://developers.circle.com/openapi/gateway.yaml before relying on it.

| Endpoint | Purpose |
|---|---|
| `GET /v1/info` | supported domains/tokens/contracts |
| `POST /v1/balances` body `{token:"USDC", sources:[{domain:26, depositor:"0x…"}]}` | unified balance per domain |
| `POST /v1/deposits` | pending (unfinalized) deposits |
| `POST /v1/estimate` (`enableForwarder=true`) | fees + expiration block heights |
| `POST /v1/transfer` body `[{burnIntent, signature}]` | get attestation |
| `GET /v1/transfer/{id}`, `GET /v1/transferSpec/{hash}` | status / lookup |
| `POST /v1/batch/submit` | submit EIP-3009 auth to be batched (nanopayments) |
| `/v1/x402/{verify,settle,supported,transfers}` | nanopayments facilitator (x402 — see Agent Stack section) |
| `POST/GET/PATCH/DELETE /v2/notifications/subscriptions/permissionless[/{id}]` | webhooks (no Circle account) |

Webhook events: `gateway.deposit.finalized`, `gateway.mint.finalized`, `gateway.mint.forwarded` (v2 envelope; verify via `/v2/notifications/publicKey/{id}`).

## Burn intent (EIP-712)

```ts
const domain = { name: "GatewayWallet", version: "1" };           // no chainId / verifyingContract
const TransferSpec = [ {name:"version",type:"uint32"},{name:"sourceDomain",type:"uint32"},
 {name:"destinationDomain",type:"uint32"},{name:"sourceContract",type:"bytes32"},
 {name:"destinationContract",type:"bytes32"},{name:"sourceToken",type:"bytes32"},
 {name:"destinationToken",type:"bytes32"},{name:"sourceDepositor",type:"bytes32"},
 {name:"destinationRecipient",type:"bytes32"},{name:"sourceSigner",type:"bytes32"},
 {name:"destinationCaller",type:"bytes32"},{name:"value",type:"uint256"},
 {name:"salt",type:"bytes32"},{name:"hookData",type:"bytes"} ];
const BurnIntent = [ {name:"maxBlockHeight",type:"uint256"},{name:"maxFee",type:"uint256"},{name:"spec",type:"TransferSpec"} ];
// all address fields left-padded to bytes32 (lowercase); salt random 32 bytes; version 1
const signature = await account.signTypedData({ domain, types:{EIP712Domain:[{name:"name",type:"string"},{name:"version",type:"string"}], TransferSpec, BurnIntent}, primaryType:"BurnIntent", message });
const { attestation, signature: attSig } = await (await fetch(`${GW}/v1/transfer`, { method:"POST",
  headers:{ "Content-Type":"application/json" }, body: JSON.stringify([{ burnIntent: message, signature }], bigintReplacer) })).json();
await minter.write.gatewayMint([attestation, attSig]);
```
Rules: `maxBlockHeight` must be ≥ current + wallet `withdrawalDelay` (quickstarts use `maxUint256`); `maxFee` ≥ gas fee + forwarding fee + 0.005% × value.

## Fees

- Transfer fee **0.005% (0.5 bps)** on cross-chain; same-chain withdrawal free.
- Per-burn gas fee by source: **Arc $0.0035**, Arbitrum $0.01, Avalanche $0.02, Base $0.01, Ethereum $1.00, HyperEVM $0.05, OP $0.0015, Polygon $0.0015, Sei $0.001, Solana $0.15, Sonic $0.01, Unichain $0.001, World Chain $0.01.
- Forwarding Service (Circle submits the destination mint): $0.05 flat + destination gas.
- Example: 1,000 USDC from Base, no forwarding → minFee $0.06 (60,000 base units).

## Signers / Circle Wallets caveats

- EOA signatures (ECDSA) or **ERC-1271** smart-contract signatures (SCA can authorize directly — `/gateway/howtos/transfer-with-erc-1271`).
- Delegates: `GatewayWallet.addDelegate(token, delegate)` lets another EOA sign burn intents for a depositor (e.g., SCA depositor + EOA delegate). Prior research: App Kit Unified Balance still requires a delegate EOA for Circle Wallet SCA spends, and SCA deposits must use `approve` (permit uses `ecrecover`). Delegation = account-level spend rights; treat as high-privilege.
- Dev-controlled EOA wallet flow: `createContractExecutionTransaction` approve → `deposit(address,uint256)` on GatewayWallet; sign burn intent with `client.signTypedData`; mint via `createContractExecutionTransaction` `gatewayMint(bytes,bytes)`.
- SDK shortcuts: `@circle-fin/unified-balance-kit` (npm) and Arc App Kit Unified Balance (`deposit`, `estimateSpend`, `spend`; includes "Fast Deposit") — see App Kit section.

## Agent use

- Treasury: keep working capital in Gateway so the agent can pay a vendor on any chain instantly without pre-positioning; consolidate burn intents (each extra intent ≈ +60k gas on mint).
- AR: customers deposit on their chain; balance shows up as one number via `/v1/balances` polled across domains.
- Latency claim to demo: <500 ms spend after balance is established.
