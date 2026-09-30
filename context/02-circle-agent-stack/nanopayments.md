# Nanopayments — Agent Nanopayments (CLI) and Gateway Nanopayments (SDK/API)

Purpose: gasless sub-cent USDC x402 payments: how batching works, CLI flow, `@circle-fin/x402-batching` SDK reference (buyer + seller), REST endpoints, manual EIP-3009 signing, reconciliation, errors.
Sources: /agent-stack/agent-nanopayments (+ operations, quickstart, seller-integration-tools), /gateway-nanopayments (+ concepts/batched-settlement, howtos/*, quickstarts/buyer, quickstarts/seller, supported-networks), /sdks/gateway-nanopayments-sdk, /api-reference/gateway-nanopayments/*, /gateway/references/contract-addresses; live `GET gateway-api[-testnet].circle.com/v1/x402/supported`; npm.
Verified: 2026-09-29

## Key numbers

| Item | Value |
|---|---|
| Min payment | $0.000001 USDC |
| Min CLI Gateway deposit | 0.5 USDC |
| Authorization validity | `validBefore` ≥ **7 days** out (live `/v1/x402/supported` → `minValiditySeconds: 604800`; SDK sets `maxTimeoutSeconds: 604900`). One doc page/error table says 3 days — the 7-day value is live. |
| Gateway protocol fee | 0.5 bps crosschain x402; same-chain free |
| Seller sees funds | immediately "accepted"; onchain batch often several minutes later |
| Transfer statuses | `received` → `batched` → `confirmed` → `completed` (or `failed`, never charged) |
| Signer type | **EOA only** (Gateway verifies with `ecrecover`; ERC-1271 not supported for nanopayments). CLI agent wallets work because the Gateway balance is keyed by the SCA's backing EOA. |
| SDK | `@circle-fin/x402-batching` **3.5.0** (2026-09-16); peers `@x402/core`, `@x402/evm`, `@x402/express` 2.27.0, `viem` |
| API base | testnet `https://gateway-api-testnet.circle.com`, mainnet `https://gateway-api.circle.com` (mainnet host responds 200 on `/v1/x402/supported`; docs only print the testnet host) |
| Arc GatewayWallet (verifyingContract) | testnet `0x0077777d7EBA4688BDeF3E311b846F25870A19B9`, mainnet `0x77777777Dcc4d5A8B6E418Fd04D8997ef11000eE`; Gateway domain **26** |
| Arc GatewayMinter | testnet `0x0022222ABE238Cc2C7Bb1f21003F0a260052475B`, mainnet `0x2222222d7164433c4C09B0b0D809a9b52C04C205` |
| Arc USDC | `0x3600000000000000000000000000000000000000` (6 decimals; also the native gas token) |
| Unsupported | Solana (only Gateway chain without nanopayments) |

## How batched settlement works

1. Buyer deposits USDC into GatewayWallet (one onchain tx).
2. Buyer requests resource → seller `402` with `accepts[]` incl. `extra:{name:"GatewayWalletBatched",version:"1",verifyingContract}`.
3. Buyer signs EIP-3009 `TransferWithAuthorization` over domain `GatewayWalletBatched` — offchain, zero gas — and retries with `PAYMENT-SIGNATURE`.
4. Seller (or its facilitator) calls Gateway `settle`: verifies, **locks** buyer funds, credits seller pending; seller serves immediately.
5. Gateway batches authorizations, computes net balances inside an **AWS Nitro Enclave (TEE)** whose KMS-protected key signs the batch; the GatewayWallet contract verifies the TEE signature and applies net changes in one tx. Attestations are independently verifiable. Non-custodial, with a 7-day trustless withdrawal option.

Economics: individual settlement viable minimum ≈ $0.01+; batched ≈ $0.000001.

## Path A — Agent Nanopayments via CLI (no code)

```bash
circle gateway deposit --amount 5 --address 0xAgent --chain ARC-TESTNET --method direct   # or ARC on mainnet
circle gateway balance --address 0xAgent --chain ARC-TESTNET [--all]
circle services search "weather" --output json
circle services inspect https://api.example.com/weather --output json
circle services pay https://api.example.com/weather -X GET --address 0xAgent --chain ARC-TESTNET --max-amount 0.01 [--estimate]
circle gateway withdraw --amount 1 --address 0xAgent --chain ARC-TESTNET [--recipient 0xOther]   # same-chain only
```
Mainnet fast funding: `circle gateway deposit --amount 5 --address 0xAgent --chain BASE --method eco` (~30 s, sources BASE/ARB/OP, lands on **Arc**; then `--chain ARC`). Gateway balances are **per chain** — pay with `--chain` = where your Gateway balance lives and the seller accepts.

## Path B — Buyer SDK (`GatewayClient`, private key)

```ts
import { GatewayClient } from "@circle-fin/x402-batching/client";
const client = new GatewayClient({ chain: "arcTestnet", privateKey: process.env.PRIVATE_KEY as `0x${string}` /*, rpcUrl */ });

