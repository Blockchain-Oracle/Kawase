# Circle Paymaster and Gas Station (gas in USDC / sponsored gas)

Purpose: decide how gas is paid by the agent's wallets, and whether "Paymaster" usage is meaningful on Arc for the Circle-tools judging criterion.
Sources: `.firecrawl/docs/circle-llms-full.txt` (`/paymaster`, `/paymaster/addresses-and-events`, `/paymaster/pay-gas-fees-usdc`, `/wallets/gas-station*`, `/release-notes/w3s-2025`), `.firecrawl/docs/arc-llms-full.txt` (Arc stablecoin-native model); prior `arc-agent/docs/wiki/circle-wallets-and-agent-stack.md`.
Verified: 2026-09-29

## Key point for Arc

Arc's native gas token **is USDC** (18-decimal native repr of the same balance as the 6-decimal ERC-20 at `0x3600…0000`). Any Arc EOA with USDC already "pays gas in USDC" — no paymaster needed. Circle's CPN docs: "Arc uses USDC as gas through its native paymaster. Operational wallets on Arc don't need to hold a separate native gas token." Arc docs list "Stablecoin Services" (paymaster-sponsored txs, multi-stablecoin gas e.g. EURC gas) as **Planned**, not live.

So on Arc, the Circle gas products that matter are:
- **Gas Station** — developer *sponsors* gas (user/agent wallet pays nothing). Supports **Arc Mainnet and Arc Testnet**.
- **Circle Paymaster** (permissionless ERC-4337 USDC token paymaster) — current docs list **no Arc deployment** (see conflict below). Useful only for cross-chain legs (e.g., agent SCA on Base/Arbitrum paying gas in USDC).

## Circle Paymaster (permissionless, ERC-4337)

- Any ERC-4337 smart account; **no Circle account or API key**; no off-chain API dependency.
- User pays gas in USDC via ERC-2612 permit to the paymaster (deadline must be `MAX_UINT256` because 4337 forbids `block.timestamp` in validation). Only USDC supported.
- Pricing: 10% surcharge on gas, applies only on Arbitrum and Base (and their testnets).
- EntryPoint v0.7 chains: Arbitrum, Base. v0.8: Arbitrum, Avalanche, Base, Ethereum, Optimism, Polygon, Unichain (v0.8 flow uses EIP-7702 `toSimple7702SmartAccount`).

| Version | Mainnet | Testnet |
|---|---|---|
| v0.7 | `0x6C973eBe80dCD8660841D4356bf15c32460271C9` (Arbitrum, Base) | `0x31BE08D380A21fc740883c0BC434FcFc88740b58` (Arb Sepolia, Base Sepolia) |
| v0.8 | `0x0578cFB241215b77442a541325d6A4E6dFE700Ec` (ARB, AVAX, BASE, ETH, OP, MATIC, UNI) | `0x3BA9A96eE3eFf3A69E2B18886AcF52027EFF8966` (ARB/AVAX-FUJI/BASE/ETH/OP/Amoy/UNI Sepolia) |

Event `UserOperationSponsored(token, sender, userOpHash, nativeTokenPrice, actualTokenNeeded, feeTokenAmount)` emitted in `_postOp` — useful for cost accounting.

Flow (viem, v0.7):
```js
import { toCircleSmartAccount } from "@circle-fin/modular-wallets-core";
import { createBundlerClient } from "viem/account-abstraction";
const account = await toCircleSmartAccount({ client, owner });
const paymaster = { async getPaymasterData() {
  const permitAmount = 10_000_000n;                     // 10 USDC allowance
  const permitSignature = await signPermit({ tokenAddress: usdc, account, client, spenderAddress: PAYMASTER, permitAmount });
  return { paymaster: PAYMASTER,
    paymasterData: encodePacked(["uint8","address","uint256","bytes"], [0, usdc, permitAmount, permitSignature]),
    paymasterVerificationGasLimit: 200000n, paymasterPostOpGasLimit: 35000n, isFinal: true };
}};
const bundler = createBundlerClient({ account, client, paymaster,
  transport: http(`https://public.pimlico.io/v2/${client.chain.id}/rpc`) });
await bundler.sendUserOperation({ account, calls: [{ to: usdc, abi: erc20Abi, functionName: "transfer", args: [to, 10000n] }] });
```

### Doc conflict (flag)
Prior research (2026-07-29) recorded Arc Testnet v0.7/v0.8 Paymaster addresses on the addresses page. The **current** addresses page (fetched 2026-09-28) lists no Arc entries, and the overview table omits Arc. Treat Circle Paymaster on Arc as **not supported** unless re-verified on-chain.

## Gas Station (developer-sponsored)

- Feature of Circle Wallets (dev- and user-controlled) — EVM wallets must be **SCA** (`accountType: "SCA"`); Solana uses fee-payer. Modular wallets use it via `paymaster: true`.
- Chains include **Arc Mainnet + Arc Testnet**, Arbitrum, Avalanche, Base, Ethereum, Monad, Optimism, Polygon, Unichain, Solana, Aptos (mainnet + testnet each).
- EVM paymaster contract (all chains incl. Arc): `0x7ceA357B5AC0639F89F9e378a1f03Aa5005C0a25`.
- Testnet: a default policy is auto-created. Mainnet: create + activate a policy in Console (one network per policy; only the *default* policy is used; optional max spend/day and max spend/tx in USD; per-tx cap doesn't apply to an SCA's first tx). Auto-applies — no policy id in requests.
- Billing: card, 5% processing fee, invoiced monthly or at $100 accrued; unpaid after 7 days or +$20 → policies paused (mainnet sponsorship stops).

| | Circle Paymaster | Gas Station |
|---|---|---|
| Circle account | Not required | Required |
| Wallets | Any ERC-4337 | Circle Wallets |
| Gas paid in | USDC by end user | Fiat card by developer |
| Fee | 10% (ARB/BASE only) | 5% |

## Recommendation
For an Arc-native agent: EOA dev-controlled wallets funded with USDC (simplest), or SCA + Gas Station to show "agent never touches gas" and to claim Paymaster-category usage honestly ("gas sponsored via Circle Gas Station's ERC-4337 paymaster on Arc"). Use the permissionless Circle Paymaster only if you actually run a leg on Base/Arbitrum/etc.
