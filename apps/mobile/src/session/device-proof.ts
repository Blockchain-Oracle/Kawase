// The proof a request carries from this device's own wallet session (security review M12): approving a send, a waiting
// run, or deleting the account is never done on the Kawase session token alone. The device signs an activity id that
// names this exact request ("kawase:<ms>:<sha256 of `METHOD path\nbody`>") as a personal message with the person's own
// wallet (Privy, D41; the dev key in local development), and the api checks it recovers to their registered wallet.
import { toast } from "sonner-native";
import { sha256, stringToBytes } from "viem";

import { ApiError } from "@kawase/api-client";

/** Proves one activity id: the headers to send, or undefined when this device cannot prove (no wallet session). */
export type DeviceProver = (activityId: string) => Promise<Record<string, string> | undefined>;

let prover: DeviceProver | undefined;

/** Set by the wallet provider while a session is on the device; cleared when it ends. */
export function setDeviceProver(next: DeviceProver | undefined) {
  prover = next;
}

const HEX_PREFIX = 2;

/** The headers for one request (none when the device cannot prove). */
export async function deviceProofHeaders(request: { method: string; path: string; body: string }): Promise<Record<string, string>> {
  if (!prover) return {};
  const digest = sha256(stringToBytes(`${request.method.toUpperCase()} ${request.path}\n${request.body}`)).slice(HEX_PREFIX);
  return (await prover(`kawase:${Date.now()}:${digest}`)) ?? {};
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

/** The api wanted this device's proof and did not get a valid one (the wallet session ended): said plainly once. */
export function sayIfProofNeeded(error: unknown, t: (key: string) => string): boolean {
  if (!(error instanceof ApiError) || (error.code !== "device_proof_required" && error.code !== "proof_invalid")) return false;
  toast(t("errors.deviceProofNeeded"));
  return true;
}
