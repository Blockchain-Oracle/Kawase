# Account-abstraction infrastructure on Arc: EntryPoints, bundlers, paymasters, account factories (verified)

Purpose: what ERC-4337 / EIP-7702 plumbing is live on Arc mainnet (5042) and testnet (5042002), checked on chain, so an architecture choice does not rest on a logo wall.

Sources:
- Live RPC, 2026-09-29, `https://rpc.mainnet.arc.io` (block 23,293,959) and `https://rpc.testnet.arc.io` (block 64,533,868): `.firecrawl/product/03-wallets/getcode-2026-09-29.tsv`, `getcode-biconomy-2026-09-29.tsv`, `getcode-policies-2026-09-29.tsv`, `getcode-extra-2026-09-29.txt`, `codehash-compare.tsv` (compared with Base mainnet `https://mainnet.base.org`), `gasstation-deposits.txt`, `p256-precompile-check.txt`
- Bundler probes: `.firecrawl/product/03-wallets/bundler-probes.txt`, `pimlico-control.txt` (made by the sibling research task for `third-party-wallet-infra.md`)
- Arc docs: https://docs.arc.io/arc/tools/account-abstraction, https://docs.arc.io/integrate/relayers-and-paymasters, https://docs.arc.io/integrate/relayers-and-paymasters/deploy-a-paymaster, https://docs.arc.io/arc/references/evm-differences (all in `.firecrawl/docs/arc-llms-full.txt` l.18295-18395, 19036-19120, 39886-40040)
- Circle: `context/03-circle-platform/paymaster.md`, `circle-wallet-options.md` (this folder)
- Address provenance: EntryPoint addresses from the Arc docs (v0.7) and the Pimlico `eth_supportedEntryPoints` response (v0.6–v0.9); account/module addresses from the npm packages named in `delegation-session-keys-limits.md`

Verified: 2026-09-29

---

## 1. Chain-level facts

| Fact | Mainnet | Testnet | Source |
|---|---|---|---|
| Osaka baseline incl. **EIP-7702** set-code txs | yes (docs) | yes (docs) | Arc EVM differences; relayers page: "EIP-7702 set-code transactions work on Arc" [VERIFIED docs; no 7702 tx sent] |
| **P256VERIFY precompile `0x100`** (EIP-7951) | works | works | valid sig → `0x…01`, tampered → `0x` [VERIFIED] |
| Gas token | native USDC, 18 dec | same | Arc docs |
| Paymaster deposits are native USDC, 18-decimal ("10 USDC deposit requires `10 * 10^18`") | yes | yes | deploy-a-paymaster [VERIFIED docs] |
| Min base fee 20 gwei; own bundlers must set `maxFeePerGas` ≥ 20 gwei | stated for testnet | yes | deploy-a-paymaster note [VERIFIED docs] |
| "Stablecoin Services" (protocol paymaster sponsorship, multi-stablecoin gas) | **Planned** | Planned | Arc docs [VERIFIED docs] |
| Blob txs rejected, `PREVRANDAO` = 0 | yes | yes | EVM differences |

## 2. EntryPoints and deterministic deployers (bytecode size)

| Contract | Address | Mainnet | Testnet | Same code as Base? |
|---|---|---|---|---|
| EntryPoint v0.6 | `0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789` | 23,689 | 23,689 | yes |
| EntryPoint v0.7 | `0x0000000071727De22E5E9d8BAf0edAc6f37da032` | 16,035 | 16,035 | yes |
| EntryPoint v0.8 | `0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108` | 21,738 | 21,738 | differs (v0.8 embeds an EIP-712 domain with chain id [INFERENCE]) |
| EntryPoint v0.9 | `0x433709009B8330FDa32311DF1C2AFA402eD8D009` | 22,425 | 22,425 | differs (same reason [INFERENCE]) |
| Arachnid CREATE2 deployer | `0x4e59b44847b379578588920cA78FbF26c0B4956C` | 69 | 69 | yes |
| Safe singleton factory | `0x914d7Fec6aaC8cd542e72Bca78B30650d45643d7` | 69 | 69 | yes |
| Multicall3 | `0xcA11bde05977b3631167028862bE2a173976CA11` | 3,808 | 3,808 | yes |

