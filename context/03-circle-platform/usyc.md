# USYC (tokenized money market fund)

Purpose: the yield leg for RFB 1 Treasury — park idle USDC in USYC, redeem before cash is needed.
Sources: `.firecrawl/docs/circle-llms-full.txt` (`/tokenized/usyc/{overview,smart-contracts,subscribe-and-redeem,subscribe-and-redeem-portal,web2-apis}`, CCTP supported-chains page), `.firecrawl/docs/arc-llms-full.txt` (Arc contract addresses → USYC, stablecoin-native model); `.firecrawl/tameion.md` (RFB wording); prior `arc-agent/docs/wiki/arc-network-and-native-primitives.md`, `swaps-liquidity-vaults-and-lending.md`.
Verified: 2026-09-29

## What it is

- On-chain share of Hashnote International Short Duration Yield Fund Ltd. (SDYF), which holds reverse repo backed by US government securities; yield ≈ **overnight fed funds rate**. Issued by Circle International Bermuda Ltd (BMA-regulated); fund is a CIMA-licensed Cayman mutual fund.
- Standard ERC-20, **6 decimals**. Price is NAV-accruing (token price rises; not rebasing) — published by an on-chain **Oracle** and HTTP API.
- Subscribe/redeem atomically with USDC, T+0, via the **Teller** contract. Redemptions: "Fees apply" (portal).

## Eligibility (hard constraint)

- **Non-US Persons only** (Reg S), institutional onboarding/KYC, **$100,000 minimum investment** (Arc docs). Addresses must be **allowlisted** in the `Entitlements` contract; Teller calls from non-entitled addresses revert.
- **Testnet access:** get testnet USDC at faucet.circle.com → open a ticket at https://support.circle.com with your **Arc Testnet wallet address** requesting USYC allowlisting — "typically processed in 24–48 hours" → then call Teller or use the testnet portal https://usyc.dev.hashnote.com.
- Hackathon implication: request allowlisting **now** for the agent's reserve wallet address(es) (dev-controlled wallet addresses are stable; EVM wallets in one set share an address). Have a fallback demo path (mock/simulated yield vault) if allowlisting doesn't land in time. Check entitlement programmatically before attempting.

## Addresses

| Contract | Arc Testnet | Arc Mainnet |
|---|---|---|
| USYC | `0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C` | `0x8a5D989Bbb96929F689B0200f435f53dA42bF490` |
| Teller (USDC) | `0x9fdF14c5B14173D74C08Af27AebFf39240dC105A` | `0x51A8CE47dC08ba5CD19c7aa84EA6fD6664f60f9b` |
| Entitlements | `0xcc205224862c7641930c87679e98999d23c26113` | `0xb69ecb156Dc0028198028c501340d5367845ca72` |
| Oracle | `0x52b56c7642E71dc54714d879127d97cd0B3D4581` | `0x4BC8d5aCD3d040d2903dD9C5B7048520c6ff537A` |

Other: Ethereum Sepolia USYC `0x38D3A3f8717F4DB1CcB4Ad7D8C755919440848A3`, Teller `0x96424C885951ceb4B79fecb934eD857999e6f82B`, Entitlements `0x7f44c5F5551ed651F7298367Ee51f1CBa608571b`, Oracle `0x48c9E02E09d03E448673166d29691ECdEf56526F`, Cross-Chain Teller `0x06eFF53Db53a760a8BAfAD0E0E229b90Fb8bAA11`. Ethereum mainnet USYC `0x136471a34f6ef19fE571EFFC1CA711fdb8E49f2b`, Teller `0xeE35F963BFC71b51eC95147f26c030D674ea30e6`. BSC (+testnet) via Cross-Chain Teller; Solana program `EMfvuBR8rre2f7sNqdDyPzQW7kgBUsVtxg7nX93YwAdm` (mainnet) / `8FZQeFy39fNK47ebUd7aUWoK1rLgJ7fsteWev3FPP1Aw` (devnet). CCTP moves USYC only between Ethereum and BNB Smart Chain.

## Teller interface

```solidity
interface ITeller {
  function deposit(uint256 _assets, address _receiver) external returns (uint256 shares);   // USDC in → USYC out
  function redeem(uint256 _shares, address _receiver, address _account) external returns (uint256 assets); // USYC in → USDC out
}
// subscribe: USDC.approve(teller, amt); teller.deposit(amt, receiver)
```

With a Circle dev-controlled wallet on Arc Testnet:
```ts
const TELLER = "0x9fdF14c5B14173D74C08Af27AebFf39240dC105A", USDC = "0x3600000000000000000000000000000000000000";
await client.createContractExecutionTransaction({ walletAddress: RESERVE, blockchain: "ARC-TESTNET",
  contractAddress: USDC, abiFunctionSignature: "approve(address,uint256)", abiParameters: [TELLER, "100000000"], fee });
await client.createContractExecutionTransaction({ walletAddress: RESERVE, blockchain: "ARC-TESTNET",
  contractAddress: TELLER, abiFunctionSignature: "deposit(uint256,address)", abiParameters: ["100000000", RESERVE], fee });
// redeem: abiFunctionSignature "redeem(uint256,address,address)", [sharesBaseUnits, RESERVE, RESERVE]
```

## HTTP endpoints (price + entitlement)

| | Mainnet | Testnet (Sepolia-based) |
|---|---|---|
| Current price | `https://usyc.hashnote.com/api/price` | `https://usyc.dev.hashnote.com/api/price` |
| Price history | `https://usyc.hashnote.com/api/price-reports` | `https://usyc.dev.hashnote.com/api/price-reports` |
| Entitled? | `https://api.hashnote.com/v1/entitlements/token_access?address={addr}&symbol=USYC` | `https://api.dev.hashnote.com/v1/entitlements/token_access?address={addr}&symbol=USYC` |

Docs label these for Ethereum networks; for Arc prefer reading the Arc Oracle contract / Entitlements contract directly (ABI not published in fetched docs — read via explorer `explorer.testnet.arc.io`).

## Agent design notes (RFB 1 "Matthew 25" hack)

- Timing logic is the product: forecast outflows (payroll, AP due dates) → keep operating buffer in USDC → sweep excess to USYC → redeem T+0 just before needs. Redemption is atomic, so "redeem exactly when needed" is realistic on Arc (sub-second finality).
- Record yield accrued = shares × (oracle price now − entry price) for the decision log.
- Prior research: XyloNet USDC/USYC pool on Arc Testnet had zero reserves (2026-07) — no secondary liquidity; use the Teller.
- App Kit exposes an `Earn` namespace (pre-GA preview as of 2026-08) — check App Kit section before building a custom path.
