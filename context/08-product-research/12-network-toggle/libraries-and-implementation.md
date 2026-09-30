# Implementing a per-network app state: libraries, versions and hard facts

Purpose: the facts that shape how a mainnet ↔ testnet toggle is built: which libraries already know Arc, where the network must live, and above all **which credentials and endpoints differ per network**.

Sources (raw under `.firecrawl/product/12/`, abbreviated `E/`):
- `npm view` run 2026-09-29, plus installed packages inspected in a scratch dir: `viem@2.57.0` (`E/viem-2.57.0-arc-chains.js`), `@circle-fin/app-kit@1.15.3` (`E/app-kit-1.15.3-arc-chains.d.ts`, `E/app-kit-1.15.3-README.md`), `@reown/appkit@1.8.24`
- Circle docs dump `.firecrawl/docs/circle-llms-full.txt` (excerpts in `E/circle-api-keys-excerpt.txt`, `E/circle-cpn-mainnet-vs-testnet-excerpt.txt`)
- Live API checks: `E/relay-*-chains.json`, `E/across-*-routes.json`, `E/lifi-chains.json`, `E/rpc-chainid-checks.txt`
- Library docs: wagmi (`useSwitchChain`, `createConfig`), Reown AppKit options, TanStack Query keys (`E/tanstack-query-keys.md`), Zustand persist (`E/zustand-persist.md`), Jotai storage (`E/jotai-storage.mdx`), Expo SecureStore / env vars / app variants (`E/expo-*.mdx`), react-native-mmkv README (`E/mmkv-readme.md`)
- Rainbow extension source (`E/rainbow-src/`); Arc app PRs (`E/arc-apps/`)
- In-repo: `../02-defi-bridge-trade/README.md`, `../01-arc-ecosystem-census/README.md`, `../03-wallets-custody-limits/README.md`

Verified: 2026-09-29

## 1. The facts that decide the architecture

1. **Circle API keys are per environment. There is no single key for both networks.** [VERIFIED]
   - "Keys prefixed `TEST_API_KEY` authenticate testnet requests. Keys prefixed `LIVE_API_KEY` authenticate mainnet requests." (`circle-llms-full.txt:44878-44879`, CPN page)
   - "API keys are specific to one environment. Create one API key for testnet and another for mainnet, and switch the credential…" (`:8360-8363`, api-reference/keys)
   - "The `blockchain` value in a request must match your API key's environment. A mainnet identifier with a testnet key, or the reverse, is rejected with a validation error." (`:44889-44891`)
   - Gateway webhooks: "Use `TEST` for testnet. Use `LIVE` for mainnet. You can create both from the same Circle Developer Console account." (`:81403-81405`)
   - The only cross-environment credential, the **kit key**, is legacy: "You can no longer create kit keys… Kit keys provide a single credential that works across both testnet and mainnet" (`:8398-8410`).
   - A search snippet from a now-404 Circle page said "Server wallets created with a testnet key will not work on the mainnet, and vice versa." [REPORTED] (`E/_evidence-notes.txt`)
   - **Consequence [INFERENCE]:** our backend holds **two Circle credentials**, and every Circle call picks its key from the request's network. Wallets, users and wallet sets created under the TEST key are separate records from those under the LIVE key. The app therefore has **two Circle identities per user**, and "switching network" means switching which one is active, not re-pointing one wallet.
2. **Circle blockchain identifiers differ per network**: `ARC` vs `ARC-TESTNET` (`circle-llms-full.txt:1116`, Agent Wallets supported-blockchains). Circle recommends chain-specific wallets (`ARC`, `ARC-TESTNET`) over generic `EVM`/`EVM-TESTNET` ones (`:47481-47484`) [VERIFIED].
3. **Same address, separate state.** "An OFI can reuse the same wallet address across environments, but its balance and transaction history are tracked separately per network." (CPN, `:44894-44896`) On Arc, USDC has the **same address on both networks**: `0x3600000000000000000000000000000000000000` in App Kit's `Arc` and `ArcTestnet` definitions (`E/app-kit-1.15.3-arc-chains.d.ts`). So an address or token contract **cannot** tell you the network; every record must carry `chainId` [VERIFIED facts; INFERENCE on the rule].
4. **The App Kit API key is server-only and environment-bound.** "The API key is a server-only secret — supplying it from a browser throws." Format: `<ENV>_API_KEY:<keyId>:<keySecret>` (`E/app-kit-1.15.3-README.md:488-503`) [VERIFIED].
5. **Third-party providers split differently** [VERIFIED live, 2026-09-29]:

