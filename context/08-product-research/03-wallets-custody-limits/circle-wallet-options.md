# Circle wallet options for a consumer agent app on Arc

Purpose: for each Circle wallet product, who holds keys, whether a backend or agent can sign while the user is away, how limits can be enforced, Arc support, mobile SDKs, pricing and KYC. Also re-checks why arc-agent rejected Circle wallets.

Sources:
- Circle docs dump `.firecrawl/docs/circle-llms-full.txt`. Pages used: `/wallets/user-controlled` (l.116874), `/wallets/user-controlled/authentication-methods` (l.117015), `/sdks/user-controlled/confirmation-uis` (l.94653), `/wallets/key-management` (l.113591), `/wallets/signing-and-authorization-models` (l.116203), `/wallets/modular` (l.113705), `/wallets/modular/how-passkeys-and-modules-work` (l.114445), `/wallets/modular/set-up-passkey-recovery` (l.114522), `/wallets/modular/use-dynamic-as-a-signer` (l.115279), `/wallets/supported-blockchains` (l.116342), `/wallets/gas-station` (l.112785), `/wallets/gas-station/contract-addresses` (l.112940), `/wallets/compliance-requirements` (l.110983), `/wallets/wallet-upgrades` (l.121255), `/release-notes/wallets-2026` (l.87027), `/sdks/user-controlled/{ios,android,react-native}-sdk` (l.94860, 92516, 96717), `/sdks/modular/{android,ios,web}-sdk` (l.88602–92196), and `/agent-stack/agent-wallets*` (l.844–1800).
- Live `npm view` and `gh api repos/circlefin/*` output on 2026-09-29, shown inline.
- `circlefin/buidl-wallet-contracts`: `src/libs/WebAuthnLib.sol`, `test/msca/6900/v0.7/plugins/SessionKeyPlugin.t.sol`, and the `broadcast/*` deploy records. Saved under `.firecrawl/product/03-wallets/`.
- Live Arc RPC: `eth_getCode` results in `.firecrawl/product/03-wallets/circle-msca-getcode-2026-09-29.txt`. A functional P256VERIFY `eth_call` probe is in `.firecrawl/product/03-wallets/p256verify-probe-2026-09-29.txt`.
- https://www.circle.com/wallets pricing section, saved as `.firecrawl/product/03-wallets/circle-wallets-page.md`.
- The `@circle-fin/adapter-circle-wallets@1.8.0` README, saved as `.firecrawl/product/03-wallets/adapter-circle-wallets-1.8.0-readme.md`.
- Earlier context: `context/02-circle-agent-stack/{agent-wallets,guardrails-and-policies,circle-cli}.md`, `context/03-circle-platform/{wallets,paymaster}.md`, and `context/07-prior-work/arc-agent-lessons.md`.

Verified: 2026-09-29

## The core constraint

Circle's docs split the products by **who authorizes a signature** (`/wallets/signing-and-authorization-models`) [VERIFIED]:
- **Developer-controlled:** "Your backend, using the entity secret."
- **User-controlled:** "Your user, by authenticating in your app. Circle cannot sign without your user's approval."
- **Modular:** "Your user (passkey)… The passkey never leaves your user's device."

For user-controlled wallets the docs are explicit: "Every signing operation requires an active, authenticated user session. User-controlled wallets are not designed for automated or backend-initiated transactions where no user is present. For automated signing, see Developer-controlled wallets" (`/wallets/user-controlled`) [VERIFIED].

**Consequence [INFERENCE]:** no Circle *user-custody* product lets the backend sign a recurring payment while the user is away. The Circle-native ways to run automations are:
1. Developer-controlled wallets, where the app has custody.
2. A modular wallet with an extra ECDSA signer or module that the backend holds. This is not a documented Circle pattern; see §2.
3. A Circle Agent Wallet session, which is one human per CLI session; see §4.

---

## 1. User-controlled wallets (PIN, social login, email OTP)

**Keys.** 2-of-2 MPC, and Circle hosts both nodes. "Only your users can sign after they authenticate." The custody model is **non-custodial** (`/wallets/key-management`) [VERIFIED]. Circle "does not offer fully custodial arrangements where it holds keys on behalf of users" (same page) [VERIFIED].

