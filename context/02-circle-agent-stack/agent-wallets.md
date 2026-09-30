# Agent Wallets

Purpose: what Circle Agent Wallets are (custody, account type, chains, fees) and how each operation works, with alternatives for code-first agents.
Sources: https://developers.circle.com/agent-stack/agent-wallets (+ /quickstart, /supported-blockchains, /fees, /wallet-operations/*); live CLI 1.1.4 help (`wallet create`, `contract deploy`, `gateway withdraw` notes); agents.circle.com/skills/wallet-pay.md; prior `arc-agent/docs/wiki/circle-wallets-and-agent-stack.md` (checked 2026-07-29, partly stale).
Verified: 2026-09-29

## Model

- Built on **Circle user-controlled wallets** with **2-of-2 MPC**. Key shares are never exposed to the agent; the user (email owner) retains custody; Circle "cannot unilaterally move funds".
- Account type: **smart contract account (SCA)** on each EVM chain (live CLI: "Create agent-controlled smart contract account (SCA) wallets"). Each SCA has a backing EOA that keys the Gateway balance (CLI resolves it).
- Operated **only through Circle CLI** — no REST/SDK surface for "agent wallets" is documented. (For code-first agents use developer-controlled wallets instead; see bottom.)
- Auth: email OTP → 28-day session in OS keychain; separate mainnet/testnet sessions.
- Provisioning: first `circle wallet login` creates one wallet per supported EVM chain automatically. Extra wallets: `circle wallet create` (max 5 per chain; undeletable).
- Tokens: USDC (primary; for transfers, bridging, x402), EURC, other ERC-20s, native tokens.
- Compliance: all transfers screened against sanctions before submission; sanctioned counterparties blocked.
- Gas: sponsored ($0) on all onchain txs; "capped, subject to fair use, and may change".
- First onchain action on a chain may hit `Wallet not deployed`: deploy with a zero self-transfer `circle wallet transfer <addr> --amount 0 --address <addr> --chain <C> --token usdc` (Gateway eco deposit also deploys it).

## Supported blockchains (docs + `circle blockchain list`)

Arbitrum `ARB`/`ARB-SEPOLIA`, **Arc `ARC`/`ARC-TESTNET`** (Arc mainnet added 2026-09-16), Avalanche `AVAX`/`AVAX-FUJI`, Base `BASE`/`BASE-SEPOLIA`, Ethereum `ETH`/`ETH-SEPOLIA`, Monad `MONAD`/`MONAD-TESTNET`, Optimism `OP`/`OP-SEPOLIA`, Polygon PoS `MATIC`/`MATIC-AMOY`, Unichain `UNI`/`UNI-SEPOLIA`. No Solana agent wallets.

## Fees

| Fee | Amount | When |
|---|---|---|
| Gas | $0 (sponsored) | all onchain txs |
| CCTP fast transfer fee | varies by source chain | bridging (agent wallets always use fast) |
| Forwarding service fee | $0.05 | bridging |
| Forwarding gas fee | varies by destination | bridging |
| Swap provider fee | 2 bps | swapping |
| Gateway protocol fee | 0.5 bps | crosschain x402 payments (same-chain free) |
| Eco deposit fee | set by Eco (skill corpus cites ~$0.03 flat) | eco Gateway deposits |

## Operations (CLI) — full flags in circle-cli.md

