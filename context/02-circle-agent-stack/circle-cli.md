# Circle CLI — full command reference

Purpose: every `circle` command, flag, auth step, env var and config location, reconciled between the docs and the live v1.1.4 binary.
Sources: https://developers.circle.com/agent-stack/circle-cli, /agent-stack/circle-cli/command-reference; live `circle --help` / `<cmd> --help` from `@circle-fin/cli@1.1.4` (raw: `.firecrawl/circle-agent-stack/circle-cli-1.1.4-help.txt`); `npm view @circle-fin/cli`; agents.circle.com skills; prior inventory `arc-agent/docs/raw/circle-cli-command-inventory-2026-07-28.md`.
Verified: 2026-09-29 (help pages run locally; no login, no account created)

## Package facts

| Item | Value |
|---|---|
| npm | `@circle-fin/cli` — latest **1.1.4** (published 2026-09-22); 1.0.0 released 2026-08-13 |
| Binary | `circle` (`dist/index.js`) |
| Node | `>=20.18.2` (starter kits use Node 22.15+ with Bun) |
| Notable deps | `viem 2.31.3`, `@x402/core`/`@x402/evm 2.11.0`, `@circle-fin/x402-batching 3.0.4`, `@solana/web3.js`, `json-schema-faker` (auto-generates request bodies for `services inspect/pay`) |
| Install | `npm install -g @circle-fin/cli` (or `bun add -g @circle-fin/cli`); verify `circle --version` |
| Update | `circle update [-y]` (wraps `npm install -g @circle-fin/cli@<latest>`) |

Pattern: `circle <resource> <verb> [options]`; every command supports `--help`.

## Global options / env vars / files

| Option | Meaning |
|---|---|
| `-o, --output json\|table` | Default `table`. **Always use `json` from an agent.** JSON wraps results in `{ "data": … }`. |
| `-q, --quiet` | Minimal output for piping (tx hash / id / URL, varies per command) |
| `-h, --help` / `-v, --version` | Help / version |

