# Arc network config and contract addresses

Purpose: every chain ID, RPC, explorer, faucet, and contract address you need to connect to Arc mainnet or testnet. All values are exact.

Sources:
- https://docs.arc.io/arc/references/connect-to-arc
- https://docs.arc.io/arc/references/rpc-endpoints
- https://docs.arc.io/arc/references/contract-addresses
- https://docs.arc.io/arc/tutorials/register-your-first-ai-agent (ERC-8004 testnet)
- https://docs.arc.io/arc/tutorials/create-your-first-erc-8183-job (ERC-8183 testnet)
- https://docs.arc.io/app-kit/tutorials/unified-balance/use-fast-deposits (TokenMessengerWithFees)
- https://docs.arc.io/integrate/relayers-and-paymasters/deploy-a-paymaster (EntryPoint v0.7)
- https://arc-node.thecanteenapp.com (Canteen hackathon RPC), `.firecrawl/arc-node-canteen.html`
- Live checks on 2026-09-29: `eth_chainId`, `eth_getCode`, and `eth_gasPrice` against the public RPCs
- viem 2.56.9 chain definitions (unpkg `viem/_esm/chains/definitions/arc*.js`)

Verified: 2026-09-29

> Docs domain: `docs.arc.io` now 301-redirects to **`docs.arc.io`**. The hackathon page and slides still link `docs.arc.io`. Both work.

## Networks