**Login methods** (`/wallets/user-controlled/authentication-methods`) [VERIFIED]:

| Method | Onboarding | Recovery | Notes |
|---|---|---|---|
| Social | Google, Apple or Facebook OAuth. Other providers are available on request via Discord. | Through the provider only. "Circle cannot recover lost provider credentials." | Each social account is a separate user ID, so Google and then Apple gives two users. |
| Email OTP | Circle generates the OTP. | Through the email account. "Email account compromise means wallet compromise." | "Requires SMTP configuration through your own provider. Circle does not send the email." |
| PIN | 6-digit PIN plus security questions. Biometrics are optional. | Security questions. "Circle cannot recover a lost PIN." | Three wrong PINs lock entry for 30 min. Three wrong answers lock recovery for 30 min. |

**Sessions.** Social and email logins get a `userToken` that expires 14 days after issue, and it can be extended with `POST /users/token/refresh`. PIN users get no session token: "Their PIN authorizes each action directly" (same page) [VERIFIED].

**Background signing.** Every transfer, contract execution or signature is a **challenge** that the user completes in the client SDK (`sdk.execute(challengeId)`) (`/sdks/user-controlled/confirmation-uis`; adapter README) [VERIFIED].
- For social and email login, a developer can turn off Circle's confirmation UIs in Console → Configurator → Wallet Security Settings. Circle warns: "If you decide to disable it, it means you can submit transactions on behalf of your users without their consent" (`/sdks/user-controlled/confirmation-uis`) [VERIFIED].
- That removes the confirmation *screen*. The challenge must still run in the client SDK with a live `userToken` [INFERENCE from the challenge flow and the "requires an active, authenticated user session" note]. So it is not a server-side automation path, and turning off consent screens for an agent app is a trust and regulatory risk [INFERENCE].
- No delegate, pre-approval or session-key mechanism is documented for user-controlled wallets. I grepped the dump for "delegate", "session" and "pre-approv". The only "delegate" hit is NEAR `sign/delegateAction` for developer-controlled wallets [VERIFIED absence in the docs dump; UNKNOWN beyond it].

**Limits.** Circle does not document a spending-policy API for user-controlled wallets. Available controls are OFAC screening on every wallet, where a sanctioned counterparty means the transaction is denied and outbound is restricted (`/wallets/compliance-requirements`). Compliance Engine rules are "available to select enterprise customers" (circle.com/wallets footnote 1) [VERIFIED].
- User SCAs are ERC-6900 single-owner accounts (`circle_6900_singleowner_v2`, `/wallets/wallet-upgrades`) [VERIFIED].
- Whether a user can install extra ERC-6900 plugins on them, such as a spending limit, through a contract-execution challenge is not documented [UNKNOWN].

**Arc.** The supported-blockchains table lists `ARC` and `ARC-TESTNET` with EOA and SCA for user-controlled wallets. Arc mainnet was added on 2026-09-16 (release notes) [VERIFIED].

**Gas.** EOAs pay gas in USDC, which is Arc's native gas token. SCAs can use Gas Station. The Gas Station table shows Arc Mainnet ✅ and Arc Testnet ✅ for user-controlled wallets (`/wallets/gas-station`) [VERIFIED].

**SDKs**, checked live on 2026-09-29 [VERIFIED]:

| Platform | Package | Latest | Notes |
|---|---|---|---|
| iOS | CocoaPods from `circlefin/w3s-ios-sdk-podspecs`, repo `circlefin/w3s-ios-sdk` | release **1.4.2**, 2026-09-22 | iOS 13.0+ (docs l.94896) |
| Android | Maven `circle.programmablewallet:sdk` from GitHub Packages `maven.pkg.github.com/circlefin/w3s-android-sdk`. **Needs GitHub username and PAT credentials.** | Repo last pushed 2025-12-30. The only GitHub release is `release-2024-01-24…`, so the current version is [UNKNOWN] without a GitHub Packages login. | API 21+ |
| React Native (Expo) | `@circle-fin/w3s-pw-react-native-sdk`, repo `circlefin/w3s-react-native-sdk` | npm **2.2.4**, 2026-09-23 | V2 added Expo. `npx expo prebuild` is needed for social login. |
| Web | `@circle-fin/w3s-pw-web-sdk` | npm **1.1.11** (npm modified 2026-05-14; GitHub release 2025-03-11) | |
| Server (Node) | `@circle-fin/user-controlled-wallets` | **10.8.1**, 2026-09-22 | Creates users, tokens and challenges |