All four EntryPoints are present on both networks [VERIFIED]. The deterministic deployers mean any team can deploy missing canonical modules (e.g. Rhinestone Smart Sessions on mainnet) at their usual addresses [INFERENCE].

## 3. Bundlers

| Provider | Mainnet 5042 | Testnet 5042002 | Evidence |
|---|---|---|---|
| **Pimlico public** `https://public.pimlico.io/v2/<chainId>/rpc` | **live**: `eth_supportedEntryPoints` returns v0.6, v0.7, v0.8, v0.9; `eth_chainId` `0x13b2`; `pimlico_getUserOperationGasPrice` returns quotes | **live**: same four EntryPoints, `eth_chainId` `0x4cef52` | `bundler-probes.txt`, `pimlico-control.txt`. Negative control chain `99999991` → "chain … is not supported" [VERIFIED] |
| Pimlico keyed `api.pimlico.io` | needs API key (401 without) | same | [VERIFIED endpoint exists; not used] |
| Arc docs | "Configured Pimlico as your bundler for Arc testnet" and "Pimlico configured for Arc handles this automatically" | | deploy-a-paymaster [VERIFIED docs] |
| Circle (modular wallets transport `…/arcTestnet`, Gas Station) | Circle-hosted bundler behind Circle Wallets / modular SDK | same | `circle-wallet-options.md` §2 [VERIFIED docs]; not probed directly |
| Alchemy | Bundler + Gas Sponsorship listed | listed | https://www.alchemy.com/docs/wallets/supported-chains [VERIFIED docs]; keyless probe inconclusive |
| ZeroDev | endpoint exists, needs a real project ("Could not retrieve user plan.") | returned EP v0.7 with a dummy project id | `zerodev-probe.txt` [VERIFIED]; ZeroDev chain docs list both |
| Biconomy MEE | not listed | Arc Testnet listed (MEE 2.1.0, 2.2.1) | docs.biconomy.io supported-chains [VERIFIED docs] |
| Thirdweb, Etherspot | endpoints exist, need client id / API key | same | [UNKNOWN] whether Arc is served |
| Candide public, Gelato | Candide: "public endpoint doesn't support this network"; Gelato: empty response | same | [VERIFIED negative / inconclusive] |

Also, **you may not need a bundler**. ERC-7710 delegations are redeemable by an EOA sending a normal transaction to the DelegationManager (`erc-7715.md:309`). EIP-3009 `transferWithAuthorization` relayers are an Arc-documented gasless path (`docs.arc.io/integrate/relayers-and-paymasters`). EIP-7702 accounts can self-submit. [VERIFIED docs; INFERENCE for the product fit]

## 4. Paymasters

| Paymaster | Mainnet | Testnet | Notes |
|---|---|---|---|
| **Circle Gas Station** `0x7ceA357B5AC0639F89F9e378a1f03Aa5005C0a25` (EIP-1967 proxy → impl `0x26f77c6455518caf29a5414004c5a2ef441228b1`) | 855 B. **EntryPoint v0.6 deposit ≈ 7,943 USDC.** v0.7/v0.8 deposits are 0. | 855 B. **v0.6 deposit ≈ 5,845 USDC.** v0.7/v0.8 are 0. | `gasstation-deposits.txt`, storage slot read [VERIFIED]. Only for Circle Wallets SCAs/MSCAs, developer-billed plus 5% (`context/03-circle-platform/paymaster.md`). That it currently funds v0.6 only is an observation of deposits, not a documented limit [INFERENCE]. |
| Circle Paymaster (permissionless USDC token paymaster) v0.7 `0x6C97…71C9` / `0x31BE…0b58`, v0.8 `0x0578…0Ec` / `0x3BA9…8966` | **no code** | **no code** | [VERIFIED]. Matches `paymaster.md`: not on Arc. Of little value on Arc anyway, since gas is already USDC. |
| Biconomy token paymaster `0x00000000301515A5410e0d768aF4f53c416edf19` | no code | no code | [VERIFIED] |
| Pimlico verifying/ERC-20 paymaster | [UNKNOWN] (needs API key; sponsorship policy is account-side) | [UNKNOWN] | see `third-party-wallet-infra.md` |
| Your own paymaster (Arc tutorial) | possible | tutorial targets testnet | deposit native USDC into the EntryPoint [VERIFIED docs] |

