# TestMint (testnet USDC via x402)

Purpose: how to get large amounts (1k to 10k) of testnet USDC on Arc when faucets are too small, using TestMint by Proceeds. TestMint is a "friend of Canteen" listed on the Tameion and Lepton pages.

Sources: https://testmint.myproceeds.xyz (Firecrawl scrape `.firecrawl/canteen/testmint.md`, JS bundle `.firecrawl/canteen/tm/all.js`), https://testmint.myproceeds.xyz/skills/testmint/SKILL.md (saved `.firecrawl/canteen/testmint-SKILL.md`), https://myproceeds.xyz/api/x402/pay/cmttoaieb0001lg046e2colwb/openapi.json.
Verified: 2026-09-29

---

## What it is

A paid x402 API run by **Proceeds** (myproceeds.xyz). You pay **real mainnet USDC** and TestMint mints **1000x as much testnet USDC** on a Circle Gateway-supported testnet. There is no API key, account or faucet queue. It never sells mainnet USDC, and the testnet USDC has no value.

| `x-payment-tier` header | Mainnet cost | Testnet USDC delivered |
|---|---:|---:|
| `1000` | 1 USDC | 1,000 |
| `5000` | 5 USDC | 5,000 |
| `10000` | 10 USDC | 10,000 |

"Up to $10k" in the slides means the 10000 tier (10 real USDC). Repeat purchases are possible.

- **Payment rails:** x402 on **Base mainnet** (`eip155:8453`; plain `exact` USDC or `GatewayWalletBatched` nanopayments) or **MPP on Tempo**.
- **Destinations** (`destinationChain`, kebab-case): **`arc-testnet`**, `base-sepolia`, `avalanche-fuji`, `ethereum-sepolia`. For Arc the delivered token is USDC `0x3600000000000000000000000000000000000000`, Gateway domain 26, explorer testnet.arcscan.app.
- Web UI: connect a wallet → choose amount → choose destination chain → enter recipient → pay. The status panel shows "Mainnet purchase" and then "Testnet mint".

## Endpoints

- x402: `POST https://myproceeds.xyz/api/x402/pay/cmttoaieb0001lg046e2colwb/mint`
- MPP: `POST https://myproceeds.xyz/api/mpp/pay/cmttoaieb0001lg046e2colwb/mint`
- Discovery: `GET https://myproceeds.xyz/api/x402/pay/cmttoaieb0001lg046e2colwb/openapi.json`
- Body (both fields required; do **not** put an amount in the body): `{"recipientAddress":"0x…","destinationChain":"arc-testnet"}`

## Agent install (Claude Code / Codex / Cursor)

The site's "Show me how" panel installs the skill:
```bash
mkdir -p ~/.claude/skills/testmint && curl -fsSL https://testmint.myproceeds.xyz/skills/testmint/SKILL.md -o ~/.claude/skills/testmint/SKILL.md
# codex: ~/.codex/skills/testmint · cursor: ~/.cursor/skills/testmint · openclaw: ~/.openclaw/skills/testmint · hermes: `hermes skills install <url>`
```

## Flow (with Circle CLI, which also counts as Circle tool usage)

```bash
# 0. preflight: an unpaid 402 is expected and costs nothing
curl -i -X POST -H 'content-type: application/json' -H 'x-payment-tier: 1000' \
  --data '{"recipientAddress":"0xYourArcAddr","destinationChain":"arc-testnet"}' \
  https://myproceeds.xyz/api/x402/pay/cmttoaieb0001lg046e2colwb/mint
# 1. check the Base agent wallet
circle wallet balance --address <base-agent-wallet> --chain BASE --output json
# 2. inspect, then pay (header and --max-amount must match the tier)
circle services inspect '<mint-url>' -X POST -H 'x-payment-tier: 1000' --data '{…}' --output json
circle services pay '<mint-url>' -X POST -H 'x-payment-tier: 1000' --data '{…}' \
  --address <base-agent-wallet> --chain BASE --max-amount 1 --output json
```
Alternative: `npx agentcash@latest fetch '<mint-url>' -m POST -H 'x-payment-tier: 1000' -b '{…}' -p x402 --payment-network base --max-amount 1` (or `-p mpp --payment-network tempo` against the MPP URL).

A successful response contains `mintTransactionState: "INITIATED"` and a `statusUrl`. Poll `statusUrl` with the same `x-payment-tier` header until it confirms, then check the balance on Arc. Treat `statusUrl` as a bearer secret.

## Failure handling (from the skill)

- `400` with `availableTiers`: bad tier; nothing was charged.
- `402` after a signed retry: settlement failed; check the wallet.
- Upstream `400` after payment: the body was rejected, but funds may already be spent. Do not repay automatically.
- `409`: the credential was already redeemed; never retry.
- `429`: honour `Retry-After`.
- Timeout, 500 or 503 after signing: the outcome is uncertain. Check status and balances before paying again.

## When to use it in Tameion

- You need **realistic treasury balances**: RFB 1 treasuries, AP/AR runs with dozens of invoices, or an agent paying many vendors. The Canteen CLI wallet ($5) and the Circle faucet are too small for these.
- A **traction and demo** artifact: it shows a real mainnet x402 payment made by your agent (Circle CLI `services pay`). This is a cheap, honest way to show "Mainnet > Testnet" plumbing works.
- Remember that x402 or Gateway spending on Arc draws from the **Gateway deposited balance**. After minting, `approve` and then `deposit` into GatewayWallet before your agent can pay x402 services (see `arc-cli.md`, circle-agent).
