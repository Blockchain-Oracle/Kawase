# Docs pack: budget lane (delegation caveats, one-shot leaves, kill-switch)

Verified 2026-10-14 against the npm tarballs (node_modules is not installed in this checkout, so I installed the pinned versions in a scratch dir and ran the snippets) and the enforcer sources on GitHub. Anything not run is marked UNVERIFIED.

## 1. Versions
- `@metamask/smart-accounts-kit` 2.0.0 (pinned). It depends on `@metamask/delegation-core` 3.0.0, `delegation-abis` 2.0.0 and `delegation-deployments` **2.1.0** (the lockfile resolves `^2.0.0` to 2.1.0). **Arc mainnet (5042) exists only from deployments 2.1.0** (changelog: "Add chain deployment for Arc Mainnet"); 2.0.0 had testnet only. Keep the lockfile entry.
- Nothing to install. `BalanceChangeType`, `ExecutionMode`, `CaveatType`, `ScopeType`, `createDelegation`, `createExecution`, `ROOT_AUTHORITY` come from the kit root; `createCaveatBuilder`, `hashDelegation`, `toDelegationStruct`, `SIGNABLE_DELEGATION_TYPED_DATA` from `/utils`; `DelegationManager`, `NonceEnforcer`, `DeleGatorCore` from `/contracts`.

## 2. Enforcers on Arc (same on 5042 and 5042002, deployments 2.1.0)
DelegationManager `0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3`; EIP7702StatelessDeleGatorImpl `0x63c0c19a282a1B52b07dD5a65b58948A07DAE32B`.
- AllowedTargets `0x7F20f61b1f09b08D970938F6fa563634d65c4EeB`
- AllowedMethods `0x2c21fD0Cb9DC8445CB3fb0DC5E7Bb0Aca01842B5`
- AllowedCalldata `0xc2b0d624c1c4319760C96503BA27C347F3260f55`
- ERC20BalanceChange `0xcdF6aB796408598Cea671d79506d7D48E97a5437`
- ExactExecution `0x146713078D39eCC1F5338309c28405ccf85Abfbb`; ExactExecutionBatch `0x1e141e455d08721Dd5BCDA1BaA6Ea5633Afd5017`
- ExactCalldata `0x99F2e9bF15ce5eC84685604836F71aB835DBBdED`
- ValueLte `0x92Bf12322527cAA612fd31a0e810472BBB106A8F`
- Timestamp `0x1046bb45C8d673d4ea75321280DB34899413c069`
- LimitedCalls `0x04658B29F6b82ed55274221a06Fc97D318E25416`
- Redeemer `0xE144b0b2618071B4E56f746313528a669c7E65c5`
- Nonce `0xDE4f2FAC4B3D87A1d9953Ca5FC09FCa7F366254f`
- LogicalOrWrapper `0xE1302607a3251AF54c3a6e69318d6aa07F5eB46c`
- ERC20PeriodTransfer `0x474e3Ae7E169e940607cC624Da8A15Eb120139aB`; MultiTokenPeriod `0xFB2f1a9BD76d3701B730E5d69C3219D42D80eBb7`
Read them with `getSmartAccountsEnvironment(chainId).caveatEnforcers.<Name>Enforcer` (already wrapped by `delegationEnvironment()` in `environment.ts`). The report says bytecode was seen live on testnet; mainnet bytecode is UNVERIFIED (no mainnet RPC reached).

