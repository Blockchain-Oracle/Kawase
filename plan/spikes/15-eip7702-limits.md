# Spike 15: spending limits on the user's own wallet with EIP-7702 (no separate account, no prompt inside the limit)

Purpose: test whether an ordinary wallet key on Arc can carry on-chain spending limits for the agent without a second smart account, so that the wallet provider (Circle, Privy, Turnkey, a passkey-derived key) becomes a free choice. Added on 2026-09-30 after Abu rejected a PIN for every action.
Code: `plan/spikes/code/04-delegation/run-7702.mjs` (`node run-7702.mjs`); results in `results.7702.testnet.json`.
Date: 2026-09-30
**Result: PASS on Arc testnet, 13/13.** Not run on mainnet (no funded mainnet key); the same contracts have identical bytecode sizes on mainnet (`.firecrawl/product/17/getcode-7702-stack-2026-09-30.tsv`).

## What was tested
A fresh local key (standing in for any embedded-wallet key), funded with 1.5 testnet USDC. Test account `0x9c8cDa2778b6B735A10b12EF4fE34AADF9CB7411`.

| # | Test | Expected | Got |
|---|---|---|---|
| 1 | Plain EOA calls Arc's Memo contract | pass | ✅ [`0xb3c6…dd4b`](https://explorer.testnet.arc.io/tx/0xb3c694c33931b65d1041820de188ca20e3de902af7264c18a928456ab405dd4b) |
| 2 | Type-4 (EIP-7702) transaction: the EOA delegates to MetaMask's `EIP7702StatelessDeleGator` `0x63c0…E32B` | pass | ✅ code becomes `0xef0100…` [`0xde4d…46aa`](https://explorer.testnet.arc.io/tx/0xde4d12ab2e5c6644435219cb2d1c13d1eb6bc97f8efdd7ef59aaf339639046aa) |
| 3 | The delegated EOA still sends a normal transfer | pass | ✅ |
| 4 | The delegated EOA still calls Memo | observe | ✅ accepted: Arc still treats it as an EOA caller |
| 5 | The agent (Circle ops wallet) sends 0.2 USDC to A from the user's account, no user signature | pass | ✅ [`0x49d9…6e70`](https://explorer.testnet.arc.io/tx/0x49d9e7750bb92dd5fe8075c607626840dc3342e77313578256ef67e4f1f46e70) |
| 6 | The agent sends 0.3 USDC to B (any recipient; total = the 0.5 cap) | pass | ✅ |
| 7 | 0.01 USDC over the period cap | fail | ✅ refused |
| 8 | `approve()` instead of `transfer()` | fail | ✅ refused |
| 9 | A native-value send | fail | ✅ refused |
| 10 | The user's balance fell by exactly 0.5 USDC | pass | ✅ |
| 11 | The user revokes with one ordinary transaction | pass | ✅ [`0x4764…2475`](https://explorer.testnet.arc.io/tx/0x4764f8d4a1d7eb0311a10bc7a5143a2a639e984921f64e35b9bbcf1320492475) |
| 12 | The agent tries again after the revoke, in a new period | fail | ✅ refused |
| 13 | The user removes the 7702 code (back to a codeless EOA) | pass | ✅ |

## What this means
- **The user's wallet can be any ordinary key.** The limits live in the MetaMask delegation (an EIP-712 signature with caveats: token, method, amount per period, expiry), not in the wallet vendor.
- **Inside the limit, nothing is asked.** The agent's server wallet redeems the delegation; the chain refuses anything over the cap, another method, or native value. This is the hackathon's own guidance: "put the limit somewhere the agent cannot reach".
- **No separate "pocket" account and no moving funds.** The money stays in the user's own address. (Spike 4 used a separate HybridDeleGator account that had to be funded.)
- **Revoking is one direct transaction**, simpler than spike 4's UserOp + self-bundled `handleOps`.
- **What the wallet must be able to sign:** one EIP-7702 authorization (once), one EIP-712 delegation per limit change, and ordinary transactions for sends above the limit. A wallet that cannot sign a 7702 authorization (to be confirmed for Circle user-controlled wallets) would need the spike-4 design instead.

## Not covered
- Mainnet (bytecode present, flow not run).
- Gas for the user's own transactions (Arc gas is native USDC, so a funded wallet pays its own; an empty new wallet needs a sponsor for the first 7702 transaction, or the agent relays it).
- A daily cap needs `periodDuration: 86400`; only a 120-second period was exercised.