On Arc, "gasless" mostly means **"the app pays the USDC gas instead of the user"**. The user already holds the gas asset. A token paymaster adds little. A sponsoring paymaster, or a relayer that pays gas, is what removes the "keep some USDC for fees" edge case. [INFERENCE]

## 5. Smart-account implementations with code on Arc

| Account | Mainnet | Testnet | Passkey owner | Session / delegation support on Arc |
|---|---|---|---|---|
| Circle MSCA (ERC-6900) factory `0x0000000DF7E6…9AdD`, impl `0xA70F…2B62`, WeightedWebAuthnMultisig `0x0000000C984A…73C8`, AddressBook `0x0000000d8108…F3d0` | ✅ | ✅ | ✅ (WebAuthn plugin) | ❌ no Circle session / spend-limit module |
| MetaMask DeleGators v1.3.0 (Hybrid, EIP-7702 Stateless, SimpleFactory) + DelegationManager + enforcers | ✅ | ✅ | ✅ Hybrid (P256/WebAuthn) | ✅ ERC-7710 caveats. The SDK lists testnet only. |
| ZeroDev Kernel v3.1 / v3.3 (+ 7702 target) + CallPolicy, RateLimit, Timestamp, Gas, Sudo | ✅ | ✅ | ✅ via WebAuthn validator [INFERENCE, validator address not checked for ZeroDev's own; Rhinestone WebAuthnValidator present] | ✅ policies. SpendingLimitHook missing. |
| Rhinestone Smart Sessions (7579) | ❌ validator missing (policies present) | ✅ | WebAuthnValidator ✅ | testnet only |
| Biconomy Nexus 1.2.0 / 1.3.1 (MEE 2.1.0 / 2.2.1) | ❌ | ✅ | via 7579 validators | testnet only; newest Nexus (1.3.2/1.3.3, MEE 2.3.0) on neither |
| Safe 1.4.1 + Safe4337Module 0.3.0 | ✅ | ✅ | via modules [not checked] | no native sessions |
| Alchemy Modular Account v2 + LightAccount v2 + MAv2 7702 impl | ✅ | ✅ | [not checked] | [not checked] |
| Coinbase Smart Wallet factories v1/v1.1 | ✅ | ❌ | ✅ (design) | SpendPermissionManager missing on both |

Full address list: `delegation-session-keys-limits.md` §2 and the raw TSVs.

## 6. Caveats

- Bytecode at a canonical address shows deployment. It does not show that a vendor supports or operates the contract, or that the whole flow works on Arc. The only end-to-end AA flow proven on Arc so far is Biconomy Nexus 1.2.0 plus Smart Sessions on **testnet** in July 2026, and the build that relied on it failed overall (`arc-agent-lessons.md` #31-35). **Treat every row as "deployable", not "proven".**
- The public Pimlico endpoint is rate-limited and meant for testing [INFERENCE from the name; see Pimlico docs]. Production needs a keyed plan.
- The EntryPoint choice constrains accounts. Circle MSCA is EP v0.7, Gas Station is funded on v0.6 today, and MetaMask/Kernel support v0.7. Pick one EntryPoint per account family and check that the paymaster you plan to use has a deposit on it.

## Gaps

- No UserOperation was sent on either network, and no 7702 authorization was submitted.
- Alchemy (docs-listed) and ZeroDev (mainnet) bundlers were not exercised with a real key; Thirdweb/Etherspot unknown.
- The Gas Station implementation's EntryPoint binding was not read from code (only deposits).
