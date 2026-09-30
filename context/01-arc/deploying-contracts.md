# Deploying and interacting with contracts on Arc

Purpose: working deploy, verify, and interact recipes for Arc Foundry, stock Foundry, Hardhat, viem, and Circle Contracts (no-Solidity templates), plus the porting checklist.

Sources:
- https://docs.arc.io/arc/tutorials/install-arc-foundry
- https://docs.arc.io/arc/tutorials/deploy-on-arc (same content at /build/deploy-on-arc and /integrate/deploy-on-arc)
- https://docs.arc.io/arc/tutorials/troubleshoot-with-arc-foundry
- https://docs.arc.io/arc/tutorials/porting-contracts-to-arc
- https://docs.arc.io/arc/tutorials/deploy-contracts (Circle Contracts templates)
- https://docs.arc.io/arc/tutorials/interact-with-contracts, https://docs.arc.io/arc/tutorials/monitor-contract-events
- https://docs.arc.io/integrate/infrastructure/bridges (viem deploy notes)
- https://github.com/circlefin/arc-foundry (releases; last push 2026-09-23)

Verified: 2026-09-29

## TL;DR

- Standard Solidity, Foundry, Hardhat, viem, and ethers work unchanged ("Osaka" EVM, EIP-7702 supported).
- **Test with Arc Foundry** (`arc-forge test --network arc`, `arc-anvil --network arc`). Stock `anvil` runs a generic EVM and won't reproduce USDC-native, blocklist, or zero-address revert behavior.
- You need testnet USDC for gas: https://faucet.circle.com → "Arc Testnet".
- The explorer is **Blockscout**. Verify with `--verifier blockscout --verifier-url https://explorer.testnet.arc.io/api/`.

## 1. Arc Foundry (official path)

Install (Linux x86_64/arm64, macOS Apple Silicon, WSL. Intel Mac must build from source):
```bash
# download arc-foundry-<version>-<target>.tar.gz from https://github.com/circlefin/arc-foundry/releases
tar -xzf arc-foundry-<version>-<target>.tar.gz
mkdir -p ~/.local/bin
mv forge ~/.local/bin/arc-forge; mv cast ~/.local/bin/arc-cast; mv anvil ~/.local/bin/arc-anvil
export PATH="$HOME/.local/bin:$PATH"
arc-forge --version
```