| | **Arc Mainnet** | **Arc Testnet** |
|---|---|---|
| Chain ID | `5042` (`0x13b2`) | `5042002` (`0x4cef52`) |
| CAIP-2 (x402 `network`) | `eip155:5042` | `eip155:5042002` |
| Native / gas token | USDC (18 decimals native) | USDC (18 decimals native) |
| Primary HTTP RPC (Circle, no key, open CORS) | `https://rpc.mainnet.arc.io` | `https://rpc.testnet.arc.io` |
| Primary WebSocket | none listed | `wss://rpc.testnet.arc.io` |
| Explorer (Blockscout) | https://explorer.arc.io | https://explorer.testnet.arc.io |
| Explorer API (for verification) | `https://explorer.arc.io/api/v2` (viem `apiUrl`) | `https://explorer.testnet.arc.io/api/` |
| Gas tracker | n/a | https://explorer.testnet.arc.io/gas-tracker |
| Faucet | none; the docs say to "request gas USDC through your Circle point of contact", or bridge real USDC in with CCTP | https://faucet.circle.com (USDC and EURC; select "Arc Testnet"; rate-limited) |
| viem import | `import { arc } from "viem/chains"` | `import { arcTestnet } from "viem/chains"` (needs viem ≥ 2.38) |
| Circle Wallets / Agent Wallets blockchain id | `ARC` | `ARC-TESTNET` |
| App Kit chain identifier | `Arc` | `Arc_Testnet` |
| CCTP / Gateway domain | `26` | `26` |
| Gateway API chain name | `arc` | `arcTestnet` |
| Public mainnet launch | 2026-09-16 ([Circle press release](https://www.circle.com/pressroom/circle-launches-arc-mainnet-an-economic-operating-system-for-the-internet)). Block 1 timestamp is 2026-05-15 13:58 UTC, so the chain ran before public launch. | Live. Current block is ~64.5M at 2026-09-29. |
| Node version | `v0.8.0` | `v0.8.0` |

### Third-party RPCs

| Provider | Mainnet HTTP | Mainnet WS | Testnet HTTP | Testnet WS |
|---|---|---|---|---|
| Alchemy | `https://arc-mainnet.g.alchemy.com/v2/<KEY>` | `wss://arc-mainnet.g.alchemy.com/v2/<KEY>` | `https://arc-testnet.g.alchemy.com/v2/<KEY>` (used in App Kit docs) | n/a |
| Blockdaemon | `https://rpc.blockdaemon.mainnet.arc.io` | `wss://rpc.blockdaemon.mainnet.arc.io/websocket` | `https://rpc.blockdaemon.testnet.arc.io` | `wss://rpc.blockdaemon.testnet.arc.io/websocket` (connect-to-arc page shows `:443/websocket`) |
| dRPC | `https://rpc.drpc.mainnet.arc.io` | none | `https://rpc.drpc.testnet.arc.io` | `wss://rpc.drpc.testnet.arc.io` |
| QuickNode | `https://rpc.quicknode.mainnet.arc.io` | `wss://rpc.quicknode.mainnet.arc.io` | `https://rpc.quicknode.testnet.arc.io` | `wss://rpc.quicknode.testnet.arc.io` |
| **Canteen (hackathon)** | none | none | `https://rpc.testnet.arc-node.thecanteenapp.com/v1/<key>` | none |

The Canteen RPC needs a per-developer key: run `uv tool install git+https://github.com/the-canteen-dev/ARC-cli.git`, then `arc-canteen login` (GitHub), then `arc-canteen rpc-url --export`. The same CLI provides `arc-canteen context sync` (docs and sample repos under `~/.arc-canteen/context/`) and `arc-canteen update product|traction` for hackathon progress logging.

On 2026-09-29 every HTTP endpoint above returned the correct chain ID. That includes the legacy `rpc.testnet.arc.io`, `rpc.quicknode.testnet.arc.io`, and `rpc.blockdaemon.testnet.arc.io` hosts that viem's `arcTestnet` still ships as defaults. `explorer.testnet.arc.io` 301-redirects to `explorer.testnet.arc.io`.

### Public RPC limits and errors
- `eth_getLogs` allows at most **10,000 blocks** per call. A larger range returns error `-32012`. Page in chunks of ≤9,999 blocks. At about 2 blocks/s, 10k blocks is roughly 85 minutes of history.
- The primary endpoint is load-balanced. A request pinned to the head block can return `-32014` because that backend hasn't imported the block yet. Back off briefly and retry.
- `eth_subscribe` works over WebSocket only.
- `web3_clientVersion` returns `arc/v1`.

## Chain definitions (copy-paste)

```ts
// viem ships both chains built in:
import { arc, arcTestnet } from "viem/chains";
// Override the transport to use the arc.io hosts (viem's arcTestnet defaults to legacy *.arc.network hosts):
const client = createPublicClient({ chain: arcTestnet, transport: http("https://rpc.testnet.arc.io") });
```

```ts
// Manual definition (bridges/tools that need their own). From docs.arc.io/integrate/infrastructure/bridges
import { defineChain } from "viem";
export const arcTestnet = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.io"], webSocket: ["wss://rpc.testnet.arc.io"] } },
  blockExplorers: { default: { name: "Block Explorer", url: "https://explorer.testnet.arc.io" } },
  contracts: { multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11", blockCreated: 0 } },
  testnet: true,
});
```

Reown AppKit requires `defineChain` from `@reown/appkit/networks` with `caipNetworkId: "eip155:5042002"` and `chainNamespace: "eip155"`. The viem version causes a runtime error there. ConnectKit falls back to `eth.merkle.io` for ENS lookups, which CORS-fails unless you include `mainnet` with a CORS-safe transport. WalletConnect does not have Arc Testnet in its registry, so it issues `wallet_addEthereumChain` on first connect. Source: [connect-to-arc](https://docs.arc.io/arc/references/connect-to-arc).

MetaMask, Rabby, Coinbase Wallet, and Rainbow manual add: name `Arc` / `Arc Testnet`, the RPC above, the chain ID above, symbol `USDC`, and the explorer above. Wallets without custom-gas-token support may label the balance "ETH", but it is USDC.

## Contract addresses

`code` = bytecode size in bytes returned by `eth_getCode` on 2026-09-29. Every documented address below had code.

### Stablecoins and assets

| Asset | Decimals | Mainnet | Testnet |
|---|---|---|---|
| **USDC** (optional ERC-20 view of the native balance) | 6 | `0x3600000000000000000000000000000000000000` | `0x3600000000000000000000000000000000000000` |
| USDC native / gas | 18 | (native balance, `eth_getBalance`) | same |
| **EURC** | 6 | `0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1` | `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a` |
| **USYC** (tokenized T-bill MMF; allowlisted, non-US institutions, $100k min) | 6 | `0x8a5D989Bbb96929F689B0200f435f53dA42bF490` | `0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C` |
| USYC Entitlements | | `0xb69ecb156Dc0028198028c501340d5367845ca72` | `0xcc205224862c7641930c87679e98999d23c26113` |
| USYC Teller (mint/redeem vs USDC) | | `0x51A8CE47dC08ba5CD19c7aa84EA6fD6664f60f9b` | `0x9fdF14c5B14173D74C08Af27AebFf39240dC105A` |
| **cirBTC** (Circle wrapped BTC) | 8 | `0x171A4217b86A807A64eB94757Db6849fb4bDbAA0` | `0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF` |
| **WETH** (bridged, lock on Ethereum, mint on Arc) | 18 | `0x128cC466B61f542da60c70e3aA11c10e19B84EDB` | `0x2c4047028a72803939b6fb674D01bC059B5C4961` |

There is no wrapped-USDC (WUSDC) contract and none is supported. Do not alias the EIP-7528 sentinel `0xEeee…EEeE` to `0x3600…`.
To get testnet USYC: request allowlisting through a [Circle Support](https://support.circle.com/) ticket that includes your Arc Testnet address (24–48h turnaround), then use the Teller or https://usyc.dev.hashnote.com/.

### Crosschain: CCTP V2 (domain 26)

| Contract | Mainnet | Testnet |
|---|---|---|
| TokenMessengerV2 | `0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d` | `0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA` |
| MessageTransmitterV2 | `0x81D40F21F12A8F0E3252Bccb954D722d4c464B64` | `0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275` |
| TokenMinterV2 | `0xfd78EE919681417d192449715b2594ab58f5D002` | `0xb43db544E2c27092c107639Ad201b3dEfAbcF192` |
| MessageV2 | `0xec546b6B005471ECf012e5aF77FBeC07e0FD8f78` | `0xbaC0179bB358A8936169a63408C8481D582390C4` |
| CrossChainTokenService | `0x431871229103b780868f8C6BB820cd16ECf942BC` | `0x63753E722bd2C2A5DF6EE19C5106662208B81077` |
| TokenMessengerWithFees (used by Unified Balance fast deposits; same address on every EVM source chain) | `0x71f54F818671cD0D7ea140Da213e5C8b5C92a408` | `0x8745D906D67C346E5eb1aEEED38Eb87F34DF0C0A` |

### Crosschain: Gateway (domain 26)

| Contract | Mainnet | Testnet |
|---|---|---|
| GatewayWallet | `0x77777777Dcc4d5A8B6E418Fd04D8997ef11000eE` | `0x0077777d7EBA4688BDeF3E311b846F25870A19B9` |
| GatewayMinter | `0x2222222d7164433c4C09B0b0D809a9b52C04C205` | `0x0022222ABE238Cc2C7Bb1f21003F0a260052475B` |

### Payments and settlement

| Contract | Mainnet | Testnet |
|---|---|---|
| StableFX **FxEscrow** (RFQ FX settlement; requires a USDC allowance to Permit2) | `0xe2E5F173576B513d994073CCbDaCBE027d43DFe6` | `0xd68256f4D69C6BbEcB873D8588AE0Dc6B8E22E10` |
| CPN Settlement (from Circle docs) | `0x355e0a2a4B7563e0E00C90deD9Aa914c119Ee868` | `0x355e0a2a4B7563e0E00C90deD9Aa914c119Ee868` |

### Transaction extensions (same address on both networks)

| Contract | Address | What it does |
|---|---|---|
| **Memo** | `0x5294E9927c3306DcBaDb03fe70b92e01cCede505` | `memo(target, data, memoId, memoData)`. Forwards a call through CallFrom (msg.sender preserved) and emits `BeforeMemo` and `Memo` events. See [transactions-memo-batching.md](transactions-memo-batching.md). |
| **Multicall3From** | `0x522fAf9A91c41c443c66765030741e4AaCe147D0` | `aggregate3(Call3[])` with msg.sender = your EOA in each subcall. |

### Common Ethereum contracts (same address on both networks)

| Contract | Address |
|---|---|
| CREATE2 factory (Arachnid) | `0x4e59b44847b379578588920cA78FbF26c0B4956C` |
| Multicall3 | `0xcA11bde05977b3631167028862bE2a173976CA11` |
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` |
| ERC-4337 EntryPoint v0.7 (docs say to "verify before use"; code present on both nets) | `0x0000000071727De22E5E9d8BAf0edAc6f37da032` |

### Protocol precompiles and system addresses

| Name | Address | Notes |
|---|---|---|
| Native Coin Authority | `0x1800000000000000000000000000000000000000` | Mint, burn, and transfer of native USDC. Emitted the legacy `NativeCoin*` events before Zero5 (testnet only). |
| Native Coin Control | `0x1800000000000000000000000000000000000001` | Blocklist |
| System Accounting | `0x1800000000000000000000000000000000000002` | Fee Manager gas ring buffer |
| Call From | `0x1800000000000000000000000000000000000003` | Backs Memo and Multicall3From. A direct EOA call reverts with `unauthorized caller`. |
| PQ Signature Verify | `0x1800000000000000000000000000000000000004` | `SLH-DSA-SHA2-128s` verification |
| **Native USDC Transfer emitter (EIP-7708)** | `0xffffFFFfFFffffffffffffffFfFFFfffFFFfFFfE` | Emits `Transfer` (18 decimals) for every native movement |

### Agentic standards

| Contract | Testnet (documented) | Mainnet |
|---|---|---|
| ERC-8004 IdentityRegistry | `0x8004A818BFB912233c491871b3d84c89A494BD9e` | Not documented. The testnet address has **no code on mainnet**. The canonical cross-chain ERC-8004 mainnet address `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` has code on Arc mainnet (unofficial; verify the ABI before use). |
| ERC-8004 ReputationRegistry | `0x8004B663056A597Dffe9eCcC1965A193B7388713` | Not documented. `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` has code (unofficial). |
| ERC-8004 ValidationRegistry | `0x8004Cb1BF31DAf7788923b405b754f57acEB4272` | Not documented. `0x8004Cc8439f36fd5F9F049D9fF86523Df6dAAB58` has code (unofficial). |
| ERC-8183 AgenticCommerce (reference implementation) | `0x0747EEf0706327138c69792bF28Cd525089e4583` | Not documented. The testnet address has **no code on mainnet**. |

### Test address for revert paths (testnet)

`0x70997970C51812dc3A010C7d01b50e0d17dc79C8` (index 1 of the `test test … junk` mnemonic) is **blocklisted** on Arc Testnet. Any value transfer to or from it reverts, including as a `SELFDESTRUCT` beneficiary. Use it to test blocklist handling. Derive its key with `cast wallet private-key --mnemonic "test test test test test test test test test test test junk" --mnemonic-index 1`.

## Quick smoke test

```bash
curl -s -X POST https://rpc.testnet.arc.io -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}'   # {"result":"0x4cef52"}
curl -s -X POST https://rpc.mainnet.arc.io -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}'   # {"result":"0x13b2"}
```
