# skills
Circle's official Agent Skills: 18 `SKILL.md` playbooks, with reference snippets, covering USDC, Arc, CCTP/Bridge Kit, Gateway, Unified Balance, Swap Kit, all three Circle wallet types, the Smart Contract Platform, and the Agent Stack (`circle` CLI agent wallets, x402 pay/accept, funding, spending policy). It ships as a Claude Code / Cursor / Codex plugin along with Circle's codegen MCP server.
Sources: https://github.com/circlefin/skills, refs/circlefin/skills @ 58ab864, https://developers.circle.com/ai/skills (skills table mirrored at `.firecrawl/docs/arc-llms-full.txt:418-454`, install at `circle-llms-full.txt:3487-3500`)
Verified: 2026-09-29

## 1. What it does
- Install with `/plugin marketplace add circlefin/skills` + `/plugin install circle-skills@circle` (Claude Code), `npx skills add circlefin/skills`, `circle skill install --tool <claude-code|cursor|codex|opencode|amp>`, or `curl -sL https://agents.circle.com/skills/setup.md` (the path `agent-stack-starter-kits` uses).
- Each skill is markdown with front-matter (`name`, `description` with trigger words, and sometimes `allowed-tools`). A coding agent reads it when the task matches. Deep snippets live in `references/*.md` and are loaded on demand.
- It bundles the **Circle MCP server** `https://api.circle.com/v1/codegen/mcp` (`plugins/circle/.mcp.json`) for live SDK signatures, addresses and chain IDs. The skills hold the stable patterns; the MCP holds the changing facts.
- Plugin manifests: `.claude-plugin/marketplace.json`, `.cursor-plugin/marketplace.json`, `.agents/plugins/marketplace.json`, and `plugins/circle/{.claude-plugin,.cursor-plugin,.codex-plugin}/plugin.json` (plugin v1.6.0).
- It contains no application code except `recover-eco-funds/scripts/*.mjs`.

## 2. RFB fit
- A cross-cutting enabler for **all RFBs**. Load it into your coding agent (and your runtime agent, if it drives the `circle` CLI) to get correct Arc, USDC, Gateway and x402 patterns.
- **RFB4** (strongest): `use-agent-wallet`, `fund-agent-wallet`, `agent-wallet-policy`, `pay-via-agent-wallet`, `accept-agent-payments`, `use-circle-cli`.
- **RFB1** treasury: `use-gateway`, `unify-balance`, `bridge-stablecoin`, `swap-tokens`, `use-developer-controlled-wallets`.
- **RFB2 / RFB3**: `use-developer-controlled-wallets` (payouts, webhooks, contract execution), `use-smart-contract-platform` (escrow deploy and event webhooks), `use-usdc`.
- **RFB5**: only indirect. The dev-controlled wallet transaction lifecycle includes the `DENIED` risk-screening state (`use-developer-controlled-wallets/SKILL.md`, "Terminal states"). There is **no** Compliance Engine or address-screening skill, and no USYC or StableFX skill.

## 3. Tech stack + versions
Markdown only. Snippets target `@circle-fin/developer-controlled-wallets`, `@circle-fin/user-controlled-wallets` / `w3s-pw-web-sdk`, `@circle-fin/modular-wallets-core`, `@circle-fin/app-kit`, `@circle-fin/bridge-kit`, `@circle-fin/swap-kit`, `@circle-fin/unified-balance-kit`, `@circle-fin/adapter-*` (viem, ethers, solana, circle-wallets), `@circle-fin/x402-batching` (+ `@x402/core`, `@x402/evm`), `@circle-fin/cli`, and viem/wagmi, `@solana/kit` and Foundry. The skills pin no versions and tell the agent to check them, e.g. `npm view @circle-fin/x402-batching version` (`accept-agent-payments/SKILL.md:48`). `recover-eco-funds` requires a Node runtime.

