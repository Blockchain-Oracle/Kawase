# Delegated authority for the agent: session keys, ERC-7710/7715, smart sessions, spending limits

Purpose: which mechanisms can let an agent (or a background automation) spend from a user's wallet **within limits the chain enforces**, and which of them actually have contracts on Arc mainnet (5042) and Arc testnet (5042002) today.

Sources:
- Live `eth_getCode` / `eth_call` against `https://rpc.mainnet.arc.io` and `https://rpc.testnet.arc.io`, 2026-09-29: `.firecrawl/product/03-wallets/getcode-2026-09-29.tsv`, `getcode-policies-2026-09-29.tsv`, `getcode-biconomy-2026-09-29.tsv`, `getcode-extra-2026-09-29.txt`, `codehash-compare.tsv`, `p256-precompile-check.txt`
- ERC texts from `github.com/ethereum/ERCs` (saved as `.firecrawl/product/03-wallets/erc-7715.md`, `erc-7710.md`, `erc-7579.md`, `erc-6900.md`); EIP-7702 and EIP-7951 headers from `github.com/ethereum/EIPs`
- MetaMask Delegation Framework: `github.com/MetaMask/delegation-framework` `documents/Deployments.md` (v1.3.0, saved `mm-delegation-deployments.md`), `documents/HybridDeleGator.md`, `src/enforcers/ERC20PeriodTransferEnforcer.sol` (saved); npm `@metamask/delegation-deployments@2.0.0` (`dist/index.mjs:145,233`); https://docs.metamask.io/smart-accounts-kit/get-started/supported-networks/ (saved `mm-smart-accounts-networks.html`)
- Rhinestone: npm `@rhinestone/module-sdk@0.4.0` `constants.ts`
- ZeroDev: npm `@zerodev/sdk@5.5.10` `_esm/constants.js`; policy addresses from `@zerodev/permissions@5.6.3` as recorded in `/Users/abu/dev/hackathon/arc-agent/docs/raw/arc-wallet-policy-live-checks-2026-07-29.md`
- Biconomy: npm `@biconomy/abstractjs@2.0.2` `_esm/constants/index.js`
- Coinbase: `github.com/coinbase/spend-permissions` README
- Circle: `circle-wallet-options.md` (this folder), `context/02-circle-agent-stack/guardrails-and-policies.md`
- Lessons (what failed, not a baseline): `context/07-prior-work/arc-agent-lessons.md` §D

Verified: 2026-09-29

---

## 0. The one rule that decides everything

**Whoever holds an unrestricted signer for the account can bypass every policy.** An agent or an automation worker must hold *only* a scoped credential (a session key, a delegation, or a policy-bound server key). If the same backend also holds the root key, limits are only app logic. [VERIFIED as behaviour on Arc testnet in July 2026: the owner key executed the same transfer after the session was revoked, `arc-agent/docs/raw/arc-wallet-policy-live-checks-2026-07-29.md` "Revocation And Owner Sovereignty"; the general principle is INFERENCE.]

Three enforcement layers exist. They are not equivalent:

| Layer | Who enforces | Survives a compromised app server? | Examples |
|---|---|---|---|
| Onchain (account module / delegation caveat) | Arc validators, via the smart account or DelegationManager | **Yes**, if the server holds only the scoped key | MetaMask enforcers, ZeroDev policies, Rhinestone Smart Sessions policies, Circle Address Book |
| Provider-side policy engine | The key custodian (MPC/TEE) refuses to sign | Yes against the app server, **no** against the provider | Circle Agent Wallet limits (mainnet only), Privy/Turnkey/CDP policy engines (see `third-party-wallet-infra.md`) |
| App logic | Your own code before calling a signer | **No** | Balance floor, pause, "confirm above $X" |

## 1. Standards status

