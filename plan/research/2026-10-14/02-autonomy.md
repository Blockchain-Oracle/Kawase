# 02 — Letting the agent act without asking every time (2026-10-14)

Labels: **VERIFIED** means I saw it in code, current docs or a live response. **REPORTED** means a secondary source or my own recall, not re-checked today. **IDEA** means my own proposal.

## 1. Today, from the code

**Where Kawase asks the owner.** All prompts go through `confirmWithBiometrics` (`apps/mobile/src/wallet/biometric.ts:35-42`). On the web, the same call opens a fresh email-code sheet instead (`biometric.web.ts:1-3, 13-16`). VERIFIED. It is called from:
- **Swap, bridge, move, earn, lend and margin**, all through one hook. Every approval runs Face ID before the wallet signs (`apps/mobile/src/intents/use-wallet-intent.ts:164`). Every one of these API services always answers `status: "sign"` with `route: "wallet_signature"` (`apps/api/src/swap/service.ts:512-523`, `earn/service.ts:455-466`, `bridge/service.ts:455-466`, `crosschain/service.ts:882-895`, `margin/service.ts:900-911`, `lend/service.ts:610-620`). The agent prompt says so outright: "the daily allowance never covers swaps" (`packages/agent/src/prompt.ts:32`). VERIFIED.
- **Send** above the allowance, or to a new or look-alike address (`send/use-send.ts:145`). VERIFIED.
- **Setup and changes**: accepting the allowance (`wallet/use-wallet-setup.ts:146`); automation on, cancel and edit (`automations/use-automation.ts:87,119,155`); margin protection grant and revoke (`margin/use-protection.ts:50,81`); safety changes and **revokes** (`safety/use-safety.ts:75,100`); x402 agent-wallet first top-up and loosening (`marketplace/use-agent-wallet.ts:70,122`); withdraw (`withdraw/use-withdraw-run.ts:182`); token rules, export, delete account, payouts and device sign-out. VERIFIED.

**What runs with no prompt.**
- A USDC or EURC send inside the daily allowance to a recipient named in the current message. The ops wallet redeems `transfer` (`apps/api/src/send/service.ts:490-547`, `prompt.ts:25,29`).
- Automation runs under their pinned grants (`packages/integrations/delegation/src/grants.ts:75-78`).
- Auto-save and rule bridges to the owner's own address, through CCTP only (`bridge-grants.ts`).
- Margin protective closes (`protect.ts`).
- x402 buys inside the agent-wallet budget, which defaults to $1/day and $0.05 per call on testnet, $5/day and $0.50 per call on mainnet, with `askFirst` off (`packages/config/src/marketplace.ts:22-29`, `apps/api/src/marketplace/service.ts:187,283`).

All VERIFIED.

**Why the owner sees "input your password after anything."** The things people actually do (swap, bridge, earn, trade) never run on the allowance, because the allowance only covers `transfer` of one token (`grants.ts:37-68`). So every action is Face ID plus a signature. On the web, every action is a new email code. Turning protection off or revoking also asks, though making things safer should never need a check. VERIFIED.

**Two facts that change the design.**
1. **The Face ID is a check Kawase added, not something the chain requires.** The Turnkey session key signs silently (`use-wallet-signer.native.ts:1-2`), and Face ID is a `LocalAuthentication` gate placed in front of it (`biometric.ts:1-5`). Removing it inside a budget is a client change. VERIFIED.
2. **The everyday allowance can pay anyone.** It has no recipient pin (`grants.ts:70-73`). The ops wallet that redeems it is a Circle developer-controlled wallet (`send/service.ts:527`, `marketplace/agent-wallets.ts:47-50`). A leaked Circle API key plus entity secret could therefore send up to the daily allowance to an attacker, every day, until the grant is revoked. `authority.ts:39` already shows this to the owner as the "worst case". VERIFIED in code; the attack itself is an IDEA (my inference from that code). It breaks the "a leaked key can never steal" rule, and this design fixes it.

## 2. Options

### (a) Widen the EIP-7710/7702 delegations (Kawase uses `@metamask/smart-accounts-kit` 2.0.0, `pnpm-workspace.yaml:27`)

