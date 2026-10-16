// Rehearse a transaction on Arc's live state before anyone signs it (Abu, 10-16, after Aomi's "rehearsed on a forked
// copy of live blockchain"): `eth_simulateV1` runs the exact calls the wallet would send, from the person's own
// address, on the latest block, and returns their logs. The ERC-20 Transfer events in those logs are exactly what
// leaves and arrives in the wallet; a revert is caught before the signature. Arc's own public RPC does not serve
// eth_simulateV1; dRPC's Arc endpoints do (checked 10-16 on mainnet and testnet), so the rehearsal goes there.
import { type Address, type Hex, createPublicClient, decodeErrorResult, erc20Abi, formatUnits, http } from "viem";

import type { NetworkId } from "@kawase/networks";

const SIMULATOR: Record<NetworkId, string> = {
  mainnet: "https://rpc.drpc.mainnet.arc.io",
  testnet: "https://rpc.drpc.testnet.arc.network",
};
const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
/**
 * Native-value echoes of a USDC move, skipped so it counts once (as Arc's USDC ERC-20): the simulator's pseudo-token
 * (traceTransfers) and Arc's native-USDC system address, which logs an 18-decimal copy of every USDC transfer.
 */
const ECHOES = new Set(["0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", "0xfffffffffffffffffffffffffffffffffffffffe"]);
const TIMEOUT_MS = 8000;
const TOKEN_TIMEOUT_MS = 4000;
const DEFAULT_DECIMALS = 18;
const ADDRESS_HEX = 40;
const WORD = 64;
const ZERO = 0n;
const HEX = 16;
/** "0x". */
const PREFIX = 2;
/** Transfer(from, to, value) carries the signature and the two addresses as topics. */
const TRANSFER_TOPICS = 3;
const SHORT_HEAD = 6;
const SHORT_TAIL = 4;

export type SimCall = { from: Address; to: Address; data: Hex; value?: bigint };
export type SimToken = { address: string; symbol: string; decimals: number };

export type Simulation =
  | {
      status: "ok";
      block: string;
      gasUsed: string;
      /** What the wallet gains (+) or pays (−), per token, in base units. */
      changes: { token: SimToken; delta: string; display: string }[];
      /** Every contract the calls touch, in order: what the person is trusting. */
      contracts: string[];
      at: string;
    }
  | { status: "reverted"; reason: string; at: string }
  | { status: "unavailable"; at: string };

type RawLog = { address: string; topics: string[]; data: string };
type RawCall = { status: string; gasUsed: string; logs?: RawLog[]; error?: { message?: string; data?: string }; returnData?: string };

const topicAddress = (topic: string) => `0x${topic.slice(-ADDRESS_HEX)}`.toLowerCase();

/** Rehearses `calls` in order on the latest block; `tokens` names what it knows (anything else shows its address). */
export async function simulate(network: NetworkId, holder: Address, calls: SimCall[], tokens: SimToken[]): Promise<Simulation> {
  const at = new Date().toISOString();
  const body = {
    jsonrpc: "2.0",
    id: 1,
    method: "eth_simulateV1",
    params: [
      {
        blockStateCalls: [{ calls: calls.map((call) => ({ from: call.from, to: call.to, data: call.data, value: `0x${(call.value ?? ZERO).toString(HEX)}` })) }],
        traceTransfers: true,
        validation: false,
      },
      "latest",
    ],
  };
  let result: { number: string; calls: RawCall[] }[] | undefined;
  try {
    const response = await fetch(SIMULATOR[network], { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT_MS) });
    const json = (await response.json()) as { result?: typeof result; error?: unknown };
    result = json.result;
  } catch {
    return { status: "unavailable", at };
  }
  const block = result?.[0];
  if (!block) return { status: "unavailable", at };

  const failed = block.calls.find((call) => call.status !== "0x1");
  if (failed) return { status: "reverted", reason: revertReason(failed), at };

  const known = new Map(tokens.map((token) => [token.address.toLowerCase(), token]));
  const me = holder.toLowerCase();
  const deltas = new Map<string, bigint>();
  const contracts: string[] = [];
  for (const call of calls) if (!contracts.includes(call.to.toLowerCase())) contracts.push(call.to.toLowerCase());
  let gas = 0n;
  for (const call of block.calls) {
    gas += BigInt(call.gasUsed);
    for (const log of call.logs ?? []) {
      const address = log.address.toLowerCase();
      if (ECHOES.has(address)) continue;
      if (!contracts.includes(address)) contracts.push(address);
      if (log.topics[0] !== TRANSFER || log.topics.length < TRANSFER_TOPICS) continue;
      const value = BigInt(log.data.length > PREFIX ? `0x${log.data.slice(PREFIX, PREFIX + WORD)}` : "0x0");
      const from = topicAddress(log.topics[1]!);
      const to = topicAddress(log.topics[2]!);
      if (from === me) deltas.set(address, (deltas.get(address) ?? ZERO) - value);
      if (to === me) deltas.set(address, (deltas.get(address) ?? ZERO) + value);
    }
  }
  // Tokens the caller did not name (vault shares, a reserve's token, any coin) are asked their own symbol and decimals.
  const moved = [...deltas.entries()].filter(([, delta]) => delta !== ZERO);
  await Promise.all(moved.filter(([address]) => !known.has(address)).map(async ([address]) => known.set(address, await describeToken(network, address))));
  const changes = moved
    .map(([address, delta]) => {
      const token = known.get(address)!;
      const sign = delta > ZERO ? "+" : "−";
      return { token, delta: delta.toString(), display: `${sign}${formatUnits(delta < ZERO ? -delta : delta, token.decimals)} ${token.symbol}` };
    })
    // What leaves first, then what arrives.
    .sort((a, b) => Number(BigInt(b.delta) < ZERO) - Number(BigInt(a.delta) < ZERO));
  return { status: "ok", block: BigInt(block.number).toString(), gasUsed: gas.toString(), changes, contracts, at };
}

/** A token's own symbol and decimals, read on the same RPC; its short address (and 18) when it does not say. */
async function describeToken(network: NetworkId, address: string): Promise<SimToken> {
  const client = createPublicClient({ transport: http(SIMULATOR[network], { timeout: TOKEN_TIMEOUT_MS }) });
  const token = address as Address;
  const [symbol, decimals] = await Promise.all([
    client.readContract({ address: token, abi: erc20Abi, functionName: "symbol" }).catch(() => null),
    client.readContract({ address: token, abi: erc20Abi, functionName: "decimals" }).catch(() => null),
  ]);
  return { address, symbol: symbol || `${address.slice(0, SHORT_HEAD)}…${address.slice(-SHORT_TAIL)}`, decimals: decimals ?? DEFAULT_DECIMALS };
}

/** The revert's own words when the contract gave a reason ("Error(string)"), else the simulator's message. */
function revertReason(call: RawCall): string {
  const data = (call.error?.data ?? call.returnData) as Hex | undefined;
  if (data && data.length > PREFIX) {
    try {
      const decoded = decodeErrorResult({ abi: [{ type: "error", name: "Error", inputs: [{ name: "reason", type: "string" }] }], data });
      const reason = decoded.args?.[0];
      if (typeof reason === "string" && reason) return reason;
    } catch {
      // A custom error: the simulator's message says enough.
    }
  }
  return call.error?.message ?? "the transaction would revert";
}