## 4. Architecture: every skill
Path prefix: `refs/circlefin/skills/plugins/circle/skills/`. Line counts refer to SKILL.md.

| # | skill (path) | one-line summary | key references |
|---|---|---|---|
| 1 | `accept-agent-payments/SKILL.md` (169) | **Seller side of x402.** Monetize an HTTP endpoint with USDC pay-per-call via Gateway Nanopayments, verify paid calls, and prepare an Agent Marketplace listing. | `references/express-integration.md` (`createGatewayMiddleware` + `gateway.require("$0.01")`, :13-27), `references/testing.md` |
| 2 | `agent-wallet-policy/SKILL.md` (128) | View per-tx, daily, weekly and monthly USDC caps on an agent wallet. Set/reset is OTP-gated, so the agent hands the user a verbatim command. **Mainnet-only.** | `references/commands.md` |
| 3 | `bridge-stablecoin/SKILL.md` (232) | CCTP USDC bridging with App Kit or Bridge Kit (`kit.bridge`), browser, server, Solana and Circle Wallets adapters, events, fees, speed, Forwarding Service, recovery. | `references/adapter-{circle-wallets,private-key,wagmi,browser-wallet}.md`, `forwarding-events-recovery.md` |
| 4 | `fund-agent-wallet/SKILL.md` (181) | Fund an agent wallet: fiat on-ramp, crypto transfer (QR), and Gateway deposits (eco vs direct) for the Nanopayments balance, plus same-chain withdraw. | `references/{fiat-on-ramp,crypto-transfer-alternatives,gateway-eco-deposit,gateway-direct-and-withdraw,troubleshooting}.md` |
| 5 | `pay-via-agent-wallet/SKILL.md` (159) | **Buyer side of x402** with the CLI. `circle services search`, then `inspect`, then `pay`. Covers chain selection (Gateway vs vanilla x402), `--estimate`, `--max-amount` and seller-header gotchas. | `references/{prerequisites,inspect,estimate,errors}.md` |
| 6 | `recover-eco-funds/SKILL.md` (307) | Recover USDC stuck in a legacy CLI Gateway `--method eco` deposit: an Eco Portal `refund(...)` self-refund, then an ERC-3009 sweep from the backing EOA to the SCA. | `references/{self-refund,eoa-to-sca}.md`, `scripts/{_shared,eco-self-refund,eoa-to-sca}.mjs` |
| 7 | `swap-tokens/SKILL.md` (341) | Keyless token swaps with App Kit or Swap Kit (`kit.swap`, `estimateSwap`, `waitForSwap`), same-chain and cross-chain, with slippage, stop limits and custom fees. | `references/adapter-{circle-wallets,viem,solana,browser-wallet}.md`, `crosschain-swap.md`, `slippage-fees.md` |
| 8 | `unify-balance/SKILL.md` (299) | A unified cross-chain USDC balance via App Kit or Unified Balance Kit (`deposit`, `spend`, `getBalances`, `removeFund`, delegates), abstracting Gateway. | `references/adapter-{circle-wallets,viem,solana,multichain,eip1193,browser-wallet}.md`, `delegate.md`, `remove-fund.md`, `check-balance.md` |
| 9 | `use-agent-wallet/SKILL.md` (126) | Bootstrap an agent wallet with the `circle` CLI: install check, Terms, email+OTP login, `circle wallet create` (SCA on each EVM chain), status and balance. ARC is the default `--chain`. | `references/{install-and-login,wallet-management,terms-of-use}.md` |
| 10 | `use-arc/SKILL.md` (114) | Arc chain config (ids, RPC, explorer, CCTP domain 26), USDC-as-gas semantics (18-decimal native vs 6-decimal ERC-20, the same pool), Foundry/viem deploys, bridging in. | `references/deploying-on-arc.md` |
| 11 | `use-circle-cli/SKILL.md` (164) | Front door to `@circle-fin/cli`: the wallet, bridge, gateway, services, contract, transaction, skill, terms, blockchain and telemetry commands, routing to the narrower skills. | `references/cli-operations.md` |
| 12 | `use-circle-wallets/SKILL.md` (83) | Decision guide: developer-controlled vs user-controlled vs modular (passkey) wallets. Covers custody, auth, EOA/SCA and gas sponsorship. | `references/example-scenarios.md` |
| 13 | `use-developer-controlled-wallets/SKILL.md` (154) | Backend-custodied wallets: entity secret, wallet sets, `createWallets`, transfers, `signTypedData`, contract execution, tx state machine, webhooks. | `references/{register-secret,create-dev-wallet,check-balance-and-transfer-tokens,receive-transfer,sign-with-wallet,contract-execution,wallet-management}.md` |
| 14 | `use-gateway/SKILL.md` (193) | Raw Gateway integration: deposit, burn intent (EIP-712), attestation, `gatewayMint`. EVM and Solana, Arc supported. Covers balance queries and <500 ms cross-chain transfers. | 15 references: `deposit-evm*.md`, `evm-to-evm*.md`, `evm-to-solana*.md`, `solana-*.md`, `transfer-evm-{delegate,circle-wallet}.md`, `query-balance.md` |
| 15 | `use-modular-wallets/SKILL.md` (172) | Passkey (WebAuthn) ERC-4337/6900 smart accounts, gasless via the Circle Gas Station paymaster, batched user operations, modules, passkey recovery. | `references/{circle-smart-account,passkey-recovery}.md` |
| 16 | `use-smart-contract-platform/SKILL.md` (225) | Circle SCP: deploy bytecode or templates (ERC-20/721/1155/Airdrop), import, ABI read/write, and event monitoring with webhooks. | `references/{deploy-bytecode,deploy-template,import-contract,interact,monitor-events}.md` |
| 17 | `use-usdc/SKILL.md` (202) | USDC on EVM and Solana: balances, transfers, approvals, verification, the 6-decimal rule, ATAs. | `references/{evm,solana}.md` |
| 18 | `use-user-controlled-wallets/SKILL.md` (228) | Non-custodial MPC embedded wallets (social login, email OTP, PIN) with `executeChallenge` flows for transfers, signing and contract execution. | `references/{create-wallet-social-login,create-wallet-email-otp,create-wallet-pin,send-transaction,sign-message,contract-execution,wallet-management}.md` |

