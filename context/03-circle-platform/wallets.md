# Circle Wallets (developer-controlled, user-controlled, modular)

Purpose: how to give a business-finance agent custody-grade USDC wallets on Arc (treasury, sub-wallets, wallet-per-contractor) via Circle Wallets APIs/SDKs.
Sources: `.firecrawl/docs/circle-llms-full.txt` (pages `/wallets*`, `/sdks/developer-controlled-wallets-nodejs-sdk`, `/api-reference/wallets*`, `/release-notes/wallets-2026`); published npm tarball `@circle-fin/developer-controlled-wallets@10.8.1` (type defs inspected 2026-09-29); prior research `arc-agent/docs/wiki/circle-wallets-and-agent-stack.md`, `account-abstraction-and-policy-surface.md` (2026-07-29, partly stale — see bottom).
Verified: 2026-09-29

## TL;DR for this hackathon

- Use **developer-controlled wallets** for the agent's own treasury/operating/reserve/payee wallets: backend-only, API key + entity secret, no user interaction, works on `ARC-TESTNET` and (since 2026-09-16) `ARC` mainnet.
- Dev-controlled wallets have **no built-in policy engine** (Circle docs, verbatim: "If you require transaction restrictions, destination allowlists, or multi-party approval flows, enforce those controls in your own application logic before calling Circle APIs"). Budget/approval enforcement = your code, a Contracts-deployed vault (see `contracts.md`), or Compliance Engine rules (see `compliance.md`).
- Agent Wallets (Circle CLI / Agent Stack) are a different product built on user-controlled wallets — covered in the Agent Stack section, not here. Their spending policies are mainnet-only.

## Wallet products

| Product | Who signs | Account types | Arc | Use for |
|---|---|---|---|---|
| Developer-controlled | Your backend (entity secret + API key; MPC keys held by Circle) | EOA, SCA | `ARC` / `ARC-TESTNET` | Treasury, payouts, automation, per-vendor sub-wallets |
| User-controlled | End user (PIN / social / email OTP, 2-of-2 MPC); every tx needs a user "challenge" approval | EOA, SCA | yes | Human CFO approval step, customer wallets |
| Modular (MSCA) | Passkey (WebAuthn, secp256r1) + optional ECDSA recovery keys; ERC-4337 + ERC-6900 modules | MSCA only | yes (`arcTestnet` transport path) | Passkey-approved treasury vault with on-chain allowlist module |

Supported-chain codes (dev/user-controlled): `ARC`/`ARC-TESTNET`, `ETH`/`ETH-SEPOLIA`, `BASE`/`BASE-SEPOLIA`, `ARB`/`ARB-SEPOLIA`, `AVAX`/`AVAX-FUJI`, `OP`/`OP-SEPOLIA`, `MATIC`/`MATIC-AMOY`, `UNI`/`UNI-SEPOLIA`, `MONAD`/`MONAD-TESTNET`, `SOL`/`SOL-DEVNET`, `APTOS`/`APTOS-TESTNET`, `NEAR` (signing only), `EVM`/`EVM-TESTNET` (other EVM chains: signing only, you broadcast). Modular MSCA: not on Ethereum.

Account types: EOA = no creation fee, lower gas, all chains. SCA = EVM only, gas charged on first outbound tx, batch ops, Gas Station sponsorship. MSCA = modular only, modules.

**Unified EVM addressing:** EVM wallets in the same wallet set share the same address across EVM chains (`/wallets/unified-wallet-addressing-evm`). Handy: one "vendor address" valid on Arc and Base.

## Setup (dev-controlled)

1. Console: https://console.circle.com → Keys → Create a key → API key → Standard Key. Keys look like `TEST_API_KEY:...` or `LIVE_API_KEY:...`; send as `Authorization: Bearer <key>`. Base URL `https://api.circle.com` for both (key prefix selects env).
2. Generate + register a 32-byte **entity secret** (Console configurator `https://console.circle.com/wallets/dev/configurator/entity-secret`, or SDK). Circle never stores it; the downloaded **recovery file** is the only reset path. For raw API calls you must send a fresh `entitySecretCiphertext` (entity secret RSA-encrypted with the entity public key from `GET /v1/w3s/config/entity/publicKey`) plus `idempotencyKey` (UUID) on every mutating request; SDK does both automatically.
3. Node >= 22 (22.6 for `--env-file` examples), Python >= 3.11.

```ts
// npm i @circle-fin/developer-controlled-wallets   (latest 10.8.1, 2026-09-22)
import { randomBytes } from "node:crypto";
import {
  registerEntitySecretCiphertext,
  initiateDeveloperControlledWalletsClient,
} from "@circle-fin/developer-controlled-wallets";

// one-time
const entitySecret = randomBytes(32).toString("hex");
await registerEntitySecretCiphertext({ apiKey: process.env.CIRCLE_API_KEY!, entitySecret, recoveryFileDownloadPath: "./recovery" });

const client = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY!,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET!,
});
```