| Provider | Mainnet | Testnet | Arc testnet (5042002)? |
|---|---|---|---|
| LI.FI | `https://li.quest/v1` | **Same host**; chains carry `mainnet: false` | Listed (`mainnet:false`); `/v1/tokens?chains=5042002` returns USDC (`E/lifi-chains.json`) |
| Relay | `https://api.relay.link` (60 chains, includes 5042) | `https://api.testnets.relay.link` | **No.** The testnets API lists only 84532 and 11155111 (`E/relay-testnets-chains.json`) |
| Across | `https://app.across.to/api` (5042 present) | `https://testnet.across.to/api` | **No** Arc routes (125 routes, none with 5042002) (`E/across-testnet-routes.json`) |
| Circle (Wallets, App Kit service, Gateway) | `api.circle.com` + LIVE key | `api.circle.com` + TEST key | Yes |
| Circle Earn explore | `api.circle.com/v1/earnKit/vaults/explore` (keyless) | same host; requires a chain param | 2 mock vaults (`../02-defi-bridge-trade/README.md:31`) |
| Arc RPC | `https://rpc.mainnet.arc.io` → `0x13b2` | `https://rpc.testnet.arc.io` and `https://rpc.testnet.arc.network` → `0x4cef52` | (`E/rpc-chainid-checks.txt`) |

   So the pattern varies: **Circle = same host, different key; Relay/Across = different host; LI.FI = same host, chain id decides.** A per-network *provider config* object is required. One "base URL" switch is not enough [INFERENCE].
6. **Network-only capabilities** (existing evidence; see the capability table in `recommendation.md` §5):
   - **Mainnet-only:** x402 catalogue listings (687 vs 0, `../01-arc-ecosystem-census/README.md:41`); meme/launchpad tokens, Relay/Across and other third-party bridges, Chainlink feeds, GoPlus (`../02-defi-bridge-trade/README.md:24,34-38`); Circle Agent Wallet policy enforcement (`../03-wallets-custody-limits/README.md:25`); Coinbase Smart Wallet (`:30`).
   - **Testnet-only:** faucets (`circle wallet fund`, faucet.circle.com; `../FEATURE-INVENTORY.md:21`); mock Earn vaults; Rhinestone Smart Sessions and Biconomy Nexus (`../03-wallets-custody-limits/README.md:30`).
   
   [VERIFIED in those files]

## 2. Chain definitions

| Library | Version (npm, 2026-09-29) | Arc support | Evidence |
|---|---|---|---|
| **viem** | `2.57.0` | **Yes**: `import { arc, arcTestnet } from 'viem/chains'`. `arc` = id 5042, RPCs `rpc.mainnet.arc.io` (+ blockdaemon, drpc, quicknode), explorer `explorer.arc.io`, **no `testnet` flag**. `arcTestnet` = id 5042002, RPC `rpc.testnet.arc.network` (+ quicknode, blockdaemon, websockets), explorer `testnet.arcscan.app`, `testnet: true`. Both have native USDC with 18 decimals and multicall3 | `E/viem-2.57.0-arc-chains.js` [VERIFIED] |
| **@circle-fin/app-kit** | `1.15.3` | Chain enum `Blockchain.Arc = "Arc"` / `Blockchain.Arc_Testnet = "Arc_Testnet"`; chain objects have `isTestnet`, `chainId`, `usdcAddress`, `eurcAddress` (they differ per network), CCTP domain 26, and separate kit, CCTP and Gateway contract addresses per network. The swap, earn, bridge, unified-balance and onramp kits all reference `Arc_Testnet` | `E/app-kit-1.15.3-arc-chains.d.ts` [VERIFIED] |
| **Circle Wallets API** | `@circle-fin/user-controlled-wallets@10.8.1`, `@circle-fin/developer-controlled-wallets@10.8.1` | `blockchain: "ARC"` / `"ARC-TESTNET"` | [VERIFIED] names; versions via npm |
| **@reown/appkit** | `1.8.24` (`@reown/appkit-react-native@2.0.6`) | `@reown/appkit/networks` does `export * from 'viem/chains'`, so `arc` and `arcTestnet` are available | installed source `dist/esm/src/networks/index.js` [VERIFIED] |
| **wagmi** | `3.7.7` | Uses viem chains | npm [VERIFIED] |