Deploy → verify → interact (from [deploy-on-arc](https://docs.arc.io/arc/tutorials/deploy-on-arc)):
```bash
arc-forge init hello-arc && cd hello-arc
echo 'ARC_TESTNET_RPC_URL="https://rpc.testnet.arc.io"' > .env && source .env
arc-forge test --network arc                     # runs tests with Arc runtime semantics
arc-cast wallet new                              # put key in .env as PRIVATE_KEY, then fund at faucet.circle.com

arc-forge create src/Counter.sol:Counter \
  --rpc-url $ARC_TESTNET_RPC_URL --private-key $PRIVATE_KEY --broadcast

arc-forge verify-contract $COUNTER_ADDRESS src/Counter.sol:Counter \
  --chain-id 5042002 --verifier blockscout \
  --verifier-url https://explorer.testnet.arc.io/api/
# constructor args:
#   --constructor-args $(arc-cast abi-encode "constructor(string,string)" "MyToken" "MTK")

arc-cast call $COUNTER_ADDRESS "number()(uint256)" --rpc-url $ARC_TESTNET_RPC_URL
arc-cast send $COUNTER_ADDRESS "increment()" --rpc-url $ARC_TESTNET_RPC_URL --private-key $PRIVATE_KEY
```
Manual verification UI: https://explorer.testnet.arc.io/contract-verification.
For mainnet, use `--chain-id 5042` and `https://explorer.arc.io/api/` (viem lists `apiUrl` `https://explorer.arc.io/api/v2`).

Debugging ([troubleshoot-with-arc-foundry](https://docs.arc.io/arc/tutorials/troubleshoot-with-arc-foundry)):
```bash
arc-cast run <TX_HASH> --rpc-url $ARC_TESTNET_RPC_URL          # replay with Arc precompiles, shows e.g. "Blocklisted address"
arc-anvil --fork-url $ARC_TESTNET_RPC_URL [--fork-block-number N]  # local fork on :8545
arc-forge test --fork-url $ARC_TESTNET_RPC_URL                 # tests against real USDC semantics
```

## 2. Stock Foundry (works for deploys; tests won't model Arc quirks)

```bash
forge create src/Counter.sol:Counter --rpc-url https://rpc.testnet.arc.io \
  --private-key $PRIVATE_KEY --broadcast
forge script script/Deploy.s.sol --rpc-url https://rpc.testnet.arc.io --broadcast \
  --verify --verifier blockscout --verifier-url https://explorer.testnet.arc.io/api/
```
`foundry.toml`:
```toml
[rpc_endpoints]
arc_testnet = "https://rpc.testnet.arc.io"
arc = "https://rpc.mainnet.arc.io"
```
If a script gets stuck, check that the gas price is at least 20 gwei. Add `--with-gas-price 20gwei` or `--priority-gas-price 0` if needed.

## 3. Hardhat (not documented by Arc; standard EVM config)

The Arc docs only say Hardhat "works unchanged" and that you should configure "chain ID `5042002`, RPC `https://rpc.testnet.arc.io`". A config that works under that guidance:
```ts
// hardhat.config.ts (Hardhat 2 + @nomicfoundation/hardhat-toolbox)
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
const config: HardhatUserConfig = {
  solidity: "0.8.28",
  networks: {
    arcTestnet: { url: "https://rpc.testnet.arc.io", chainId: 5042002, accounts: [process.env.PRIVATE_KEY!] },
    arc:        { url: "https://rpc.mainnet.arc.io", chainId: 5042,    accounts: [process.env.PRIVATE_KEY!] },
  },
  etherscan: {
    apiKey: { arcTestnet: "empty", arc: "empty" },          // Blockscout ignores the key
    customChains: [
      { network: "arcTestnet", chainId: 5042002,
        urls: { apiURL: "https://explorer.testnet.arc.io/api", browserURL: "https://explorer.testnet.arc.io" } },
      { network: "arc", chainId: 5042,
        urls: { apiURL: "https://explorer.arc.io/api", browserURL: "https://explorer.arc.io" } },
    ],
  },
  sourcify: { enabled: false },
};
export default config;
```
`npx hardhat ignition deploy ./ignition/modules/X.ts --network arcTestnet`, then `npx hardhat verify --network arcTestnet <addr> <args>`.
Hardhat's local network is a generic EVM. Run integration tests against an `arc-anvil` fork (`url: "http://127.0.0.1:8545"`).

## 4. viem (deploy and write from an agent backend)

```ts
import { createPublicClient, createWalletClient, http, parseUnits, erc20Abi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet } from "viem/chains";

const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);
const transport = http("https://rpc.testnet.arc.io");   // override viem's legacy default hosts
const pub = createPublicClient({ chain: arcTestnet, transport });
const wallet = createWalletClient({ account, chain: arcTestnet, transport });

// deploy
const hash = await wallet.deployContract({ abi, bytecode, args: [] });
const { contractAddress } = await pub.waitForTransactionReceipt({ hash }); // final on receipt

// pay 12.50 USDC via ERC-20 interface (6 decimals)
const USDC = "0x3600000000000000000000000000000000000000";
await wallet.writeContract({ address: USDC, abi: erc20Abi, functionName: "transfer",
  args: [recipient, parseUnits("12.50", 6)] });

// same payment via native send (18 decimals!)
await wallet.sendTransaction({ to: recipient, value: parseUnits("12.50", 18) });
```
CREATE2 via the Arachnid factory `0x4e59…956C` works. Permit2 is at `0x0000…8BA3` and Multicall3 at `0xcA11…CA11`.

## 5. Circle Contracts (templates, no Solidity) and dev-controlled wallets

[deploy-contracts](https://docs.arc.io/arc/tutorials/deploy-contracts) deploys **pre-audited ERC-20, ERC-721, ERC-1155, and Airdrop templates** from a Circle dev-controlled **SCA** wallet. **Circle Gas Station sponsors the fees on Arc Testnet.** Prerequisites: a Circle Console account, an API key (Keys → Create a key → API key → Standard Key), and a registered entity secret. It uses `@circle-fin/developer-controlled-wallets` and `@circle-fin/smart-contract-platform`, and blockchain id `ARC-TESTNET`.
Follow-ups:
- [interact-with-contracts](https://docs.arc.io/arc/tutorials/interact-with-contracts): mint, transfer, and airdrop through the Circle Contracts API.
- [monitor-contract-events](https://docs.arc.io/arc/tutorials/monitor-contract-events): Circle event monitors and webhooks, a good choice for agent triggers.
The Circle-side API details are covered in the Circle section of this library.

Generic Circle Wallets contract call (used in the ERC-8183 tutorial):
```ts
await circleClient.createContractExecutionTransaction({
  walletAddress, blockchain: "ARC-TESTNET", contractAddress,
  abiFunctionSignature: "approve(address,uint256)", abiParameters: [spender, "1000000"],
  fee: { type: "level", config: { feeLevel: "MEDIUM" } },
});
```

## 6. Arc Studio (AI builder; testnet only)

Browser: https://studio.arc.io. CLI: `npm i -g @circle-fin/arc-studio-cli` (v1.1.3), then `arc-studio login`, then `arc-studio run "write and deploy an ERC-20 called DEMO on Arc testnet" --output json`. See [agentic-and-ai.md](agentic-and-ai.md).

## Porting checklist (condensed from [porting-contracts-to-arc](https://docs.arc.io/arc/tutorials/porting-contracts-to-arc))

1. **Decimals**: never compare `address.balance` or `msg.value` (18) with `USDC.balanceOf` (6) without ×1e12. `balanceOf` truncates.
2. **Value transfers can revert** with enough balance (blocklist, `0x0`, destructed account, precompile target). Check `receipt.status`. Gas is still spent.
3. **Allowances are not a complete spending control**: a contract that can send native value moves USDC regardless of ERC-20 approvals. A native "sweep" also drains the users' ERC-20 USDC because it is the same asset.
4. **DEX/AMM**: use `0x3600…0000` as the pair token. No WUSDC/WETH wrapping. Remove `deposit()`/`withdraw()` wrap paths. Don't pair native vs ERC-20 USDC. Don't alias the EIP-7528 `0xEeee…` sentinel.
5. **SELFDESTRUCT** moves the contract's USDC (its native balance) to the beneficiary. It reverts if the beneficiary is self, `0x0`, blocklisted, or already destructed while holding a balance.
6. **Randomness**: `PREVRANDAO` = 0. Use a VRF or oracle.
7. **Timestamps**: `block.timestamp` is non-decreasing (1 s granularity), and several blocks can share one. Order by block number.
8. Run the suite on `arc-anvil --network arc`, then exercise the revert paths with blocklisted `0x7099…79C8` on testnet.