**Export.** Circle docs describe no raw private-key export for user-controlled wallets. "You don't manage raw private keys" (`/wallets` overview) [VERIFIED absence in the docs dump]. Leaving means signing transfers out to another wallet [INFERENCE].

---

## 2. Modular wallets (passkeys, MSCA, ERC-4337 and ERC-6900)

**Keys.** A passkey (WebAuthn, secp256r1) sits in the device's secure enclave or password manager and syncs through iCloud or Google Password Manager. The model is **non-custodial**: "Neither Circle nor your application can recover user wallets if every credential is lost" (`/wallets/modular/how-passkeys-and-modules-work`) [VERIFIED].

**Recovery.** `registerRecoveryAddress` adds an **ECDSA EOA**, derived from a mnemonic, as a second signer. "A recovery key has the same permissions as a passkey" (same page and `/set-up-passkey-recovery`) [VERIFIED].
- Recovery adds a new passkey but does **not** remove the old one [VERIFIED].
- Owner-removal is a separate flow you build yourself [VERIFIED].
- Circle also documents using a Dynamic-managed EOA as the signer instead of a passkey (`/wallets/modular/use-dynamic-as-a-signer`) [VERIFIED].

**Modules** (ERC-6900). The docs list only two:
- **Passkey** (built in).
- **Address Book** at `0x0000000d81083B16EA76dfab46B0315B0eDBF3d0`. It "Restricts transfers (ERC-20, ERC-721, ERC-1155) to a list of onchain allowlisted addresses." Custom ERC-6900 modules are allowed [VERIFIED].
- The contracts repo also has a `WeightedWebauthnMultisigPlugin`, deployed at `0x0000000c984aff541d6ce86bb697e68ec57873c8` (broadcast record for chain 421614) [VERIFIED].
- **No spending-limit, session-key or automation module is shipped.**
  - `test/msca/6900/v0.7/plugins/SessionKeyPlugin.t.sol` is still wrapped in a block comment, which says "modular account library needs to be updated before tests can pass." The repo was last committed 2026-09-14 [VERIFIED].
  - The docs' mention of modules for "automation" (`/wallets/modular` card) has no shipped module behind it [VERIFIED].
- Arc-agent's caveat still applies: Address Book covers ERC-20/721/1155 transfer paths. A native-value USDC send is a separate path, so coverage must be tested [REPORTED from arc-agent; not re-tested].

**Onchain deployment on Arc.** `eth_getCode` on 2026-09-29 (mainnet block 0x1636fcd, testnet 0x3d8b4eb) [VERIFIED]:

| Contract | Address | Arc mainnet | Arc testnet |
|---|---|---|---|
| PluginManager | `0x00000005e69188224e4deef607801916dc0936d5` | 12,275 B | 12,275 B |
| UpgradableMSCAFactory | `0x0000000df7e6c9dc387cafc5ecbfa6c3a6179add` | 4,514 B | 4,514 B |
| MSCA implementation (from factory deploy record) | `0xa70f1296869da9d7cb69578123f21888e6db2b62` | 16,412 B | 16,412 B |
| ColdStorageAddressBook plugin | `0x0000000d81083b16ea76dfab46b0315b0edbf3d0` | 7,254 B | 7,254 B |
| WeightedWebauthnMultisig plugin | `0x0000000c984aff541d6ce86bb697e68ec57873c8` | 19,580 B | 19,580 B |
| Gas Station paymaster | `0x7ceA357B5AC0639F89F9e378a1f03Aa5005C0a25` | 855 B | 855 B |
| EntryPoint v0.7 | `0x0000000071727De22E5E9d8BAf0edAc6f37da032` | 16,035 B | 16,035 B |

