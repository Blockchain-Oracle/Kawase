// The dry run's chain: Arc mainnet state plus everything the run would have sent, with nothing sent. A local JSON-RPC
// endpoint the in-process api (and every library it hands an RPC URL) talks to instead of the real node:
//   - reads (eth_call, eth_estimateGas, eth_simulateV1, balance, code, nonce, storage) go to the real node with the
//     shadow state as state overrides, so they see the funded test wallet and every earlier shadow transaction;
//   - eth_sendRawTransaction is never forwarded: the transaction is simulated (eth_simulateV1 for status, gas and
//     logs) and its state change read with debug_traceCall's prestate tracer in diff mode, then folded into the
//     overrides; a type-4 transaction installs its authorizations' delegation code;
//   - receipts and transactions for shadow hashes are answered here, so the api's waits and receipt witnesses run
//     unchanged.
// The ops wallet (Circle) is replaced by a shadow executor that runs its calls through the same path.
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import {
  encodeFunctionData,
  erc20Abi,
  keccak256,
  pad,
  parseTransaction,
  recoverTransactionAddress,
  toHex,
  type Address,
  type Hex,
} from "viem";
import { recoverAuthorizationAddress } from "viem/utils";

import type { NetworkId } from "@kawase/networks";

import type { OpsExecutor, OpsTransaction } from "../../src/send/ops";

type Account = { balance?: Hex; nonce?: Hex; code?: Hex; stateDiff: Record<string, Hex> };
type RpcLog = { address: Address; topics: Hex[]; data: Hex };
type RpcRequest = { jsonrpc: "2.0"; id: number | string | null; method: string; params?: unknown[] };
type RpcError = { code: number; message: string; data?: unknown };

export type ShadowTx = {
  hash: Hex;
  from: Address;
  to: Address | null;
  input: Hex;
  value: Hex;
  nonce: Hex;
  gas: Hex;
  type: Hex;
  status: "success" | "reverted";
  gasUsed: Hex;
  effectiveGasPrice: Hex;
  blockNumber: Hex;
  logs: RpcLog[];
  error: string | undefined;
};

export type ShadowSnapshot = { accounts: Record<string, Account>; txs: ShadowTx[] };

const DESIGNATOR_PREFIX = "0xef0100";
const TX_TYPES: Record<string, Hex> = { legacy: "0x0", eip2930: "0x1", eip1559: "0x2", eip4844: "0x3", eip7702: "0x4" };
const EMPTY_BLOOM = `0x${"0".repeat(512)}` as Hex;
const REQUEST_TIMEOUT_MS = 60_000;
const PROBE_UNITS = 123_456_789n;
const RPC_INVALID_PARAMS = -32602;
const RPC_INTERNAL = -32603;
const UPSTREAM_TRIES = 4;
const UPSTREAM_BACKOFF_MS = 1_500;
const HTTP_TOO_MANY = 429;
const HTTP_SERVER_ERROR = 500;

const lower = (address: string) => address.toLowerCase();
const hex = (value: bigint) => toHex(value);

class UpstreamError extends Error {
  constructor(readonly rpc: RpcError) {
    super(rpc.message);
  }
}

export class ShadowChain {
  private accounts = new Map<string, Account>();
  private txs = new Map<string, ShadowTx>();
  private server: Server | undefined;
  private nextId = 1;
  url = "";

  constructor(private readonly upstream: string) {}

  /** Every transaction the run would have sent, in order. */
  get sent(): ShadowTx[] {
    return [...this.txs.values()];
  }

  snapshot(): ShadowSnapshot {
    return { accounts: Object.fromEntries(this.accounts), txs: this.sent };
  }

  restore(snapshot: ShadowSnapshot) {
    this.accounts = new Map(Object.entries(snapshot.accounts));
    this.txs = new Map(snapshot.txs.map((tx) => [tx.hash, tx]));
  }

