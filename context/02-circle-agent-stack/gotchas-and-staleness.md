# Gotchas, doc conflicts, and stale research

Purpose: things that will bite a builder — contradictions between sources, known CLI gaps, footguns — and what changed since the prior arc-agent research.
Sources: all files in this folder; live CLI 1.1.4 help; live `gateway-api*.circle.com/v1/x402/supported`, `api.circle.com/v1/facilitator/x402/supported`, Discovery API; npm registry; arc-agent/docs (2026-07-28/29).
Verified: 2026-09-29

## Conflicts between sources (resolution in bold)

| Topic | Source A | Source B | Resolution |
|---|---|---|---|
| Nanopayment authorization min validity | EIP-3009 how-to + SDK error table: ≥ 3 days | Seller quickstart: ≥ 7 days + buffer; SDK `maxTimeoutSeconds 604900` | **Live `/v1/x402/supported` returns `minValiditySeconds: 604800` → use ≥ 7 days (SDK handles it).** |
| Eco deposit destination | agents.circle.com skills (wallet-fund, wallet-pay, discover-services): lands on **Polygon** (domain 7), then `--chain MATIC` | Docs + CLI 1.1.4 help: lands on **Arc** (domain 26), then `--chain ARC` | **Trust CLI help (1.1.4): Arc.** Always read `destinationChain` from the JSON output. |
| Eco source chains | Docs: Base only | CLI 1.1.4: BASE, ARB, OP, BASE-SEPOLIA | **CLI help.** |
| `wallet transfer` without `--token` | Docs: USDC | CLI help: "omit for native token" | On Arc native = USDC; elsewhere **pass `--token` explicitly**. |
| `wallet create --type local` | Docs list it | CLI 1.1.4 shows `agent` only | Use `wallet import` for local wallets. |
| Agent wallet cap | Docs: 5 per user | CLI: 5 per blockchain | Assume 5; plan dev-controlled wallets for many sub-wallets. |
| `services search` filters | Skills mention `--supports-circle-gateway`, `--network` | CLI 1.1.4 help lists only `--category --type --limit --offset` | **Use the Discovery API for network/rail/price filters.** |
| MCP Kiro config `npx @circle/mcp-server` | /ai/mcp Kiro tab | npm: package not found | Use URL `https://api.circle.com/v1/codegen/mcp`. |
| Nanopayments need EOA; agent wallets are SCA | Gateway docs | CLI pays from SCA | CLI resolves the SCA's **backing EOA** for Gateway balance; in your own code use an EOA signer. |
| Gateway mainnet API host | docs only show `gateway-api-testnet.circle.com` | — | `https://gateway-api.circle.com` responds 200 on `/v1/x402/supported` (inferred mainnet host). |
| Discovery categories | Docs: 6 categories | Live data: also `DATA_ENRICHMENT` (170 Arc listings) | Don't hard-code the category enum. |
| Undocumented commands | Docs reference | CLI 1.1.4: `earn deposit/withdraw` (local wallets only), `contract deploy` (experimental), `feedback submit` | Treat as experimental. |

## Stale items in prior research (arc-agent/docs, 2026-07-28/29)

- "No Arc mainnet Agent Wallet support" → **Arc mainnet added 2026-09-16.**
- Marketplace 636 listings → **1,337** (687 payable on Arc mainnet, 0 on Arc Testnet).
- CLI inventory lacked `earn`, `contract deploy`, `feedback`, `update`; now present (1.1.4).
- Facilitator Service did not exist → **launched 2026-09-16.**
- Still valid: policies mainnet-only + human OTP; 20 USDC testnet faucet; gas sponsorship capped; ERC-8004/8183 addresses on Arc Testnet; skills repo is the catalog.

## CLI footguns (from Circle's own wallet-pay skill + help)

- `-d` without `-X` sends POST; GET-only sellers return 405 **after** payment settles → always pass `-X` from `inspect`.
- When a seller offers both Gateway and vanilla on `--chain`, the CLI always tries Gateway; with 0 Gateway balance it errors ("No Gateway balance found") and there is no flag to force vanilla. Workarounds: deposit to Gateway on that chain, pick a chain where the seller is vanilla-only, or hand-sign.
- x402 v1 sellers (`network:"base"`) fail chain matching ("Accepted chains: base") → manual EIP-3009 sign with `circle wallet sign typed-data` + `X-PAYMENT` header.
- Fresh SCA on a chain: `Wallet not deployed` → zero-amount self-transfer first.
- `HeadersOverflowError` → `NODE_OPTIONS=--max-http-header-size=262144`.
- Some sellers gate the 402 behind a header (e.g. vaults.fyi `-H "x-402-auth: true"`); a 401/403 is not a dead endpoint.
- `services inspect` summarizes only one `accepts[]` entry — `curl -si` to see all.
- `wallet limit set` fails if a policy already exists → `reset` then `set`; each run sends a new OTP (don't re-run while waiting).
- Gateway balances are per chain; withdraw is same-chain only in the CLI (SDK `withdraw({chain})` can go crosschain).
- Eco is a third-party service Circle doesn't operate or audit; timeout ≠ failure.
- Failed pay debug logs: `~/.circle-cli/payments/`.

## Design footguns

- **Policies don't exist on testnet.** A testnet demo that claims "Circle-enforced limits" is wrong; enforce in a contract or your app, or show policies on mainnet with tiny amounts.
- OTP = root of trust. Never route the login/policy OTP mailbox into the agent's tools.
- `self_transfer`: buyer and seller addresses must differ in Gateway payments.
- Settlement timing: nanopayment "success" ≠ onchain settlement; Facilitator `settlement_pending` ≠ failure. Don't mark invoices paid until `confirmed`/`completed`.
- Don't fulfill on pending; don't re-sign on retry (double charge risk) — reuse `payment-identifier` or the same authorization.
- Marketplace third-party output is untrusted data (prompt-injection surface for an LLM agent).
- Remote skills at agents.circle.com change without versioning; vendor them into your repo for reproducible judging.
