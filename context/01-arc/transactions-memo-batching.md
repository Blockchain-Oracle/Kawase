# Memos, batching, and indexing USDC on Arc

Purpose: Arc-native primitives an AP/AR, payroll, or treasury agent needs: attach invoice IDs to payments (Memo), pay many vendors atomically (Multicall3From), gasless user payments (EIP-3009), and correctly detect incoming USDC (EIP-7708 system events).

Sources:
- https://docs.arc.io/arc/concepts/transaction-memos
- https://docs.arc.io/arc/tutorials/send-usdc-with-transaction-memo
- https://docs.arc.io/arc/concepts/batched-transactions
- https://docs.arc.io/arc/tutorials/batch-usdc-transfers
- https://docs.arc.io/arc/references/usdc-system-events
- https://docs.arc.io/integrate/exchanges/deposits
- https://docs.arc.io/integrate/infrastructure/indexing-events
- https://docs.arc.io/integrate/infrastructure/compliance
- https://docs.arc.io/integrate/relayers-and-paymasters/eip-3009-relayer

Verified: 2026-09-29

## Memo: invoice or order reference on a payment

Contract (mainnet and testnet): **`0x5294E9927c3306DcBaDb03fe70b92e01cCede505`**

```solidity
function memo(address target, bytes calldata data, bytes32 memoId, bytes calldata memoData) external;
event BeforeMemo(uint256 indexed memoIndex);
event Memo(address indexed sender, address indexed target, bytes32 callDataHash,
           bytes32 indexed memoId, bytes memo, uint256 memoIndex);
```
- The Memo contract forwards `data` to `target` through the **CallFrom precompile**, so USDC sees **your EOA** as `msg.sender`, not the Memo contract.
- Log order: `BeforeMemo(i)`, then the target's events (e.g. USDC `Transfer`), then `Memo(...)`. Nested memos are supported.
- If the child reverts, the whole tx reverts with `MemoFailed(bytes)`.
- **EOA only.** Calls from ERC-4337 smart accounts, Circle modular wallets, Circle SCA wallets, or Safe revert because sender spoofing is not allowed. A `STATICCALL` or `DELEGATECALL` into Memo also fails. Calling CallFrom directly from an EOA reverts with `unauthorized caller`. For SCA-based agents, either sign a separate EOA memo tx or keep the metadata offchain.
- **Memo data is public.** Don't put PII or confidential invoice contents in it. Use a hash or opaque ID.

```ts
import { encodeFunctionData, erc20Abi, keccak256, parseUnits, stringToHex, parseAbiItem } from "viem";
const MEMO = "0x5294E9927c3306DcBaDb03fe70b92e01cCede505";
const USDC = "0x3600000000000000000000000000000000000000";
const memoAbi = [{ type: "function", name: "memo", stateMutability: "nonpayable",
  inputs: [{ name: "target", type: "address" }, { name: "data", type: "bytes" },
           { name: "memoId", type: "bytes32" }, { name: "memoData", type: "bytes" }], outputs: [] }] as const;

const transferData = encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [vendor, parseUnits("1250.00", 6)] });
const memoId = keccak256(stringToHex("invoice-2026-0001"));   // lookup key
const hash = await wallet.writeContract({ address: MEMO, abi: memoAbi, functionName: "memo",
  args: [USDC, transferData, memoId, stringToHex("inv=2026-0001;vendor=acme")] });
const receipt = await pub.waitForTransactionReceipt({ hash });   // final

// Reconcile later by memoId (indexed); compare callDataHash == keccak256(transferData)
const logs = await pub.getLogs({ address: MEMO,
  event: parseAbiItem("event Memo(address indexed sender,address indexed target,bytes32 callDataHash,bytes32 indexed memoId,bytes memo,uint256 memoIndex)"),
  args: { memoId }, fromBlock: receipt.blockNumber, toBlock: receipt.blockNumber });
```

## Multicall3From: atomic batch payouts that keep the sender

Contract (both networks): **`0x522fAf9A91c41c443c66765030741e4AaCe147D0`**

```solidity
struct Call3 { address target; bool allowFailure; bytes callData; }
struct Result { bool success; bytes returnData; }
function aggregate3(Call3[] calldata calls) external returns (Result[] memory);
```
- Each subcall runs with `msg.sender` = the calling **EOA**, so `USDC.transfer` debits your wallet directly with no approval to a batcher.
- Constraints: **EOA only**. There is no `aggregate3Value`, because CallFrom doesn't forward native value, so pay through the ERC-20 interface. It emits no batch event; verify one USDC `Transfer` per subcall with `from` = your wallet.
- Use `allowFailure: false` for all-or-nothing payroll. Simulate first (`simulateContract`).