**Passkey verification on Arc works.**
- Circle's `WebAuthnLib.sol` says: "Attempts to use the RIP-7212 precompile for signature verification. If precompile verification fails, it falls back to FreshCryptoLib" (Solidity) [VERIFIED, source].
- A live `eth_call` to `0x…0100` with a freshly generated valid P-256 signature returned `0x…01` on **Arc mainnet and Arc testnet**, and returned `0x` for a tampered hash. Base mainnet gave the same results as a control [VERIFIED, `p256verify-probe-2026-09-29.txt`].
- **The RIP-7212 precompile is live on Arc.** Arc-agent's "no code at 0x100" finding was a methodology error: precompiles never have bytecode, so `eth_getCode` returns empty even when they work.
- Circle's MSCA would verify passkeys either way through its FCL fallback. The fallback costs more gas.
- Circle also ships SDK chain enums and USDC constants for `Arc` and `ArcTestnet` (`/sdks/modular/*`, docs l.88602ff) [VERIFIED].

**Background signing.** Modular wallets need a passkey, meaning the user and the device are present. No Circle session module exists. The backend could only sign unattended if the app registered a server-held ECDSA key as an extra owner, for example through the recovery-address mechanism. That key would have **full** owner power, with no limits. Circle does not document this as a pattern [INFERENCE]. A scoped alternative would be a custom ERC-6900 limit or session module, which you would build and audit yourself [INFERENCE].

**Operational note.** "Modular wallets submit user operations directly to the bundler… Your application is responsible for monitoring user operation status and resubmitting failed operations" (`/wallets/modular`) [VERIFIED]. MSCAs "have a single implementation and can't be upgraded" (`/wallets/wallet-upgrades`) [VERIFIED].

**SDKs**, checked live on 2026-09-29 [VERIFIED]:

| Platform | Package | Latest |
|---|---|---|
| Web (viem-based) | `@circle-fin/modular-wallets-core` | npm **1.0.16**, 2026-09-16 (mirror repo `modularwallets-web-sdk` 1.0.15) |
| iOS | SPM `https://github.com/circlefin/modularwallets-ios-sdk.git`, product `CircleModularWalletsCore` | **1.5.0**, 2026-05-29 |
| Android | Maven `circle.modularwallets:core` from GitHub Packages. Needs a GitHub PAT. | **1.5.3**, 2026-05-29 |
| React Native | **none found.** No `@circle-fin/*modular*` RN package on npm and no circlefin repo. A RN app would need the web SDK plus a passkey polyfill, or native modules [INFERENCE]. | — |

The 2026-09-16 release note says the Arc mainnet update touched the Android, iOS and Web modular SDK docs. The iOS and Android binaries were last released on 2026-05-29, though, so check that the mobile enums include `Arc` mainnet before relying on them [UNKNOWN].

---

## 3. Developer-controlled wallets

**Keys.** 2-of-2 MPC, with signing authorized by your **entity secret**. Circle can host both nodes, share hosting with you, or you can self-host both. Self-hosting is for enterprise customers. Custody model: "**Direct custody**… you hold key material on your users' behalf" (`/wallets/key-management`) [VERIFIED]. Circle never stores the entity secret, and the recovery file is the only reset path (`context/03-circle-platform/wallets.md`) [VERIFIED].

**Background signing.** Yes. This is Circle's documented path for "automated signing" (`/wallets/user-controlled` note) [VERIFIED]. It suits cron-style automations and agent actions.

**Limits.** No built-in policy engine. Circle says: "enforce those controls in your own application logic before calling Circle APIs" (quoted in `context/03-circle-platform/wallets.md`) [VERIFIED]. Your options:
- App-level checks.
- Compliance Engine rules (enterprise only).
- An SCA plus an onchain vault or contract.
- Gas Station per-tx and per-day USD caps, which only bound *gas* [VERIFIED, `paymaster.md`].

**Arc.** `ARC` and `ARC-TESTNET`, EOA and SCA [VERIFIED, supported-blockchains]. Gas Station supports both [VERIFIED].

