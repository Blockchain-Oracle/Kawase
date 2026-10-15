// M12 (security review 2026-10-03): a leaked bearer token alone must not spend within the allowance or delete the
// account. Those requests also carry a proof that the person's own wallet signed this very request (D41: a Privy key
// is not bound to the device, so the wallet itself proves it): the activity
//   "kawase:<unix ms>:<sha256 hex of `METHOD path\nbody`>"
// signed as an EIP-191 personal message by the account's registered wallet, in two headers (x-kawase-proof-activity
// and x-kawase-proof-signature). It holds when the signer is the account's wallet, the time is within a couple of
// minutes, the hash is this very request, and the proof was not used before.
//
// Old app builds send no proof: while DEVICE_PROOF_REQUIRED is off, nothing is refused (a proof that does not hold is
// logged, never trusted); once the app that proves is out, the flag makes a valid proof required.
import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { Context, MiddlewareHandler } from "hono";
import { isHex, recoverMessageAddress } from "viem";

import { wallets, type Db } from "@kawase/db";

import { HTTP, problem } from "../http/problem";
import type { AppEnv } from "../types";

/** The activity string, and the wallet's personal-message signature over it. */
export const PROOF_ACTIVITY_HEADER = "x-kawase-proof-activity";
export const PROOF_SIGNATURE_HEADER = "x-kawase-proof-signature";
/** How far a proof's time may be from the server's. */
const PROOF_WINDOW_MS = 120_000;
/** A used proof is remembered until it could no longer pass the time check from either side (twice the window). */
const USED_MEMORY_MS = 240_000;
const ACTIVITY = /^kawase:(\d{13}):([0-9a-f]{64})$/;

/** The activity id a device signs for one request (the app computes the same). */
export const proofActivity = (method: string, path: string, body: string, at: number) =>
  `kawase:${at}:${createHash("sha256").update(`${method.toUpperCase()} ${path}\n${body}`).digest("hex")}`;

/** Proofs already used, until they could no longer pass the time check anyway. */
const used = new Map<string, number>();
const forgetOld = (now: number) => {
  for (const [key, until] of used) if (until < now) used.delete(key);
};

export type DeviceProofOutcome = "proven" | "absent" | "invalid";

/** The person's own wallet signed this exact request; a leaked Kawase token alone cannot make it. */
async function checkWalletProof(db: Db, c: Context<AppEnv>, activity: string | undefined, signature: string | undefined): Promise<DeviceProofOutcome> {
  const userId = c.get("userId");
  if (!activity || !signature || !userId || !c.get("sessionId") || !isHex(signature)) return "invalid";
  const match = ACTIVITY.exec(activity);
  if (!match) return "invalid";
  const now = Date.now();
  const at = Number(match[1]);
  if (Math.abs(now - at) > PROOF_WINDOW_MS) return "invalid";
  const requestBody = await c.req.text();
  if (proofActivity(c.req.method, c.req.path, requestBody, at) !== activity) return "invalid";
  const [wallet] = await db
    .select({ address: wallets.address })
    .from(wallets)
    .where(and(eq(wallets.userId, userId), eq(wallets.role, "user"), eq(wallets.status, "active")));
  if (!wallet) return "invalid";
  const signer = await recoverMessageAddress({ message: activity, signature }).catch(() => undefined);
  if (!signer || signer.toLowerCase() !== wallet.address.toLowerCase()) return "invalid";
  forgetOld(now);
  const key = `${wallet.address.toLowerCase()}:${activity}`;
  if (used.has(key)) return "invalid";
  used.set(key, now + USED_MEMORY_MS);
  return "proven";
}

/** Whether this request carries a valid proof from the person's wallet. */
export async function checkDeviceProof(db: Db, c: Context<AppEnv>): Promise<DeviceProofOutcome> {
  const activity = c.req.header(PROOF_ACTIVITY_HEADER);
  const signature = c.req.header(PROOF_SIGNATURE_HEADER);
  if (!activity && !signature) return "absent";
  return checkWalletProof(db, c, activity, signature);
}

/**
 * For the requests a bearer token alone may not make. Once proofs are required, one that does not hold is refused
 * (401) and a missing one too (403); before that nothing is refused, and one that does not hold is only logged. The
 * outcome is left on the context for the handler.
 */
export function requireDeviceProof(db: Db, required: boolean): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const outcome = await checkDeviceProof(db, c);
    if (outcome === "invalid") {
      c.get("log").warn({ path: c.req.path, userId: c.get("userId") }, "security.device_proof_invalid");
      if (required) throw problem(HTTP.unauthorized, "proof_invalid", "the device proof does not hold");
    }
    if (outcome === "absent" && required) throw problem(HTTP.forbidden, "device_proof_required", "this needs the proof from your signed-in device; update the app");
    c.set("deviceProven", outcome === "proven");
    await next();
  };
}

/** For requests that may go on without a proof but do less without one (a chat turn sends inside the allowance only with it). */
export function markDeviceProof(db: Db): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    c.set("deviceProven", (await checkDeviceProof(db, c)) === "proven");
    await next();
  };
}