## 3. Builders (names for `createCaveatBuilder(env).addCaveat(name, cfg)`; as `{type: CaveatType.X, ...}` in `createDelegation({caveats})`)
| Caveat | Config | Mode limit |
|---|---|---|
| `erc20BalanceChange` | `{tokenAddress, recipient, balance, changeType: BalanceChangeType.Increase \| Decrease}` | default mode only |
| `exactExecution` | `{execution: {target, value, callData}}` | any |
| `exactCalldata` | `{calldata}` | any |
| `allowedTargets` / `allowedMethods` | `{targets}` / `{selectors}` (signature strings OK) | any |
| `valueLte` | `{maxValue: 0n}` | any |
| `timestamp` | `{afterThreshold, beforeThreshold}` (unix seconds, 0 = open) | any |
| `limitedCalls` | `{limit}` | any |
| `redeemer` | `{redeemers: [addr]}` | any |
| `nonce` | `{nonce: Hex}` (padded to 32 bytes; `0x1` works, I printed it) | default mode only |
| LogicalOrWrapper | **no builder in kit 2.0.0** ("Function logicalOrWrapper does not exist"). Use `createLogicalOrWrapperTerms({caveatGroups})` from `@metamask/delegation-core` and build the `{enforcer, terms, args}` by hand | default mode only |

Balance-change semantics (source: ERC20BalanceChangeEnforcer.sol): `beforeHook` locks key `keccak(caller, token, delegationHash)` and caches `balanceOf(recipient)`; `afterHook` reverts `insufficient-balance-increase` unless balance >= cached + amount, or `exceeded-balance-decrease` unless balance >= cached - amount. Terms are 73 bytes. Per-token, per-delegation keys: one Increase on tokenOut and one Decrease on tokenIn in the same delegation do not collide; two caveats on the **same token** in one delegation do (lock revert `enforcer-is-locked`). The natspec warns against tracking the same recipient twice in one chain.

## 4. Execution modes and batching
`ExecutionMode.SingleDefault` (0x00..), `SingleTry`, `BatchDefault` (0x01..), `BatchTry`. `redeemDelegations({delegations: Delegation[][], modes, executions: Execution[][]})` takes parallel arrays; each outer index is one chain and one mode, and in default modes the whole tx reverts if any step fails. Balance-change, Nonce and LogicalOr enforcers carry `onlyDefaultExecutionMode`: use **SingleDefault, one execution per delegation**, and batch by putting several delegations in the outer arrays (this is what `encodeRedeemMany` does). Never use the Try modes on a money path: a failed step is skipped silently. Kit gotcha already hit (batch.ts): a lone execution is encoded in the single layout, so `BatchDefault` with one execution reverts `DecodingError()`.