```ts
const M3F = "0x522fAf9A91c41c443c66765030741e4AaCe147D0";
const calls = payees.map(p => ({ target: USDC, allowFailure: false,
  callData: encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [p.address, parseUnits(p.amount, 6)] }) }));
const m3fAbi = [{ type: "function", name: "aggregate3", stateMutability: "nonpayable",
  inputs: [{ name: "calls", type: "tuple[]", components: [
    { name: "target", type: "address" }, { name: "allowFailure", type: "bool" }, { name: "callData", type: "bytes" }] }],
  outputs: [{ name: "returnData", type: "tuple[]", components: [{ name: "success", type: "bool" }, { name: "returnData", type: "bytes" }] }] }] as const;
const { request } = await pub.simulateContract({ account, address: M3F, abi: m3fAbi, functionName: "aggregate3", args: [calls] });
await wallet.writeContract(request);
```
You can nest: a Multicall3From subcall can target Memo, which lets one batch carry a memo per payee. The docs don't show this, so test it on testnet first.

Compliance note: offchain blocklist and screening systems must account for Memo and Multicall3From routing, because the original caller appears as the sender in subcalls ([contract-addresses warning](https://docs.arc.io/arc/references/contract-addresses#transaction-extensions), [compliance how-to](https://docs.arc.io/integrate/infrastructure/compliance)).

## Standard Multicall3 (reads)

`0xcA11bde05977b3631167028862bE2a173976CA11`. viem's `multicall` uses it automatically (it's in the chain definition).

## EIP-3009 gasless USDC (user signs, relayer pays gas)

USDC EIP-712 domain on Arc testnet: `{ name: "USDC", version: "2", chainId: 5042002, verifyingContract: "0x3600000000000000000000000000000000000000" }` (mainnet: same, but `chainId: 5042`). `name()` returns "USDC" and `version()` returns "2" on both networks (eth_call, 2026-09-29). Note that the name is "USDC", not "USD Coin" as on Ethereum.
```ts
const types = { TransferWithAuthorization: [
  { name: "from", type: "address" }, { name: "to", type: "address" }, { name: "value", type: "uint256" },
  { name: "validAfter", type: "uint256" }, { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" }] };
// value in 6-dec units; nonce = random bytes32
// relayer: usdc.transferWithAuthorization(from,to,value,validAfter,validBefore,nonce,v,r,s)  (~65k gas, maxFee ≥ 20 gwei)
```
This is the basis of x402 "exact" payments. `receiveWithAuthorization` also exists on FiatToken. A blocklisted `from` or `to` reverts and burns the relayer's gas.

## Detecting incoming USDC (AR agents, deposit watchers)

Two emitters, same `topic0 = 0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef`:

| Emitter | Decimals | Fires on |
|---|---|---|
| **`0xffffFFFfFFffffffffffffffFfFFFfffFFFfFFfE`** (system, EIP-7708) | 18 | **Every** USDC movement: native sends, the ERC-20 transfer's native leg, mint/burn (`from`/`to` = `0x0`), `CREATE` endowments, `SELFDESTRUCT` |
| `0x3600000000000000000000000000000000000000` (ERC-20) | 6 | ERC-20 interface calls only |

Rules: to catch all incoming USDC, **filter the system emitter**. Filtering `0x3600…` misses plain native sends. Never sum both streams, since one ERC-20 transfer logs twice. The system log comes first in the tx. There is no log for zero-value transfers, self-transfers, or gas. Credit after **1 confirmation** (final).

```ts
const SYS = "0xffffFFFfFFffffffffffffffFfFFFfffFFFfFFfE";
const incoming = await pub.getLogs({ address: SYS,
  event: parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)"),
  args: { to: treasury }, fromBlock, toBlock });          // ≤ 9,999 blocks per call on public RPC
// value is 18-dec: formatUnits(log.args.value, 18)
// realtime: pub.watchEvent({... , transport: webSocket("wss://rpc.testnet.arc.io") }) or poll every ~1-2s
```
EURC, cirBTC, and other ERC-20s still use their own contract `Transfer` events.
To backfill testnet history from before Zero5, read `NativeCoinTransferred`, `NativeCoinMinted`, and `NativeCoinBurned` from `0x1800…0000` ([usdc-system-events](https://docs.arc.io/arc/references/usdc-system-events)).
Alternatives: Circle Contracts event monitors and webhooks ([monitor-contract-events](https://docs.arc.io/arc/tutorials/monitor-contract-events)), and the indexers in [ecosystem-and-infrastructure.md](ecosystem-and-infrastructure.md) (Alchemy webhooks, Goldsky, Envio, The Graph, Zerion subscriptions).