Note the RPC mismatch: Arc docs give `rpc.testnet.arc.io`, while viem and App Kit use `rpc.testnet.arc.network`. Both answered chain id `0x4cef52` today [VERIFIED]. Pin RPCs in our own config rather than relying on library defaults [INFERENCE].

## 3. Client libraries for the switch

- **wagmi `useSwitchChain`**: "When connected, `switchChain` will switch the target chain for the connector. When not connected, `switchChain` will switch the target chain for the Wagmi Config." `createConfig` takes `chains` and `transports`, "Mapping of chain IDs to Transports" (wagmi.sh) [VERIFIED]. **Relevance [INFERENCE]:** only if we support **external wallets** (desktop MetaMask/Rabby). An injected wallet can **refuse** the switch (MetaMask `4001`), so the app's network must be *our* state, with the wallet's chain checked against it. Agari's lesson: "Our embedded wallet should own the network switch" (`../10-reference-flows/agari.md:264`).
- **Reown AppKit options:**
  - `networks`, `defaultNetwork`
  - `enableNetworkSwitch` ("Enables or disables the network switching functionality in the modal. The default is `true`")
  - `allowUnsupportedChain`
  
  The `useAppKitNetwork()` hook returns `chainId`, `caipNetwork` and `switchNetwork(network)` (installed types `TypeUtil.d.ts:1223-1230`) [VERIFIED]. **Relevance [INFERENCE]:** set `networks: [arc, arcTestnet]` and consider `enableNetworkSwitch: false`, so the wallet modal can't change the network behind the app's toggle.
