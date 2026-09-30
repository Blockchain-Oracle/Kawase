# Quickstarts — copy-paste paths on Arc

Purpose: the shortest working paths from zero to "agent holds USDC, pays, gets paid" on Arc Testnet, with official quickstart links.
Sources: /agent-stack/agent-wallets/quickstart, /agent-stack/agent-nanopayments/quickstart, /gateway-nanopayments/quickstarts/{buyer,seller}, /facilitator-service/quickstart, /agent-stack/agent-marketplace/become-a-seller, live CLI 1.1.4 help.
Verified: 2026-09-29 (commands checked against help output; no account was created, so login/pay were not executed end-to-end)

Official quickstarts: Agent Wallets https://developers.circle.com/agent-stack/agent-wallets/quickstart · Agent Nanopayments https://developers.circle.com/agent-stack/agent-nanopayments/quickstart · Facilitator seller https://developers.circle.com/facilitator-service/quickstart · Gateway buyer https://developers.circle.com/gateway-nanopayments/quickstarts/buyer · Gateway seller https://developers.circle.com/gateway-nanopayments/quickstarts/seller

## 1. CLI agent wallet on Arc Testnet (≈5 min)

```bash
npm install -g @circle-fin/cli            # Node >= 20.18.2
circle --version                          # 1.1.4
circle terms show --init --output json    # show the human the Terms; after explicit consent:
circle terms accept
circle wallet login you@company.com --testnet                         # enter OTP from email
#   agent/script variant:
#   circle wallet login you@company.com --testnet --init   → request id
#   circle wallet login --request <id> --otp ABC-123456
ADDR=$(circle wallet list --type agent --chain ARC-TESTNET --output json | jq -r '.data[0].address')   # check JSON shape on first run
circle wallet fund --address $ADDR --chain ARC-TESTNET                # 20 testnet USDC from faucet
circle wallet balance --address $ADDR --chain ARC-TESTNET --output json
circle wallet transfer 0xVendor --amount 1 --address $ADDR --chain ARC-TESTNET --output json
```
Or let the coding agent do it: `Run curl -sL https://agents.circle.com/skills/setup.md, and use the returned setup instructions to set up my agent wallet.` (tell it to use ARC-TESTNET instead of its BASE default).

## 2. Nanopayment from the CLI

```bash
circle gateway deposit --amount 5 --address $ADDR --chain ARC-TESTNET --method direct
circle gateway balance --address $ADDR --chain ARC-TESTNET
circle services pay http://localhost:3000/premium-data -X GET --address $ADDR --chain ARC-TESTNET --max-amount 0.05 --output json
circle gateway withdraw --amount 1 --address $ADDR --chain ARC-TESTNET
```
Marketplace has no Arc Testnet listings, so point `services pay` at your own seller (§3). Mainnet: `--chain ARC` and `circle services search "…"`.

## 3. Your own x402 seller on Arc Testnet (Express, Gateway rail)

```bash
mkdir seller && cd seller && npm init -y && npm pkg set type=module scripts.start="node server.ts"
npm install @circle-fin/x402-batching @x402/core @x402/evm viem express typescript
npm install -D @types/node @types/express
```
```ts
// server.ts  (Node 22.6+ runs .ts directly)
import express from "express";
import { createGatewayMiddleware } from "@circle-fin/x402-batching/server";
const app = express();
const gateway = createGatewayMiddleware({
  sellerAddress: process.env.PAYOUT!,                          // must differ from buyer (self_transfer error)
  facilitatorUrl: "https://gateway-api-testnet.circle.com",
  networks: ["eip155:5042002"],
});
gateway.onAfterSettle(async (ctx) => { if (ctx.result.success) console.log("paid", ctx.paymentPayload.resource?.url, ctx.result.transaction); });
app.get("/invoices/:id/extract", gateway.require("$0.002"), (req, res) => res.json({ invoice: req.params.id, total: "123.45" }));
app.listen(3000);
```
`curl -i localhost:3000/invoices/42/extract` → `402` with `PAYMENT-REQUIRED`.

## 4. TypeScript buyer (private key, Gateway)

```bash
npm install @circle-fin/x402-batching viem
```
```ts
import { GatewayClient } from "@circle-fin/x402-batching/client";
const client = new GatewayClient({ chain: "arcTestnet", privateKey: process.env.PRIVATE_KEY as `0x${string}` });
if ((await client.getBalances()).gateway.available < 1_000_000n) await client.deposit("1");
const { data, formattedAmount, transaction } = await client.pay("http://localhost:3000/invoices/42/extract");
```
Fund the key's address from https://faucet.circle.com (Arc Testnet USDC = gas too). For keyless-in-process custody use the developer-controlled-wallet signer (nanopayments.md Path C; repo `circlefin/arc-x402-circle-wallets`).

## 5. Vanilla x402 seller via Circle Facilitator Service (keyless trial)

Buyer signs EIP-3009 against Arc USDC (`{name:"USDC",version:"2",chainId:5042002,verifyingContract:"0x3600000000000000000000000000000000000000"}`), seller builds a `Facilitator-Seller-Proof` (EIP-712 `SellerRequest`, purpose `settle`), then:
```bash
curl -X POST https://api.circle.com/v1/facilitator/x402/settle -H "Facilitator-Seller-Proof: $PROOF" -H "Content-Type: application/json" -d @body.json
curl https://api.circle.com/v1/facilitator/x402/status/<paymentId> -H "Facilitator-Seller-Proof: $STATUS_PROOF"
```
Full payloads and signing code: x402.md.

## 6. Agent framework kits

```bash
git clone https://github.com/circlefin/agent-stack-starter-kits && cd agent-stack-starter-kits
bun install && cd kits/claude-agent-sdk && cp .env.example .env && bun run demo
```

## 7. Spending policy (mainnet only)

```bash
circle wallet login you@company.com                     # mainnet session
circle wallet limit set --address $MAIN --chain ARC --policy-type stablecoin --per-tx 5 --daily 20 --weekly 50 --monthly 100   # human OTP
circle wallet limit budget --address $MAIN
```

## Faucets / funding

- Circle faucet: https://faucet.circle.com (Arc Testnet USDC; also funds gas on Arc).
- CLI testnet faucet: `circle wallet fund --chain ARC-TESTNET` (20 USDC, agent login required).
- TestMint (Proceeds): up to $10k testnet USDC via x402 — https://testmint.myproceeds.xyz (Tameion partner).
