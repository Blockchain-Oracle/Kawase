// The voice token: what lets Kawase's voice worker ask for agent turns on one person's behalf, in one thread, for one
// session. The api issues it with the LiveKit token (inside the agent dispatch's metadata, which only the worker
// reads) and is the only one who checks it: base64url(payload).base64url(HMAC-SHA256(payload)), keyed by a value
// derived from the LiveKit API secret (private to the api, stable across restarts, no extra variable).
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { MS_PER_SECOND } from "@kawase/config";

export type VoiceClaims = { sub: string; thread: string; exp: number };

const KEY_LABEL = "kawase-voice-token-v1:";
const keyFrom = (livekitSecret: string) => createHash("sha256").update(KEY_LABEL + livekitSecret).digest();
const encode = (value: Buffer | string) => Buffer.from(value).toString("base64url");
const signature = (key: Buffer, payload: string) => createHmac("sha256", key).update(payload).digest();

export function signVoiceToken(claims: VoiceClaims, livekitSecret: string): string {
  const payload = encode(JSON.stringify(claims));
  return `${payload}.${encode(signature(keyFrom(livekitSecret), payload))}`;
}

/** The claims, or undefined for a token that is malformed, forged or expired. */
export function verifyVoiceToken(token: string, livekitSecret: string): VoiceClaims | undefined {
  const [payload, mac] = token.split(".");
  if (!payload || !mac) return undefined;
  const expected = signature(keyFrom(livekitSecret), payload);
  const given = Buffer.from(mac, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return undefined;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as VoiceClaims;
    if (typeof claims.sub !== "string" || typeof claims.thread !== "string" || typeof claims.exp !== "number") return undefined;
    return claims.exp * MS_PER_SECOND > Date.now() ? claims : undefined;
  } catch {
    return undefined;
  }
}