| Standard | What it does | Status | Source |
|---|---|---|---|
| ERC-7710 Smart Contract Delegation | A delegator account lets a delegate redeem a signed delegation through a `DelegationManager` (`redeemDelegations`) | **Draft**, requires 1271, 7579 | `erc-7710.md` header [VERIFIED] |
| ERC-7715 Request Permissions from Wallets (`wallet_grantPermissions`, now also `wallet_getSupportedExecutionPermissions`) | A dapp asks the wallet for e.g. `native-token-allowance` / `erc20-token-allowance` with an `expiry` rule; the response is redeemable via ERC-7710 | **Draft**, requires 4337, 7710 | `erc-7715.md` header and l.211-252 [VERIFIED] |
| ERC-7579 Minimal Modular Smart Accounts | Module interface (validators, executors, hooks) used by Kernel, Nexus, Safe7579; Smart Sessions is a 7579 validator | **Draft** | `erc-7579.md` [VERIFIED] |
| ERC-6900 Modular Smart Contract Accounts | Plugin standard used by Circle MSCA and Alchemy Modular Account | **Draft** | `erc-6900.md` [VERIFIED] |
| EIP-7702 Set Code for EOAs | An EOA delegates its code to a smart-account implementation | **Final**; Arc docs: "EIP-7702 set-code transactions work on Arc" | EIPs repo header; `docs.arc.io/integrate/relayers-and-paymasters` (`.firecrawl/docs/arc-llms-full.txt:~39925`) [VERIFIED] |
| EIP-7951 secp256r1 precompile (P256VERIFY at `0x100`) | Cheap passkey / Secure Enclave signature checks onchain | **Final**; **works on Arc mainnet and testnet** (valid sig → `…01`, tampered → `0x`) | `p256-precompile-check.txt` [VERIFIED] |

Important: ERC-7715 is a *wallet RPC*. It only helps if the user's wallet implements it. MetaMask's Advanced Permissions (its ERC-7715 implementation) **does not list Arc** (testnet or mainnet) in its support table; MetaMask Smart Accounts v2.0.0 lists **Arc Testnet only** ("Arc Testnet | ❌ | ❌ | ❌ | ✅" for v1.5.0/1.6.0/1.7.0/2.0.0) [VERIFIED, `mm-smart-accounts-networks.html`]. So for an app that embeds its own wallet, you call the delegation framework directly; you do not depend on `wallet_grantPermissions`. [INFERENCE]

