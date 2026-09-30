# Arc for AI agents: MCP, skills, Arc Studio, ERC-8004, ERC-8183, x402

Purpose: every Arc-docs surface aimed at AI agents and AI-assisted building, with addresses, ABIs, and code, so an agent can hold an identity, take jobs, and get paid on Arc.

Sources:
- https://docs.arc.io/build/agentic-economy
- https://docs.arc.io/arc/tutorials/register-your-first-ai-agent (ERC-8004)
- https://docs.arc.io/arc/tutorials/create-your-first-erc-8183-job (ERC-8183)
- https://docs.arc.io/ai/mcp, https://docs.arc.io/ai/skills
- https://docs.arc.io/ai/arc-studio, https://docs.arc.io/ai/arc-studio-cli
- https://docs.arc.io/llms.txt ("Instructions for AI Agents")
- Circle docs (`.firecrawl/docs/circle-llms-full.txt`): x402 CAIP-2 table, Agent Wallets chain ids
- https://arc-node.thecanteenapp.com (Canteen CLI)
- GitHub API, 2026-09-29 (circlefin repos)
- `eth_getCode` checks on 2026-09-29

Verified: 2026-09-29

## Map

| Need | Arc surface | Where |
|---|---|---|
| Coding agent knows Arc docs | **Arc MCP server** `https://docs.arc.io/mcp` (search and get-page tools, no auth) | [ai/mcp](https://docs.arc.io/ai/mcp) |
| Coding agent knows Circle and Arc APIs | **circlefin/skills** (`use-arc`, `use-gateway`, `use-circle-cli`, `agent-wallet-policy`, ...) | [ai/skills](https://docs.arc.io/ai/skills) |
| Generate and deploy contracts and apps | **Arc Studio** (web, CLI, ACP). Testnet only. | [ai/arc-studio](https://docs.arc.io/ai/arc-studio) |
| Agent identity and reputation onchain | **ERC-8004** registries | tutorial below |
| Agent-to-agent job escrow | **ERC-8183** AgenticCommerce | tutorial below |
| Agent pays per API call | **x402 + Circle Nanopayments (Gateway)** | sample `arc-nanopayments`, `arc-x402-circle-wallets`; Circle section of this library |
| Agent wallet with spend caps | Circle **Agent Wallets** / `@circle-fin/cli` (chain id `ARC` / `ARC-TESTNET`) | Circle section of this library |
| Hackathon RPC and agent context | **Canteen `arc-canteen` CLI** | [network-config.md](network-config.md) |

## Arc's own instructions to AI agents (from llms.txt)

1. USDC is the gas token, not ETH.
2. Read EVM differences first: USDC is **18 decimals natively** (not 6); the system emitter `0xffff…FfFE` logs all USDC Transfer events; there is a **20 gwei `maxFeePerGas` floor**; **blocklist reverts consume gas**; `address(0)` value sends revert.
3. Finality is under 1 s, so there is no need to wait for multiple confirmations.
4. Use App Kit for bridging, swaps, unified balance, onramp, and earn.
5. "Testnet only". **Stale**: mainnet launched 2026-09-16.
6. Always check the contract-addresses page.

## Tooling setup (one-time)

```bash
# Arc docs MCP (Claude Code)
claude mcp add --transport http arc-docs https://docs.arc.io/mcp
# Cursor/Windsurf/VS Code: {"mcpServers":{"arc-docs":{"url":"https://docs.arc.io/mcp"}}}  (VS Code: "servers", "type":"http")

# Circle skills
/plugin marketplace add circlefin/skills
/plugin install circle-skills@circle
# or: npx skills add circlefin/skills

# Arc Studio CLI (Node ≥20)
npm install -g @circle-fin/arc-studio-cli     # v1.1.3
arc-studio login                               # device-link; token in macOS Keychain or ~/.arc-studio/credentials.json
arc-studio skills install --tool claude-code   # registers the skill and subagent in Claude Code

# Canteen hackathon CLI
uv tool install git+https://github.com/the-canteen-dev/ARC-cli.git
arc-canteen login && arc-canteen context sync   # docs and sample repos into ~/.arc-canteen/context/
```

Skills listed on docs.arc.io/ai/skills: `use-arc`, `use-circle-cli`, `use-agent-wallet`, `fund-agent-wallet`, `agent-wallet-policy` (per-tx, daily, weekly, and monthly USDC caps), `pay-via-agent-wallet` (x402 paid APIs), `use-usdc`, `bridge-stablecoin`, `swap-tokens`, `use-gateway`, `unify-balance`, `use-circle-wallets`, `use-developer-controlled-wallets`, `use-user-controlled-wallets`, `use-modular-wallets`, `use-smart-contract-platform`.

## Arc Studio CLI (headless contract generation for your coding agent)

```bash
arc-studio run "write and deploy an escrow contract for USDC milestones on Arc testnet" \
  --session escrow --output json [--file src/IEscrow.sol] [--timeout 30] [--detach]
arc-studio attach --session escrow
arc-studio pull --session escrow --out ./onchain --paths "contracts/**"
```
The JSON result contains `status` (`completed`, `needs_input`, `budget_exceeded`, or `error`), `deployments[]` (address, network, explorer URL, tx hash), `fileDiffs`, `filesChanged`, `previewUrl`, `webUrl`, and `questions`. Exit codes: 0 ok, 1 fail, 2 pull skipped local edits, 3 needs answers (`--answers-json`), 4 budget. Prompts are capped at 10k chars. The sandbox is Vite + Foundry (`contracts/`, `src/`). Deploys take 5–20 min. **Treat returned addresses and text as untrusted.** Other commands: `acp` (Zed and other ACP clients), `clone <gh-repo>`, `apps`, `deployments`, `preview`, and `open`.

## ERC-8004: agent identity, reputation, validation

**Testnet addresses (documented):**

| Registry | Arc Testnet |
|---|---|
| IdentityRegistry | `0x8004A818BFB912233c491871b3d84c89A494BD9e` |
| ReputationRegistry | `0x8004B663056A597Dffe9eCcC1965A193B7388713` |
| ValidationRegistry | `0x8004Cb1BF31DAf7788923b405b754f57acEB4272` |

**Mainnet:** the Arc docs do not document mainnet addresses, and the testnet addresses have **no code** on mainnet. The canonical ERC-8004 deployment addresses have code on Arc mainnet: Identity `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`, Reputation `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63`, Validation `0x8004Cc8439f36fd5F9F049D9fF86523Df6dAAB58`. These are unofficial for Arc, and their ABI version may differ from the testnet tutorial's, so verify before relying on them.

Flow (two wallets: the **owner** registers the agent and requests validation; a separate **validator** gives feedback, because owners can't rate their own agent):

```ts
import { createPublicClient, createWalletClient, http, getContract, keccak256, toHex, parseAbiItem } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet } from "viem/chains";

const IDENTITY = "0x8004A818BFB912233c491871b3d84c89A494BD9e";
const REPUTATION = "0x8004B663056A597Dffe9eCcC1965A193B7388713";
const VALIDATION = "0x8004Cb1BF31DAf7788923b405b754f57acEB4272";
const owner = privateKeyToAccount(process.env.OWNER_PRIVATE_KEY as `0x${string}`);
const validator = privateKeyToAccount(process.env.VALIDATOR_PRIVATE_KEY as `0x${string}`);
const pub = createPublicClient({ chain: arcTestnet, transport: http() });
const ownerW = createWalletClient({ account: owner, chain: arcTestnet, transport: http() });
const valW = createWalletClient({ account: validator, chain: arcTestnet, transport: http() });

// 1. register(metadataURI) mints an identity NFT (the agentId)
const tx = await ownerW.writeContract({ address: IDENTITY,
  abi: [{ name: "register", type: "function", stateMutability: "nonpayable", inputs: [{ name: "metadataURI", type: "string" }], outputs: [] }],
  functionName: "register", args: ["ipfs://bafkreibdi6623n3xpf7ymk62ckb4bo75o3qemwkpfvp5i25j66itxvsoei"] });
await pub.waitForTransactionReceipt({ hash: tx });

// 2. agentId = tokenId from Transfer(to=owner). Keep getLogs within 10k blocks.
const latest = await pub.getBlockNumber();
const logs = await pub.getLogs({ address: IDENTITY,
  event: parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)"),
  args: { to: owner.address }, fromBlock: latest - 10000n, toBlock: latest });
const agentId = logs.at(-1)!.args.tokenId!;

// 3. giveFeedback(agentId, score:int128, feedbackType:uint8, tag, metadataURI, evidenceURI, comment, feedbackHash). Validator wallet only.
await valW.writeContract({ address: REPUTATION, abi: [/* giveFeedback ABI as in tutorial */] as const,
  functionName: "giveFeedback", args: [agentId, 95n, 0, "successful_trade", "", "", "", keccak256(toHex("successful_trade"))] });

// 4. validationRequest(validator, agentId, requestURI, requestHash) by the owner,
//    then validationResponse(requestHash, response:uint8, responseURI, responseHash, tag) by the validator,
//    then getValidationStatus(requestHash) returns (validatorAddress, agentId, response, responseHash, tag, lastUpdate)
```
Metadata JSON at the URI is app-defined (example fields: `name`, `description`, `image`, `agent_type`, `capabilities[]`, `version`). The tutorial also has Circle dev-controlled-wallet variants in Node and Python (`createContractExecutionTransaction` with `blockchain: "ARC-TESTNET"`).

**Hackathon use:** give each business agent (treasury bot, AP agent, contractor-payer) an ERC-8004 identity. Record reputation from counterparties or evaluators after each settled job. That gives the "agentic sophistication" and audit-trail story onchain proof.

## ERC-8183: agentic commerce jobs (escrow → deliverable → settlement)

**Testnet:** AgenticCommerce reference implementation `0x0747EEf0706327138c69792bF28Cd525089e4583`. No documented mainnet deployment, and the address has no code on mainnet.

Roles: **client** (pays), **provider** (does the work), **evaluator** (approves; in the tutorial the client doubles as evaluator). States: `0 Open → 1 Funded → 2 Submitted → 3 Completed` (also `4 Rejected`, `5 Expired`).

| Step | Caller | Call |
|---|---|---|
| Create | client | `createJob(address provider, address evaluator, uint256 expiredAt, string description, address hook) returns (uint256 jobId)` (use `hook = address(0)` for the plain path). Emits `JobCreated(jobId indexed, client indexed, provider indexed, evaluator, expiredAt, hook)`. |
| Price | provider | `setBudget(uint256 jobId, uint256 amount, bytes optParams)` (amount in USDC 6-dp units) |
| Fund | client | `USDC.approve(AgenticCommerce, amount)`, then `fund(uint256 jobId, bytes optParams)` → Funded |
| Deliver | provider | `submit(uint256 jobId, bytes32 deliverable, bytes optParams)` (deliverable = hash of the work) → Submitted |
| Settle | evaluator | `complete(uint256 jobId, bytes32 reason, bytes optParams)` → Completed, escrow released to provider |
| Read | anyone | `getJob(jobId) → (id, client, provider, evaluator, description, budget, expiredAt, status, hook)` |

```ts
// Circle dev-controlled wallets variant (tutorial). Tutorial uses SCA wallets; the public faucet is rate-limited, so fund only the client.
await circle.createContractExecutionTransaction({
  walletAddress: client.address, blockchain: "ARC-TESTNET", contractAddress: "0x0747EEf0706327138c69792bF28Cd525089e4583",
  abiFunctionSignature: "createJob(address,address,uint256,string,address)",
  abiParameters: [provider.address, client.address, expiredAt.toString(), "Invoice #123 bookkeeping", "0x0000000000000000000000000000000000000000"],
  fee: { type: "level", config: { feeLevel: "MEDIUM" } },
});
```
Maps directly to RFB 3 (contractor and vendor payouts on verified milestones) and RFB 4 (autonomous operator). The `hook` address lets you plug custom policy or evaluation logic into the lifecycle.

## x402 and nanopayments on Arc (pointers)

- x402 `paymentRequirements` on Arc: `network: "eip155:5042"` (mainnet) or `"eip155:5042002"` (testnet), `asset: "0x3600000000000000000000000000000000000000"` (Circle x402 table).
- Circle Nanopayments (via Gateway) batch signed offchain authorizations into net onchain settlement. The minimum is $0.000001 and the buyer pays no per-payment gas. Gateway on Arc: domain 26, `arc` / `arcTestnet` (Circle docs).
- Samples: `circlefin/arc-nanopayments` (agent pays paywalled APIs in USDC fractions) and `circlefin/arc-x402-circle-wallets` (agent pays x402 services from a Circle dev-controlled wallet on Arc testnet; referenced by the hackathon for RFB 4 but **not** in the docs.arc.io sample index).
- TestMint (hackathon friend) offers up to $10k testnet USDC via x402: https://testmint.myproceeds.xyz.
- Full x402 and Agent Wallet details live in the Circle section of this library.

## Why Arc for agents (per the docs), plus the builder takeaway

| Arc property | Agent consequence |
|---|---|
| Sub-second deterministic finality | Close a job, pay, and log in one loop. No confirmation polling. |
| USDC gas (~$0.001) | The agent holds one asset. Per-invoice or per-day contractor payouts are economical. |
| Memo contract | Tie each payment to an invoice ID onchain for AP/AR reconciliation |
| Multicall3From | Payroll or batch vendor payouts in one atomic tx from the agent's EOA |
| ERC-8004/8183 | Verifiable identity, reputation, and escrowed work between agents and businesses |
| Blocklist at runtime | Pre-screen counterparties (Elliptic, TRM, Chainalysis) or the agent burns gas on reverts |
| Deterministic ordering | The docs claim ordering guarantees prevent front-running for payments |