Python: `pip install circle-developer-controlled-wallets` → `from circle.web3 import utils, developer_controlled_wallets`; `utils.init_developer_controlled_wallets_client(api_key=..., entity_secret=...)`.

## Core calls (Node SDK method → REST)

| SDK method (v10.8.1) | REST |
|---|---|
| `createWalletSet({ name })` | `POST /v1/w3s/developer/walletSets` |
| `createWallets({ walletSetId, blockchains:["ARC-TESTNET"], count, accountType:"EOA"|"SCA", metadata:[{name, refId}] })` | `POST /v1/w3s/developer/wallets` (max 200 per call; `metadata.length` must equal `count`) |
| `deriveWallet` / `deriveWalletByAddress` | `PUT /v1/w3s/developer/wallets/{id}/blockchains/{blockchain}` / `PUT /v1/w3s/developer/wallets/derive` (same address on another EVM chain) |
| `listWallets`, `getWallet`, `updateWallet` (name/refId) | `GET /v1/w3s/wallets`, `GET/PUT /v1/w3s/wallets/{id}` |
| `getWalletTokenBalance({ id })`, `getWalletsWithBalances` | `GET /v1/w3s/wallets/{id}/balances`, `GET /v1/w3s/developer/wallets/balances` |
| `createTransaction(...)` | `POST /v1/w3s/developer/transactions/transfer` |
| `createContractExecutionTransaction(...)` | `POST /v1/w3s/developer/transactions/contractExecution` |
| `estimateTransferFee`, `estimateContractExecutionFee` | `POST /v1/w3s/transactions/transfer/estimateFee`, `.../contractExecution/estimateFee` |
| `getTransaction({ id })`, `listTransactions` | `GET /v1/w3s/transactions/{id}`, `GET /v1/w3s/transactions` |
| `accelerateTransaction`, `cancelTransaction` | `POST /v1/w3s/developer/transactions/{id}/accelerate|cancel` |
| `signTypedData({ walletId | walletAddress+blockchain, data })` | `POST /v1/w3s/developer/sign/typedData` (EIP-712, EVM only) |
| `signMessage` | `POST /v1/w3s/developer/sign/message` (EIP-191) |
| `signTransaction` | `POST /v1/w3s/developer/sign/transaction` (only SOL, NEAR, `EVM`/`EVM-TESTNET`) |
| `validateAddress` | `POST /v1/w3s/transactions/validateAddress` |
| `requestTestnetTokens` | `POST /v1/faucet/drips` (docs: "requires upgrading to mainnet" account) |
| `createSubscription` (webhooks) | `POST /v2/notifications/subscriptions` |

Identify a wallet with either `walletId` **or** `walletAddress` + `blockchain`.

### Transfer USDC on Arc Testnet

```ts
const ARC_TESTNET_USDC = "0x3600000000000000000000000000000000000000"; // ERC-20 iface, 6 decimals
const res = await client.createTransaction({
  walletAddress: SOURCE, blockchain: "ARC-TESTNET",
  tokenAddress: ARC_TESTNET_USDC,          // or tokenId (UUID from Circle token catalog) when using walletId
  destinationAddress: VENDOR,
  amount: ["5"],                            // decimal string, NOT base units
  fee: { type: "level", config: { feeLevel: "MEDIUM" } }, // LOW|MEDIUM|HIGH
  refId: "invoice-1042",                   // your correlation id (optional)
});
// poll getTransaction({id}) until COMPLETE | FAILED | CANCELLED | DENIED, or use webhooks
```

Doc/SDK drift: the `/sdks/developer-controlled-wallets-nodejs-sdk` page shows `amounts: [...]`; the v10.8.1 type `CreateTransferTransactionInput` uses **`amount: string[]`** (the transfer-tokens quickstart also uses `amount`). Use `amount`. REST body field is `amounts`.

### Contract execution (approve + deposit example — Gateway deposit from a dev wallet)

```ts
await client.createContractExecutionTransaction({
  walletAddress, blockchain: "ARC-TESTNET",
  contractAddress: "0x3600000000000000000000000000000000000000",
  abiFunctionSignature: "approve(address,uint256)",
  abiParameters: ["0x0077777d7EBA4688BDeF3E311b846F25870A19B9", "1000000"], // base units here
  fee: { type: "level", config: { feeLevel: "MEDIUM" } },
});
// alternatively pass callData: "0x..." (mutually exclusive with abiFunctionSignature/abiParameters)
```
Contract execution supports batching related txs in one call (SCA). Not supported on Solana.

### Sign EIP-712 (x402 / Gateway burn intents / permits) with a dev wallet