- **TanStack Query** (`@tanstack/react-query@5.104.0`): "If your query function depends on a variable, include it in your query key… any time a variable changes, queries will be refetched automatically" (`E/tanstack-query-keys.md:77-94`) [VERIFIED]. Rainbow does exactly this with `testnetMode` in its asset key (`E/rainbow-src/userAssets.ts:100`). **Pattern [INFERENCE]:** every chain-reading query key starts with `['net', chainId, …]`. Switching back is then instant from cache: dark-mode-fast, with no refetch flash inside `staleTime`.
- **Persisted setting (the "theme store")**:
  - Jotai `3.0.0`: the canonical `atomWithStorage` example **is** `atomWithStorage('darkMode', false)`. It supports `AsyncStorage` on React Native. Without `getOnInit: true`, an SPA "will always get the initial value instead of the stored value on initialization" (`E/jotai-storage.mdx:15,29,46`) [VERIFIED].
  - Zustand `5.0.15`: `persist` + `createJSONStorage(() => AsyncStorage)`. With async storage, "the store will **not** be hydrated at the initial render"; `persist.hasHydrated()` / `onRehydrateStorage` exist for that (`E/zustand-persist.md:98,396-405,474-506`) [VERIFIED].
  - Rainbow's own store is a persisted boolean `testnetMode` (`E/rainbow-src/testnetMode.ts`) [VERIFIED].
  - **Safety rule [INFERENCE]:** never render balances or allow a write until the network setting has hydrated. Async hydration would otherwise briefly show the default network (Zustand's docs give the same "thinks the user is not logged in" example).
- **Storage choice:**
  - `expo-secure-store@57.0.4` lists platforms android/ios/tvos/expo-go (**no web**), and warns that "some iOS releases refused values above roughly 2048 bytes" (`E/expo-securestore.mdx:7,21`) [VERIFIED]. A network preference is **not a secret**, so it doesn't belong there [INFERENCE].
  - Use `@react-native-async-storage/async-storage@3.1.1` or `react-native-mmkv@4.3.2`. MMKV has "Fully synchronous calls" and "iOS, Android and Web support", which avoids the hydration gap (`E/mmkv-readme.md:39,46`) [VERIFIED]. On web, `localStorage` is synchronous.
  - **Source of truth [INFERENCE]:** the device keeps the last choice for instant startup, but the **server session** holds the active network. The agent, automations and Telegram must agree with it; see §5.
- **Expo "environment switcher" patterns** (versions: `expo@57.0.26`, `expo-updates@57.0.24`):
  - **Build-time:** `EXPO_PUBLIC_*` env vars "will be visible in plain-text in your compiled application" (`E/expo-env-vars.mdx:41`). **App variants** (`APP_VARIANT`) give separate bundle IDs "to run them side by side on one device" (`E/expo-app-variants.mdx:19-24`) [VERIFIED].
  - These are *build* switches for dev/preview/prod, **not** a runtime user toggle. No official Expo runtime environment switcher was found [UNKNOWN beyond these docs]. So the runtime toggle is app state, and all secrets (the TEST/LIVE Circle keys) stay on the server [INFERENCE].

## 4. Lessons from Arc apps that already did this (third-party PRs) [VERIFIED as PR text]

- **One switch, no derived defaults, fail toward testnet.** Splitsy: "the switch has a default — absent means testnet… nothing derived from the switch has a default at all… Only the exact string `mainnet` selects mainnet." The bug it fixed was a testnet fallback rendered "as real money" (`E/arc-apps/qFloppa_Splitsy_12.json`).
- **Gate every read path.** Kaleido: one ungated hook leaked testnet balances into the mainnet portfolio (`E/arc-apps/kaleidofinance_Kaleido-os_220.json`).
- **Don't over-separate UI state.** Nest split its room selection per network, then merged it back into "one shared UI selection" while keeping on-chain data separate (`E/arc-apps/sigmaserene1_Nest_14.json`, `_15.json`).
- **Hard-lock cross-network routes.** Nest locked testnet CCTP/Gateway flows while mainnet was selected, "so real USDC can never hit sandbox/testnet routes".

## 5. A network-agnostic tool and capability layer [INFERENCE, grounded in §1–4]

```ts
// One module (Splitsy lesson). No other file reads env vars or hard-codes chain values.
type NetworkId = 'mainnet' | 'testnet';
interface NetworkContext {
  id: NetworkId;
  chainId: 5042 | 5042002;
  viemChain: Chain;                    // viem/chains arc | arcTestnet
  appKitChain: 'Arc' | 'Arc_Testnet';
  circleBlockchain: 'ARC' | 'ARC-TESTNET';
  circleKeyRef: 'CIRCLE_LIVE' | 'CIRCLE_TEST';  // server-side secret name, never the value
  rpc: string[];                       // pinned (rpc.mainnet.arc.io / rpc.testnet.arc.io)
  providers: { lifi: {base:'https://li.quest/v1'}, relay?: {base:string}, across?: {base:string} };
  tokens: { usdc: Address; eurc: Address };      // from App Kit chain defs
}
const NETWORKS: Record<NetworkId, NetworkContext> = { /* exactly two literals */ };
```

- **The model never chooses the network.** The server resolves `NetworkContext` from the authenticated session (the toggle). It injects the context into every tool call and states it in the system prompt ("Active network: Arc Testnet (no real money)"). Tool schemas have **no** `network` parameter, so a prompt-injected "do it on mainnet" has nothing to set. This is consistent with C2 in `../00-SYNTHESIS.md` §3.
- **The capability registry is data, keyed by network**, per C3 in the synthesis:
  ```ts
  { id: 'meme.buy', networks: { mainnet: {status:'available', providers:['kyberswap','lifi']},
                                testnet: {status:'unavailable', reason:'NO_MEME_TOKENS', availableOn:'mainnet'} },
    preconditions: [...], risk: 'high' }
  ```
  One registry feeds four consumers: (a) the tool list given to the model; (b) the capabilities summary in the prompt, *including* unavailable items with reasons, so the agent can explain rather than guess; (c) UI buttons (disabled with the reason); (d) the user-facing availability matrix (NEW-G17, `../10-reference-flows/agari.md:234`).
- **Everything stored carries `network`** (drafts, intents, receipts, automations, grants, alert rules, cached balances). Execution re-checks `intent.network === session.network === wallet.environment === rpc eth_chainId` before signing. A mismatch is a hard error, never a silent re-route.
- **Two Circle identities per user**, created lazily. The testnet identity can be made instantly (guest demo, NEW-G1). The mainnet identity is created on the first switch to mainnet.

## 6. Gaps
- Whether one Circle user-controlled-wallet *user* can span both environments: the docs imply not (keys and app IDs are environment-scoped), but no explicit Wallets-product statement was found. The one explicit line is [REPORTED] from a removed page. **Test on day 1 with both keys.**
- Whether the Circle RN SDK / web SDK `appId` is per environment: [UNKNOWN] (`GET /config/entity` returns it per key, `circle-llms-full.txt:9769`, which suggests it is).
- Relay and Across testnet coverage could change. Treat their testnet status as a registry value refreshed from `/chains` and `available-routes`, not hard-coded.
- Context7 was not used. All docs were fetched directly or read from installed packages.