**SDKs.** Server only: Node `@circle-fin/developer-controlled-wallets` **10.8.1** (2026-09-22), and Python. The API key and entity secret must never ship in a mobile app, and Circle's App Kit adapter README says the same ("should only be accessible from trusted backend services") [VERIFIED].

**Regulatory note [INFERENCE].** "Direct custody" of consumer funds may make the app operator a custodian or money transmitter in some jurisdictions. Circle's own site says CTS "is not engaged in any regulated money transmission activity" (circle.com/wallets footer) [VERIFIED quote], which leaves that exposure with the developer. Get legal review before holding consumer funds this way.

---

## 4. Agent Wallets (Circle CLI)

**Keys.** Built on user-controlled 2-of-2 MPC wallets. "key shares are never exposed to the agent. The user retains custody, and Circle cannot unilaterally move funds" (`/agent-stack/agent-wallets`) [VERIFIED]. Account type is SCA [VERIFIED, `agent-wallets.md`].

**Access.** CLI only (`@circle-fin/cli` **1.1.4**, 2026-09-22). No REST or SDK surface for Agent Wallets is documented [VERIFIED, `agent-wallets.md`].
- Login is by email OTP. It has an interactive mode and a non-interactive `--init` / `--request <id> --otp <code>` mode for scripts and agents [VERIFIED].
- Request IDs expire in 10 min [VERIFIED].
- "Sessions last 28 days. Session secrets are stored in your operating system's secure keychain." Mainnet and testnet sessions are separate (`/agent-stack/agent-wallets/wallet-operations/authenticate`) [VERIFIED].

**Headless or background use.** Within an active 28-day session the CLI can transfer, swap, bridge, execute and pay with no per-transaction approval, so an unattended agent works. A human OTP is needed only at login and for policy changes [VERIFIED, `guardrails-and-policies.md`].

For a **multi-user consumer app** it is a poor fit [INFERENCE]:
- There is one email identity per CLI session, and secrets live in the OS keychain.
- There is no multi-tenant API.
- Wallets are capped at 5 per chain.
- The user has to relay an OTP every 28 days.
- Terms consent must be collected from each human.

It suits "one person's own agent", for example a desktop build where the user runs the CLI locally [INFERENCE].

**Limits.** Server-enforced `circle wallet limit set`:
- per-tx, daily, weekly and monthly USDC caps, which also cover x402;
- recipient allowlists and blocklists;
- contract allowlists and blocklists.

They are **mainnet only**, and every set or reset needs a second **human email OTP** [VERIFIED, `guardrails-and-policies.md`, CLI help 1.1.4]. Budgets are EVM-wide [VERIFIED].

**Arc.** `ARC` since 2026-09-16, plus `ARC-TESTNET` [VERIFIED, `agent-wallets.md`]. So **Arc mainnet Agent Wallets can now have enforced limits**. Arc testnet still cannot [VERIFIED, docs and prior CLI gate check].

**Mobile.** None. It is a CLI [VERIFIED].

**Pricing.** Gas is sponsored at $0, "capped, subject to fair use." Other fees: swap 2 bps, bridge forwarding $0.05 plus gas, Gateway 0.5 bps crosschain [VERIFIED, `agent-wallets.md`].

---

## 5. Gas Station (sponsorship, not a wallet)

- **Scope.** ERC-4337 paymaster `0x7ceA357B5AC0639F89F9e378a1f03Aa5005C0a25`, present on Arc mainnet and testnet (docs table plus `eth_getCode` 855 B on both) [VERIFIED]. On EVM it covers **SCA and MSCA only**, not EOAs (circle.com/wallets FAQ) [VERIFIED].
- **Policies.** Testnet gets an auto-created default policy. Mainnet needs an active Console policy with optional max USD per day and per tx; the per-tx cap does not apply to an SCA's first transaction. These cap **gas spend, not token spend** [VERIFIED, `paymaster.md`].
- **Billing.** Sponsored gas at cost in USD, plus a **5% fee** and taxes, charged to the developer's credit card (circle.com/wallets FAQ) [VERIFIED].
- **Relevance on Arc [INFERENCE].** Gas on Arc is already paid in USDC, so Gas Station mainly removes the "keep a USDC buffer for gas" problem and the first-tx deploy cost. It also lets the app claim Circle Paymaster-category usage honestly.

