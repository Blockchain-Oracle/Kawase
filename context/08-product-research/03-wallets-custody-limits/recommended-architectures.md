# Recommended wallet, custody and limit architectures

Purpose: 2–3 viable end-to-end architectures for (a) the user's own wallet, (b) the agent's limited delegated authority and (c) background automations, with pros, cons and the evidence behind each. **The recommendation itself is [INFERENCE].** The facts it rests on are tagged in the linked files.

Sources: the other files in this folder (`circle-wallet-options.md`, `third-party-wallet-infra.md`, `delegation-session-keys-limits.md`, `aa-infra-on-arc.md`, `mobile-security-ux.md`) and their raw evidence in `.firecrawl/product/03-wallets/`; judging weights `context/00-hackathon/judging-and-submission.md:13` ("20% Circle tool usage … Wallets, Paymaster, App Kit, CCTP, Gateway, USYC, Contracts") and RFB 4 `context/00-hackathon/rfbs.md:96` ("budgets and approval limits enforced in the contract rather than the prompt"); failure lessons from `context/07-prior-work/arc-agent-lessons.md` (arc-agent's custody choices are **not** a baseline: that build failed. Abu, 2026-09-29, via coordinator).

Verified: 2026-09-29

---

## Facts that drive the choice (all verified today unless noted)

1. **No Circle wallet gives an agent a *scoped* unattended key.** User-controlled wallets and modular wallets need the user for each signature. Developer-controlled wallets are full custody with no policy engine. Agent Wallets have real limits but are CLI-only, one human per session, and the limits work on mainnet only (`circle-wallet-options.md` §1–4, §8).
2. **Passkeys work onchain on Arc.** The P256VERIFY precompile works on both networks (`p256-precompile-check.txt`). arc-agent's "passkeys can't sign on Arc" was a testing error.
3. **Onchain delegation with periodic budgets is deployed on Arc mainnet and testnet**: MetaMask Delegation Framework v1.3.0, incl. `ERC20PeriodTransferEnforcer`, recipient/target/method/time/redeemer enforcers and the passkey-capable HybridDeleGator. ZeroDev Kernel v3 policies and the Safe AllowanceModule are also deployed on both. Rhinestone Smart Sessions and Biconomy Nexus are **testnet only** (`delegation-session-keys-limits.md` §2).
4. **Bundler**: Pimlico's public bundler serves 5042 and 5042002 with EntryPoints v0.6–v0.9. Alchemy's docs list both networks. Circle Gas Station is live on both (its v0.6 deposit is funded) (`aa-infra-on-arc.md`).
5. **Provider policy engines on Arc**: Turnkey (Arc page, `eip155:5042` in API types) and Privy (chain defs, "Signers" for offline and recurring actions) both sign in the background under a default-deny policy. Neither documents rolling daily/weekly budgets (`third-party-wallet-infra.md`).
6. **Phones can't schedule reliably.** iOS "doesn't guarantee launching the task at the specified date". Automations must run server-side (`mobile-security-ux.md` §2).
7. **Nothing has been run end-to-end on Arc mainnet** for any delegation or session system. Bytecode is present, but the flows are unproven.

---

## Architecture A: "Circle-native envelope" (fastest; highest Circle-tool usage)

| Layer | Choice |
|---|---|
| (a) User wallet | **Circle user-controlled wallet** (social / email OTP / PIN with biometrics), SCA on `ARC`/`ARC-TESTNET`. React Native SDK `@circle-fin/w3s-pw-react-native-sdk` 2.2.4 (Expo), iOS 1.4.2, Web 1.1.11. Gas via **Gas Station**. |
| (b) Agent authority | A per-user **"agent allowance" wallet**: a Circle **developer-controlled** SCA that the user tops up from their UCW with a challenge per top-up. The agent can only spend what is in that wallet. Per-tx, per-recipient, per-period and approval-threshold rules are **app logic** in front of `createTransaction`. |
| (c) Automations | A server worker (Postgres queue, skip-missed-slots) signs from the allowance wallet via the dev-controlled API. |
| Optional | Desktop power users can link a **Circle Agent Wallet** (CLI) on mainnet and get Circle-enforced per-tx/daily/weekly/monthly caps and allowlists, changed only with a human email OTP. |

- **Pros**: every piece is a documented Circle product live on Arc mainnet and testnet. Mobile SDKs exist. There is no bundler or module risk. The hard limit is simple and honest: "the agent can never spend more than the allowance balance." It scores well on the 20% Circle criterion (Wallets + Gas Station + App Kit/CCTP/Gateway).
- **Cons**: the allowance wallet is **custodial** (Circle: "direct custody"). Per-recipient and per-period limits are only as strong as your server, so this does **not** satisfy RFB 4's "enforced in the contract". There are two balances to explain to users. Top-ups need the user. The Android UCW SDK needs a GitHub PAT to install. Beyond 1,000 MAW, pricing is per monthly active wallet for both wallets.
- **Evidence**: `circle-wallet-options.md` §1, §3, §5, §6; `context/03-circle-platform/wallets.md` ("enforce those controls in your own application logic").

## Architecture B: "Passkey smart account + onchain delegation" (strongest guarantees)

| Layer | Choice |
|---|---|
| (a) User wallet | **MetaMask HybridDeleGator** smart account (or ZeroDev Kernel v3.3) owned by the phone's **passkey** (P-256, Face ID / fingerprint). A second signer (another device's passkey or a recovery EOA) handles recovery. Deployed through SimpleFactory, or the user's EOA is upgraded via EIP-7702 to `EIP7702StatelessDeleGator`. |
| (b) Agent authority | The user signs an **ERC-7710 delegation** to the agent's session key, with caveats: `AllowedTargets`=USDC `0x3600…`, `AllowedMethods`=`transfer`, `ERC20PeriodTransferEnforcer` (e.g. 50 USDC/day), `AllowedCalldata` (pinned recipient) for per-contact automations, `Timestamp` (expiry), `Redeemer` (only our key). Anything outside is a proposal that the user signs with Face ID. |
| (c) Automations | One delegation per automation ("10 USDC / 7 days → Alex, until Dec 31"). The worker redeems with a **plain EOA transaction paying USDC gas** (no bundler) or through Pimlico/Alchemy. Revocation is `disableDelegation` onchain. |