## 5. Circle products covered, and where the key snippet is

| product | package/API | where | what it shows |
|---|---|---|---|
| Dev-Controlled Wallets: init | `initiateDeveloperControlledWalletsClient({apiKey, entitySecret})` | `use-developer-controlled-wallets/SKILL.md` "SDK Initialization" | Client setup. Env vars `CIRCLE_API_KEY`, `ENTITY_SECRET`. |
| Dev-Controlled Wallets: create | `createWalletSet`, `createWallets({accountType, blockchains, count, walletSetId})` | `use-developer-controlled-wallets/references/create-dev-wallet.md:8,20-25` | The example uses `MATIC-AMOY`; swap in `ARC-TESTNET`. |
| Dev-Controlled Wallets: transfer | `createTransaction({walletId, tokenAddress, destinationAddress, amounts, fee})` | `.../check-balance-and-transfer-tokens.md:22` | USDC send, plus fee estimate, accelerate and cancel. |
| Dev-Controlled Wallets: EIP-712 sign | `signTypedData` | `.../sign-with-wallet.md:55` | The primitive for signing x402 / EIP-3009 authorizations from a dev wallet. |
| Dev-Controlled Wallets: contract call | `createContractExecutionTransaction` | `.../contract-execution.md:8,27` | Call escrow or policy contracts on Arc. |
| x402 seller | `createGatewayMiddleware({sellerAddress}).require("$0.01")` from `@circle-fin/x402-batching/server` | `accept-agent-payments/references/express-integration.md:13-27` | An Express paywall in about 10 lines. |
| x402 buyer (CLI) | `circle services pay "<url>" -X <METHOD> --chain <C> [--max-amount] --output json` | `pay-via-agent-wallet/SKILL.md:72-82`, chain hints :84-93 | Agent pays with an agent wallet. |
| Spending policy | `circle wallet limit set --address --chain ARC --policy-type stablecoin --per-tx 1 --daily 5 --weekly 20 --monthly 50` | `agent-wallet-policy/SKILL.md:65-69`; reset :74 | Circle-enforced caps. OTP-gated and mainnet-only (:21,89,99). |
| Gateway (agent) | `circle gateway deposit --method direct\|eco`, `circle wallet fund … --chain ARC --method crypto` | `fund-agent-wallet/SKILL.md:50,76,99` | The default recommendation is a direct deposit on Arc. |
| Gateway (raw) | Gateway Wallet `0x0077777d7EBA4688BDeF3E311b846F25870A19B9`, Minter `0x0022222ABE238Cc2C7Bb1f21003F0a260052475B`; Arc domain 26 | `use-gateway/SKILL.md:49-50,77,95` | Deposit, burn intent and mint. |
| Unified Balance Kit | `kit.unifiedBalance.deposit/spend/getBalances` | `unify-balance/SKILL.md:68-77,107-118`; `Arc_Testnet` id :163 | The simpler Gateway abstraction. |
| Bridge Kit / App Kit (CCTP) | `new AppKit()` / `new BridgeKit()` + `createCircleWalletsAdapter` + `kit.bridge({...})` | `bridge-stablecoin/references/adapter-circle-wallets.md:28-51,78-101`; chain names `SKILL.md:104,208` | Bridges USDC from dev-controlled wallets. |
| Swap Kit / App Kit | `kit.swap({...})` with the Circle Wallets adapter; `KIT_KEY` optional | `swap-tokens/references/adapter-circle-wallets.md:55,101`; the Arc USDC-vs-NATIVE no-op rule `SKILL.md:122`; **testnet swaps support only `Arc_Testnet`** (`SKILL.md:150-160`) | USDC to EURC, for example. |
| Modular Wallets | passkey + paymaster | `use-modular-wallets/SKILL.md`, `references/circle-smart-account.md` | Gasless user operations. |
| SCP webhooks | contract event monitoring | `use-smart-contract-platform/references/monitor-events.md:3` | Event-driven reconciliation. |
| Circle MCP | `https://api.circle.com/v1/codegen/mcp` | `plugins/circle/.mcp.json` | Live SDK and docs lookup. |

