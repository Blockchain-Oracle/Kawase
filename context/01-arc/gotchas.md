# Arc gotchas: sharp edges builders hit

Purpose: a checklist of Arc behaviors that break assumptions from Ethereum or other L2s, each with a symptom and a fix. Read this before writing any code that moves USDC.

Sources:
- https://docs.arc.io/arc/references/evm-differences
- https://docs.arc.io/arc/concepts/stablecoin-native-model
- https://docs.arc.io/arc/references/usdc-system-events
- https://docs.arc.io/arc/references/gas-and-fees, https://docs.arc.io/arc/references/rpc-endpoints
- https://docs.arc.io/arc/concepts/transaction-memos, /batched-transactions
- https://docs.arc.io/app-kit/* (bridge, unified-balance, swap notes)
- https://github.com/circlefin/arc-node CHANGELOG v0.8.0
- viem 2.56.9 `arcTestnet` definition; live RPC checks on 2026-09-29

Verified: 2026-09-29

## Money and decimals (the #1 source of bugs)

1. **USDC is 18 decimals natively and 6 through ERC-20, with one balance.** `eth_getBalance`, `msg.value`, and gas are 18 dp. `USDC.balanceOf`, `transfer`, `approve`, EIP-3009, and App Kit amounts are 6 dp. The raw numbers differ by 1e12. `parseUnits("1", 6)` sent as a native `value` is **1e-12 USDC**. (The gas-and-fees docs example has exactly this bug.)
2. **Don't show two USDC balances** (native and ERC-20). They are the same money, so show one.
3. **`balanceOf` truncates** amounts below 1e-6 USDC. `balanceOf == 0` does not mean empty. Book from 18-dp native values if you need exactness. Truncating when you credit under-records.
4. **Gas and payments draw from the same USDC.** An agent that sends its "full balance" via ERC-20 leaves nothing for gas. Keep a gas float, since ~$0.01 covers dozens of txs.
5. **There is no WUSDC and no wrapping.** Use `0x3600…0000` as the ERC-20. Never alias the EIP-7528 `0xEeee…EEeE` sentinel to it. Don't pool native against ERC-20 USDC.
6. **ERC-20 allowances don't bound native sends.** A contract or wallet that can send `value` can move USDC past any `approve` cap. Spending policies must cover both paths.
7. **Contract USDC is the contract's native balance.** `SELFDESTRUCT` moves it, and a native "sweep" drains ERC-20 USDC too.
8. EURC, USYC, and USDC(ERC-20) are 6 dp. cirBTC is 8 dp. WETH is 18 dp. Always call `decimals()`.

## Transfers that revert even with enough balance (gas still spent)

9. **Blocklist is enforced at runtime.** A value transfer to or from a blocklisted address reverts, the tx is included, gas is consumed, and the receipt has `status: 0`. Screen counterparties first. Test with blocklisted testnet address `0x70997970C51812dc3A010C7d01b50e0d17dc79C8`.
10. **A value send to `address(0)` reverts** ("Zero address not allowed"). Zero-value is fine. Burn-style patterns fail.
11. **A value send to a precompile reverts.** A value send to an account self-destructed earlier in the same tx reverts (Ethereum allows it).
12. `SELFDESTRUCT` with a balance reverts if the beneficiary is self, `0x0`, blocklisted, or already destructed.
13. Always check `receipt.status`. Don't assume "mined = paid".

## Fees and transaction submission

14. **`maxFeePerGas` < 20 gwei means the tx is silently dropped** (no receipt, never mined). Floor at 20 gwei. Custom bundlers and relayers must do the same.
15. **Blob (type-3) txs are rejected.** Use type-2 (or type-4 for 7702).
16. The base fee is not burned (it goes to the proposer). The next base fee is in the parent `extraData` (8-byte BE).
17. Gas fees emit no Transfer log. Compute them from `gasUsed × effectiveGasPrice` (18 dp).
18. **Node v0.8.0 changed error strings**: insufficient balance now shows revm `OutOfFunds` or `gas required exceeds allowance` instead of `insufficient funds for gas * price + value`. Don't regex-match the old text.

## Blocks, time, randomness

19. `PREVRANDAO` = 0 always. Use Chainlink, Pyth, or another VRF or oracle. The EIP-4788 beacon-roots contract is absent (reads return `0x`). EIP-2935 block hashes work.
20. **`block.timestamp` is non-decreasing, not strictly increasing** (1 s granularity, ~2 blocks/s). Don't use it for uniqueness or ordering. Use block number plus log index.
21. `block.withdrawals` is always empty. `BLOBHASH` returns 0 and `BLOBBASEFEE` returns 1.
22. Finality comes from **1 confirmation**. `safe` and `finalized` tags equal `latest`. Don't add artificial N-confirmation waits.

