# Account abstraction, smart wallets, relayers, and paymasters on Arc

Purpose: options for gasless UX, smart accounts, and policy-constrained agent wallets on Arc, including the USDC-specific details (18-decimal paymaster deposits, EOA-only Memo and Multicall3From).

Sources:
- https://docs.arc.io/arc/tools/account-abstraction
- https://docs.arc.io/integrate/relayers-and-paymasters
- https://docs.arc.io/integrate/relayers-and-paymasters/deploy-a-paymaster
- https://docs.arc.io/integrate/relayers-and-paymasters/eip-3009-relayer
- https://docs.arc.io/arc/references/evm-differences (EIP-7702)
- https://docs.arc.io/app-kit/unified-balance (SCA and delegate constraints)
- https://docs.arc.io/arc/tutorials/deploy-contracts (Gas Station on SCAs)
- Prior research: /Users/abu/dev/hackathon/arc-agent/docs/wiki/account-abstraction-and-policy-surface.md (checked 2026-07-29; cross-checked below)

Verified: 2026-09-29

## What Arc supports

- **ERC-4337** with EntryPoint **v0.7** at `0x0000000071727De22E5E9d8BAf0edAc6f37da032` (code present on both networks; the docs say to "verify before use").
- **EIP-7702** set-code (type-4) transactions, from the Osaka baseline. EOAs can delegate to contract code, and paymasters can serve 7702-delegated accounts.
- **EIP-3009** `transferWithAuthorization` and `receiveWithAuthorization` on USDC (FiatToken v2 domain `name "USDC"`, `version "2"`).
- **Permit2** at the canonical address. Native **Stablecoin Services** paymasters and multi-token gas are *planned* and not live.

## Paths to gasless or sponsored transactions

| Path | How | Notes |
|---|---|---|
| **EIP-3009 relayer** | User signs typed data offchain. Your EOA calls `transferWithAuthorization` and pays gas in USDC. | The simplest option. ~65k gas. Bill with `gasUsed*effectiveGasPrice/1e12` for 6-dp USDC. |
| **ERC-4337 paymaster** | Deploy a paymaster and call `EntryPoint.depositTo(paymaster){value: X}` | **Deposit in 18-decimal native USDC**: 10 USDC is `10n * 10n**18n`, not `10e6`. Pimlico is the documented bundler for chain 5042002. Your own bundler must use `maxFeePerGas` ≥ 20 gwei. |
| **Circle Gas Station** | Circle dev-controlled **SCA** wallets | Auto-sponsors fees on Arc Testnet (deploy-contracts tutorial). Mainnet policy is set in the Circle Console. |
| **Circle Paymaster** (pay gas in USDC for 4337 accounts) | Circle product | On Arc gas is USDC anyway. Prior research found Circle's Paymaster overview omits Arc while its address page lists Arc Testnet. Treat it as unconfirmed. |
| **Provider AA** | Alchemy (Wallet APIs, gas sponsorship), Biconomy, Pimlico, ZeroDev, Thirdweb, Privy, Dynamic, Crossmint, Para, Turnkey, Blockradar, MetaMask Embedded Wallets, Circle Wallets | Listed on [account-abstraction](https://docs.arc.io/arc/tools/account-abstraction). The listing is not a verified deployment matrix. |

## Paymaster funding snippet (from the docs)

```ts
const ENTRY_POINT = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";
const ep = new ethers.Contract(ENTRY_POINT, [
  "function depositTo(address account) external payable",
  "function balanceOf(address account) external view returns (uint256)"], wallet);
await (await ep.depositTo(PAYMASTER, { value: 10n * 10n ** 18n })).wait();   // 10 USDC
```

## Smart-account caveats specific to Arc

- **Memo and Multicall3From accept direct EOA callers only.** A 4337 smart account, Safe, or Circle SCA or modular wallet calling them reverts (sender spoofing). Agents built on SCAs need an EOA side-wallet for memos, or must record references offchain.
- **Unified Balance**: SCAs (Circle Wallets SCA, Privy server wallets) can't sign spends, so use an authorized **EOA delegate**. SCA deposits must use `allowanceStrategy: "approve"`, because USDC permit uses `ecrecover`, not ERC-1271.
- **Spending policy must cover both USDC interfaces.** An ERC-20 allowance, or an allowlist module scoped to ERC-20 `transfer`, does not stop a native-value send from the same balance. Constrain native `value` too, e.g. with a native-value policy module or by disallowing value calls. (Porting guide plus prior research.)

## Policy-constrained agent wallets (from prior research, still relevant)

Prior research in `arc-agent` (dated 2026-07-29) live-verified these on **Arc Testnet**. They are not re-run today and are not in Arc docs:
- **Biconomy Nexus + Smart Sessions** (MEE 2.1.0 / Nexus 1.2.0): scoped, time-limited, revocable session keys with spending-limit, usage-limit, timeframe, and native-value policies. A full grant, use, deny, and revoke lifecycle was proven with USDC on testnet. Staging sponsorship via `getDefaultMEENetworkUrl(true)` needs no dashboard key.
- **ZeroDev Kernel** permission modules had code on Arc testnet (call, gas, rate, and timestamp policies). The lifecycle was not executed.
- **Circle Address Book module** `0x0000000d81083B16EA76dfab46B0315B0eDBF3d0` had code on Arc testnet. It covers ERC-20/721/1155 transfers only, **not native USDC**.
- Circle **Agent Wallets** (`@circle-fin/cli`, `agent-wallet-policy` skill) offer per-tx, daily, weekly, and monthly USDC caps. Chain ids are `ARC` and `ARC-TESTNET`, and Circle's Agent Wallets table now lists **both mainnet and testnet** for Arc. The prior note that "Agent Wallet is Arc Testnet only" is stale.

For a hackathon "agent cannot quietly exceed budget" story (slide: "Contracts: budget rules and thresholds an agent cannot quietly exceed"), the cheapest credible options are:
1. Circle Agent Wallet spend caps, or
2. a small custom Solidity "treasury vault" that the agent EOA calls, enforcing per-period limits and an allowlist, and holding USDC as ERC-20 (with any native-value path blocked), or
3. Biconomy Smart Sessions.
