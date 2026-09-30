# App Kit (Send, Bridge, Swap, Unified Balance, Onramp, Earn)

Purpose: everything needed to move money with Circle's App Kit SDK on Arc: packages, adapters, one-call examples for every capability, chain and token support, fees, and failure handling. App Kit counts toward the hackathon's "Circle tool usage" score (20%).

Sources:
- https://docs.arc.io/app-kit and /app-kit/{send,bridge,swap,unified-balance,onramp,earn}
- https://docs.arc.io/app-kit/tutorials/installation
- https://docs.arc.io/app-kit/tutorials/adapter-setups
- https://docs.arc.io/app-kit/references/supported-blockchains
- https://docs.arc.io/app-kit/references/sdk-reference
- https://docs.arc.io/app-kit/quickstarts/* (bridge, send, swap, unified-balance, earn, onramp)
- https://docs.arc.io/app-kit/tutorials/bridge/*, /swap/*, /unified-balance/*, /earn/*
- https://docs.arc.io/app-kit/concepts/*-fees
- npm registry, 2026-09-29 (versions below)

Verified: 2026-09-29

## Packages (npm, 2026-09-29)

| Package | Version | What |
|---|---|---|
| `@circle-fin/app-kit` | 1.15.3 | All-in-one: `AppKit` class with send, bridge, swap, `unifiedBalance.*`, `earn.*`, `onramp.*` |
| `@circle-fin/bridge-kit` | 1.15.1 | Bridge only (CCTP V2) |
| `@circle-fin/swap-kit` | 1.7.0 | Swap only |
| `@circle-fin/unified-balance-kit` | 1.7.0 | Gateway unified balance only |
| `@circle-fin/earn-kit` | 1.8.0 | Earn vaults only |
| `@circle-fin/onramp-kit` | 1.0.2 | Fiat onramp widget (no adapter needed) |
| `@circle-fin/adapter-viem-v2` | 1.18.0 | viem v2 adapter |
| `@circle-fin/adapter-ethers-v6` | 1.12.0 | ethers v6 adapter |
| `@circle-fin/adapter-solana-kit` | 1.6.3 | Solana (`@solana/kit` + `@solana/web3.js`). The browser bridge quickstart uses `@circle-fin/adapter-solana`. |
| `@circle-fin/adapter-circle-wallets` | 1.8.0 | Circle dev-controlled (and user-controlled via `/ucw/server`) wallets, **server-side only** |

```bash
npm install @circle-fin/app-kit @circle-fin/adapter-viem-v2 viem
# Node v22+ in all quickstarts; ESM ("type": "module"); run with tsx --env-file=.env
```