## Events and indexing

23. **Two Transfer streams.** The system emitter `0xffff…FfFE` (18 dp) fires for all USDC moves. `0x3600…` (6 dp) fires only for ERC-20 calls. One ERC-20 transfer produces **two logs**. Filter by emitter or you double count. Watching only `0x3600…` misses native sends.
24. On testnet, history before Zero5 used `NativeCoinTransferred`, `NativeCoinMinted`, and `NativeCoinBurned` from `0x1800…0000`. Mainnet used EIP-7708 from genesis.
25. **`eth_getLogs` is capped at 10,000 blocks** (~85 min) on public RPCs, returning `-32012`. Page your queries.
26. The **load-balanced public RPC can return `-32014`** for the head block. Retry with backoff, or query `latest - 1`.

## Memo, Multicall3From, and smart accounts

27. Memo and Multicall3From **only accept direct EOA callers**. SCAs, 4337 accounts, Safes, delegatecall, and staticcall revert. Circle SCA wallets and modular wallets can't use them directly.
28. Multicall3From can't forward native value (no `aggregate3Value`). Batch ERC-20 transfers instead.
29. **Memo data is public.** Store invoice hashes or IDs, not PII. Arc privacy (APS) is **not live**.
30. Compliance tooling must attribute calls routed through Memo and Multicall3From to the original sender.

## Tooling

31. **Stock `anvil`, Hardhat network, and Tenderly-like simulators don't model Arc.** Use `arc-anvil --network arc` or `arc-forge test --fork-url`.
32. **viem's `arcTestnet` ships legacy RPCs** (`rpc.testnet.arc.network`, which still works) and `testnet.arcscan.app` (redirects to `explorer.testnet.arc.io`). Pass `http("https://rpc.testnet.arc.io")` explicitly. `arcTestnet` needs viem ≥ 2.38. `arc` (mainnet) is built in too.
33. Reown AppKit needs `defineChain` from `@reown/appkit/networks`, not viem. WalletConnect prompts `wallet_addEthereumChain` for Arc Testnet. ConnectKit without `mainnet` breaks ENS lookups (CORS).
34. The explorer is **Blockscout**. Verify with `--verifier blockscout --verifier-url https://explorer.testnet.arc.io/api/`, not an Etherscan key.
35. Wallets without custom-gas-token support label USDC as "ETH".

## App Kit, CCTP, Gateway

36. App Kit amounts are **decimal strings** ("1.00"), not base units.
37. **Bridging out of Arc needs an amount > the CCTPv2 max fee (~1.4 USDC on testnet)**, otherwise you get `Max fee must be less than amount`.
38. Standard Unified Balance deposits wait for **source-chain finality** (≥15 min from Ethereum L2s). Use fast deposits (to Arc) or pre-fund. Only spend `totalConfirmedBalance`.
39. Unified Balance trustless withdrawal takes **7 days**. SCAs need an EOA delegate to spend and `allowanceStrategy: "approve"` to deposit.
40. **Swap on testnets works only on Arc Testnet**, and on Arc only USDC, EURC, and cirBTC.
41. Kit keys are legacy. Use `apiKey` (Circle Console), which is required for Onramp and optional but rate-limited for Swap and Earn. Keys are per-environment and server-side only.
42. Circle Wallets are per-chain. Pass `address` in every App Kit `from`/`to`. Solana-origin crosschain transfers can't be gas-sponsored.

## Network status and faucet

43. **Mainnet is live (2026-09-16)**, but the docs `llms.txt` still says "Testnet only". Arc Studio, the ERC-8004 tutorial, and the ERC-8183 tutorial are testnet-only. The ERC-8004 and ERC-8183 testnet addresses have **no code on mainnet**.
44. The testnet faucet (faucet.circle.com) is **rate-limited**. Fund one wallet, then distribute via transfers (the ERC-8183 tutorial does this). There is no mainnet faucet. Get mainnet USDC by bridging with CCTP or Gateway, or by onramp.
45. USYC requires allowlisting (a support ticket, 24–48h) even on testnet, and it is restricted to non-US institutions in production.
46. Fee parameter tables still say "may change before mainnet launch". Read `eth_gasPrice` live (testnet currently returns 25 gwei, mainnet 20 gwei).