---

## 6. Pricing and KYC

Circle Wallets pricing is per **Monthly Active Wallet** (MAW), billed monthly in arrears (circle.com/wallets, scraped 2026-09-29) [VERIFIED]:

| MAW tier | All-included (per wallet) | Signing-API-only (per wallet) |
|---|---|---|
| 0–1,000 | **Free every month** | Free |
| 1,001–5,000 | $0.050 | $0.038 |
| 5,001–10,000 | $0.047 | $0.035 |
| 10,001–25,000 | $0.040 | $0.030 |
| 25,001–50,000 | $0.035 | $0.026 |
| 50,001–100,000 | $0.030 | $0.023 |
| 100,001–250,000 | $0.025 | $0.015 |
| >250,001 | $0.020 | $0.012 |

- **MAW** means a wallet "that has conducted an on-chain transaction within the month period, such as initial wallet creation or sending or receiving funds." There is a $0.01 rebate per MAW that holds at least 10 USDC all month, except within the free first 1,000 [VERIFIED].
- The pricing card's chain list ("Aptos, Arbitrum, Avalanche, Base, Ethereum, Monad, OP Mainnet, Polygon PoS, Solana, and Unichain") **omits Arc**. That card is probably stale relative to the 2026-09-16 release note, but Arc's tier is [UNKNOWN] until Circle confirms it.
- **Modular wallets** have no separate price on the page [UNKNOWN].
- **End-user KYC:** none is required by Circle Wallets for any wallet type, as far as the docs say. Onboarding is login-based only, and the obligation Circle places on developers is OFAC. "You are responsible for ensuring the wallets you create do not transact with" SDN addresses (`/wallets/compliance-requirements`) [VERIFIED for the docs; a KYC requirement would appear there, and none does].
- **Developer account:** "Anyone can sign up… and begin building immediately," and there is no Circle Mint requirement (circle.com/wallets FAQ) [VERIFIED].
- **Mainnet upgrade:** the faucet API "requires upgrading to mainnet" (docs l.10041) and Gas Station mainnet needs a credit card [VERIFIED]. Whether the mainnet upgrade involves KYB was not found in the docs or on the site [UNKNOWN; looked in the docs dump for "KYB", "upgrad… mainnet" and in the wallets page].

---

## 7. App Kit interoperability (swap, bridge, Gateway)

`@circle-fin/adapter-circle-wallets` **1.8.0** (2026-09-16) now has a **User-Controlled Wallets** entry, `createCircleUserWalletAdapter` in `/ucw/server` [VERIFIED, README].
- Every state change becomes a Circle challenge that the owner approves.
- SCAs batch steps such as approve plus burn into one approval.
- Chains include `Arc` and `Arc_Testnet`.
- Typed-data signing needs a `resolveTypedDataSignature` relay and "a durable server or worker process."

The README does not mention modular wallets or Agent Wallets [VERIFIED absence]. Agent Wallets reach swap, bridge and Gateway through their own CLI commands instead [VERIFIED, `agent-wallets.md`].

---

## 8. Arc-agent's reasons for rejecting Circle wallets, re-checked