```ts
const r = await client.signTypedData({
  walletAddress, blockchain: "ARC-TESTNET",
  data: JSON.stringify({ domain: {...d, chainId: d.chainId.toString()}, primaryType, message,
    types: { EIP712Domain: [ {name:"name",type:"string"},{name:"version",type:"string"},
      {name:"chainId",type:"uint256"},{name:"verifyingContract",type:"address"} ], ...types } }),
});
const sig = r.data!.signature!.startsWith("0x") ? r.data!.signature! : `0x${r.data!.signature}`;
```
Must include explicit `EIP712Domain` type and stringify bigints (Circle's Gateway-nanopayments quickstart pattern). SCA signatures are ERC-1271 (not `ecrecover`-able) — matters for permits and Gateway (see `gateway.md`).

## Transaction states

`INITIATED → QUEUED → CLEARED (passed risk screening) → SENT → [CONFIRMED] → COMPLETE`; terminal: `COMPLETE`, `FAILED`, `CANCELLED`, `DENIED` (platform/compliance denial; check `errorReason`, `errorDetails`). `STUCK` → accelerate. **On Arc (instant finality) `CONFIRMED` is skipped (`SENT → COMPLETE`).** Cancel allowed in INITIATED/QUEUED/SENT; accelerate in SENT/STUCK. `transactionScreeningEvaluation` field appears on transactions when Compliance Engine embedded screening is on.

## Webhooks (v2 notifications)

- Subscribe: `POST /v2/notifications/subscriptions` (Console → Webhooks also works). HTTPS endpoint, public.
- Types include `transactions.inbound`, `transactions.outbound`, `challenges.initialize` (user-controlled), `contracts.eventLog`; can "limit to specific events".
- Envelope: `{subscriptionId, notificationId, notificationType, notification{...resource}, timestamp, version:2}`.
- At-least-once, **unordered** → dedupe on `notificationId`, act on the state carried, not arrival order.
- Verify: headers `X-Circle-Signature` (base64 ECDSA_SHA_256 over the **raw** body) + `X-Circle-Key-Id`; fetch key `GET /v2/notifications/publicKey/{keyId}` (cache it).

## Rate limits

GET 20 rps, POST 5 rps default; 10 rps for wallet creation, fee estimation, and all `/sign/*` endpoints. 429 on excess.

## Gas on Arc

Arc gas is paid in native USDC (18-decimals native, same balance as the 6-decimals ERC-20), so an EOA dev wallet just needs USDC. For zero-gas UX use **Gas Station** (Circle-sponsored, SCA wallets, billed to your card, 5% fee; Arc Mainnet + Arc Testnet supported; paymaster `0x7ceA357B5AC0639F89F9e378a1f03Aa5005C0a25`). Mainnet needs an active Gas Station policy (per-day / per-tx USD caps) — error `155509` if SCA created without one. Details in `paymaster.md`.

## Modular wallets (MSCA) — only Circle wallet with on-chain rules

- SDK `@circle-fin/modular-wallets-core` (web), plus iOS/Android. `toCircleSmartAccount`, `toModularTransport(\`${clientUrl}/arcTestnet\`, clientKey)`, `toWebAuthnAccount`, bundler client with `paymaster: true` for Gas Station sponsorship.
- **Address Book module** `0x0000000d81083B16EA76dfab46B0315B0eDBF3d0` (mainnet + testnet): restricts ERC-20/721/1155 transfers to an on-chain allowlist ("treasury vaults that should only send to known counterparties"). Caveat from prior live check: covers the ERC-20 path; Arc native-value USDC sends are a separate path — verify before claiming full allowlist coverage.
- Custom ERC-6900 modules allowed. Requires passkey signing (human in the loop) — not unattended.
- Modular API (read-only) under `/v1/w3s/buidl/...` (transfers, userOps, balances).

## Patterns for the RFBs

- **Treasury tree:** one wallet set = `operating`, `reserve`, `payroll`, `tax` wallets (`metadata.name`), agent moves funds between them with `createTransaction`; reserve → USYC via contract execution (see `usyc.md`).
- **Wallet-per-contractor/customer:** `createWallets({count:N, metadata:[{name, refId: vendorId}]})` — incoming-payment attribution (AR) by wallet, `transactions.inbound` webhook marks invoice paid. 200/call.
- **Human approval above threshold:** agent proposes; either (a) app-level gate before calling Circle, (b) user-controlled wallet challenge for the CFO, or (c) on-chain vault contract requiring a second signer (see `contracts.md`).
- **Screen before pay:** call `POST /v1/w3s/compliance/screening/addresses` first (gated; see `compliance.md`), or rely on embedded screening → `DENIED` state.

## Staleness vs prior research (arc-agent wiki, 2026-07-29)

- Prior notes said "no Arc mainnet" for Wallets/Contracts. **Superseded:** release notes 2026-09-16 add Arc mainnet to Circle Wallets, Gas Station and Contracts; chain code `ARC`.
- Agent Wallet policy limits remain documented as mainnet-only ("Spending policies require a mainnet agent wallet. Testnet is not supported").