const b = await client.getBalances();                     // { wallet:{balance,formatted}, gateway:{total,available,withdrawing,withdrawable,formattedTotal,formattedAvailable} }
if (b.gateway.available < 1_000_000n) await client.deposit("1");   // approve + deposit onchain; returns {approvalTxHash?, depositTxHash, amount, formattedAmount}
const ok = await client.supports(url);                    // {supported, requirements?, error?}
const { data, status, amount, formattedAmount, transaction } = await client.pay(url /*, RequestInit */);
await client.withdraw("5");                               // same chain, instant → {mintTxHash, amount, formattedAmount, sourceChain, destinationChain, recipient}
await client.withdraw("5", { chain: "baseSepolia", recipient: "0x…" });   // crosschain needs dest native gas
const { transfers, pagination } = await client.searchTransfers({ from: client.address, status: "received", pageSize: 20 });
const t = await client.getTransferById(transfers[0].id);
```
Properties: `address, chainName, domain, publicClient, walletClient`. `searchTransfers` params: `from, to, nonce, network (CAIP-2), status (needs from/to/nonce), token:'USDC', startDate, endDate, pageSize, pageAfter, pageBefore`.

Chain names (`SupportedChainName`): e.g. `arcTestnet`, `baseSepolia`, `base`, … (full list in `CHAIN_CONFIGS`). `CHAIN_CONFIGS["arcTestnet"]` → `{usdc, gatewayWallet, rpc, chain}`; `GATEWAY_DOMAINS["arcTestnet"]` → 26.

## Path C — Buyer with a Circle developer-controlled wallet (no raw key in the agent)

From the buyer quickstart "Circle Wallets" tab (EOA dev-controlled wallet on ARC-TESTNET; needs `CIRCLE_API_KEY`, `CIRCLE_ENTITY_SECRET`):
```ts
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { BatchEvmScheme, CHAIN_CONFIGS } from "@circle-fin/x402-batching/client";
const circle = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret });
const chain = CHAIN_CONFIGS.arcTestnet;
const batch = new BatchEvmScheme({
  address: walletAddress,
  signTypedData: async (p) => {
    const typed = { domain: { ...p.domain, chainId: p.domain.chainId.toString() }, primaryType: p.primaryType,
      types: { EIP712Domain: [{name:"name",type:"string"},{name:"version",type:"string"},{name:"chainId",type:"uint256"},{name:"verifyingContract",type:"address"}], ...p.types },
      message: p.message };
    const r = await circle.signTypedData({ walletAddress, blockchain: "ARC-TESTNET",
      data: JSON.stringify(typed, (_, v) => typeof v === "bigint" ? v.toString() : v) });
    const s = r.data!.signature!; return (s.startsWith("0x") ? s : `0x${s}`) as `0x${string}`;
  },
});
// deposit: createContractExecutionTransaction approve(chain.gatewayWallet, amt) on chain.usdc, then deposit(address,uint256)(chain.usdc, amt) on chain.gatewayWallet
// balance: POST https://gateway-api-testnet.circle.com/v1/balances {"token":"USDC","sources":[{"domain":26,"depositor":walletAddress}]}
// pay: fetch(url) → 402 → decode PAYMENT-REQUIRED → pick accepts[] with extra.name==="GatewayWalletBatched" && network===`eip155:${chain.chain.id}`
//      → payload = await batch.createPaymentPayload(x402Version, option)
//      → fetch(url, { headers: { "PAYMENT-SIGNATURE": b64(JSON.stringify({...payload, accepted: option, resource})) } })
```
This is the pattern behind `circlefin/arc-x402-circle-wallets` (Tameion's RFB 4 starter). Poll dev-wallet txs until `COMPLETE|CONFIRMED` (fail on `FAILED|DENIED|CANCELLED`).

## Seller SDK

Express middleware (simplest):
```ts
import { createGatewayMiddleware } from "@circle-fin/x402-batching/server";
const gateway = createGatewayMiddleware({
  sellerAddress: "0xPayout",
  facilitatorUrl: "https://gateway-api-testnet.circle.com",   // optional; your own facilitator also OK
  networks: ["eip155:5042002"],                               // optional; default = all Gateway networks
  description: "Invoice OCR",                                 // optional
});
app.get("/premium", gateway.require("$0.01"), (req, res) => {
  const { payer, amount, network, transaction } = (req as any).payment;   // amount in base units
  res.json({ ok: true, payer });
});
```
Lifecycle hooks (chainable): `onProtectedRequest(ctx{method,path,url,getHeader})`, `onBeforeVerify` (→ `{abort:true,reason}` | `{skip:true,result}`), `onAfterVerify` (→ `{skipHandler:true,response}`), `onVerifyFailure` (→ `{recovered:true,result}`), `onBeforeSettle`, `onAfterSettle(ctx{paymentPayload,requirements,result})`, `onSettleFailure`, `onVerifiedPaymentCanceled`. Hook throws are logged and ignored. `onBeforeSettle` returning `abort` is a natural place for a seller-side compliance check.

Non-Express / dynamic pricing: `new BatchFacilitatorClient({ url })` → `.verify(payload, req)` → `{isValid, invalidReason?, payer?}`; `.settle(payload, req)` → `{success, errorReason?, payer?, transaction}`; `.getSupported()`. Circle: call `settle()` directly (low latency, guarantees settlement) rather than verify+settle. Requirements you emit must include `extra:{name:"GatewayWalletBatched",version:"1",verifyingContract}` and `maxTimeoutSeconds: 604900`.

Existing x402 server: add `new BatchFacilitatorClient()` next to `HTTPFacilitatorClient` and register `new GatewayEvmScheme()` (x402.md). Facilitator operators: route with `isBatchPayment(requirements)`.

Earnings: `new GatewayClient({chain:"arcTestnet", privateKey})` → `getBalances()`, `withdraw("50")`.

Utilities/constants: `supportsBatching`, `isBatchPayment`, `getVerifyingContract`, `CIRCLE_BATCHING_NAME='GatewayWalletBatched'`, `CIRCLE_BATCHING_VERSION='1'`, `CIRCLE_BATCHING_SCHEME='exact'`.

## Reconciliation (AP/AR relevance)

- Record in `onAfterSettle`: `resource.url` (encode invoice/task id in the path, e.g. `/invoices/INV-42/pay`), `authorization.nonce` (unique per payment), `payer`, `requirements.amount`, `network`, `transaction`.
- Look up: `searchTransfers({ nonce })` → `getTransferById(id)`.
- Date-range reconcile: `searchTransfers({ to: seller, startDate, pageSize: 100, pageAfter })`, match by nonce; unmatched = direct transfers/tests.
- Treat as final for accounting at `confirmed`; wait for `completed` before dependent onchain actions; `failed` = never charged, don't fulfill.

## REST endpoints (Gateway x402)

| Method | Path | Purpose |
|---|---|---|
| GET | `/v1/x402/supported` | kinds per network with `extra.verifyingContract`, `extra.assets[]`, `minValiditySeconds` |
| POST | `/v1/x402/verify` | read-only checks (scheme, network, token, sig, time, address/amount); balance/nonce only checked at settle |
| POST | `/v1/x402/settle` | verify + lock balance + queue for batch |
| GET | `/v1/x402/transfers/{id}` | one transfer |
| GET | `/v1/x402/transfers` | search; `status` requires `from`, `to` or `nonce` (else 400); cursor `pageAfter/pageBefore` |
| POST | `/v1/balances` | Gateway balances `{token:"USDC", sources:[{domain, depositor}]}` |

## Manual EIP-3009 signing (non-JS clients / debugging)

```ts
const domain = { name: "GatewayWalletBatched", version: "1", chainId: 5042002, verifyingContract: "0x0077777d7EBA4688BDeF3E311b846F25870A19B9" };
const types = { TransferWithAuthorization: [ {name:"from",type:"address"},{name:"to",type:"address"},{name:"value",type:"uint256"},
  {name:"validAfter",type:"uint256"},{name:"validBefore",type:"uint256"},{name:"nonce",type:"bytes32"} ] };