| Arc-agent reason (Jul–Aug 2026) | Today (2026-09-29) | Evidence |
|---|---|---|
| Agent Wallet policies are mainnet-only | **Still true.** Arc testnet cannot enforce Circle policies. | `guardrails-and-policies.md`, CLI 1.1.4 [VERIFIED] |
| No Arc mainnet for Wallets or Agent Wallets | **No longer true.** `ARC` was added 2026-09-16 for Wallets, Gas Station, Contracts and Agent Wallets, so mainnet Agent Wallet limits now work on Arc. | release notes l.87027, `agent-wallets.md` [VERIFIED] |
| Circle's session-key plugin test is commented out | **Still true.** The file is still block-commented, and no session or spend-limit module is shipped. | `SessionKeyPlugin.t.sol` fetched 2026-09-29 [VERIFIED] |
| The App Kit Circle Wallet adapter supports developer-controlled only | **No longer true** for user-controlled (UCW entry in adapter 1.8.0). Still no modular or Agent Wallet adapter. | adapter README [VERIFIED] |
| Passkeys cannot sign or validate on Arc (no RIP-7212) | **False.** P256VERIFY at `0x100` verifies correctly on Arc mainnet and testnet, and Circle's WebAuthnLib has a Solidity fallback anyway. Circle's MSCA stack is deployed on both networks. | `p256verify-probe-2026-09-29.txt`, `circle-msca-getcode-2026-09-29.txt` [VERIFIED] |
| Product-level: a scoped onchain session for an unattended agent was needed | **Still unmet by Circle.** No Circle wallet gives the agent a *scoped* key. The choices are full backend custody (dev-controlled), a user present for every action (UCW or modular), or one human's CLI session with mainnet-only caps (Agent Wallet). | §1–4 [INFERENCE from verified facts] |

---

## Comparison

| | User-controlled | Modular (MSCA) | Developer-controlled | Agent Wallet (CLI) | Gas Station |
|---|---|---|---|---|---|
| Who holds keys | User. 2-of-2 MPC, Circle hosts both nodes. | User's passkey, plus optional ECDSA recovery EOA | You, through the entity secret. MPC hosted by Circle, shared, or self-hosted. | End user, through email OTP. UCW MPC. | n/a |
| Custody label (Circle) | Non-custodial | Non-custodial | Direct custody | User custody | n/a |
| Backend or agent signs while user is away | **No** (needs user session and challenge) | **No** (passkey). Only via an extra full-power owner key or a custom module. | **Yes** | **Yes**, within a 28-day session, for one human per CLI | n/a |
| Built-in limit enforcement | OFAC only. Compliance Engine is enterprise-only. | Address Book allowlist (onchain) and weighted multisig. No spend or session module. | None (app logic). Compliance Engine is enterprise-only. | per-tx, daily, weekly, monthly caps and allow/blocklists. **Mainnet only**, human OTP to change. | Gas USD caps only |
| Arc mainnet / testnet | ✅ / ✅ (EOA, SCA) | ✅ / ✅ (contracts verified live) | ✅ / ✅ (EOA, SCA) | ✅ / ✅ (limits only on mainnet) | ✅ / ✅ |
| iOS | CocoaPods 1.4.2 | SPM 1.5.0 | server only | none | n/a |
| Android | Maven (GitHub Packages, PAT) | Maven 1.5.3 (GitHub Packages, PAT) | server only | none | n/a |
| React Native | `@circle-fin/w3s-pw-react-native-sdk` 2.2.4 (Expo) | **none** | server only | none | n/a |
| Web | `@circle-fin/w3s-pw-web-sdk` 1.1.11 | `@circle-fin/modular-wallets-core` 1.0.16 | server only | CLI | n/a |
| Price | MAW tiers, first 1,000 free | [UNKNOWN] | MAW tiers, first 1,000 free | gas sponsored, plus op fees | gas + 5% |
| End-user KYC | none documented | none documented | none documented (you carry custody obligations) | none documented | n/a |

## Gaps

- The Arc MAW price tier is unconfirmed, and so is modular wallet pricing. The pricing card omits Arc.
- It is unknown whether the developer account's mainnet upgrade requires KYB.
- The current Android user-controlled SDK version is unknown; GitHub Packages needs auth.
- The modular iOS and Android binaries (2026-05-29) predate Arc mainnet (2026-09-16). Mainnet enum support in the binaries is unverified.
- No React Native modular SDK exists.
- It is unknown whether user-controlled SCAs (`circle_6900_singleowner_v2`) can install third-party ERC-6900 plugins.
- Address Book coverage of Arc native-value USDC transfers has not been re-tested.
- No live Circle transaction was sent in this research: no accounts were created, per the rules. Every "works on Arc" claim rests on docs plus deployed bytecode, not an executed user operation.
