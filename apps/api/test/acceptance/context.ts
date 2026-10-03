// What a step gets: the api as the signed-in acceptance account, its wallet signer, chain reads, and the run's record
// (every transaction with its explorer link, notes, values handed to later steps). Steps fail by throwing StepFailed
// with a reason a person can act on; the runner stops there.
import { randomUUID } from "node:crypto";
import { createPublicClient, erc20Abi, formatUnits, http, type Address, type Hex, type PublicClient, type TypedDataDefinition } from "viem";

import type { UnsignedTransaction } from "@kawase/api-client";
import type { WalletSigner } from "@kawase/wallet";

import type { AcceptanceAccount } from "./account";

export type Mode = "dry" | "live";
export type Card = "setup" | "trade" | "money-in" | "money-out" | "earn-borrow" | "marketplace" | "automate-safety";
export type TxRecord = { step: string; what: string; hash: string; url: string | null; shadow: boolean };

export class StepFailed extends Error {}
/** The step cannot run here (a manual walk, a missing key, no model credit); the run carries on. */
export class StepSkipped extends Error {}

export type Step = {
  id: string;
  card: Card;
  /** The checklist line this step proves. */
  title: string;
  /** The most this step can cost the account (fees, slippage, gas, payments to others), in dollars. */
  worstCaseUsd: number;
  /** Needs a live model turn: skipped when the OpenAI key has no credit. */
  agent?: boolean;
  run(ctx: Ctx): Promise<void>;
};

const REQUEST_TIMEOUT_MS = 120_000;
const POLL_MS = 4_000;

export type ApiTransport = (method: string, path: string, init: RequestInit) => Promise<Response>;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: Record<string, unknown>,
    what: string,
  ) {
    super(`${what}: ${status} ${String(body.code ?? body.title ?? "")} ${String(body.detail ?? "")}`.trim());
  }
}

export class Api {
  token = "";
  constructor(private readonly transport: ApiTransport) {}

  async call<T>(method: string, path: string, body?: unknown, options: { idempotencyKey?: string; auth?: boolean } = {}): Promise<T> {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers["content-type"] = "application/json";
    if (this.token && options.auth !== false) headers.authorization = `Bearer ${this.token}`;
    if (options.idempotencyKey) headers["idempotency-key"] = options.idempotencyKey;
    const response = await this.transport(method, path, { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    const text = await response.text();
    const parsed = (text ? JSON.parse(text) : {}) as Record<string, unknown>;
    if (!response.ok) throw new ApiError(response.status, parsed, `${method} ${path}`);
    return parsed as T;
  }

  /** The body as text (a stream read to its end). */
  async raw(method: string, path: string, body: unknown): Promise<string> {
    const response = await this.transport(method, path, {
      method,
      headers: { "content-type": "application/json", authorization: `Bearer ${this.token}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const text = await response.text();
    if (!response.ok) throw new ApiError(response.status, (text.startsWith("{") ? JSON.parse(text) : { detail: text }) as Record<string, unknown>, `${method} ${path}`);
    return text;
  }

  get = <T>(path: string) => this.call<T>("GET", path);
  post = <T>(path: string, body: unknown = {}, idempotencyKey?: string) => this.call<T>("POST", path, body, idempotencyKey ? { idempotencyKey } : {});
  put = <T>(path: string, body: unknown) => this.call<T>("PUT", path, body);
  patch = <T>(path: string, body: unknown) => this.call<T>("PATCH", path, body);
  del = <T>(path: string) => this.call<T>("DELETE", path);
}

export type Ctx = {
  mode: Mode;
  step: Step;
  api: Api;
  account: AcceptanceAccount;
  signer: WalletSigner;
  /** Signs for account 1 (the "friend" address), for steps that move money back. */
  friendSigner: WalletSigner;
  /** Arc reads: the shadow chain in a dry run, mainnet when live. */
  arc: PublicClient;
  explorer: string;
  agentAvailable: boolean;
  /** Dry run: why a shadow transaction reverted (its revert message). */
  shadowError?: (hash: string) => string | undefined;
  /** Values earlier steps left for later ones (a position id, a contact id), persisted with the run. */
  data: Record<string, unknown>;
  note(text: string): void;
  tx(what: string, hash: string): void;
};

export function makeCtx(base: Omit<Ctx, "note" | "tx" | "step">, step: Step, record: { notes: string[]; txs: TxRecord[] }): Ctx {
  return {
    ...base,
    step,
    note(text) {
      record.notes.push(text);
      console.log(`      · ${text}`);
    },
    tx(what, hash) {
      const shadow = base.mode === "dry";
      const url = `${base.explorer}/tx/${hash}`;
      record.txs.push({ step: step.id, what, hash, url: shadow ? null : url, shadow });
      console.log(shadow ? `      ⛓ ${what}: ${hash} (simulated on mainnet state, not sent)` : `      ⛓ ${what}: ${hash}\n        ${url}`);
    },
  };
}

export const arcClient = (rpc: string): PublicClient => createPublicClient({ transport: http(rpc, { timeout: REQUEST_TIMEOUT_MS }) }) as PublicClient;

export async function tokenBalance(ctx: Pick<Ctx, "arc">, token: Address, holder: Address, decimals: number): Promise<number> {
  const raw = await ctx.arc.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [holder] });
  return Number(formatUnits(raw, decimals));
}

export const fail = (reason: string): never => {
  throw new StepFailed(reason);
};

export function check(condition: unknown, reason: string): asserts condition {
  if (!condition) throw new StepFailed(reason);
}

/** Polls until `done` returns a value, or fails with what it last saw. */
export async function waitFor<T>(what: string, read: () => Promise<T>, done: (value: T) => boolean, timeoutMs: number): Promise<T> {
  const until = Date.now() + timeoutMs;
  let last = await read();
  while (!done(last)) {
    if (Date.now() > until) throw new StepFailed(`${what}: still ${JSON.stringify(last).slice(0, 400)} after ${Math.round(timeoutMs / 1000)}s`);
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    last = await read();
  }
  return last;
}

export async function signTransaction(ctx: Pick<Ctx, "signer">, unsigned: UnsignedTransaction): Promise<Hex> {
  return ctx.signer.signTransaction({
    type: "eip1559",
    chainId: unsigned.chainId,
    nonce: unsigned.nonce,
    to: unsigned.to,
    data: unsigned.data,
    value: BigInt(unsigned.value),
    gas: BigInt(unsigned.gas),
    maxFeePerGas: BigInt(unsigned.maxFeePerGas),
    maxPriorityFeePerGas: BigInt(unsigned.maxPriorityFeePerGas),
  });
}

export async function signTypedData(ctx: Pick<Ctx, "signer">, typedData: Record<string, unknown>): Promise<Hex> {
  return ctx.signer.signTypedData(typedData as unknown as TypedDataDefinition);
}

export const idem = () => randomUUID();