## 5. One-shot swap leaf (new file `action-grants.ts`)
Two delegations from the wallet, redeemed in one tx by ops. Each gets a fresh random salt: LimitedCalls and the balance cache are keyed by the delegation hash, so identical delegations (salt 0x, kit issue #207) share counters.
```ts
import { BalanceChangeType, ExecutionMode, ROOT_AUTHORITY, createExecution, type Delegation } from "@metamask/smart-accounts-kit";
import { createCaveatBuilder } from "@metamask/smart-accounts-kit/utils";
import { encodeFunctionData, erc20Abi, toHex, type Address, type Hex } from "viem";
import { delegationEnvironment } from "./environment";
import { encodeRedeemMany } from "./redeem";

const TTL = 120, ONCE = 1, NO_VALUE = 0n, UNSIGNED: Hex = "0x";
export type SwapLeafTerms = { network: NetworkContext; wallet: Address; ops: Address; router: Address; tokenIn: Address; tokenOut: Address;
  amountIn: bigint; minOut: bigint; routerCalldata: Hex; nonce: bigint; now: number; salts: [Hex, Hex] };

export function buildSwapLeaves(t: SwapLeafTerms) {
  const env = delegationEnvironment(t.network);
  const expires = t.now + TTL;
  const approve = createExecution({ target: t.tokenIn, value: NO_VALUE,
    callData: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [t.router, t.amountIn] }) });
  const swap = createExecution({ target: t.router, value: NO_VALUE, callData: t.routerCalldata });
  const common = (b: ReturnType<typeof createCaveatBuilder>) => b
    .addCaveat("timestamp", { afterThreshold: 0, beforeThreshold: expires })
    .addCaveat("limitedCalls", { limit: ONCE })
    .addCaveat("redeemer", { redeemers: [t.ops] })
    .addCaveat("nonce", { nonce: toHex(t.nonce, { size: 32 }) }); // kill-switch, section 7
  const make = (caveats: ReturnType<ReturnType<typeof createCaveatBuilder>["build"]>, salt: Hex): Delegation =>
    ({ delegate: t.ops, delegator: t.wallet, authority: ROOT_AUTHORITY as Hex, caveats, salt, signature: UNSIGNED });
  const approveLeaf = make(common(createCaveatBuilder(env).addCaveat("exactExecution", { execution: approve })).build(), t.salts[0]);
  const swapLeaf = make(common(createCaveatBuilder(env)
      .addCaveat("allowedTargets", { targets: [t.router] })
      .addCaveat("valueLte", { maxValue: NO_VALUE })
      .addCaveat("erc20BalanceChange", { tokenAddress: t.tokenOut, recipient: t.wallet, balance: t.minOut, changeType: BalanceChangeType.Increase })
      .addCaveat("erc20BalanceChange", { tokenAddress: t.tokenIn, recipient: t.wallet, balance: t.amountIn, changeType: BalanceChangeType.Decrease })).build(), t.salts[1]);
  return { approveLeaf, swapLeaf, approve, swap };
}
// Sign each with grantTypedData(network, leaf) (grants.ts), then ops sends:
//   encodeRedeemMany(network, [{ grant: signedApprove, target: approve.target, callData: approve.callData },
//                              { grant: signedSwap, target: swap.target, callData: swap.callData }])
```
Ran this against kit 2.0.0: 8 caveats built, terms lengths as expected, `redeemDelegations` encodes with selector `0xcef6d209`. Not run end to end on chain: UNVERIFIED. To pin calldata instead of a target allowlist, add `exactCalldata` only if the venue calldata is final when signing (it is for a one-shot, but then the quote cannot change).
Notes: the approve leaf is `exactExecution` (target, value, calldata all fixed, pinned spender and amount). The swap leaf cannot pin the recipient, but the Increase check on the wallet's own tokenOut balance makes a redirect revert. `minOut` must come from a quote the phone fetched and slippage-checked. Add a `sqrtPriceLimit`-style price floor only where the venue supports it (UNVERIFIED).
Arc detail: USDC at `0x3600…0000` is an ERC-20 view (6 decimals) of native USDC (18). The enforcer reads `balanceOf`, so amounts are 6-decimal base units. Gas is paid by ops, not the wallet, so it does not touch the Decrease check; behaviour with sub-6-decimal dust is UNVERIFIED.

## 6. Per-recipient send grant
`grants.ts` already has it: `buildAutomationGrant` (period cap + `AllowedCalldata` at offset 4 = recipient word). Make one per saved contact and add Nonce. Edit `build()` to append, which I ran in `createDelegation`:
```ts
{ type: CaveatType.Nonce, nonce: toHex(terms.nonce, { size: 32 }) }
```
Result was 8 caveats (period, targets, methods, calldata, timestamp, redeemer, nonce plus the scope's valueLte). The any-recipient `buildAllowanceGrant` should be retired for the away pack. Optional: several recipients under one delegation via LogicalOrWrapper, one group per recipient (`caveatGroups: [[AllowedCalldata alice], [AllowedCalldata bob]]`, `args = {groupIndex, caveatArgs: ["0x", ...]}`). Caveat from the source: **the redeemer picks the group**, so every group must be fully safe on its own; and the period/Redeemer/Timestamp caveats must be inside each group or outside the wrapper (not both). Keep Nonce **outside** the wrapper: NonceEnforcer reads `currentNonce[msg.sender][delegator]` and `msg.sender` must be the DelegationManager (my inference from the source; inside the wrapper msg.sender would be the wrapper; UNVERIFIED on chain). Prefer separate grants; the wrapper is untested here.

## 7. Nonce kill-switch
Every grant and leaf carries `nonce = currentNonce` (read once per grant batch):
```ts
import { NonceEnforcer } from "@metamask/smart-accounts-kit/contracts";
const nonce = await NonceEnforcer.read.currentNonce({ client, contractAddress: env.caveatEnforcers.NonceEnforcer, delegationManager: env.DelegationManager, delegator: wallet });
// revoke everything: the WALLET must be msg.sender (incrementNonce keys on the caller)
const call = { to: env.caveatEnforcers.NonceEnforcer, data: NonceEnforcer.encode.incrementNonce(env.DelegationManager) };
```
Send it as the wallet: `selfBatchCall(wallet, [call])` (batch.ts, single mode) or through `buildRelayedBatch` so the relayer pays gas (the redeem executes from the wallet, so the caller is still the wallet). After it mines, every delegation signed with the old nonce fails `NonceEnforcer:invalid-nonce` at redeem time. Terms are exactly 32 bytes. Anyone can call `incrementNonce` but it only moves their own counter. `disableDelegation` (`encodeRevoke`) still works per grant. Gap in this repo: `checkRevoke`/`checkDisables` in `packages/wallet/src/checks.ts` only accept DelegationManager calls, so the phone will refuse this tx until `NonceEnforcer.incrementNonce(delegationManager)` is allowed there with zero value.

## 8. EIP-7702 stateless delegator
The wallet is an EOA whose code is the EIP7702StatelessDeleGator (set by the 7702 authorization in `setup.ts`). Delegations are signed by the EOA key over the DelegationManager EIP-712 domain (`name "DelegationManager"`, `version "1"`, chainId, verifyingContract); `grantTypedData` does this. A redeem makes the manager call the wallet's `executeFromExecutor`, so the **wallet is `msg.sender` to the target**: tokens leave the wallet, `Redeemer` restricts the redeemer, and enforcers see `delegator = wallet`.

## 9. Phone-side checks (extend `checks.ts`)
`decodeCaveat` throws on unknown enforcers. Add decoders for ERC20BalanceChange (73 bytes: byte0 decrease flag, token, recipient, uint256) and Nonce (32 bytes), then add a `checkLeaf` that requires: both leaves from this wallet, delegate = ops, Redeemer = ops, Timestamp before <= now+TTL+slack, LimitedCalls 1, Increase on tokenOut for the wallet >= phone's own minOut, Decrease on tokenIn <= amountIn, approve `exactExecution` spender = allowlisted router. `checkGrant` currently refuses exactExecution by design; keep that and add the leaf path separately.

## 10. Gotchas
- Default-mode-only enforcers revert in batch/try modes (source, above).
- Salt: pass a random 32-byte salt every time ([kit issue #207](https://github.com/MetaMask/smart-accounts-kit/issues/207)); the kit does not.
- Kit allows contradictory caveats ([#250](https://github.com/MetaMask/smart-accounts-kit/issues/250)): test every leaf with `simulateCall` before signing.
- Terms are fixed at signing, so standing grants cannot carry per-trade `minOut`: balance-change is for one-shot leaves.
- Timestamp compares block time; keep TTL >= 60 s for Arc finality/clock skew. Arc block time not checked: UNVERIFIED.
- MultiTokenPeriod/ERC20PeriodTransfer only count `transfer` calls, not `transferFrom` pulls by a router.

## 11. Sources
- https://docs.metamask.io/smart-accounts-kit/reference/delegation/caveats , /reference/delegation , /guides/delegation/ (Context7 `/websites/metamask_io_smart-accounts-kit`)
- Enforcer sources, Context7 `/metamask/delegation-framework`: https://github.com/MetaMask/delegation-framework/tree/main/src/enforcers (ERC20BalanceChange, Nonce, LogicalOrWrapper read 2026-10-14)
- npm: `@metamask/smart-accounts-kit@2.0.0`, `@metamask/delegation-deployments@2.1.0` (CHANGELOG), `@metamask/delegation-core@3.0.0`, `@metamask/delegation-abis@2.0.0`
- Repo: `packages/integrations/delegation/src/{grants,redeem,bridge-grants,protect,batch,relayed-batch}.ts`, `packages/wallet/src/checks.ts`, `plan/research/2026-10-14/02-autonomy.md`
