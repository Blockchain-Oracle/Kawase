# Spike 4: on-chain spending limits (ERC-7710 delegation on Arc)

Purpose: prove the kickoff's "limits the agent can't exceed" with the MetaMask Delegation Framework v1.3.0 on Arc. A HybridDeleGator is owned by an ECDSA EOA, the delegation's caveats are built in code, and the Kawase ops DCW redeems it.
Code: `plan/spikes/code/04-delegation/` (`node setup.mjs`, `node fund.mjs`, `node run.mjs`). Raw results: `results.testnet.json`. Keys (testnet only) live in the gitignored `.spike-state.testnet.json`.
Date: 2026-09-30
**Result: testnet PASS (17/17 as expected).** The $1 mainnet run is pending, because Circle LIVE returns 403 until the account is activated.

## Setup
- Packages: `@metamask/smart-accounts-kit@2.0.0` (maps Arc Testnet 5042002), `viem@2.57.1`, `@circle-fin/developer-controlled-wallets@10.8.1`.
- **Owner:** a local EOA standing in for the UCW EOA. UCW `signTypedData` is spike #2; the kit's `signer: { account }` only needs `signTypedData`, so a UCW adapter plugs in at the same place.
- **DeleGator** `0x2264d7B00460f82aD0aB812cdCf0f497588e4B6b`, deployed through SimpleFactory **by the ops DCW** (Circle contract execution): [`0xe6a4…5dd3`](https://explorer.testnet.arc.io/tx/0xe6a44fdfbc6bed5305065d4425eb0dad89ae6e4ca910b09a076d5e64fe6a5dd3). The owner needed no gas.
- **Ops DCW** `0x2d9b5452178316e064d10e1424e8acf65a71b6b9` (wallet set `kawase-testnet`). It was funded with 12 test USDC from the archived Arc Treasury Intelligence wallet ([`0x800b…c151`](https://explorer.testnet.arc.io/tx/0x800b072a922327b99df1bf8eb6e7c782db7cb2e32b97e106a1b922f21ccbc151)), because the Circle faucet API returned `Forbidden`.
- **Caveats** (in order): `ValueLte(0)` (added automatically by the kit's `Erc20PeriodTransfer` scope), `ERC20PeriodTransfer` (0.5 USDC per 90 s), `AllowedTargets=[USDC 0x3600…]`, `AllowedMethods=[transfer]`, `AllowedCalldata` (bytes 4–36 = the pinned recipient), `Timestamp` (expiry).

## Results
| # | Test | Expected | Got | Evidence |
|---|---|---|---|---|
| 1 | ops DCW: 0.2 to the pinned recipient | pass | ✅ | [`0x1e2e…7658`](https://explorer.testnet.arc.io/tx/0x1e2e2d8caaf0a527af192fd89fc470d6e4bcc160feae79fb2de3922daccf7658) |
| 2 | ops DCW: +0.3 (period total = cap) | pass | ✅ | [`0x181f…8a75`](https://explorer.testnet.arc.io/tx/0x181fc8a67c4c7eef29e85ce0cbdb7094d1405a84c1989eac738fa7098eda8a75) |
| 3 | ops DCW: +0.01 over the period cap | fail | ✅ Circle `ESTIMATION_ERROR`, never broadcast | — |
| 4 | ops DCW: wrong recipient | fail | ✅ `ESTIMATION_ERROR` | — |
| 5 | worker: 0.1 to the recipient | pass | ✅ | [`0x8ae8…9aa3`](https://explorer.testnet.arc.io/tx/0x8ae8994549a34b6319f8f49ac5cff770a9d16ffc24b185b62a65aa90d1fe9aa3) |
| 6 | worker: wrong recipient | revert | ✅ `AllowedCalldataEnforcer:invalid-calldata` | [`0x8a81…581c`](https://explorer.testnet.arc.io/tx/0x8a81144a6b1a5dfb154c2de33c8aa1298ab9f96addbfa0f75f9548f19f2e581c) |
| 7 | worker: wrong token (EURC) | revert | ✅ `ERC20PeriodTransferEnforcer:invalid-contract` | [`0x0a98…1cd8`](https://explorer.testnet.arc.io/tx/0x0a98d1eeec9d26b6e33ac2dee6c9f704b4393d99a562e81e3ae56d2a67211cd8) |
| 8 | worker: wrong method (`approve`) | revert | ✅ `…:invalid-method` | [`0xbb58…337d`](https://explorer.testnet.arc.io/tx/0xbb588ba910e6ff523549717b973d6753e6b8df90e740f6283d6269f37eab337d) |
| 9 | worker: native 0.1 USDC (18 dp) to the recipient | revert | ✅ `ValueLteEnforcer:value-too-high` | [`0xe8ec…c36c`](https://explorer.testnet.arc.io/tx/0xe8ec9b3e5be7d662d852262414666db26cf795b23d5e9e65157855a22725c36c) |
| 10 | worker: `value=1` attached to a USDC transfer | revert | ✅ `ValueLteEnforcer:value-too-high` | [`0x5605…02cc`](https://explorer.testnet.arc.io/tx/0x5605135a87c8271f8ea8d80545da4185f5432f4b19160d8c70352038b6b702cc) |
| 11 | worker: expired delegation | revert | ✅ `TimestampEnforcer:expired-delegation` | [`0xdf66…d576`](https://explorer.testnet.arc.io/tx/0xdf66941b01a665a551a54e5ad0c6a3364653872b6a31aaa0e53f7f0d9f9bd576) |
| 12 | leaked worker key: drain the whole balance to the attacker | revert | ✅ `…:transfer-amount-exceeded` | [`0x3321…b1ab`](https://explorer.testnet.arc.io/tx/0x3321c4ba7896eaaae02bbb3c25a12de10a58b1a4809bd7573b1ed0156c6b0ab1) |
| 13 | leaked worker key: over the cap to the pinned recipient | revert | ✅ `…:transfer-amount-exceeded` | [`0xb359…d413`](https://explorer.testnet.arc.io/tx/0xb359ef536d56fc085e2435f559c4e81b2bd39e725169b3a134b37873ade3d413) |
| 14 | attacker redeems the ops delegation | revert | ✅ `InvalidDelegate` (`0xb5863604`) | [`0xcba9…d75c`](https://explorer.testnet.arc.io/tx/0xcba9cc854a605b4e9b1f8d3572a4374f5bace026bea9d61c3f602aa9003fd75c) |
| 15 | ops DCW: next period, full 0.5 again (reset) | pass | ✅ | [`0x623e…cfac`](https://explorer.testnet.arc.io/tx/0x623e7c46f6ccb8a799cced65ac500e52cb9e91fdfc281e20febc3ec2adeecfac) |
| 16 | owner revokes: UserOp → `disableDelegation`, self-bundled `handleOps` | pass | ✅ `disabledDelegations[hash]=true` | [`0xbdc7…9de0`](https://explorer.testnet.arc.io/tx/0xbdc79de0013041e1cb0f8d7f12ae0da9b3b7d6c38bf736a5cf1cadc171d29de0) |
| 17 | ops DCW: redeem after revoke | fail | ✅ `ESTIMATION_ERROR` | — |

Worst case with a leaked worker key: at most the period amount, only to the pinned recipient, only USDC `transfer`, and only until the expiry or a revoke. Tests 6–14 show every other path reverts on-chain.

## Findings (these change the plan)
1. **Revoking cannot be a plain UCW contract call.** `DelegationManager.disableDelegation` requires `msg.sender == delegator`, which is the DeleGator, and the DeleGator's `execute` is EntryPoint-or-self only. What works: the owner signs a **UserOp** (EntryPoint v0.7 `0x0000000071727De22E5E9d8BAf0edAc6f37da032`, which has code on Arc testnet), and Kawase submits `handleOps` itself as the bundler. **No third-party bundler is needed.** ARCHITECTURE.md ("Revoking is `disableDelegation`, sent as a UCW contract-execution challenge") must change to: "UCW signs the UserOp (typed data); ops DCW submits `handleOps`." The same path covers any other owner admin action on the DeleGator.
2. **The DeleGator pays its own UserOp gas in USDC** (the prefund came from its balance, about 0.016 USDC here). Keep a gas float in the allowance account, or pass a paymaster later.
3. **Circle DCW rejects failing redeems before broadcasting** (`ESTIMATION_ERROR`, no gas spent). This is good for users, but the reason string is lost, so the executor should run `eth_call` first to get the enforcer reason for the "why it was blocked" receipt (as `localRedeem` does).
4. **The ops DCW can deploy the DeleGator** through SimpleFactory, so the user's EOA never needs gas. The address is counterfactual (`toMetaMaskSmartAccount` + salt) and can be shown before deployment.
5. The kit's `Erc20PeriodTransfer` scope already adds `ValueLte(0)`, which closes Arc gotcha #6 (native USDC bypassing ERC-20 caps). Our own caveat builder must keep it if we ever stop using the kit's scope.
6. `hashDelegation` is exported from `@metamask/smart-accounts-kit/utils`, not from the package root.
7. The Circle faucet API (`requestTestnetTokens`) returns **403 Forbidden** for this key. Testnet funding comes from faucet.circle.com (manual) or from existing wallets.
8. Verified source on the Arc **testnet** Blockscout: DelegationManager, HybridDeleGator, ERC20PeriodTransferEnforcer and AllowedCalldataEnforcer (solc 0.8.23). The mainnet explorer API returned no data; re-check during the mainnet run.

## Still to do
- **$1 mainnet run** once Circle LIVE is activated (the same script with the mainnet addresses passed manually; `smart-accounts-kit@2.0.0` does not map Arc mainnet).
- Owner = a real **UCW** (spike #2), plus a passkey/P256 owner variant (HybridDeleGator supports it; P256VERIFY is live on Arc).
- Audit scope: not yet checked. Before mainnet, confirm that the MetaMask DF v1.3.0 audit reports cover each enforcer used here.

## Decision
**Architecture B confirmed on testnet**: an ERC-7710 HybridDeleGator allowance account with caveats built in code, redeemed by the ops DCW. Fallback A (DCW allowance + app limits) is not needed unless mainnet fails.
