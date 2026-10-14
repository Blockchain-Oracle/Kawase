// M12 (security review 2026-10-03): a leaked bearer token alone must not spend within the allowance or delete the
// account. Those requests also carry a proof from this device's own Turnkey session key, the same kind of stamp a
// sign-in carries (turnkey-proof.ts), over a Turnkey "get activity" body:
//   {"organizationId": <the person's sub-organization>, "activityId": "kawase:<unix ms>:<sha256 hex of `METHOD path\nbody`>"}
// in two headers (the exact body that was signed, and the X-Stamp value). It holds when the stamp verifies, its key is
// the one that proved this device's sign-in (devices.turnkey_public_key), the organization is the person's, the time
// is within a couple of minutes, the hash is this very request, and the proof was not used before.
//
// A Turnkey session renews its key now and then; a proof from a key this device did not sign in with still holds when
// Turnkey lists it as one of the person's current session keys, and the device then remembers the new key.
//
// With Privy (D41) there is no session key to stamp with: the app sends the same activity string signed by the
// person's registered wallet (x-kawase-proof-activity + x-kawase-proof-signature, checkWalletProof below).
//
// Old app builds send no proof: while DEVICE_PROOF_REQUIRED is off, nothing is refused (a proof that does not hold is
// logged, never trusted); once the app that proves is out, the flag makes a valid proof required.
import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { Context, MiddlewareHandler } from "hono";
import { isHex, recoverMessageAddress } from "viem";

import { devices, sessions, wallets, type Db } from "@kawase/db";

import { HTTP, problem } from "../http/problem";
import type { AppEnv } from "../types";
import type { TurnkeyReader } from "./turnkey";
import { parseStamp, proofClaims, verifyStamp } from "./turnkey-proof";

export const PROOF_BODY_HEADER = "x-kawase-proof-body";
export const PROOF_STAMP_HEADER = "x-kawase-proof-stamp";
/** Privy: the activity string, and the wallet's personal-message signature over it. */
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

/** Whether this request carries a valid proof from the device its session belongs to. */
/**
 * Privy (D41): a Privy key is not bound to the device, so the proof is the person's own wallet signing this exact
 * request (EIP-191 personal message = the activity string above). A leaked Kawase token alone cannot make it; the
 * wallet is the one registered for the account.
 */
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

export async function checkDeviceProof(db: Db, c: Context<AppEnv>, turnkey?: TurnkeyReader): Promise<DeviceProofOutcome> {
  const activity = c.req.header(PROOF_ACTIVITY_HEADER);
  const walletSignature = c.req.header(PROOF_SIGNATURE_HEADER);
  if (activity || walletSignature) return checkWalletProof(db, c, activity, walletSignature);
  const body = c.req.header(PROOF_BODY_HEADER);
  const stampHeader = c.req.header(PROOF_STAMP_HEADER);
  if (!body && !stampHeader) return "absent";
  const user = c.get("user");
  const sessionId = c.get("sessionId");
  if (!body || !stampHeader || !user || !sessionId) return "invalid";
  let stamp;
  try {
    stamp = parseStamp(stampHeader);
  } catch {
    return "invalid";
  }
  const claims = proofClaims(body);
  const match = claims ? ACTIVITY.exec(claims.nonce) : null;
  if (!claims || !match || claims.organizationId !== user.turnkeySubOrganizationId) return "invalid";
  const now = Date.now();
  const at = Number(match[1]);
  if (Math.abs(now - at) > PROOF_WINDOW_MS) return "invalid";
  const requestBody = await c.req.text();
  if (proofActivity(c.req.method, c.req.path, requestBody, at) !== claims.nonce) return "invalid";
  if (!verifyStamp(body, stamp)) return "invalid";
  const [device] = await db
    .select({ id: devices.id, key: devices.turnkeyPublicKey })
    .from(sessions)
    .innerJoin(devices, eq(devices.id, sessions.deviceId))
    .where(eq(sessions.id, sessionId));
  if (!device) return "invalid";
  if (device.key !== stamp.publicKey) {
    // A renewed Turnkey session: Turnkey must list the key as one of this person's now.
    const current = turnkey && user.turnkeyUserId ? await turnkey.getUser(claims.organizationId, user.turnkeyUserId).catch(() => undefined) : undefined;
    if (!current?.sessionPublicKeys.includes(stamp.publicKey)) return "invalid";
    await db.update(devices).set({ turnkeyPublicKey: stamp.publicKey }).where(eq(devices.id, device.id));
  }
  forgetOld(now);
  const key = `${stamp.publicKey}:${claims.nonce}`;
  if (used.has(key)) return "invalid";
  used.set(key, now + USED_MEMORY_MS);
  return "proven";
}

/**
 * For the requests a bearer token alone may not make. Once proofs are required, one that does not hold is refused
 * (401) and a missing one too (403); before that nothing is refused, and one that does not hold is only logged. The
 * outcome is left on the context for the handler.
 */
export function requireDeviceProof(db: Db, required: boolean, turnkey?: TurnkeyReader): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const outcome = await checkDeviceProof(db, c, turnkey);
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
export function markDeviceProof(db: Db, turnkey?: TurnkeyReader): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    c.set("deviceProven", (await checkDeviceProof(db, c, turnkey)) === "proven");
    await next();
  };
}