- **Enforcers on Arc.** Delegation-deployments 1.3.0 lists these for Arc testnet (5042002) and mainnet (5042) at the same `DelegationManager` Kawase verified: `0xdb9B…7dB3` (`packages/networks/src/addresses.ts:28`).
  - Listed: ERC20BalanceChange, NativeBalanceChange, MultiTokenPeriod, LogicalOrWrapper, Nonce, ExactExecution(Batch), ExactCalldata(Batch), ArgsEqualityCheck, SpecificActionERC20TransferBatch, ERC20Streaming and the rest. VERIFIED from the npm tarball.
  - Bytecode for ERC20BalanceChange `0xcdF6…5437` and Nonce `0xDE4f…254f` is live on testnet. VERIFIED with `eth_getCode` on rpc.testnet.arc.network.
  - Mainnet presence is REPORTED only (it is in the package, but I could not reach a mainnet RPC).
  - Kit 2.0.0 includes `erc20BalanceChange` and `BalanceChangeType.Increase/Decrease` builders. VERIFIED.
- **How the balance-change check works** ([source](https://github.com/MetaMask/delegation-framework/blob/main/src/enforcers/ERC20BalanceChangeEnforcer.sol), VERIFIED):
  - `beforeHook` caches the recipient's balance of the token.
  - `afterHook` checks either "increased by at least X" or "decreased by at most X".
  - It works in default (single-call) mode only.
  - Its own warning: don't track the same recipient and token twice in one delegation chain.
- **This answers "how do we guarantee the output comes back".** If the swap delegation says "your EURC must rise by at least `minOut`" and "your USDC may fall by at most `amountIn`", then any venue calldata that sends the output elsewhere reverts. That holds for KyberSwap, LI.FI and App Kit alike, with no per-venue calldata parsing. IDEA, built on the VERIFIED enforcer.
- **The catch.** Terms are fixed when the delegation is signed. A standing weekly grant can't know each trade's `minOut`. So the check works for **one-shot delegations signed per action** and is weak for standing grants. MultiTokenPeriod and ERC20PeriodTransfer only count `transfer` calls, so they don't cap a router pulling tokens through `transferFrom`. REPORTED, from the enforcer docs' wording.
- **Pinning calldata per venue** works only where the recipient sits at a fixed offset:
  - Already done: CCTP `mintRecipient` (`bridge-grants.ts:84-93`) and Uniswap v3 `exactInputSingle` (`protect.ts:110-111`).
  - Would also work: ERC-4626 `deposit(assets, receiver)` and `withdraw(assets, receiver, owner)` for Morpho vaults (REPORTED that they are ERC-4626).
  - Can't be done: KyberSwap's recipient sits in a dynamic struct (`protect.ts:12-13`), and Relay and deBridge keep the recipient off-chain in the order.
  - Even with a pinned recipient, `minOut` can't be pinned. A leaked key could sandwich trades inside the pinned pool, up to the cap. The code already says so (`protect.ts:14-18`).
- **A Kawase executor contract** that checks balance changes is not needed: the deployed balance-change enforcer already is that post-condition, and it has been audited. A custom executor that makes arbitrary venue calls while users hold allowances to it is the LI.FI-style bug class. IDEA: don't build one.

### (b) ERC-7715 / "advanced permissions"
- The docs list `erc20-token-allowance`, `-periodic` and `-stream` only: token transfers, no swaps or arbitrary calls ([docs](https://docs.metamask.io/smart-accounts-kit/guides/advanced-permissions/use-permissions/erc20-token/), VERIFIED).
- It is a request to an outside wallet (`window.ethereum`). Kawase is the wallet, so 7715 adds nothing except a standard JSON shape. Skip.

### (c) Vendor policy engines
- **Privy policies** ([docs](https://docs.privy.io/controls/policies/overview), VERIFIED): contract and recipient allowlists, ABI-decoded calldata conditions and spend aggregations over time, enforced in a TEE. Simulation runs outside the enclave and "is not policy enforcement". It can't guarantee swap output.
- **Turnkey policies** ([docs](https://docs.turnkey.com/concepts/policies/overview), VERIFIED): allow/deny with consensus and condition expressions such as `eth.tx.to`. ABI-parsed calldata is REPORTED. Again, no output check. The page has an "Agent Instructions" block; I noted it and did not follow it.
- **Dynamic delegated access** and **CDP Spend Permissions**: REPORTED. Delegated access is server signing through MPC shares; Spend Permissions is Base Account's SpendPermissionManager, with no Arc support known.
- **Verdict:** all of them check the shape of a transaction off-chain, add a vendor to the money path, and charge per signature or per user. The owner is already leaving Turnkey over the $0.10/signature fee after 25 free a month (REPORTED, 00-context). On-chain caveats cost nothing and are stronger. Skip.

### (d) Silent device signing vs real background work
- **App open:** the phone holds the only key that can say yes to a specific trade. A leaked server key gets nothing, and the LLM never holds a key. This is the strong mode.
- **App closed** (automations, overnight rules): only standing grants are possible, so the background set must be limited to actions whose recipient is pinned to the owner.

## 3. Recommendation: "Weekly budget" (IDEA, built on VERIFIED parts)

**The owner's line:** *"One Face ID sets your weekly budget. Inside it, Kawase swaps, bridges, earns and buys services for you. You only see Face ID above the budget, for a new kind of action, or to pay someone new."*

**What the owner approves once (one Face ID, several signatures):**
1. **A signed budget**, as an EIP-712 message from the wallet:
   - $X/week (default $200 mainnet; testnet larger);
   - per-action cap $Y (default $50);
   - categories on: swap, bridge, earn, x402; perps opens off by default;
   - the venue allowlist.
   The server can't raise it, because the phone checks the signature.
2. **An "away pack" of standing grants**, all with Redeemer = ops, a 7-day Timestamp, and a shared **Nonce** caveat so one transaction revokes all of them:
   - **Sends:** replace the any-recipient allowance with per-contact grants, as automations already do. Alternatively, LogicalOrWrapper over several recipient pins (VERIFIED on Arc, but untested).
   - **Bridges:** the existing CCTP-to-self grants.
   - **Earn:** vault `deposit` and `withdraw` with receiver and owner pinned to the wallet, plus an exact `approve` to the vault.
   - **Swap:** Uniswap v3 `exactInputSingle` with tokenIn, tokenOut, fee and recipient pinned, for allowlisted pairs (USDC↔EURC first), plus erc20BalanceChange Decrease ≤ $Y on tokenIn, plus LimitedCalls N. On-chain worst case: N × $Y of sandwich loss per week, never a redirect.
   - **x402:** the existing agent-wallet top-up grant.

**In-app actions (the agent working while you watch):**
- Per action, the phone signs **one-shot delegations** silently, without Face ID:
  - an `approve(router, amountIn)` as ExactExecution;
  - the venue call: AllowedTargets [router], ValueLte 0, BalanceChange Decrease tokenIn ≤ amountIn, Increase tokenOut ≥ minOut (or vault shares ≥ minShares for earn), Timestamp now+120 s, LimitedCalls 1, Redeemer ops.
- The ops wallet redeems both in one `redeemDelegations` (reusing `encodeRedeemMany`, `redeem.ts:39-47`), so the user pays no gas.
- Before signing, the phone's **budget guard** checks:
  - spent this week + amount ≤ budget, kept in a phone-local ledger plus chain reads;
  - the venue is on the allowlist and tokenOut is not flagged by token safety;
  - `minOut` is within the slippage setting of a quote the **phone fetches itself** (KyberSwap's quote API, keyless);
  - every caveat it decodes matches, extending `packages/wallet/src/checks.ts`.
- **Cross-chain** (Across, Relay, LI.FI, deBridge): the destination can't be checked on Arc. The phone checks the provider's quote/order recipient directly with the provider before signing. Background stays CCTP-only.

**On-chain vs off-chain:**

| Rule | Where it is enforced |
|---|---|
| Output to you, max spend per action, single use, 2-min life, only ops redeems, pinned recipients, 7-day expiry, background caps (N × $Y) | On-chain caveats |
| Weekly total in app, venue allowlist, price sanity, "new kind of action" | On the phone (the server can't bypass them) |
| Pause-all, x402 per-call caps, LLM taint rule (`prompt.ts:29`) | Server |

**What still needs a prompt** (Face ID; on the web, a passkey or email code):
- above the weekly budget or the per-action cap;
- the first use of a category or venue ("new kind of action");
- a new person, or a changed contact address;
- raising any limit;
- opening perps (until Day 3);
- withdrawals to exchanges, export, delete account.

**Never prompt for:** revoking, pausing or lowering limits. These are silent session-key signatures.

**Revocation:**
- "Stop agent" pauses instantly off-chain.
- One silent self-transaction increments the Nonce caveat's nonce, which kills every grant carrying it (Nonce enforcer, VERIFIED on Arc testnet).
- Grants expire weekly anyway; renewing them is the weekly Face ID.

**What the user sees:**
- **Budget ring:** "$34 of $200 this week".
- **Agent feed** (Mitoshi `DecisionTimeline` pattern, per 00-context): each row shows the venue logo, what went in and out, an "inside budget · no Face ID" chip and the status.
- **Receipt:** the transaction hash plus the rule that guarded it, e.g. "Output had to land in your wallet: at least 9.95 EURC". Also "Swap back" where it applies.
- **Weekly push summary.**

**Build steps (3 days):**
- **Day 1**
  - `packages/integrations/delegation/src/action-grants.ts` (new): swap and earn one-shot leaves with balance-change caveats.
  - Swap and earn services gain `status: "sign_leaf"`, and `/signature` gains `kind: "leaf"` that redeems through ops (`apps/api/src/swap/service.ts`, `earn/service.ts`).
  - `apps/mobile/src/budget/guard.ts` (new).
  - In `use-wallet-intent.ts:164` and `use-send.ts:145`, ask the guard first and skip `confirmWithBiometrics` when it says silent.
- **Day 2**
  - Budget card and screen, where one Face ID signs the budget and the away pack.
  - `grants.ts`: per-contact send grants, plus Nonce on all grants.
  - Vault grants.
  - Revoke and pause without a prompt (`safety/use-safety.ts:100`).
  - The web uses the same guard, so email codes disappear inside the budget.
- **Day 3**
  - Feed, receipts and the budget ring.
  - The agent prompt: replace "every swap is confirmed on the card" (`prompt.ts:32`) with the budget rules.
  - Margin opens as a leaf: Spoke target, onBehalfOf self, Decrease USDC ≤ margin.
- **Can wait**
  - A device-held session key: one Turnkey signature per app session, with free local leaf signatures after that.
  - Background swaps beyond USDC/EURC.
  - A custom oracle-price enforcer for background swaps.
  - Pinning Uniswap's `sqrtPriceLimitX96` as a price floor on stable pairs. I believe it stops the swap at a price limit; REPORTED/IDEA, not checked.

**Contracts:** none needed. If the oracle enforcer is built later, deployment is about 300k gas × Arc's 20 gwei-in-USDC floor ≈ $0.006, well under $0.10 even under load ([Arc gas docs](https://docs.arc.network/arc/references/gas-and-fees), REPORTED). Mainnet floor figures conflict across Arc pages.

**Costs:**
- Enforcers and DelegationManager are free; only gas, paid by ops in USDC (about $0.01 per transaction per [Arc docs](https://docs.arc.io/arc/references/gas-and-fees), REPORTED).
- Each silent leaf is still a Turnkey signature: two per swap, which is $0.20 after the 25 free a month. This falls away if Report 1's Turnkey replacement, or the device session key, lands.

**Risks:**
1. **Sandwich and price loss.** Possible in background swaps within N × $Y. Shown as the "worst case" on the budget card.
2. **The balance-change enforcer** is labelled "use at your own risk" and works in single-call mode only. Test leaves on testnet first: success, redirect reverts, low output reverts.
3. **An unlocked phone** with the app open can spend inside the budget. Mitigation: an optional app lock after 15 minutes idle.
4. **Cross-chain** non-CCTP routes rely on the phone checking the provider's order. Keep them in-app only.
5. **The Circle ops key and x402 agent wallet** are server-held. A leak can spend the agent-wallet float (≤ $5/day mainnet), which is a payment the owner budgeted, not wallet funds.
6. **Fixing the any-recipient allowance (Day 2)** is required before claiming "a leaked key can't steal".
