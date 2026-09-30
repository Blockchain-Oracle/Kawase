// A sign-in proof is a Turnkey stamp: the client signs a request body with its session key exactly the way it
// signs requests to Turnkey (ECDSA P-256 over SHA-256 of the body, DER, in the X-Stamp header). The body carries
// our single-use nonce, so a captured proof cannot be replayed.
import { createPublicKey, verify } from "node:crypto";
import { pointDecode } from "@turnkey/api-key-stamper";

export type StampedProof = {
  /** The exact string that was signed. */
  body: string;
  /** The X-Stamp header value (base64url JSON). */
  stamp: string;
};

type Stamp = { publicKey: string; scheme: string; signature: string };

const SCHEME = "SIGNATURE_SCHEME_TK_API_P256";

export function parseStamp(stampHeader: string): Stamp {
  const decoded = JSON.parse(Buffer.from(stampHeader, "base64url").toString("utf8")) as Partial<Stamp>;
  if (decoded.scheme !== SCHEME || typeof decoded.publicKey !== "string" || typeof decoded.signature !== "string") {
    throw new Error("not a Turnkey P-256 stamp");
  }
  return decoded as Stamp;
}

/** True when `signature` (DER hex) is a valid P-256 signature of `body` by the compressed public key. */
export function verifyStamp(body: string, stamp: Stamp): boolean {
  try {
    const jwk = pointDecode(Buffer.from(stamp.publicKey, "hex"));
    if (!jwk.x || !jwk.y) return false;
    const key = createPublicKey({ key: { kty: "EC", crv: "P-256", x: jwk.x, y: jwk.y }, format: "jwk" });
    return verify("sha256", Buffer.from(body, "utf8"), key, Buffer.from(stamp.signature, "hex"));
  } catch {
    return false;
  }
}

export type ProofClaims = { organizationId: string; nonce: string };

/** The body the client signs: a Turnkey "get activity" request whose activityId is our nonce. */
export function proofClaims(body: string): ProofClaims | undefined {
  try {
    const parsed = JSON.parse(body) as { organizationId?: unknown; activityId?: unknown };
    if (typeof parsed.organizationId !== "string" || typeof parsed.activityId !== "string") return undefined;
    return { organizationId: parsed.organizationId, nonce: parsed.activityId };
  } catch {
    return undefined;
  }
}