Correction of an earlier lesson: arc-agent concluded "RIP-7212 has no code on Arc, so a passkey cannot sign" (`arc-agent-lessons.md` #9). That test used `eth_getCode`, which is always empty for precompiles. A real `eth_call` shows P256VERIFY works on both networks. **Passkey-signed smart accounts are viable on Arc.** [VERIFIED]

## 2. What is deployed on Arc (bytecode, 2026-09-29)

Code size in bytes. "=Base" means the code fingerprint on Arc mainnet, Arc testnet and Base mainnet is identical (`codehash-compare.tsv`); a difference on contracts that embed their own address/chain id in immutables (DelegationManager, DeleGator implementations, Kernel implementations, EntryPoint v0.8/v0.9) is expected and not evidence of tampering [INFERENCE — not proven; verify via explorer "verified source" before mainnet use].

### 2a. MetaMask Delegation Framework v1.3.0 (ERC-7710) — **deployed on both**

| Contract | Address | Mainnet | Testnet | =Base |
|---|---|---|---|---|
| DelegationManager | `0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3` | 11,503 | 11,503 | differs (immutables) |
| HybridDeleGator impl (EOA **and P256/WebAuthn** signers) | `0x48dBe696A4D990079e039489bA2053B36E8FFEC4` | 20,203 | 20,203 | differs (immutables) |
| EIP7702StatelessDeleGator impl | `0x63c0c19a282a1B52b07dD5a65b58948A07DAE32B` | 11,185 | 11,185 | differs (immutables) |
| SimpleFactory | `0x69Aa2f9fe1572F1B640E1bbc512f5c3a734fc77c` | 751 | 751 | yes |
| ERC20PeriodTransferEnforcer | `0x474e3Ae7E169e940607cC624Da8A15Eb120139aB` | 3,346 | 3,346 | yes |
| ERC20TransferAmountEnforcer | `0xf100b0819427117EcF76Ed94B358B1A5b5C6D2Fc` | 2,078 | 2,078 | yes |
| AllowedTargetsEnforcer | `0x7F20f61b1f09b08D970938F6fa563634d65c4EeB` | 1,846 | 1,846 | yes |
| AllowedMethodsEnforcer | `0x2c21fD0Cb9DC8445CB3fb0DC5E7Bb0Aca01842B5` | 2,044 | 2,044 | yes |
| AllowedCalldataEnforcer (e.g. pin recipient) | `0xc2b0d624c1c4319760C96503BA27C347F3260f55` | 1,756 | 1,756 | yes |
| RedeemerEnforcer (only the agent key can redeem) | `0xE144b0b2618071B4E56f746313528a669c7E65c5` | 1,611 | 1,611 | yes |
| TimestampEnforcer | `0x1046bb45C8d673d4ea75321280DB34899413c069` | 1,255 | 1,255 | yes |
| LimitedCallsEnforcer | `0x04658B29F6b82ed55274221a06Fc97D318E25416` | 1,257 | 1,257 | yes |
| ValueLteEnforcer | `0x92Bf12322527cAA612fd31a0e810472BBB106A8F` | 1,272 | 1,272 | yes |
| NativeTokenPeriodTransferEnforcer | `0x9BC0FAf4Aca5AE429F4c06aEEaC517520CB16BD9` | 2,903 | 2,903 | yes |

The SDK package maps only **Arc Testnet** (`arcTestnet: 5042002` → `DEPLOYMENTS_1_3_0`, `@metamask/delegation-deployments@2.0.0 dist/index.mjs:145,233`). The same addresses have code on Arc mainnet, but MetaMask does not list mainnet [VERIFIED]. A PR "feat: add arc mainnet" was merged 2026-09-28 in MetaMask/smart-accounts-kit#304, but the latest published `@metamask/smart-accounts-kit` is 2.0.0 (2026-08-13) (`third-party-wallet-infra.md` §MetaMask) [VERIFIED]. Until a release ships, mainnet use means passing the addresses manually [INFERENCE].

Why it fits this product [INFERENCE from the contract docs]:
- `ERC20PeriodTransferEnforcer`: "a user may transfer up to a fixed amount of tokens (the period amount) during a given time period. The transferable amount resets at the beginning of each period" — exactly "$10 every Tuesday" or "$200/day". It only accepts `IERC20.transfer(address,uint256)` (`mm-ERC20PeriodTransferEnforcer.sol:188`), which matches Arc's recommendation to pay through the USDC ERC-20 view `0x3600…0000`.
- HybridDeleGator accepts "NIST P256 elliptic curve signatures" incl. WebAuthn, and its verifier "will forward verification calls to a precompiled version … if EIP7212 is included" (`documents/HybridDeleGator.md`). With P256VERIFY live on Arc, a phone passkey or Secure Enclave key can own the account.
- ERC-7715 text says the permission is redeemable "using any account type (EOA or contract) to form a transaction or UserOp using whatever payment or relay infrastructure they prefer" (`erc-7715.md:309`). So the agent can redeem with a plain EOA transaction paying gas in USDC — **no bundler required** for the agent's spends [INFERENCE from the spec; not yet run on Arc].

### 2b. ZeroDev Kernel v3 + permission policies — **deployed on both**

| Contract | Address | Mainnet | Testnet |
|---|---|---|---|
| Kernel v3.1 impl / factory | `0xBAC849bB641841b44E965fB01A4Bf5F074f84b4D` / `0xaac5D4240AF87249B3f71BC8E4A2cae074A3E419` | 22,784 / 989 | 22,784 / 989 |
| Kernel v3.3 impl (also the 7702 delegation target) / factory | `0xd6CEDDe84be40893d153Be9d467CD6aD37875b28` / `0x2577507b78c2008Ff367261CB6285d44ba5eF2E9` | 24,469 / 950 | 24,469 / 950 |
| Meta factory | `0xd703aaE79538628d27099B8c4f621bE4CCd142d5` | 1,871 | 1,871 |
| ECDSA signer | `0x6A6F069E2a08c2468e7724Ab3250CdBFBA14D4FF` | 1,609 | 1,609 |
| CallPolicy v0.0.5 (target/selector/arg rules incl. amount caps) | `0x85770b902D1e503D5f5141d9eaC16d0d08eEaDd2` | 11,455 | 11,455 |
| RateLimitPolicy (no reset) | `0xf63d4139B25c836334edD76641356c6b74C86873` | 1,739 | 1,739 |
| TimestampPolicy | `0xB9f8f524bE6EcD8C945b1b87f9ae5C192FdCE20F` | 1,441 | 1,441 |
| GasPolicy / SudoPolicy | `0xaeFC…4b23` / `0x67b4…B9B7` | 1,872 / 658 | 1,872 / 658 |
| SpendingLimitHook v0.7 | `0xb6D6B30C9E1A28E8044F4cCB48A63A423Ee3D70E` | **0** | **0** |
| RateLimitPolicy (with reset) | `0x6a06358e6b283921deceabe7e8a3741d506cca9b` | not rechecked | **0** in July |

Gap: no resetting rate limit or spending-limit hook, so "N per week" periodic budgets are weaker here than with MetaMask's period enforcer [INFERENCE]. ZeroDev bundler/paymaster availability on Arc: see `third-party-wallet-infra.md` / `aa-infra-on-arc.md`.

### 2c. Rhinestone Smart Sessions (ERC-7579) — **testnet only for the session module**

| Contract | Address | Mainnet | Testnet |
|---|---|---|---|
| SmartSessions validator | `0x00000000008bDABA73cD9815d79069c247Eb4bDA` | **0** | 23,608 |
| SmartSessions compatibility fallback | `0x000000000052e9685932845660777DF43C2dC496` | **0** | 2,439 |
| UniversalActionPolicy / UsageLimit / ValueLimit / TimeFrame / SpendingLimits / Sudo | `0x…714Cf…` / `0x…1d4479…` / `0x…21dC45…` / `0x…D30f6…` / `0x…33212e…` / `0x…FEEc8…` | all present | all present |
| OwnableValidator / WebAuthnValidator | `0x000000000013fdB5234E4E3162a810F54d9f7E98` / `0x7ab16Ff354AcB328452F1D445b3Ddee9a91e9e69` | present | present |
| Module Registry, ScheduledTransfersExecutor, SocialRecovery | `0x…69E2a…`, `0xA8E3…b6bA`, `0xA04D…b597` | 0 | 0 |

The policies exist on mainnet but the validator that uses them does not. Anyone could deploy it at the deterministic address through the CREATE2 deployer (which exists on Arc) [INFERENCE — not attempted]. Until then, Smart Sessions is **testnet-only on Arc** [VERIFIED].

### 2d. Biconomy Nexus — **testnet only, old versions**

Nexus 1.2.0 (MEE 2.1.0) factory `0x0000006648ED9B2B842552BE63Af870bC74af837` and Nexus 1.3.1 (MEE 2.2.1) factory `0x000000002c9A405a196f2dc766F2476B731693c3` have code on **testnet only**. Nexus 1.3.2 / 1.3.3 / MEE 2.3.0 factories (current in `@biconomy/abstractjs@2.0.2`) have **no code on either network**. Biconomy token paymaster `0x00000000301515A5410e0d768aF4f53c416edf19`: no code on either [VERIFIED, `getcode-biconomy-2026-09-29.tsv`]. Lesson from arc-agent: Smart Sessions on Nexus 1.2.0 did enforce recipient and per-call caps on testnet (denied in simulation), but MEE 2.2.1/Nexus 1.3.1 failed with `Invalid signature` (`arc-agent-lessons.md` #31-32).

### 2e. Other

| Item | Mainnet | Testnet | Note |
|---|---|---|---|
| Coinbase SpendPermissionManager `0xf85210B21cC50302F477BA56686d2019dC9b67Ad` | 0 | 0 | Coinbase "spend permissions" unavailable on Arc [VERIFIED] |
| Coinbase Smart Wallet factory v1 / v1.1 | 1,668 / 1,810 | 0 / 0 | mainnet only; no spend-permission manager anyway |
| Safe 1.4.1 + Safe4337Module 0.3.0 | present | present | Safe deployments registry lists 5042 and 5042002 as "canonical" for Safe 1.4.1 (`safe-v1.4.1-*.json`); the 4337 module registry does not list Arc, but bytecode is there. Safe has no native session keys. **Safe AllowanceModule v0.1.1** `0xAA46724893dedD72658219405185Fb0Fc91e091C` (per-delegate, per-token allowance with reset period) has code on both (`third-party-wallet-infra.md` §Safe) [VERIFIED code; flow not run]. Safe7579 adapter `0x7579EE83…0002`: 0 on both |
| Alchemy Modular Account v2 factory `0x00000000000017c61b5bEe81050EC8eFc9c6fecd`, LightAccount v2 factory, MAv2 7702 impl | present | present | MAv2 has session-key style permissions via modules (not individually checked) |
| Circle MSCA (ERC-6900) + Address Book + WeightedWebAuthnMultisig | present | present | no session-key or spend-limit module shipped by Circle (`circle-wallet-options.md` §2, §8) |

## 3. Limit types vs where they can be enforced on Arc

✅ = supported primitive exists on Arc (bytecode verified); (T) = testnet only; App = must be app logic; Prov = provider policy engine.

| Limit | MetaMask DF v1.3.0 | ZeroDev Kernel v3 | Rhinestone Smart Sessions | Circle Agent Wallet | Circle dev-controlled / UCW / MSCA |
|---|---|---|---|---|---|
| Per-transaction cap | ✅ `ERC20TransferAmountEnforcer` is cumulative; per-call via `AllowedCalldata`/`ValueLte` combos [INFERENCE] | ✅ CallPolicy arg rule | ✅ (T) SpendingLimits/ValueLimit | ✅ mainnet, `--per-tx` | App |
| Per-period (day/week) budget | ✅ `ERC20PeriodTransferEnforcer` (resets each period) | ⚠️ only non-reset RateLimit (count) | ⚠️ (T) cumulative, not periodic [UNKNOWN whether a periodic policy exists] | ✅ mainnet, daily/weekly/monthly | App |
| Recipient allowlist | ✅ `AllowedCalldataEnforcer` on `transfer` arg 0 | ✅ CallPolicy | ✅ (T) UniversalActionPolicy | ✅ mainnet | MSCA Address Book (ERC-20 path) |
| Token allowlist | ✅ `AllowedTargetsEnforcer` = USDC `0x3600…` | ✅ CallPolicy target | ✅ (T) | USDC-only policy type | App |
| Contract/function allowlist (e.g. only swap router) | ✅ AllowedTargets + AllowedMethods | ✅ CallPolicy | ✅ (T) | ✅ contract allowlist, mainnet | App |
| Time window / expiry | ✅ TimestampEnforcer | ✅ TimestampPolicy | ✅ (T) TimeFrame | ❌ not documented | App |
| Max number of uses | ✅ LimitedCallsEnforcer | ✅ RateLimitPolicy | ✅ (T) UsageLimit | ❌ | App |
| Only this agent can use it | ✅ RedeemerEnforcer / delegate field | session signer | session signer | CLI session | API key |
| Human approval above threshold | App (agent needs a fresh user-signed delegation) | App / second validator | App | Only for changing limits (OTP) | UCW challenge per tx |
| Protected balance floor | ❌ onchain [UNKNOWN whether a balance-floor enforcer applies; `ERC20BalanceChangeEnforcer` checks deltas, not floors] | App | App | ❌ | App |
| Revoke | `disableDelegation` onchain | uninstall permission | removeSession | `limit reset` (OTP) | App |

## 4. Background automations ("every Tuesday send $10 to Alex")

Nothing on Arc schedules transactions by itself; some off-chain worker must submit at the right time [INFERENCE; Rhinestone's ScheduledTransfersExecutor is not deployed on Arc, see 2c]. The authority question is what that worker holds:

1. **Scoped delegation / session key (recommended shape)**: the user signs, once, on their phone with passkey/biometric, a delegation to the worker's key with caveats: USDC target only, `transfer` only, recipient = Alex, period = 7 days, amount = 10 USDC, expiry. The worker redeems every Tuesday. A bug or leaked server key can at most send $10/week to Alex. Revocable onchain. [INFERENCE; MetaMask DF contracts verified deployed; end-to-end not yet run on Arc.]
2. **Provider policy engine on a server-controlled key** (Privy/Turnkey/CDP-style, or Circle Agent Wallet limits on mainnet): simpler, but the provider and whoever holds the app's API credential can widen policy; Circle Agent Wallet requires a human email OTP to change limits (good) but is CLI-only and one human per session (`circle-wallet-options.md` §4).
3. **Developer-controlled wallet + app logic**: works today with the fewest moving parts, but it is custodial and limits are only as good as your server (`context/03-circle-platform/wallets.md`: "enforce those controls in your own application logic").

Operational lessons (from the failed arc-agent build, still relevant): skip missed slots rather than catch up after downtime; re-check expiry immediately before submit because a provider may accept an op after `validUntil`; use idempotency keys per occurrence (`arc-agent-lessons.md` #34, #43-44).

## 5. Human-approval thresholds

No onchain primitive on Arc implements "auto-approve under $X, ask the human above $X" as one rule. The pattern that works [INFERENCE]:
- The standing delegation/session covers the low-risk envelope (small, periodic, allowlisted).
- Anything outside the envelope becomes a *proposal*: push notification → user confirms with Face ID / fingerprint → the phone's passkey signs a one-off UserOp or a one-off delegation. The agent never gets authority for it in advance.
- Circle user-controlled wallets implement the same "every out-of-envelope action is a user challenge" model natively (PIN/biometric per tx), but have no in-envelope autonomous path (`circle-wallet-options.md` §1).

## Gaps

- No end-to-end run on Arc of: HybridDeleGator creation with a passkey signer, delegation signing, `redeemDelegations` by an EOA agent, period reset, over-limit revert, revoke. This is the first spike to do.
- MetaMask Arc **mainnet** support is merged but unreleased; the docs table still shows testnet only.
- Rhinestone Smart Sessions validator absent on mainnet; not checked whether Rhinestone plans a deployment.
- Code-fingerprint differences for DelegationManager/DeleGators/Kernel impls vs Base are assumed to be immutables; not proven (compare with verified source on `explorer.arc.io`).
- Whether any embedded-wallet provider exposes ERC-7715 `wallet_grantPermissions` on Arc: see `third-party-wallet-infra.md`.