- **Pros**: non-custodial. Limits are **enforced onchain**: a leaked worker key can at most spend the delegated envelope, which directly answers RFB 4. Periodic budgets are native. Hardware-backed keys never leave the device, and the P256 precompile makes verification cheap. No provider has to be trusted for enforcement.
- **Cons**: the most engineering, and **no end-to-end run on Arc yet**. MetaMask's published SDK lists only Arc testnet; mainnet support is merged but unreleased. Passkey plumbing for React Native and domain association needs work. No protected balance floor onchain. Lower Circle-tool usage (no Circle Wallet; Gas Station doesn't apply to non-Circle accounts), unless you add Circle Contracts, App Kit, CCTP or Gateway elsewhere. Memo `CallFrom` does not work from smart accounts.
- **Evidence**: `delegation-session-keys-limits.md` §1–4; `aa-infra-on-arc.md` §2–5; `mobile-security-ux.md` §1.

## Architecture C: "Embedded wallet + provider policy engine" (fastest mobile UX, trust the vendor)

| Layer | Choice |
|---|---|
| (a) User wallet | **Turnkey** (Arc docs page, RN/Swift/Kotlin SDKs, gas sponsorship on Arc) or **Privy** (Arc chain defs, Expo/iOS SDKs). The user authenticates with passkey, email or social. The key lives in the provider's enclave/TEE. |
| (b) Agent authority | A provider **server signer / delegated signer** with a default-deny policy: allowed contract = USDC, max value per tx, recipient allowlist, method/calldata constraints. |
| (c) Automations | The server worker signs through the provider API under that policy. Rolling period budgets (per day/week) are app logic, because no provider page confirms them. |