| Operation | Command | Notes |
|---|---|---|
| Authenticate | `circle wallet login you@x.com [--testnet]` / `--init` + `--request <id> --otp <code>` | non-interactive two-step for agents; human must supply the OTP |
| Get address | `circle wallet list --type agent --chain ARC-TESTNET --output json` | `--chain` required |
| Fund | testnet `circle wallet fund --address 0x… --chain ARC-TESTNET` (20 USDC faucet); mainnet `--amount 10 --method fiat\|crypto` | Transak onramp for fiat; EIP-681 QR for crypto |
| Balance | `circle wallet balance --address 0x… --chain ARC` | |
| Transfer | `circle wallet transfer 0xTo --amount 1.0 --address 0x… --chain ARC` | blocks until terminal state; returns id/txHash |
| Bridge | `circle bridge transfer ARC --amount 10 --address 0x… --chain BASE` | CCTP fast + forwarding, no dest gas |
| Swap | `circle wallet swap EURC 10 USDC 9.9 --address 0x… --chain ARC` | `--quote` first; USDC↔EURC relevant for FX |
| Execute contract | `circle wallet execute "fn(types)" args… --contract 0x… --address 0x… --chain ARC` | any write function; `--amount` for native value |
| Deploy contract | `circle contract deploy --bytecode 0x… --address 0x… --chain ARC-TESTNET` | experimental; msg.sender = factory |
| Sign | `circle wallet sign message "…"` / `sign typed-data '<json>'` | EIP-712 EVM only |
| Policies | `circle wallet limit set …` | mainnet only, human OTP — guardrails-and-policies.md |
| Nanopayments | `circle gateway deposit/balance/withdraw`, `circle services pay` | nanopayments.md |
| Tx history | `circle transaction list --address 0x… --chain ARC --tx-type inbound` | |

Sample outputs (JSON, `data` envelope):
```json
{"data":{"id":"abc-123-...","state":"CONFIRMED","blockchain":"ARC","txHash":"0xabc...","sourceAddress":"0xYou","destinationAddress":"0xRecipient","amounts":["1"],"operation":"TRANSFER"}}
{"data":{"message":"Bridge complete: 10.0 USDC from BASE to ARC","burnTxHash":"0xabc...","forwardTxHash":"0xdef...","fromChain":"BASE","toChain":"ARC"}}
```

## Guided setup prompt (official)

Paste into Claude Code / Codex / Cursor:
```text
Run curl -sL https://agents.circle.com/skills/setup.md, and use the returned setup instructions to set up my agent wallet.
```
The setup skill installs the CLI + skills, handles the Terms gate (must show the user the live Terms URLs and get explicit consent), logs in, lists/creates wallets (it defaults to BASE; for Tameion say ARC/ARC-TESTNET), checks balance, routes to funding, and then to service discovery/pay.

## Agent Wallet vs other Circle wallet types (choose deliberately)

| | Agent Wallet (CLI) | Developer-controlled wallet | User-controlled | Modular (MSCA) |
|---|---|---|---|---|
| Control | end user's email OTP; agent operates via CLI session | your backend: API key + entity secret | end user PIN/social | passkey |
| Programmatic API | CLI only | REST + `@circle-fin/developer-controlled-wallets` (10.8.1) | SDK w/ user approval | SDK |
| Account | SCA | EOA or SCA | EOA/SCA | MSCA (ERC-4337/6900) |
| Built-in spend policy | yes (mainnet) | no agent-policy API; Gas Station sponsorship policies; Compliance Engine rules | — | via modules |
| Nanopayment signing | via CLI (backing EOA) | EOA only (`ecrecover`; SCA not supported) | | |
| Best for | one agent acting for one human; fastest demo | a product with many wallets (treasury, per-contractor, per-department) | end-user-facing | on-chain policy modules |

Tameion's stack page suggests "a treasury wallet, departmental sub-wallets, and a wallet per contractor" — that multi-wallet shape fits developer-controlled wallets better than the 5-per-chain agent wallet cap. A common hybrid: agent wallet (CLI) for the agent's own spending + dev-controlled wallets for business sub-accounts.

## Staleness vs prior research (arc-agent wiki, 2026-07-29)

- Prior: "no Arc mainnet Agent Wallet support" → **now supported** (2026-09-16).
- Prior: Agent Wallet chain list said "Arc Testnet (testnet only)" → now ARC + ARC-TESTNET.
- Still true: policies mainnet-only; testnet faucet 20 USDC; gas sponsored/capped.