  async start(): Promise<string> {
    this.server = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => {
        void this.handle(Buffer.concat(chunks).toString("utf8")).then((body) => {
          response.writeHead(200, { "content-type": "application/json" });
          response.end(body);
        });
      });
    });
    await new Promise<void>((resolve) => this.server!.listen(0, "127.0.0.1", resolve));
    this.url = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
    return this.url;
  }

  async stop() {
    await new Promise<void>((resolve) => (this.server ? this.server.close(() => resolve()) : resolve()));
  }

  // --- funding -------------------------------------------------------------------------------------------------

  /** Arc's USDC is the native coin (18 decimals); its ERC-20 face at 0x3600 reads the same balance. */
  setNative(address: Address, amount: bigint) {
    this.account(address).balance = hex(amount);
  }

  /**
   * Gives `holder` `amount` of an ERC-20 by overriding the storage key its balanceOf reads: the node's access list for
   * balanceOf names the keys it touches; the one that, overridden, changes the answer is the balance (proxies and
   * namespaced storage included).
   */
  async setToken(token: Address, holder: Address, amount: bigint) {
    const data = encodeFunctionData({ abi: erc20Abi, functionName: "balanceOf", args: [holder] });
    const access = (await this.upstreamCall("eth_createAccessList", [{ from: holder, to: token, data }, "latest"])) as {
      accessList: { address: Address; storageKeys: Hex[] }[];
    };
    for (const entry of access.accessList) {
      for (const key of entry.storageKeys) {
        const probe = { [entry.address]: { stateDiff: { [key]: pad(hex(PROBE_UNITS), { size: 32 }) } } };
        const read = (await this.upstreamCall("eth_call", [{ to: token, data }, "latest", probe]).catch(() => undefined)) as Hex | undefined;
        if (read && read !== "0x" && BigInt(read) === PROBE_UNITS) {
          this.account(entry.address).stateDiff[key] = pad(hex(amount), { size: 32 });
          return;
        }
      }
    }
    throw new Error(`no balance slot found for ${token}`);
  }

  setCode(address: Address, code: Hex) {
    this.account(address).code = code;
  }

  // --- sending --------------------------------------------------------------------------------------------------

  /** Runs one call from `from` as a shadow transaction (the ops wallet's path) and returns its hash. */
  async execute(call: { from: Address; to: Address; data: Hex; value?: bigint; tag: string }): Promise<ShadowTx> {
    const nonce = BigInt((await this.read("eth_getTransactionCount", [call.from, "latest"])) as Hex);
    const hash = keccak256(toHex(`shadow:${call.tag}:${call.from}:${nonce}:${call.data}`));
    const existing = this.txs.get(hash);
    if (existing) return existing;
    return this.run({ hash, from: call.from, to: call.to, input: call.data, value: hex(call.value ?? 0n), nonce: hex(nonce), gas: undefined, type: TX_TYPES.eip1559!, maxFee: undefined });
  }

  private async sendRaw(raw: Hex): Promise<Hex> {
    const hash = keccak256(raw);
    if (this.txs.has(hash)) return hash;
    const parsed = parseTransaction(raw);
    const from = await recoverTransactionAddress({ serializedTransaction: raw as never });
    if (parsed.type === "eip7702") {
      for (const authorization of parsed.authorizationList ?? []) {
        const authority = await recoverAuthorizationAddress({ authorization });
        const target = authorization.address;
        const account = this.account(authority);
        account.code = `${DESIGNATOR_PREFIX}${target.slice(2).toLowerCase()}` as Hex;
        const current = BigInt((await this.read("eth_getTransactionCount", [authority, "latest"])) as Hex);
        account.nonce = hex(current + 1n);
      }
    }
    await this.run({
      hash,
      from,
      to: parsed.to ?? null,
      input: parsed.data ?? "0x",
      value: hex(parsed.value ?? 0n),
      nonce: hex(BigInt(parsed.nonce ?? 0)),
      // A type-4 limit carries the authorizations' intrinsic cost, which a plain simulated call does not charge.
      gas: parsed.type === "eip7702" ? undefined : parsed.gas,
      type: TX_TYPES[parsed.type ?? "eip1559"] ?? TX_TYPES.eip1559!,
      maxFee: parsed.maxFeePerGas ?? parsed.gasPrice,
    });
    return hash;
  }

  private async run(tx: { hash: Hex; from: Address; to: Address | null; input: Hex; value: Hex; nonce: Hex; gas: bigint | undefined; type: Hex; maxFee: bigint | undefined }): Promise<ShadowTx> {
    const call = { from: tx.from, to: tx.to ?? undefined, data: tx.input, value: tx.value, ...(tx.gas ? { gas: hex(tx.gas) } : {}) };
    const overrides = this.overrides();
    const [simulated] = (await this.upstreamCall("eth_simulateV1", [{ blockStateCalls: [{ stateOverrides: overrides, calls: [call] }], validation: false }, "latest"])) as {
      number: Hex;
      calls: { status: Hex; gasUsed: Hex; logs: RpcLog[]; error?: { message?: string; data?: Hex } }[];
    }[];
    const result = simulated!.calls[0]!;
    const success = result.status === "0x1";
    const gasUsed = BigInt(result.gasUsed);
    const price = tx.maxFee ?? BigInt((await this.upstreamCall("eth_gasPrice", [])) as Hex);
    if (success) {
      const diff = (await this.upstreamCall("debug_traceCall", [call, "latest", { tracer: "prestateTracer", tracerConfig: { diffMode: true }, stateOverrides: overrides }])) as {
        pre: Record<string, { storage?: Record<string, Hex> }>;
        post: Record<string, { balance?: Hex; nonce?: number | Hex; code?: Hex; storage?: Record<string, Hex> }>;
      };
      for (const [address, after] of Object.entries(diff.post)) {
        const account = this.account(address as Address);
        if (after.balance !== undefined) account.balance = after.balance;
        if (after.nonce !== undefined) account.nonce = hex(BigInt(after.nonce));
        if (after.code !== undefined) account.code = after.code;
        for (const [slot, value] of Object.entries(after.storage ?? {})) account.stateDiff[slot] = value;
      }
      // Diff mode leaves a slot that went to zero out of `post`.
      for (const [address, before] of Object.entries(diff.pre)) {
        const after = diff.post[address]?.storage ?? {};
        for (const slot of Object.keys(before.storage ?? {})) if (!(slot in after)) this.account(address as Address).stateDiff[slot] = pad("0x0", { size: 32 });
      }
    }
    // The sender's nonce moves either way; gas is charged at the signed maximum (an upper bound) when it can be paid.
    const sender = this.account(tx.from);
    const nonceNow = BigInt((await this.read("eth_getTransactionCount", [tx.from, "latest"])) as Hex);
    if (!success || nonceNow <= BigInt(tx.nonce)) sender.nonce = hex(BigInt(tx.nonce) + 1n);
    const balance = BigInt((await this.read("eth_getBalance", [tx.from, "latest"])) as Hex);
    const fee = gasUsed * price;
    if (balance >= fee) sender.balance = hex(balance - fee);

    const shadow: ShadowTx = {
      hash: tx.hash,
      from: tx.from,
      to: tx.to,
      input: tx.input,
      value: tx.value,
      nonce: tx.nonce,
      gas: hex(tx.gas ?? gasUsed),
      type: tx.type,
      status: success ? "success" : "reverted",
      gasUsed: result.gasUsed,
      effectiveGasPrice: hex(price),
      blockNumber: simulated!.number,
      logs: result.logs.map((log) => ({ address: log.address, topics: log.topics, data: log.data })),
      error: success ? undefined : (result.error?.message ?? "reverted"),
    };
    this.txs.set(tx.hash, shadow);
    return shadow;
  }

  // --- the endpoint --------------------------------------------------------------------------------------------

  private async handle(body: string): Promise<string> {
    let parsed: RpcRequest | RpcRequest[];
    try {
      parsed = JSON.parse(body) as RpcRequest | RpcRequest[];
    } catch {
      return JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: RPC_INVALID_PARAMS, message: "bad json" } });
    }
    const one = async (request: RpcRequest) => {
      try {
        return { jsonrpc: "2.0", id: request.id, result: await this.dispatch(request.method, request.params ?? []) };
      } catch (error) {
        const rpc = error instanceof UpstreamError ? error.rpc : { code: RPC_INTERNAL, message: error instanceof Error ? error.message : String(error) };
        return { jsonrpc: "2.0", id: request.id, error: rpc };
      }
    };
    return JSON.stringify(Array.isArray(parsed) ? await Promise.all(parsed.map(one)) : await one(parsed));
  }

  private async dispatch(method: string, params: unknown[]): Promise<unknown> {
    switch (method) {
      case "eth_sendRawTransaction":
        return this.sendRaw(params[0] as Hex);
      case "eth_getTransactionReceipt": {
        const tx = this.txs.get(params[0] as string);
        return tx ? receiptOf(tx) : this.upstreamCall(method, params);
      }
      case "eth_getTransactionByHash": {
        const tx = this.txs.get(params[0] as string);
        return tx ? transactionOf(tx) : this.upstreamCall(method, params);
      }
      default:
        return this.read(method, params);
    }
  }

  /** A read against mainnet state with the shadow state laid over it. */
  private async read(method: string, params: unknown[]): Promise<unknown> {
    switch (method) {
      case "eth_call":
      case "eth_estimateGas":
        return this.upstreamCall(method, [params[0], "latest", this.overrides(params[2] as Record<string, Partial<Account> & { state?: unknown }> | undefined)]);
      case "eth_simulateV1": {
        const [payload, block] = params as [{ blockStateCalls: { stateOverrides?: Record<string, Partial<Account>> }[] }, unknown];
        const [first, ...rest] = payload.blockStateCalls;
        return this.upstreamCall(method, [{ ...payload, blockStateCalls: [{ ...first, stateOverrides: this.overrides(first?.stateOverrides) }, ...rest] }, block ?? "latest"]);
      }
      case "eth_getBalance": {
        const account = this.accounts.get(lower(params[0] as string));
        return account?.balance ?? this.upstreamCall(method, [params[0], "latest"]);
      }
      case "eth_getCode": {
        const account = this.accounts.get(lower(params[0] as string));
        return account?.code ?? this.upstreamCall(method, [params[0], "latest"]);
      }
      case "eth_getTransactionCount": {
        const account = this.accounts.get(lower(params[0] as string));
        return account?.nonce ?? this.upstreamCall(method, [params[0], "latest"]);
      }
      case "eth_getStorageAt": {
        const account = this.accounts.get(lower(params[0] as string));
        const slot = pad(params[1] as Hex, { size: 32 });
        return account?.stateDiff[slot] ?? this.upstreamCall(method, [params[0], params[1], "latest"]);
      }
      default:
        return this.upstreamCall(method, params);
    }
  }

  /** The shadow accounts as an eth_call state override set, with the caller's own overrides on top. */
  private overrides(extra?: Record<string, Partial<Account> & { state?: unknown }>) {
    const out: Record<string, Record<string, unknown>> = {};
    for (const [address, account] of this.accounts) {
      const entry: Record<string, unknown> = {};
      if (account.balance) entry.balance = account.balance;
      if (account.nonce) entry.nonce = account.nonce;
      if (account.code) entry.code = account.code;
      if (Object.keys(account.stateDiff).length) entry.stateDiff = { ...account.stateDiff };
      out[address] = entry;
    }
    for (const [address, theirs] of Object.entries(extra ?? {})) {
      const key = lower(address);
      const mine = out[key] ?? {};
      const merged: Record<string, unknown> = { ...mine, ...theirs };
      if (theirs.state) delete merged.stateDiff;
      else if (mine.stateDiff || theirs.stateDiff) merged.stateDiff = { ...(mine.stateDiff as object), ...(theirs.stateDiff ?? {}) };
      out[key] = merged;
    }
    return out;
  }

  private account(address: Address): Account {
    const key = lower(address);
    let account = this.accounts.get(key);
    if (!account) {
      account = { stateDiff: {} };
      this.accounts.set(key, account);
    }
    return account;
  }

  /** One JSON-RPC call to the real node; a dropped connection or a rate limit is tried again. */
  private async upstreamCall(method: string, params: unknown[]): Promise<unknown> {
    let lastError: unknown;
    for (let attempt = 0; attempt < UPSTREAM_TRIES; attempt++) {
      if (attempt) await new Promise((resolve) => setTimeout(resolve, UPSTREAM_BACKOFF_MS * attempt));
      try {
        const response = await fetch(this.upstream, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: this.nextId++, method, params }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        if (response.status === HTTP_TOO_MANY || response.status >= HTTP_SERVER_ERROR) {
          lastError = new Error(`${method}: upstream ${response.status}`);
          continue;
        }
        const body = (await response.json()) as { result?: unknown; error?: RpcError };
        if (body.error) throw new UpstreamError(body.error);
        return body.result;
      } catch (error) {
        if (error instanceof UpstreamError) throw error;
        lastError = error;
      }
    }
    const cause = lastError instanceof Error ? `${lastError.message}${lastError.cause instanceof Error ? ` (${lastError.cause.message})` : ""}` : String(lastError);
    throw new Error(`${method} upstream: ${cause}`);
  }
}

