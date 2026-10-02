// A short-lived link to one month's history file (export_history from chat): the share sheet or a browser opens it
// without the session, so the link itself carries who, which network, which month and format, and when it ends —
// base64url(claims).base64url(HMAC-SHA256(claims)), keyed by a value derived from the agent's approval secret (private
// to the api; without it, a key for this process only, so links die with a restart). Read-only: it can only fetch that
// one file, for 15 minutes.
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { MS_PER_SECOND, SECONDS_PER_MINUTE } from "@kawase/config";
import type { NetworkId } from "@kawase/networks";

export type ExportClaims = { sub: string; network: NetworkId; month: string; format: "csv" | "beancount"; exp: number };

const KEY_LABEL = "kawase-export-link-v1:";
const PROCESS_KEY_BYTES = 32;
const LINK_MINUTES = 15;
export const EXPORT_LINK_SECONDS = LINK_MINUTES * SECONDS_PER_MINUTE;

const encode = (value: Buffer | string) => Buffer.from(value).toString("base64url");

export class ExportLinks {
  private readonly key: Buffer;

  constructor(secret: string | undefined) {
    this.key = createHash("sha256")
      .update(KEY_LABEL + (secret ?? randomBytes(PROCESS_KEY_BYTES).toString("hex")))
      .digest();
  }

  private mac(payload: string) {
    return createHmac("sha256", this.key).update(payload).digest();
  }

  sign(claims: Omit<ExportClaims, "exp">, now = Date.now()): { token: string; expiresAt: Date } {
    const exp = Math.floor(now / MS_PER_SECOND) + EXPORT_LINK_SECONDS;
    const payload = encode(JSON.stringify({ ...claims, exp }));
    return { token: `${payload}.${encode(this.mac(payload))}`, expiresAt: new Date(exp * MS_PER_SECOND) };
  }

  /** The claims, or undefined for a link that is malformed, forged or expired. */
  verify(token: string): ExportClaims | undefined {
    const [payload, mac] = token.split(".");
    if (!payload || !mac) return undefined;
    const expected = this.mac(payload);
    const given = Buffer.from(mac, "base64url");
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return undefined;
    try {
      const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as ExportClaims;
      if (typeof claims.sub !== "string" || typeof claims.exp !== "number" || !/^\d{4}-\d{2}$/.test(claims.month)) return undefined;
      if (claims.format !== "csv" && claims.format !== "beancount") return undefined;
      if (claims.network !== "mainnet" && claims.network !== "testnet") return undefined;
      return claims.exp * MS_PER_SECOND > Date.now() ? claims : undefined;
    } catch {
      return undefined;
    }
  }
}