## 6. Env vars
Named in snippets only, with no values: `CIRCLE_API_KEY`, `ENTITY_SECRET` (dev-controlled wallets), `KIT_KEY` (optional, swap, server-only), `ARC_MAINNET_RPC_URL`, `ARC_TESTNET_RPC_URL`, `PRIVATE_KEY` (use-arc), `SELLER_ADDRESS` (x402 seller). There is no env file in the repo.

## 7. How to run
```bash
# Claude Code
/plugin marketplace add circlefin/skills
/plugin install circle-skills@circle
claude mcp add --transport http circle https://api.circle.com/v1/codegen/mcp --scope user
# any agent
npx skills add circlefin/skills          # or: circle skill install --tool claude-code
```

## 8. Smart contracts / Arc facts found in the skills
- Arc Testnet: chain id `5042002` (`0x4CEF52`), RPC `https://rpc.testnet.arc.io`, WSS `wss://rpc.testnet.arc.io`, explorer `https://explorer.testnet.arc.io`, faucet `https://faucet.circle.com`, CCTP domain `26` (`use-arc/SKILL.md` "Network Details").
- Arc Mainnet: chain id `5042` (`0x13B2`), RPC `https://rpc.mainnet.arc.io`, explorer `https://explorer.arc.io`, domain `26`.
- USDC `0x3600000000000000000000000000000000000000` (6-decimal ERC-20 view, the same on mainnet and testnet; native gas is the same pool at 18 decimals, and you must never sum the two). EURC testnet `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a`, mainnet `0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1`.
- viem ships the `arcTestnet` and `arc` chains. App Kit chain ids are `"Arc_Testnet"` and `"Arc"`. The CLI and Wallets API use `ARC-TESTNET` and `ARC`.
- Gateway Wallet and Minter addresses: see the section 5 table (`use-gateway/SKILL.md:49-50`).
- Note: the sample apps use `rpc.testnet.arc.network` and `testnet.arcscan.app`, while the skills say `rpc.testnet.arc.io` and `explorer.testnet.arc.io`. Verify which is live.