function receiptOf(tx: ShadowTx) {
  const blockHash = keccak256(tx.hash);
  return {
    transactionHash: tx.hash,
    transactionIndex: "0x0",
    blockHash,
    blockNumber: tx.blockNumber,
    from: tx.from,
    to: tx.to,
    cumulativeGasUsed: tx.gasUsed,
    gasUsed: tx.gasUsed,
    effectiveGasPrice: tx.effectiveGasPrice,
    contractAddress: null,
    logs: tx.logs.map((log, index) => ({ ...log, logIndex: toHex(index), transactionHash: tx.hash, transactionIndex: "0x0", blockHash, blockNumber: tx.blockNumber, removed: false })),
    logsBloom: EMPTY_BLOOM,
    status: tx.status === "success" ? "0x1" : "0x0",
    type: tx.type,
  };
}

function transactionOf(tx: ShadowTx) {
  return {
    hash: tx.hash,
    from: tx.from,
    to: tx.to,
    input: tx.input,
    value: tx.value,
    nonce: tx.nonce,
    gas: tx.gas,
    gasPrice: tx.effectiveGasPrice,
    maxFeePerGas: tx.effectiveGasPrice,
    maxPriorityFeePerGas: "0x0",
    type: tx.type,
    blockHash: keccak256(tx.hash),
    blockNumber: tx.blockNumber,
    transactionIndex: "0x0",
    chainId: undefined,
    v: "0x0",
    r: "0x0",
    s: "0x0",
  };
}

/** The ops wallet in a dry run: its calls become shadow transactions from the real ops address. */
export function shadowOps(chain: ShadowChain, opsAddress: (network: NetworkId) => Address): OpsExecutor {
  const done = new Map<string, OpsTransaction>();
  return {
    async execute(call) {
      const seen = done.get(call.idempotencyKey);
      if (seen) return seen;
      const tx = await chain.execute({ from: opsAddress(call.network), to: call.contract, data: call.callData, tag: call.idempotencyKey });
      const result: OpsTransaction = { id: `shadow-${call.idempotencyKey}`, state: tx.status === "success" ? "complete" : "failed", txHash: tx.hash, error: tx.error };
      done.set(call.idempotencyKey, result);
      done.set(result.id, result);
      return result;
    },
    async get(_network, id) {
      return done.get(id) ?? { id, state: "failed", txHash: undefined, error: "unknown shadow transaction" };
    },
  };
}