- **Pros**: background signing is a first-class, documented feature, with mature mobile SDKs and quick setup. Policies are enforced outside your app server. Free tiers are Privy 499 MAU and Turnkey 25 signatures/month.
- **Cons**: enforcement lives with the provider (whoever controls the provider credentials can widen policy). Periodic budgets are unconfirmed. Signature pricing (Turnkey $0.10/sig on pay-as-you-go) grows with automations. Vendor lock-in. No Circle Wallet, so less Circle-tool credit. Dynamic's equivalent needs Enterprise in production. Coinbase CDP has no managed Arc support.
- **Evidence**: `third-party-wallet-infra.md` §Privy, §Turnkey, §Dynamic, comparison table.

---

## Matrix

| | A: Circle envelope | B: Passkey SA + 7710 | C: Provider policy |
|---|---|---|---|
| Custody of user funds | Non-custodial UCW (2-of-2 MPC, Circle-hosted); allowance wallet custodial | Non-custodial (device passkey) | Provider enclave / MPC (non-custodial per vendor) |
| Agent signs in background | Yes (allowance wallet) | Yes (scoped delegation) | Yes (server signer) |
| Where limits are enforced | Balance cap = hard; everything else = app | **Onchain** (period, recipient, target, expiry, redeemer) | Provider policy engine; periods = app |
| Periodic budget ("$50/day") | App | Onchain (`ERC20PeriodTransferEnforcer`) | App [UNKNOWN in provider] |
| Survives a compromised app server | Loses at most the allowance balance | Loses at most the delegated envelope | Depends on provider credential isolation |
| Arc mainnet readiness | Documented, live | Contracts deployed; SDK mainnet unreleased; unproven | Turnkey/Privy Arc artefacts; flows untested |
| Mobile SDKs | UCW iOS/Android/RN/Web | viem + passkey libs (DIY) | RN/iOS/Android (vendor) |
| Circle-tool credit | High | Medium (via App Kit/CCTP/Gateway/Contracts) | Low–medium |
| Build risk (hackathon) | Low | **High** | Low–medium |

## Recommendation [INFERENCE]

**Build A now, and spike B for the agent allowance in week 1.** If the spike passes, ship the hybrid:

1. **User vault = Circle user-controlled wallet** (A), for onboarding, recovery via social/email, RN SDK and Gas Station. It keeps Circle Wallets central for judging.
2. **Agent allowance = a passkey-owned HybridDeleGator on Arc, funded from the vault**, with ERC-7710 delegations per agent scope and per automation (B). This puts "budgets and approval limits enforced in the contract" onchain and stays non-custodial. The worker only ever holds the delegate key.
3. **Fallback if the spike fails** (no clean grant → redeem → over-limit revert → revoke on testnet within ~2 days): keep A's developer-controlled allowance wallet with app-level limits, and say so plainly on the screen. Optionally show Circle-enforced limits via a mainnet Agent Wallet for the desktop power-user path.
4. **Do not** give the agent or worker any root/owner key (the owner-sovereignty rule). **Do not** schedule on the phone. **Do not** use testnet-only stacks (Biconomy Nexus, Rhinestone Smart Sessions) if the mainnet demo matters.

Spike checklist (testnet, then $1 on mainnet): create a HybridDeleGator with a WebAuthn signer. Sign a delegation with period 1 USDC/day to recipient X. Redeem 0.5 twice (second succeeds, third fails). Send to recipient Y (fails). Let it expire (fails). Revoke (fails after). Record every tx hash.

## Gaps

- The recommendation depends on the unrun B spike. Until it passes, B is a design, not a capability.
- No legal review of the custodial allowance wallet (A) for consumers or small businesses (money-transmission posture). Research separately.
- No cost model at scale (Circle MAW × 2 wallets vs Turnkey per-signature vs gas for delegation redemptions).
