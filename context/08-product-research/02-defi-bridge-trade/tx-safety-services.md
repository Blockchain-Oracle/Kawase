# Transaction safety services that support Arc

Purpose: what an agent can use on Arc to simulate transactions, score token and address risk, and estimate gas correctly before it asks the user to sign.

Sources (`E/` = `.firecrawl/product/02-defi/`):
- Tenderly public networks `https://api.tenderly.co/api/v1/public-networks` → `E/tenderly-public-networks.json`
- Blockaid Node SDK chain enums: https://github.com/blockaid-official/blockaid-client-node/blob/main/src/resources/evm/evm.ts → `E/blockaid-evm.ts`. The docs at https://docs.blockaid.io/reference/supported-chains redirect to a login.
- GoPlus `https://api.gopluslabs.io/api/v1/supported_chains`, `/token_security/5042`, `/address_security/…?chain_id=5042`, `/token_security/5042002` → `E/goplus-*.json`
- Arc launch blog, "Compliance and Security" partners: https://www.arc.io/blog/arc-economic-os-internet
- Live gas RPCs → `E/onchain-checks-2026-09-29.txt`; `context/01-arc/gas-and-fees.md`
- `context/03-circle-platform/compliance.md` (Circle Compliance Engine)

Verified: 2026-09-29

## Matrix

| Service | What | Arc mainnet | Arc testnet | Access | Evidence |
|---|---|---|---|---|---|
| **Tenderly** | Tx simulation, virtual testnets, alerts | Yes: network `{"id":"5042","slug":"arc"}` with a full `chain_config` (`"type":"arc"`, `osaka_time: 0`, `arc_zero7_time`/`arc_zero8_time`) | Yes: `{"id":"5042002","slug":"arc-testnet"}` | Tenderly account + access key for the Simulation API (not tested) | [VERIFIED] network listing; simulation not exercised |
| **Blockaid** | Transaction and address scanning | Yes: `'arc'` appears in the SDK's address-scan chain union (`evm.ts:~123`) and in the `TransactionScanSupportedChain` union (`:~420`) | No `arc-testnet` enum value found (only `'arc'`) | API key (enterprise) | [VERIFIED] SDK code; docs gated |
| **GoPlus** | Token security (honeypot, taxes, owner, holders, LP), address security | Yes: `supported_chains` → `{"name":"Arc","id":"5042"}`. Token and address security calls returned data **without a key** | **No**: `token_security/5042002` → `"The main chain is not supported"` | Keyless (rate-limited) | [VERIFIED] |
| **Hypernative** | Threat monitoring, token verification | Named as a launch security partner [REPORTED] | – | Enterprise | LI.FI's token metadata uses a `hypernative` verification provider on other chains; Arc USDC is marked `unverified` in LI.FI [VERIFIED] |
| Chainalysis, Elliptic, TRM Labs | Sanctions / AML screening | Listed in Arc docs "Compliance vendors" and launch blog [REPORTED] | – | Enterprise | `context/01-arc/ecosystem-and-infrastructure.md` |
| **Circle Compliance Engine** | Address screening for Circle Wallets | Arc supported per Circle docs | Yes | "only available for eligible customers" | `context/03-circle-platform/compliance.md` |
| Socure | Identity | Launch partner [REPORTED] | – | – | arc.io blog |
| **Plain RPC simulation** | `eth_call` / `eth_estimateGas` against latest state | Yes (Circle public RPC) | Yes | Free | [VERIFIED] RPCs answer; standard EVM |

Example GoPlus output for ARGUS on Arc: `is_honeypot 0`, `is_open_source 1`, `is_mintable 0`, `buy_tax 0`, `sell_tax 0`, `holder_count 20628`, `lp_holder_count 111`, and a `dex[]` list of Uniswap v4 pools under PoolManager `0x8366…0951` (`E/goplus-token-security-arc-argus.json`) [VERIFIED].

## Gas specifics for the agent

From live RPC reads on 2026-09-29 (`E/onchain-checks-2026-09-29.txt`) and `context/01-arc/gas-and-fees.md`:

| | Mainnet | Testnet |
|---|---|---|
| `eth_gasPrice` | 20,000,000,321 wei (20 gwei) | 25,000,000,000 (25 gwei) |
| base fee | 20 gwei (the floor) | 20 gwei |
| `eth_maxPriorityFeePerGas` | `0x141` (321 wei) | `0x12a05f200` (**5 gwei**) |

Two changes versus `gas-and-fees.md`: testnet priority is now 5 gwei, and mainnet priority is 321 wei rather than 1 wei [VERIFIED].

Rules [VERIFIED in `gas-and-fees.md`]:
- `maxFeePerGas` below 20 gwei is silently dropped.
- Gas is paid in USDC (18 dp native).
- ~500 ms blocks and 1-confirmation finality, so a pre-sign simulation reflects state that is at most a block old.

Cost reference: KyberSwap priced a USDC→EURC swap at 330,498 gas = **$0.0066** at 20 gwei (`E/kyberswap-route-arc-usdc-eurc.json`) [VERIFIED].

## Pre-sign safety pipeline [INFERENCE]

1. **Recipient / counterparty:**
   - Circle Compliance Engine if the team has access.
   - Otherwise GoPlus `address_security` (Arc mainnet only) plus an on-chain blocklist check. The Native Coin Control precompile `0x1800…0001` blocks transfers, and a revert burns gas (`network-config.md`).
2. **Token (meme trades):** GoPlus `token_security/5042` for honeypot, tax, owner, and holders, plus DexScreener liquidity. Block below a liquidity threshold.
3. **Transaction:** `eth_call` or `eth_estimateGas` simulation on the Arc RPC for every tx. Use Tenderly simulation for balance-diff previews in the confirmation card once a Tenderly key exists. Blockaid is optional if an enterprise key can be obtained.
4. **Fees:** floor `maxFeePerGas` at 20 gwei and show the fee in USD.

## Gaps
- Tenderly simulation and Blockaid scans were not run (keys needed) [UNKNOWN runtime behaviour on Arc].
- On testnet, GoPlus is unavailable. Token-risk UX can only be demoed against mainnet data (read-only) [VERIFIED].