const message = { from, to: seller, value: 10000n, validAfter: 0n,
  validBefore: BigInt(Math.floor(Date.now()/1000) + 8*24*3600), nonce: `0x${randomBytes(32).toString("hex")}` };
const signature = await account.signTypedData({ domain, types, primaryType: "TransferWithAuthorization", message });
// header "Payment-Signature": base64(JSON.stringify({ x402Version:2, payload:{authorization:{…stringified}, signature}, resource, accepted }))
```
`invalid_signature` checklist: domain name exactly `GatewayWalletBatched` (not `GatewayWallet`/`USDC`); verifyingContract = GatewayWallet (not USDC/GatewayMinter); chainId = EVM chain id (not Gateway domain 26); fresh random nonce; validity long enough; value in base units; `from` = signer. Withdrawals use a different domain (`GatewayWallet`).

## Error codes (`errorReason` / `invalidReason`)

`unsupported_scheme`, `unsupported_network`, `unsupported_asset`, `invalid_payload`, `address_mismatch`, `amount_mismatch`, `invalid_signature`, `authorization_not_yet_valid`, `authorization_expired`, `authorization_validity_too_short`, `self_transfer` (buyer ≠ seller!), `insufficient_balance`, `nonce_already_used`, `unsupported_domain`, `wallet_not_found`, `unexpected_error`. Client errors include `No Gateway batching option available`, `Missing PAYMENT-REQUIRED header in 402 response` (server must be x402 v2).

Gotcha for demos: `self_transfer` — your buyer agent and seller endpoint must use different addresses.

## Sample apps

- `circlefin/arc-nanopayments` — gasless USDC nanopayments on Arc (Tameion-listed).
- `circlefin/arc-x402-circle-wallets` — agent pays x402 from a dev-controlled wallet on Arc Testnet (RFB 4 starter).
- `circlefin/agent-stack-starter-kits` — CLI-driven agents in 6 frameworks (mcp-and-ai-tooling.md).