## 9. AI/LLM usage
None in the repo; the skills themselves are LLM instructions. Notable agent-safety rules you can copy into your own agent prompt:
- Never let the OTP pass through the agent (`agent-wallet-policy/SKILL.md:95-97`).
- Validate seller-controlled fields before putting them in a shell command, to prevent injection (`pay-via-agent-wallet/SKILL.md:130`).
- Always pass `-X`, or a wrong-method 405 burns the payment (`:80`).
- Search the marketplace before declining a task (`:20`).

## 10. Reusable for a hackathon entry
- **Install it in your dev agent on day 1** (plus the MCP) so generated Circle code uses correct decimals, chain ids, adapters and addresses.
- **RFB4 agent that pays:** use `pay-via-agent-wallet` as your runtime agent's buying playbook. Its steps are search, inspect, `--estimate`, then pay with `--max-amount`. Pair it with `agent-wallet-policy` to show judges where Circle-enforced caps would apply on mainnet.
- **RFB4 with dev-controlled wallets:** combine `use-developer-controlled-wallets/references/sign-with-wallet.md:55` (`signTypedData`) with the Nanopayments buyer quickstart. The glue is written up in the `arc-x402-circle-wallets.md` card.
- **Sell your agent's output (x402 seller):** `accept-agent-payments/references/express-integration.md:13-27`.
- **RFB1 treasury moves:** `unify-balance` (one balance across chains), `bridge-stablecoin` with the Circle Wallets adapter (`references/adapter-circle-wallets.md:28-51`), and `swap-tokens` for USDC to EURC on `Arc_Testnet`.
- **RFB3 escrow:** `use-smart-contract-platform` to deploy an escrow and get event webhooks, plus `use-developer-controlled-wallets/references/contract-execution.md` for release and refund calls.
- **Arc correctness:** the `use-arc` "Core Concepts" section is the canonical explanation of native USDC gas and should be cited in a README.

## 11. Limitations / gotchas
- These are docs, not code. Snippets can drift from the SDKs, which is why the MCP exists. Examples are often on other chains (for example `MATIC-AMOY` in `create-dev-wallet.md:22`), so adapt them to `ARC-TESTNET`.
- **Agent-wallet spending policies are mainnet-only**, so you can't demo Circle-enforced caps on Arc testnet.
- `circle wallet create` makes **SCA** agent wallets (`use-agent-wallet/SKILL.md:56`). Raw Gateway nanopayments from a dev-controlled wallet need an **EOA** (docs: SCA is unsupported because of `ecrecover`).
- An eco Gateway deposit always lands on **Polygon** (a fixed destination), and legacy eco deposits can get stuck, which is why `recover-eco-funds` exists. Prefer `--method direct` on Arc (`fund-agent-wallet/SKILL.md:50`).
- The agent-marketplace flows mostly settle on mainnet Base, Polygon or Avax (real USDC).
- There are no skills for USYC, StableFX, Compliance Engine/address screening, Circle Mint or Payments APIs. RFB1 yield and RFB5 screening need the docs or other repos (for example `arc-fintech`, `arc-stablecoin-fx`).
- Some descriptions say "11 EVM chains + Solana" (use-gateway) and "seventeen skills" (starter-kit comments), while the repo has 18 skills. Counts drift.