| Env var | Effect |
|---|---|
| `CIRCLE_ACCEPT_TERMS=1` | Accept Terms non-interactively (Circle's own skill says an agent must NOT set this without explicit user consent) |
| `CIRCLE_VERSION_CHECK=off` | Skip version checks (CI/air-gapped). Below min supported version, commands return `VERSION_BLOCKED` except `help`, `version`, `update`, `skill` |
| `CIRCLE_FEEDBACK_ENDPOINT` | Override feedback endpoint (HTTPS only) |
| `NODE_OPTIONS=--max-http-header-size=262144` | Fix `HeadersOverflowError` on large x402 payment headers |

| Path | Content |
|---|---|
| OS keychain | Session secrets (28-day sessions, separate mainnet/testnet) |
| `~/.ows/wallets/<name>` | Local (imported) wallets, Open Wallet Standard |
| `~/.circle-cli/payments/` | Debug logs for failed `services pay` (request, response, failing stage; no secrets) |

## Command tree (live 1.1.4)

```
blockchain  list | config
bridge      transfer | status | get-fee
contract    address | query | deploy (EXPERIMENTAL, undocumented)
earn        deposit | withdraw          (undocumented; local wallets only)
feedback    submit                      (undocumented)
gateway     balance | deposit | withdraw
services    search | inspect | pay
skill       list | info | install | update
telemetry   status | enable | disable
terms       show (default) | accept | reset
transaction list | accelerate | cancel
wallet      login | logout | status | list | create | import | balance | fund | transfer | swap | sign {message,typed-data} | execute | limit [set|reset|budget]
update
```

---

## wallet

### `circle wallet login`
```bash
circle wallet login <email> [--testnet]                  # interactive, prompts for OTP
circle wallet login <email> --init [--testnet]           # step 1 (agents): sends OTP, prints request ID
circle wallet login --request <id> --otp <code>          # step 2: completes login
```
- First login registers the email and provisions **one agent wallet on each supported EVM chain**; no `wallet create` needed. Re-login is idempotent.
- OTP format `B1X-123456` (3-char anti-phishing prefix + 6 digits); CLI accepts just the 6 digits.
- Request IDs expire after 10 min, single use. Sessions last 28 days, one per environment (mainnet/testnet); `wallet status` shows both, `wallet logout` clears both.
- `--type agent` is the only login type.
- Security: never give an agent unrestricted access to the inbox — whoever reads the OTP controls the wallet **and its policies**.

### `circle wallet logout [--type agent]` / `circle wallet status [--type agent]`

### `circle wallet create [--type agent] [--testnet] [--idempotency-key <k>]`
Creates additional agent SCA wallets on all supported EVM chains. Cap: 5 per blockchain (docs: "up to 5 agent wallets" per user). Agent wallets cannot be deleted. (Docs list `--type local` too; live help shows only `agent`; local wallets come from `wallet import`.)

### `circle wallet list --chain <chain> [--type agent|local]`
`--chain` is required. Default lists local + agent.

### `circle wallet import <name> [--private-key | --mnemonic]`
Prompts securely; stored at `~/.ows/wallets/<name>`. **Local wallets bypass policies, OFAC screening and audit logging.**

### `circle wallet balance --address <a> --chain <c> [--rpc-url <u>]`

### `circle wallet fund --address <a> --chain <c> [--amount n] [--method fiat|crypto] [--token usdc|eth|eurc|native] [--export <dir>] [--open|--no-open]`
- Mainnet: `--method fiat` → Transak onramp URL/browser; `--method crypto` → EIP-681 QR (terminal, `--export` PNG, `--open` HTML page). `--method` and `--amount` required non-interactively.
- Testnet: omit `--method`/`--amount`; draws **20 USDC** from the Circle faucet (requires agent login). Example: `circle wallet fund --address 0x… --chain ARC-TESTNET`.
- `--address` must be one of your wallets.

### `circle wallet transfer <to> --amount <n> --address <from> --chain <c> [--token <addr>] [--idempotency-key k] [--estimate] [--rpc-url u]`
Waits for terminal state; returns `{id, state:"CONFIRMED", blockchain, txHash, sourceAddress, destinationAddress, amounts, operation:"TRANSFER"}`. Docs: omit `--token` → USDC; live help: "omit for native token" (on Arc native gas token *is* USDC). Pass `--token` explicitly to be safe. `-q` prints tx ID for agent wallets.

### `circle wallet swap <sellToken> <sellAmount> <buyToken> [<minBuyAmount>] --chain <c> [--address a] [--quote] [--slippage-bps 300] [--idempotency-key k]`
Agent wallets only; via "Circle Stablecoin Kits"; `minBuyAmount` = stop-limit; default slippage 300 bps; Arc Testnet is the only testnet. Fee: 2 bps swap provider fee.
```bash
circle wallet swap EURC 10 USDC --chain ARC --quote
circle wallet swap EURC 10 USDC 9.9 --address 0x… --chain ARC
```

### `circle wallet sign message <msg> --address a --chain c [--hex]`
### `circle wallet sign typed-data '<eip712-json>' --address a --chain c`
EVM only for typed data. This is how you hand-sign EIP-3009 for x402 v1 sellers (see x402.md).

### `circle wallet execute "<fn(sig)>" [args...] --contract <addr> --address a --chain c [--amount <native>] [--estimate] [--idempotency-key k]`
```bash
circle wallet execute "approve(address,uint256)" 0xSpender 1000000 --contract 0xUSDC --address 0x… --chain ARC
```
Returns `{state:"CONFIRMED", operation:"CONTRACT_EXECUTION", txHash, …}`. This is the escape hatch to call ERC-8004/ERC-8183/escrow/your own PolicyWallet contracts from an agent wallet (subject to contract allow/blocklists on mainnet).

### `circle wallet limit …` — see guardrails-and-policies.md
```bash
circle wallet limit --address a --chain ARC [--output json]            # read (no OTP)
circle wallet limit set --address a --chain ARC --policy-type stablecoin --per-tx 100 --daily 500 --weekly 2000 --monthly 5000
circle wallet limit set --address a --chain ARC --policy-type stablecoin --rule-type recipient-allowlist --targets "[0xA,0xB]"
circle wallet limit reset --address a --chain ARC [--yes]
circle wallet limit budget --address a                                   # remaining rolling budgets, EVM-wide
```
Mainnet only; `set`/`reset` require a second human email OTP; `set` fails if a policy of that type exists — `reset` first.

## services (x402 marketplace)

```bash
circle services search ["query"] [--category FINANCIAL_ANALYSIS] [--type http] [--limit 50] [--offset 0] [-q]
circle services inspect <url> [-X METHOD] [-d '<json>'] [-H "K: V"]...      # pricing, input schema, provider, health
circle services pay <url> --address <a> --chain <c> [-X METHOD] [-d '<json>'] [-H "K: V"] [--max-amount 0.01] [--estimate] [--timeout 30] [-q]
```
- `pay` performs the 402 handshake and prints the seller response body. `-d` implies POST if no `-X` — **always pass `-X` from `inspect`'s `method`**, or a GET-only seller returns 405 *after* you paid.
- `--max-amount` refuses to pay more than N USDC (client-side cap, works on testnet too).
- `--estimate` shows requirements without paying.
- CLI picks the Gateway option first when the seller offers one on `--chain`; no flag forces vanilla (known gap).
- SIWX (sign-in-with-X) endpoints are filtered out by the CLI.
- `services inspect` summarises only the auto-selected `accepts[]` entry; `curl -si <url>` to see all.

## gateway (nanopayment balance)

```bash
circle gateway balance --address a --chain ARC [--all]
circle gateway deposit --amount 5 --address a --chain ARC --method direct          # min 0.5 USDC
circle gateway deposit --amount 5 --address a --chain BASE --method eco [--no-wait] [--timeout 120]
circle gateway withdraw --amount 1 --address a --chain ARC [--recipient 0x…] [--timeout 120]
```
- `--method` required for agent wallets. `direct` sources (1.1.4): ETH, MATIC, ARB, AVAX, OP, BASE, UNI, ETH-SEPOLIA, BASE-SEPOLIA, ARB-SEPOLIA, AVAX-FUJI, OP-SEPOLIA, MATIC-AMOY, UNI-SEPOLIA, ARC-TESTNET, ARC (no MONAD). Balance lands on the same chain.
- `eco` (third-party Eco, not operated/audited by Circle): ~30 s, no source gas, single-use quoted vault; sources BASE, ARB, OP, BASE-SEPOLIA; **lands on Arc (Gateway domain 26)** → then use `--chain ARC` for `services pay`/`gateway balance`. JSON: `vaultAddress, deadline, destinationChain, gatewayDomain, transferTxHash, state`. Timeout ≠ failure; failed/expired deposits refund to the agent wallet.
- Withdraw is **same-chain only** (v1); agent wallets are SCAs — pass the SCA address; the Gateway balance is keyed by the SCA's backing EOA and the CLI resolves it. JSON includes `transferId, estimatedFee, chargedFee`.

## bridge (CCTP via Circle Forwarding Service)

```bash
circle bridge get-fee ARC --chain BASE
circle bridge transfer ARC [0xRecipient] --amount 10 --address a --chain BASE [--idempotency-key k] [-q]
circle bridge status <burnTxHash> --chain BASE
```
Fast attestation ~8–20 s; Circle mints on destination (no destination gas needed); `--amount` = amount received, source burns amount + forwarder fee (quoted live from Iris). Fees: CCTP fast fee (varies by source) + $0.05 forwarding service fee + forwarding gas (varies by destination). Returns `{message, burnTxHash, forwardTxHash, fromChain, toChain}`.

## contract

```bash
circle contract address [all|usdc|eurc|cctp|gateway] [--chain <partial name>]
circle contract query "balanceOf(address)" 0xWALLET --contract 0xUSDC --chain ARC
circle contract deploy --bytecode 0x6080… --address <agentWallet> --chain ARC-TESTNET \
  [--constructor-signature "constructor(uint256,address)" 100 0xOwner] [--estimate] [--idempotency-key k]   # EXPERIMENTAL
```
`deploy` note: agent wallets are SCAs, so deployment goes through a factory via the bundler — in the constructor `msg.sender` is the factory and `tx.origin` the bundler. Pass owner/admin explicitly as a constructor arg.

## earn (undocumented, live in 1.1.4)

```bash
circle earn deposit  --amount 10 --address 0xWALLET --chain ARC-TESTNET --vault 0xVAULT
circle earn withdraw --amount 5  --address 0xWALLET --chain ARC-TESTNET --vault 0xVAULT
```
"Deposit USDC into a yield vault." **Local wallets only** ("agent wallet support is not yet available"). No vault list documented — treat as experimental; relevant to RFB 1 yield but USYC is the hackathon-endorsed yield path.

## blockchain / transaction

```bash
circle blockchain list [-q]                         # authoritative chain codes
circle blockchain config --chain ARC [--rpc-url https://…|--default]
circle transaction list --address a --chain ARC [--operation transfer|execute] [--state confirmed] [--tx-type inbound|outbound] [--lowest-nonce] [--cursor id] [--limit 50]
circle transaction cancel <id> --address a --chain ARC
circle transaction accelerate <id> --address a --chain ARC
```
States: `initiated, queued, sent, confirmed, complete, failed, cancelled, denied, cleared, stuck`. `transaction list --tx-type inbound` is a cheap way for an AR agent to detect incoming payments on an agent wallet.

## skill / terms / telemetry / feedback

```bash
circle skill list [--output json]
circle skill info --name <skill>
circle skill install --tool claude-code [--tool cursor --tool codex] [--name accept-agent-payments]   # omit --name = all
circle skill update --tool claude-code
circle terms [show] [--init] [--output json] ; circle terms accept ; circle terms reset
circle telemetry status|enable|disable
circle feedback submit "msg" [--category QUESTION|FEEDBACK|BUG] [--from-file f] [--recent-commands f.json]   # mainnet session required; ≤2000 chars; secrets/PII scrubbed
```
Tools for `--tool`: `claude-code`, `cursor`, `codex`, `opencode`, `amp`, or any tool the open `skills` registry supports.

## Chain identifiers

| Chain | Mainnet | Testnet | CAIP-2 main / test |
|---|---|---|---|
| Arc | `ARC` | `ARC-TESTNET` | eip155:5042 / eip155:5042002 |
| Base | `BASE` | `BASE-SEPOLIA` | eip155:8453 / eip155:84532 |
| Ethereum | `ETH` | `ETH-SEPOLIA` | eip155:1 / eip155:11155111 |
| Arbitrum | `ARB` | `ARB-SEPOLIA` | |
| Avalanche | `AVAX` | `AVAX-FUJI` | |
| Optimism | `OP` | `OP-SEPOLIA` | |
| Polygon PoS | `MATIC` | `MATIC-AMOY` | eip155:137 / eip155:80002 |
| Unichain | `UNI` | `UNI-SEPOLIA` | |
| Monad | `MONAD` | `MONAD-TESTNET` | |

## Agent-driving tips

- Always `--output json`, parse `.data`.
- Commands that move money (per the starter kits' approval list): `services pay`, `wallet transfer`, `bridge transfer`, `gateway deposit`, `wallet sign`, `wallet limit set/reset`. Gate these in your harness; let reads run freely.
- Use `--idempotency-key` on transfer/swap/bridge/execute/create for safe retries.
- Use `--estimate` (transfer/execute/pay/deploy) for dry-runs shown to a human approver.
- Scripted OTP (policy set) needs a single long-lived shell holding a named pipe; see guardrails-and-policies.md.