**API key**: a Circle Console API key (https://console.circle.com/api-keys; choose the "App Kits" permission for restricted keys) is **required for Onramp** and **optional for Swap and Earn**. Without it, requests share a rate limit. Keys are environment-specific (testnet vs mainnet). Keep them server-side; the SDK rejects an Earn key used from a browser. **Kit keys are legacy**: rename `kitKey` to `apiKey` in swap config.

## Adapters

```ts
import { AppKit } from "@circle-fin/app-kit";
import { createViemAdapterFromPrivateKey, createViemAdapterFromProvider } from "@circle-fin/adapter-viem-v2";
import { createCircleWalletsAdapter } from "@circle-fin/adapter-circle-wallets";

const kit = new AppKit();                    // new AppKit({ disableAnalytics: true, disableErrorReporting: true }) to silence telemetry

// Agent backend with a raw key (one adapter works across all EVM chains; default public RPCs are rate-limited)
const adapter = createViemAdapterFromPrivateKey({ privateKey: process.env.PRIVATE_KEY as `0x${string}` });

// Browser wallet (EIP-6963 / window.ethereum)
const browserAdapter = await createViemAdapterFromProvider({ provider: window.ethereum });

// Circle developer-controlled wallets (no keys in your app; pass wallet address per operation)
const cw = createCircleWalletsAdapter({ apiKey: process.env.CIRCLE_API_KEY!, entitySecret: process.env.CIRCLE_ENTITY_SECRET! });
// usage: from: { adapter: cw, chain: "Arc_Testnet", address: "0xYourCircleWalletOnArc" }
```

Custom RPC (recommended so you don't hit the rate limits on shared defaults):
```ts
import { EthereumSepolia, ArcTestnet } from "@circle-fin/app-kit/chains";
const RPC = { [ArcTestnet.name]: "https://rpc.testnet.arc.io", [EthereumSepolia.name]: process.env.SEPOLIA_RPC! };
const adapter = createViemAdapterFromPrivateKey({
  privateKey: process.env.PRIVATE_KEY as `0x${string}`,
  getPublicClient: ({ chain }) => createPublicClient({ chain, transport: http(RPC[chain.name], { retryCount: 3, timeout: 10_000 }) }),
  getWalletClient: ({ chain, account }) => createWalletClient({ account, chain, transport: http(RPC[chain.name]) }),
});
```
Other signers documented: Turnkey (`@turnkey/viem`), Privy (ethers), MetaMask EIP-6963, and Circle user-controlled wallets (`createCircleUserWalletAdapter` from `@circle-fin/adapter-circle-wallets/ucw/server`). Circle Wallets are **one wallet per chain** (different addresses per chain for EOAs; one SCA per chain). The Circle Wallets adapter cannot gas-sponsor crosschain transfers originating on Solana.

## Chain identifiers and support

Identifiers are case-sensitive: `Arc`, `Arc_Testnet`, `Ethereum_Sepolia`, `Base_Sepolia`, `Arbitrum_Sepolia`, `Avalanche_Fuji`, `Solana_Devnet`, `Optimism_Sepolia`, `Polygon_Amoy_Testnet`, `Edge_Testnet`, `Pharos_Testnet`, and so on. Enums `BridgeChain`, `SwapChain`, `UnifiedBalanceChain`, and `EarnChain` are exported from `@circle-fin/app-kit`. Use `kit.getSupportedChains("bridge" | "swap" | "unifiedBalance" | "earn")` to check at runtime.

| Chain | Capabilities | Adapters |
|---|---|---|
| **Arc** | **Send, Bridge, Swap, Unified Balance, Onramp, Earn** (only chain with all six) | Viem, Ethers, Circle Wallets |
| Arbitrum, Avalanche, Base, Ethereum, OP, Polygon PoS, Unichain | Send, Bridge, Swap, Unified Balance | Viem, Ethers, Circle Wallets |
| HyperEVM, Sei, Sonic, World Chain | Send, Bridge, Swap, Unified Balance | Viem, Ethers |
| Solana | Send, Bridge, Swap, Unified Balance | Solana, Circle Wallets |
| Ink, Linea, Monad, Plume, XDC | Send, Bridge, Swap | Viem, Ethers |
| Codex, EDGE, Injective, Morph, Pharos, X Layer | Send, Bridge | Viem, Ethers |
| Cronos, Plasma | Send, Bridge | Viem, Ethers, Circle Wallets |

**Swap works on mainnets only, except Arc Testnet.** On Arc, Swap accepts **USDC, EURC, and cirBTC** only.

Tokens per capability: Send takes any token (alias or address). Bridge takes USDC, EURC, WETH, cirBTC, and CCTPx-registered assets. Swap takes liquid tokens. **Unified Balance takes USDC only.** Onramp and Earn take USDC and EURC.
Aliases (case-insensitive): `USDC EURC cirBTC USDT USDe DAI PYUSD WETH WBTC WSOL WAVAX WPOL POL PLUME MON NATIVE`.

## Send (same chain)

```ts
const result = await kit.send({
  from: { adapter, chain: "Arc_Testnet" },
  to: "0xRecipient",
  amount: "12.50",          // human-readable decimal string
  token: "USDC",            // or "EURC" or a token address
});
// kit.estimateSend(params) available
```
Send is the simplest way for an agent to pay a vendor. For invoice reconciliation, use the raw `Memo` contract instead ([transactions-memo-batching.md](transactions-memo-batching.md)). App Kit Send has no memo field.

## Bridge (CCTP V2 burn → attest → mint)

```ts
kit.on("*", (e) => console.log(e));               // approve, burn, fetchAttestation, mint events
let result = await kit.bridge({
  from: { adapter, chain: "Ethereum_Sepolia" },
  to:   { adapter, chain: "Arc_Testnet" },         // or { recipientAddress, chain, useForwarder: true } with no destination adapter
  amount: "25.00",
  // token: "EURC" | "cirBTC" | "WETH"             // default USDC; non-USDC routes are EVM↔EVM only, no custom fees
  config: { transferSpeed: "FAST", maxFee: "0.10" }, // "SLOW" = Standard (free, waits for source finality)
});
if (result.state === "error") result = await kit.retryBridge(result, { from: adapter, to: adapter });
// result.steps[i].explorerUrl for approve/burn/mint
```
- Pre-flight: `const est = await kit.estimateBridge(params); est.fees // [{type:"provider", amount}, ...]`.
- **Forwarding Service** (`useForwarder: true`): Circle submits the destination mint, so you need no gas or wallet on the destination. The mint step's `data` is `undefined` (confirmation comes from the Iris API). A fee is deducted from the mint unless you set `config.feePayment: "source"`, which is incompatible with custom fees.
- Default speed is FAST. **Bridging out of Arc**: the amount must exceed the CCTPv2 max fee (~1.4 USDC on testnet) or the burn reverts with `"Max fee must be less than amount"`.
- Recovery guide: https://docs.arc.io/app-kit/references/bridge-error-recovery.
- Arc attestations take about 1 block (~0.5 s). Ethereum, Base, and Arbitrum as sources take 13–19 min on Standard.

## Swap (same chain or crosschain)

```ts
const params = {
  from: { adapter, chain: "Arc_Testnet" },
  tokenIn: "USDC", tokenOut: "EURC", amountIn: "100.00",
  config: { apiKey: process.env.CIRCLE_API_KEY, slippageBps: 100 /* default 300 */ /* or stopLimit: "95.0" */ },
};
const est = await kit.estimateSwap(params);   // est.amountOut e.g. "0.989589" per 1 USDC
const out = await kit.swap(params);
// crosschain: add to: { chain: "Polygon", recipientAddress } and tokenOut: "NATIVE"
// helpers: kit.getTokenRates(), kit.getSwapStatus(), kit.waitForSwap()
```
Fees: 2 bps provider fee plus an optional custom fee (90/10 split with Arc). The `arc-stablecoin-fx` sample is built on this.

## Unified Balance (Circle Gateway under the hood)

```ts
await kit.unifiedBalance.deposit({ from: { adapter, chain: "Base_Sepolia" }, amount: "10.00", token: "USDC" });
await kit.unifiedBalance.deposit({ from: { adapter, chain: "Arbitrum_Sepolia" }, amount: "10.00", token: "USDC" });
const bal = await kit.unifiedBalance.getBalances({ /* sources */ includePending: true });
// bal.totalConfirmedBalance, bal.totalPendingBalance, per-depositor breakdown by chain
await kit.unifiedBalance.spend({
  amount: "15.00",
  from: { adapter },                                   // SDK picks source chains from confirmed balance
  to: { adapter, chain: "Arc_Testnet", recipientAddress: "0xVendor" },
});
```
- Standard deposits wait for **source-chain finality** (≥15 min on Ethereum L2s). Wait until `totalConfirmedBalance` covers the spend.
- **Fast deposits** (`config: { transferSpeed: "FAST" }` with `to`) use CCTP Fast plus `TokenMessengerWithFees`. Sources: Arbitrum, Codex, Ethereum, Ink, Linea, OP, Plume, Unichain, World Chain. Destinations: **Arc**, Avalanche, Polygon PoS.
- Once confirmed, spends are near-instant (Gateway docs quote under 500 ms). Fee: 0.5 bps crosschain, plus source gas per burn intent (Arc $0.0035).
- **Delegates**: Circle Wallets SCAs and Privy server wallets can't sign spends. Add an EOA delegate with `kit.unifiedBalance.addDelegate`, then `depositFor` and `spend` (see the [delegate quickstart](https://docs.arc.io/app-kit/quickstarts/unified-balance-delegate-deposit-and-spend)). SCA deposits need `allowanceStrategy: "approve"` because permit uses `ecrecover`, not ERC-1271.
- **Trustless exit**: `initiateRemoveFund`, then a **7-day wait**, then `removeFund`. One pending removal per chain and address.
- Other methods: `estimateDeposit`, `estimateSpend`, `getDelegateStatus`, `removeDelegate`, `setFeeRecipients`, and `setCustomFeePolicy`.
- For a treasury agent this is the "one balance across chains" primitive the hackathon brief describes.

## Earn (vaults on Arc; USDC and EURC)

```ts
const { vaults } = await kit.earn.exploreVaults({ chain: "Arc_Testnet", sortBy: "apy" });
const q = await kit.earn.getDepositQuote({ /* ... */ });
await kit.earn.deposit({ from: { adapter, chain: "Arc_Testnet" }, vaultAddress: vaults[0].vaultAddress, amount: "100.00" });
const pos = await kit.earn.getPosition({ /* ... */ });   // pos.currentBalance = redeemable after fees
await kit.earn.withdraw({ /* ... */ });                   // getWithdrawalQuote first
// crosschain: deposit from another chain; getCrossChainDepositStatus / waitForCrossChainDeposit; kit.earn.retry(err)
```
Earn is non-custodial and runs over third-party lending vaults (Morpho is named in the fee docs). Fees come out of returns. Principal can fall in extreme conditions. It is a natural fit for the "idle treasury cash earns yield" RFB. USYC is the institutional alternative (allowlisted).

## Onramp (fiat to USDC/EURC on Arc)

Server mints a session (valid 30 min, needs an API key) → client runs `kit.onramp.fetchSession({ url: "/api/onramp/sessions", body: { appUserId, destinationAddress } })` → `kit.onramp.mountIframe({ session, container, onDepositSettled })` or `openWindow(...)`. Debit card, Apple Pay, and Google Pay need **KYB in the Circle Console** plus `referrerDomain`. Bank transfer covers select US states and the EU. No credit cards. Demo: https://onramp-demo.arc.io/. Sandbox and hosting rules (CSP, container sizing): https://docs.arc.io/app-kit/references/onramp-hosting-requirements.

## Monetization: custom fees

```ts
kit.setCustomFeePolicy({
  bridge: { computeFee: () => "1.00", resolveFeeRecipientAddress: () => "0xYourFeeWallet" },
  swap: { /* same shape */ }, unifiedBalance: { /* same shape */ },
});
```
**90% to you, 10% to Arc.** Use a fee recipient on the **source** chain. Show the full breakdown before the user confirms.

## Events and observability

`kit.on("*" | action, handler)` and `kit.off(...)`. Bridge events carry `{ protocol: "cctp", version: "v2", traceId, values: { name, state, txHash, data, explorerUrl } }`. Persist `traceId` and step tx hashes in your agent's audit log. Partial bridges are recoverable with `retryBridge`.

## Gotchas specific to App Kit

- Amounts are **decimal strings**, not base units. Don't pass `"10000000"` for 10 USDC.
- On Arc, App Kit's "USDC" means the ERC-20 interface (6 dp). Your own native-balance reads are 18 dp.
- Swap needs liquidity. On Arc testnet only the USDC/EURC/cirBTC pairs exist.
- The earlier (2026-07) note that "CCTP Fast Transfer is unavailable on Arc Testnet" is superseded. Circle's table now lists Arc's Fast source as "N/A" (already fast), and App Kit defaults to FAST for inbound routes.
- The Circle Wallets adapter requires an explicit `address` in each `from`/`to`.
