# Third-party wallet infrastructure on Arc (non-Circle)

Purpose: which non-Circle wallet, signer, smart-account, bundler and paymaster providers actually work on Arc mainnet (5042) and testnet (5042002), and what each gives a mobile/desktop agent app: custody, background signing for automations, policy/limit engine, SDKs, price.

Sources:
- Live RPC `eth_getCode` on `https://rpc.mainnet.arc.io` and `https://rpc.testnet.arc.io`: `.firecrawl/product/03-wallets/getcode-third-party.txt`
- Bundler probes: `.firecrawl/product/03-wallets/bundler-probes.txt`, `pimlico-control.txt`, `zerodev-probe.txt`, `alchemy-probe.txt`
- npm tarballs grepped for 5042/5042002: `.firecrawl/product/03-wallets/npm-arc-grep.txt`; package/repo existence: `npm-versions.txt`
- thirdweb chain API `https://api.thirdweb.com/v1/chains/{id}`: `thirdweb-chains.txt`; chainid.network: `chainlist.txt`
- Safe config service `https://safe-config.safe.global/api/v1/chains/{id}/`: `safe-config-5042.json`, `safe-config-5042002.json`
- Rhinestone orchestrator `https://v1.orchestrator.rhinestone.dev/chains`: `rhinestone-chains.json`
- GitHub: `alchemy-docs-pr1622.json` (alchemyplatform/docs#1622), `metamask-sak-pr304.json` (MetaMask/smart-accounts-kit#304)
- Docs pages (fetched 2026-09-29), cited inline
- Arc EVM baseline: `.firecrawl/docs/arc-llms-full.txt:18303-18305` ("Arc targets the **Osaka** hard fork as its baseline, including features such as EIP-7702")

Verified: 2026-09-29

---

## 1. Bottom line

- **Proven on both Arc networks, with an Arc-specific artefact** [VERIFIED]: Privy (chain defs in `@privy-io/chains`), Turnkey (dedicated Arc docs page + API types), Crossmint (supported-chains table + SDK), thirdweb (chain API), ZeroDev (docs + Kernel v3.1 bytecode on both), Safe (config service + singletons + 4337 module + AllowanceModule on both), Alchemy (Bundler/Gas Sponsorship table), Pimlico (public bundler answers on both), MetaMask Delegation Framework v1.3.0 (bytecode on both; SDK constant for testnet only).
- **Testnet only**: Biconomy (docs list Arc Testnet only; Nexus 1.2.0 factory/impl and Rhinestone Smart Sessions `0x…8bDABA` have code on testnet, **0 bytes on mainnet**).
- **Mainnet only**: Coinbase Smart Wallet factories (code on 5042, none on 5042002). Rhinestone orchestrator lists 5042 and not 5042002.
- **Not listed / not proven**: Coinbase CDP managed send + policies network enum (no Arc), Openfort (not in chain list), Candide public bundler (rejects both), Web3Auth, Para, Magic (custom-EVM configurable, no Arc artefact found).
- **Background signing + a server-side policy engine, on Arc** [INFERENCE from the rows below]: Turnkey (strongest proof: Arc page says policies parse EVM tx on Arc), Privy (signers + policies; Arc in chain defs but Arc not named in the tier doc), Dynamic (delegated access, Enterprise-only in production; Arc named in docs, policy detail thin). Onchain-enforced limits usable on Arc mainnet today: ZeroDev Kernel permissions, Safe AllowanceModule, MetaMask delegation caveat enforcers (bytecode present; not exercised by us).

## 2. Per-provider detail

### Privy (embedded wallets, server wallets, signers, policies)
- **Arc**: `@privy-io/chains@0.6.1` exports `arcMainnet` (`id:5042`, RPC `https://arc-mainnet.rpc.privy.systems`) and `arcTestnet` (`id:5042002`, `privy` RPC `https://arc-testnet.rpc.privy.systems`) [VERIFIED, npm tarball]. Both Privy RPC hosts returned `{}` to an unauthenticated `eth_chainId` (auth likely required) [VERIFIED]. The chain-tiers page (https://docs.privy.io/wallets/overview/chains) describes Tier 3 (managed send, webhooks) as including "EVM-compatible networks" but does not name Arc [VERIFIED]. Custom chains via viem `defineChain` / `supportedChains` (https://docs.privy.io/basics/react/advanced/configuring-evm-networks) [REPORTED via search snippet].
- **Background signing**: "Signers" let "your server to sign requests with their embedded wallet … without needing the user in the loop"; supports "offline actions" and "recurring actions"; per-signer policies ("specific policies on wallets that apply to specific signers") (https://docs.privy.io/wallets/using-wallets/signers/overview) [VERIFIED].
- **Policy engine**: rules per RPC method; transfer value limits, recipient/contract/network allow/deny lists, calldata constraints, EIP-712 constraints; "DENY actions take precedence… If no rules resolve, the policy will default to `DENY`"; evaluated in a secure enclave (https://docs.privy.io/controls/policies/overview) [VERIFIED]. No cumulative/daily budget rule seen on that page [UNKNOWN].
- **Custody**: "signer will never see the wallet's private key. All signing takes place in a secure enclave" (signers page) [VERIFIED].
- **SDKs**: `@privy-io/react-auth` 3.46.0, `@privy-io/expo` 0.75.0 (React Native), `@privy-io/node` 0.35.0, `privy-io/privy-ios` repo active 2026-09-11 [VERIFIED]; `privy-io/privy-android` repo not found under that name [UNKNOWN whether a native Android SDK exists elsewhere].
- **Price**: free 0–499 MAU incl. "50K signatures and $1M transaction volume"; $299/mo to 2,499 MAU; $499/mo to 9,999 MAU (https://www.privy.io/pricing) [VERIFIED]. No KYC mentioned [VERIFIED absence on page].

### Dynamic (embedded MPC wallets, delegated access)
- **Arc**: "Dynamic offers embedded wallets on EVM, Solana, Bitcoin, Sui, TON, Stellar, Tempo, and Arc compatible networks" (https://www.dynamic.xyz/docs/overview/wallets/embedded-wallets/mpc/overview) [VERIFIED]. Mainnet vs testnet not separated on that page [UNKNOWN]. `@dynamic-labs/sdk-api-core` has no 5042 string [VERIFIED; chains are dashboard config].
- **Custody**: TSS-MPC; user share on device, server share in a TEE; "no complete private key ever exists in one place" (same page) [VERIFIED].
- **Background signing**: Delegated Access: user is prompted, a reshare issues the developer an "encrypted external share and per-wallet API key" via webhook; revocation webhook `wallet.delegation.revoked`; "For production use, delegated access requires an Enterprise plan"; delegated access cannot export keys or modify policies (https://www.dynamic.xyz/docs/overview/wallets/embedded-wallets/mpc/delegated-access/overview) [VERIFIED]. Whether spending limits bind delegated signing: not stated [UNKNOWN].
- **SDKs**: React, JS, React Native, Flutter, Swift, Kotlin, Unity (search snippet of https://www.dynamic.xyz/sdk) [REPORTED]; `@dynamic-labs/sdk-react-core` 5.9.2, `dynamic-labs/swift-sdk-and-sample-app` active 2026-09-28 [VERIFIED].
- **Price**: free to 1,000 MAU; $249/mo 1k–5k; +$0.05/MAU beyond (https://www.dynamic.xyz/pricing) [VERIFIED]. Delegated access Enterprise-only in prod (above).

### Turnkey (TEE key management, policy engine)
- **Arc**: dedicated page https://docs.turnkey.com/features/networks/arc lists Arc Mainnet 5042 and Arc Testnet 5042002; tx construction/broadcast/nonce/status; `sponsor: true` gas sponsorship (dashboard activation, billed monthly); policies parse EVM tx (destination, value, calldata, EIP-712); only tx types 0/1/2 [VERIFIED]. `@turnkey/sdk-server@8.6.0` API types enumerate `"eip155:5042" | "eip155:5042002"` for `v1EthSendTransactionIntent`, balances, tx history and `v1EthUndelegate7702Intent` [VERIFIED]. Example repo `tkhq/sdk/examples/chain-integrations/with-arc` exists [VERIFIED].
- **Policy engine**: JSON `effect`/`consensus`/`condition`; default deny, "EFFECT_DENY always wins"; `eth.tx.to` etc.; multi-party consensus (https://docs.turnkey.com/concepts/policies/overview) [VERIFIED]. Cumulative/daily budgets: not on the page [UNKNOWN; per-tx conditions only confirmed].
- **Background signing**: a backend API-key user with policy-scoped rights can sign (policies overview) [REPORTED; dedicated delegated-access page 404'd].
- **SDKs**: `@turnkey/react-native-wallet-kit` 2.3.7, `@turnkey/sdk-react-native` 1.5.33, `tkhq/swift-sdk`, `tkhq/kotlin-sdk` (active Aug 2026) [VERIFIED].
- **Price**: Pay-as-you-go free 25 signatures/mo, up to 1,000 wallets, then $0.10/signature; Pro $99/mo min, $0.05/sig; Enterprise from $0.0015/sig; gas sponsorship listed under Enterprise (https://www.turnkey.com/pricing) [VERIFIED].

### Coinbase CDP (embedded wallets, Server Wallet v2, policies)
- **Arc**: no Arc artefact. `@coinbase/cdp-sdk@1.57.0` managed network enum is `base, base-sepolia, ethereum, ethereum-sepolia, avalanche, polygon, optimism, arbitrum` [VERIFIED, npm]. Docs: EOAs "on all EVM-compatible networks"; SendTransaction only on the managed list, "For other networks, use the SignTransaction API … and rely on your own RPC" (https://docs.cdp.coinbase.com/wallet-api/v2/evm-features/sending-transactions) [REPORTED via search snippet]. So Arc = sign-only + own broadcast [INFERENCE]. Coinbase Smart Wallet factories `0x0BA5ED0c…` and `0xBA5ED110…` have code on **mainnet only** [VERIFIED].
- **Background signing**: embedded wallets: "After a user grants a time-bound delegation, your backend can sign within that delegation while the user is offline"; server wallets keys "in a TEE" (https://docs.cdp.coinbase.com/wallets/non-custodial-wallets/overview) [VERIFIED].
- **Policies**: `ethValue`, `evmAddress`, `evmData`, `evmNetwork`; scope project/account (https://docs.cdp.coinbase.com/server-wallets/v2/using-the-wallet-api/policies/overview) [VERIFIED]; `evmNetwork` cannot name Arc given the enum [INFERENCE].
- **SDKs**: TypeScript, React, React Native (`@coinbase/cdp-react`, `@coinbase/cdp-hooks` 0.0.126) [VERIFIED]; native iOS/Android not mentioned [UNKNOWN].
- **Price/KYC**: free CDP Portal project; "business verification is not required" (overview page) [VERIFIED].

### Crossmint (smart wallets, signers)
- **Arc**: supported-chains table lists Arc with wallets self-serve, labels `arc` / `arc-testnet` (https://docs.crossmint.com/introduction/supported-chains) [VERIFIED]. `@crossmint/common-sdk-base@0.12.2` maps `arc:5042`, `"arc-testnet":5042002`; `@crossmint/wallets-sdk@1.18.0` defines both chains [VERIFIED]. Oddity: that SDK's Arc Testnet viem def sets native `decimals:6` (mainnet: 18) [VERIFIED]; Arc native is 18 (see `context/01-arc/network-config.md`). Crossmint's smart-wallet contract addresses on Arc were not checked [UNKNOWN].
- **Custody/signing**: ERC-4337 smart wallets; operational signers = device keys (Secure Enclave / Android Keystore), passkeys, **server signers**, Cloud KMS; recovery via email/phone OTP (https://docs.crossmint.com/wallets/architecture) [VERIFIED]. Onchain "spending limits, role-based permissions, delegated approvals" [REPORTED, search snippet].
- **SDKs**: `@crossmint/client-sdk-react-native-ui` 1.7.1 [VERIFIED].
- **Price**: 1,000 MAW free, then from $0.025/MAU; policy engine and AML screening listed (https://www.crossmint.com/pricing) [VERIFIED].

### thirdweb (in-app wallets, server wallets, bundler/paymaster)
- **Arc**: chain API returns 5042 ("Arc", `testnet:false`) and 5042002 ("Arc Testnet") [VERIFIED]. `thirdweb@5.121.6` exports `arcTestnet` only; no `arc` mainnet definition file [VERIFIED] (use `defineChain(5042)`). Bundler host `https://{5042,5042002}.bundler.thirdweb.com` answers `MISSING_CLIENT_ID` (endpoint exists; needs key) [VERIFIED]; whether it serves Arc: [UNKNOWN].
- **Background signing**: EIP-7702 session keys via Wallets API for "your backend to execute transactions on behalf of your users" with scoped permissions (https://portal.thirdweb.com/wallets/session-keys, changelog) [REPORTED]. Arc supports EIP-7702 per Arc docs [VERIFIED], but thirdweb's 7702 delegate contract on Arc was not checked [UNKNOWN].
- **Price**: 1,000 in-app MAW free then $0.015/MAU; server wallets 1,000 req/mo then $1/1k; sponsorship 1,000 tx then usage-based, 2.5% mainnet gas surcharge (https://thirdweb.com/pricing) [VERIFIED].

### Web3Auth (MetaMask Embedded Wallets)
- **Arc**: any EVM chain via dashboard or `chains` config (https://docs.metamask.io/embedded-wallets/dashboard/advanced/custom-chains/) [REPORTED, search snippet]; no Arc artefact in `@web3auth/modal@11.4.1` [VERIFIED].
- **Custody**: MPC TSS listed on Enterprise (pricing); default model not checked [UNKNOWN]. No documented backend-signing-for-user feature found [UNKNOWN].
- **SDKs**: `@web3auth/react-native-sdk` 10.0.0; `Web3Auth/web3auth-swift-sdk`, `web3auth-android-sdk` active 2026-09-28 [VERIFIED].
- **Price**: free 1,000 MAW, $0.05/extra; Growth $69; Scale $399 (https://web3auth.io/pricing.html) [VERIFIED].

### Para
- **Arc**: no Arc artefact in `@getpara/core-sdk@3.20.0` [VERIFIED]; custom EVM support not confirmed [UNKNOWN].
- **Signing/policy**: Server SDK, 2-of-2 MPC; per-wallet "spending limits, allowlists, and approval rules enforced at the MPC signing layer"; pregenerated wallets (https://blog.getpara.com/comparing-backend-transaction-signing-architectures/, search snippets) [REPORTED].
- **SDKs**: `@getpara/react-native-wallet` 3.20.0, `getpara/swift-sdk` [VERIFIED]; Flutter [REPORTED].
- **Price**: free 1,200 MAU; Starter $200 (Server SDK & permissions start here); Growth $500; Scale $1,000 (https://www.getpara.com/pricing) [VERIFIED].

### Magic
- **Arc**: custom node `rpcUrl` + `chainId` (search snippet of Magic docs) [REPORTED]; no Arc artefact in `magic-sdk@33.13.0` [VERIFIED].
- **Server wallets**: "API Wallets" with AWS Nitro TEE [REPORTED, search snippet]. Policy engine: [UNKNOWN].
- **SDKs**: `@magic-sdk/react-native-expo` 34.12.0; `magiclabs/magic-ios` last push 2026-07-06; `magiclabs/magic-android` last push **2024-12-06** (possibly stale) [VERIFIED].
- **Price**: MAU model [REPORTED]; numbers not fetched [UNKNOWN].

### Openfort
- **Arc**: not in supported chains ("Arbitrum Nova, Arbitrum One, Avalanche, Base, Beam, BNB, Ethereum, Optimism, and Polygon POS") (https://www.openfort.io/docs/development/chains) [VERIFIED].
- Backend wallets, offchain policy engine + onchain session keys (ERC-4337/7702) [REPORTED, openfort.io blog snippets]. Not usable on Arc without their contracts/bundler [INFERENCE].

### Biconomy (Nexus + MEE + Smart Sessions)
- **Arc**: docs list "Arc Testnet | 2.2.1, 2.1.0" (MEE versions); Arc mainnet not listed (https://docs.biconomy.io/contracts-and-audits/supported-chains) [VERIFIED]. Nexus 1.2.0 factory `0x0000006648ED9B2B842552BE63Af870bC74af837` and impl `0x00000000383e8cBe298514674Ea60Ee1d1de50ac`: testnet 2,954 / 23,452 bytes, **mainnet 0** [VERIFIED].
- Prior live test (arc-agent, 2026-07-29): session grant/use/deny-in-simulation/revoke on Arc Testnet with MEE 2.1.0 + Nexus 1.2.0; MEE 2.2.1 + Nexus 1.3.1 failed `Invalid signature` (`context/07-prior-work/arc-agent-lessons.md` items 31–35) [VERIFIED as prior evidence, not re-run].
- Legacy bundler URL probe returned empty body for both chains [VERIFIED; inconclusive].

### ZeroDev (Kernel)
- **Arc**: docs list "Arc Mainnet | 5042" and "Arc Testnet | 5042002" (https://docs.zerodev.app/sdk/faqs/chains) [VERIFIED]. Kernel v3.1 impl `0xBAC849bB641841b44E965fB01A4Bf5F074f84b4D` (22,784 B), factory `0xaac5D4240AF87249B3f71BC8E4A2cae074A3E419`, meta-factory `0xd703aaE7…42d5`, Kernel v3.0 impl: code on **both** networks [VERIFIED]. Bundler v3 endpoint: testnet with a dummy project id returned `["0x0000000071727De22E5E9d8BAf0edAc6f37da032"]`; mainnet returned `Could not retrieve user plan.` (needs a real project) [VERIFIED].
- Permissions policies CallPolicy v0.0.5, RateLimitPolicy (no reset), TimestampPolicy, GasPolicy, SudoPolicy and the ECDSA signer have code on **both** networks on 2026-09-29; `SpendingLimitHook v0.7` has **0** on both (`.firecrawl/product/03-wallets/getcode-policies-2026-09-29.tsv`, `getcode-2026-09-29.tsv`; see `delegation-session-keys-limits.md` §2b) [VERIFIED].
- `@zerodev/sdk@5.5.10` constants contain no Arc ID (chain-agnostic) [VERIFIED].

### Safe
- **Arc**: Safe config service returns chain 5042 "Arc" (tx service `https://api.safe.global/tx-service/arc`) and 5042002 "Arc Testnet" (`…/tx-service/arc-testnet`) [VERIFIED]. `@safe-global/safe-deployments@1.37.63` marks v1.3.0/1.4.1/1.5.0 as `canonical` on both; `@safe-global/protocol-kit@8.0.7` has shortNames `arc` and `arc-testnet` [VERIFIED].
- Bytecode on both networks [VERIFIED]: Safe 1.4.1 singleton `0x41675C09…461a` (23,579 B), SafeL2 1.4.1, ProxyFactory 1.4.1, Safe 1.5.0; **Safe4337Module v0.3.0** `0x75cf11467937ce3F2f357CE24ffc3DBF8fD5c226` (8,373 B) and SafeModuleSetup `0x2dd68b00…5b47`; **AllowanceModule v0.1.1** `0xAA46724893dedD72658219405185Fb0Fc91e091C` (14,908 B; spending allowances per delegate/token with reset period) — v0.1.0 address has 0. Safe7579 adapter `0x7579EE83…0002`: **0 on both** (so Rhinestone ERC-7579 modules on Safe are not available at the canonical adapter) [VERIFIED].

### Rhinestone (Smart Sessions, orchestrator)
- Orchestrator chain catalog lists **5042 "Arc"** (USDC `0x3600…` as supported/wrapped token), not 5042002 [VERIFIED]. Smart Sessions module `0x00000000008bDABA73cD9815d79069c247Eb4bDA`: testnet 23,608 B, **mainnet 0** [VERIFIED]. `@rhinestone/sdk@2.16.4` has no Arc string (runtime catalog) [VERIFIED]. Whether a newer Smart Sessions deployment exists on mainnet at another address: [UNKNOWN].

### MetaMask Delegation Framework / Smart Accounts Kit (for ERC-7710 delegations)
- `@metamask/delegation-deployments@2.0.0` maps `arcTestnet: 5042002 → DEPLOYMENTS_1_3_0`; no 5042 [VERIFIED]. Bytecode of v1.3.0 on **both** networks: DelegationManager `0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3` (11,503 B), EIP7702StatelessDeleGator `0x63c0c19a…E32B`, HybridDeleGator `0x48dBe696…FEC4`, ERC20PeriodTransferEnforcer `0x474e3Ae7…139aB`, ERC20TransferAmountEnforcer `0xf100b081…D2Fc` [VERIFIED]. PR "feat: add arc mainnet" merged 2026-09-28 in MetaMask/smart-accounts-kit#304, but latest published `@metamask/smart-accounts-kit` is 2.0.0 (2026-08-13), so mainnet needs a manual environment override until a release [VERIFIED/INFERENCE].

### Bundlers and paymasters (probe results)
| Provider | Arc mainnet 5042 | Arc testnet 5042002 | Evidence |
|---|---|---|---|
| Pimlico (public, no key) | `eth_supportedEntryPoints` → v0.6 `0x5FF1…2789`, v0.7 `0x0000…a032`, v0.8 `0x4337084D…f108`, v0.9 `0x43370900…D009`; `eth_chainId` 0x13b2; gas price returned | same four EPs; `eth_chainId` 0x4cef52 | [VERIFIED]; control chain 99999991 → "not supported" |
| Pimlico ERC-20 paymaster | `pimlico_getSupportedTokens` → `[]` (public endpoint) | not probed | [VERIFIED]; sponsorship needs API key [UNKNOWN] |
| Alchemy | Bundler, Gas Sponsorship, ERC-20 gas, BSOs ✅ | same ✅ | https://www.alchemy.com/docs/wallets/supported-chains; alchemyplatform/docs#1622 [VERIFIED docs]; `demo` key probe empty [inconclusive]. `@account-kit/infra@4.88.5` exports no Arc chain [VERIFIED] |
| ZeroDev | endpoint requires project ("Could not retrieve user plan.") | returned EP v0.7 | [VERIFIED] |
| Biconomy | not listed | MEE 2.1.0/2.2.1 | docs [VERIFIED] |
| thirdweb | host exists, needs client id | same | [VERIFIED endpoint only] |
| Etherspot | needs API key | needs API key | [UNKNOWN support] |
| Candide (public) | "public endpoint doesn't support this network" | same | [VERIFIED for public endpoint] |
| Gelato | empty response | empty response | [UNKNOWN] |
| Coinbase CDP paymaster | not in managed network enum | same | [VERIFIED npm] |

### WalletConnect / Reown AppKit and external mobile wallets
- `@reown/appkit@1.8.24` `networks` export is `export * from 'viem/chains'` with peer `viem >=2.55.13`; viem 2.55.13 exports `arc` and `arcTestnet` → `import { arc, arcTestnet } from '@reown/appkit/networks'` resolves [VERIFIED, npm tarballs]. `@reown/appkit-react-native` 2.0.6, `reown-swift`, `reown-kotlin` active 2026-09-25 [VERIFIED].
- Mobile wallets: add-network guides for MetaMask, Coinbase Wallet (Settings → Networks → Add custom network), Rainbow, Trust, Rabby (datawallet.com, trustswap.com, airdropalert.com) [REPORTED]. Whether each wallet honours `wallet_addEthereumChain` for 5042 over WalletConnect on mobile was not tested [UNKNOWN].

## 3. Comparison table

| Provider | Arc mainnet | Arc testnet | Custom EVM | Custody | Background/agent signing | Built-in limits | Mobile SDKs | Free tier |
|---|---|---|---|---|---|---|---|---|
| Privy | SDK chain def [V] | SDK chain def [V] | yes [R] | enclave, key never seen by signer [V] | Signers: offline/recurring [V] | Policy engine, default deny; value, allow/deny lists, calldata [V]; cumulative [U] | RN (Expo), iOS [V]; Android [U] | 499 MAU, 50K sigs [V] |
| Dynamic | "Arc compatible" [V] (net unsplit) | same | dashboard [R] | TSS-MPC, device + TEE share [V] | Delegated Access, **Enterprise** for prod [V] | thin [U] | RN, Flutter, Swift, Kotlin, Unity [R] | 1,000 MAU [V] |
| Turnkey | docs page + API enum [V] | same [V] | curve-level [V] | TEE [R] | backend API-key user under policy [R] | Policy engine: to/value/calldata/712, quorum [V]; budgets [U] | RN, Swift, Kotlin [V] | 25 sigs/mo [V] |
| CDP | sign-only, own RPC [I] | sign-only [I] | EOAs any EVM [R] | TEE [V] | time-bound delegation [V] | policies, but network enum lacks Arc [V] | React, RN [V] | free, no business verification [V] |
| Crossmint | listed [V] | listed [V] | — | ERC-4337 SCW; device/passkey/server/KMS signers [V] | server signers [V] | onchain limits [R] | RN [V] | 1,000 MAW [V] |
| thirdweb | chain API [V] | chain API + SDK export [V] | yes | in-app / server wallets | 7702 session keys [R] (Arc delegate [U]) | session-key permissions [R] | RN, .NET/Unity [R] | 1,000 MAW [V] |
| Web3Auth | custom [R] | custom [R] | yes [R] | MPC (Enterprise) [V] | [U] | [U] | RN, Swift, Android [V] | 1,000 MAW [V] |
| Para | [U] | [U] | [U] | 2-of-2 MPC [R] | Server SDK (Starter+) [V] | MPC-layer limits/allowlists [R] | RN, Swift [V] | 1,200 MAU [V] |
| Magic | custom node [R] | custom node [R] | yes [R] | TEE API wallets [R] | [U] | [U] | RN, iOS; Android stale [V] | [U] |
| Openfort | not listed [V] | not listed [V] | — | — | backend wallets [R] | policies + session keys [R] | RN [V] | — |
| Biconomy | **no** (0 bytes) [V] | yes, tested Jul 2026 [V] | — | SCA (Nexus) | Smart Sessions [V] | onchain session policies [V] | web/TS | — |
| ZeroDev | docs + bytecode [V] | docs + bytecode + bundler [V] | on request | Kernel SCA | session keys/permissions | CallPolicy/RateLimit/Timestamp [V both nets, 2026-09-29]; SpendingLimitHook 0 B | TS | — |
| Safe | config svc + bytecode [V] | same [V] | — | multisig SCA | 4337 module; AllowanceModule delegates [V] | AllowanceModule (per-token, reset period) [V code] | TS | free contracts |
| Rhinestone | orchestrator yes; Smart Sessions **0 B** [V] | Smart Sessions code [V]; not in orchestrator | — | ERC-7579 modules | Smart Sessions | per-session policies | TS | — |
| MetaMask DF v1.3.0 | bytecode [V]; SDK release lacks it | bytecode + SDK constant [V] | — | 7702/Hybrid DeleGator | ERC-7710 delegations | caveat enforcers (period/amount) [V code] | TS | — |
| Pimlico | public bundler EP 0.6–0.9 [V] | same [V] | — | — | — | — | — | public endpoint free (rate-limited [U]) |
| Alchemy | Bundler + Gas Mgr docs [V] | same [V] | — | Light/Modular Account | — | — | RN [R] | [U] |
| Reown AppKit | via viem `arc` [V] | via viem `arcTestnet` [V] | yes | external wallet | no (user signs) | none | RN, Swift, Kotlin [V] | — |

[V]=VERIFIED, [R]=REPORTED, [I]=INFERENCE, [U]=UNKNOWN.

## 4. Gaps

1. No grant/use/deny test was run on **Arc mainnet** for any session or delegation system (ZeroDev, Safe AllowanceModule, MetaMask enforcers). Bytecode presence ≠ working flow.
2. Privy: Arc not named in the chain-tier doc; managed send/gas sponsorship on Arc unconfirmed; no daily/cumulative budget rule seen.
3. Dynamic: mainnet vs testnet split and whether policies bind delegated signing are undocumented on the pages read; production delegation is Enterprise-only.
4. Turnkey: delegated-access doc page 404'd; budget-style (rolling-window) policy conditions not confirmed.
5. Crossmint: its ERC-4337 wallet factory/bundler on Arc not checked onchain; SDK Arc Testnet native `decimals:6` looks wrong.
6. thirdweb: 7702 delegate contract and bundler on Arc unverified (needs client id).
7. Pimlico: paymaster sponsorship and rate limits on Arc not tested (needs API key); public ERC-20 token list empty.
8. Rhinestone Smart Sessions and Biconomy Nexus absent on mainnet at their testnet addresses; a different mainnet deployment was not searched.
9. Para, Magic, Web3Auth: no Arc-specific artefact; custom-chain behaviour on mobile SDKs untested.
10. External mobile wallets adding 5042 via WalletConnect: only secondary guides; not tested.
11. KYC: none of the pages read requires end-user KYC; CDP explicitly says business verification not required. Provider-side AML (Crossmint) exists. Regulatory posture for a custodial-like server-signing design was not researched.
