// The proof a request carries from this device's own Turnkey key (security review M12): approving a send, a waiting
// run, or deleting the account is never done on the Kawase session token alone. The Turnkey session stamps a "get
// activity" body whose activity id names this exact request ("kawase:<ms>:<sha256 of `METHOD path\nbody`>"), the way
// sign-in proves the session; the api checks the stamp's key is the one this device signed in with.
import { toast } from "sonner-native";
import { sha256, stringToBytes } from "viem";

import { ApiError } from "@kawase/api-client";

/** Stamps a Turnkey "get activity" body for this activity id with the session's key; undefined without a session. */
export type DeviceProver = (activityId: string) => Promise<{ body: string; stamp: string } | undefined>;

let prover: DeviceProver | undefined;

/** Set by the Turnkey account while a session is on the device; cleared when it ends. */
export function setDeviceProver(next: DeviceProver | undefined) {
  prover = next;
}

const HEX_PREFIX = 2;

/** The headers for one request (none when the device cannot prove: no Turnkey session). */
export async function deviceProofHeaders(request: { method: string; path: string; body: string }): Promise<Record<string, string>> {
  if (!prover) return {};
  const digest = sha256(stringToBytes(`${request.method.toUpperCase()} ${request.path}\n${request.body}`)).slice(HEX_PREFIX);
  const signed = await prover(`kawase:${Date.now()}:${digest}`);
  return signed ? { "x-kawase-proof-body": signed.body, "x-kawase-proof-stamp": signed.stamp } : {};
}

/**
 * A message as the chat sends it, carrying the proof over its exact body: inside the allowance the agent may then send
 * by itself (the api refuses that to a bearer token alone once proofs are required).
 */
export function provenFetch(base: typeof fetch, path: string): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const body = typeof init?.body === "string" ? init.body : "";
    const proof = await deviceProofHeaders({ method: init?.method ?? "POST", path, body }).catch(() => ({}));
    const headers = { ...Object.fromEntries(new Headers(init?.headers).entries()), ...proof };
    return base(input, { ...init, headers });
  }) as typeof fetch;
}

/** The api wanted this device's proof and did not get a valid one (the Turnkey session ended): said plainly once. */
export function sayIfProofNeeded(error: unknown, t: (key: string) => string): boolean {
  if (!(error instanceof ApiError) || (error.code !== "device_proof_required" && error.code !== "proof_invalid")) return false;
  toast(t("errors.deviceProofNeeded"));
  return true;
}
