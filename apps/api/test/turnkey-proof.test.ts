import assert from "node:assert/strict";
import { test } from "node:test";

import { parseStamp, proofClaims, verifyStamp } from "../src/auth/turnkey-proof";
import { stampBody, turnkeyStyleKeyPair } from "./helpers";

test("a stamp made by Turnkey's stamper verifies, and a changed body does not", async () => {
  const key = turnkeyStyleKeyPair();
  const body = JSON.stringify({ organizationId: "org", activityId: "nonce-1" });
  const stamp = parseStamp(await stampBody(body, key));
  assert.equal(stamp.publicKey, key.publicKeyHex);
  assert.equal(verifyStamp(body, stamp), true);
  assert.equal(verifyStamp(body.replace("nonce-1", "nonce-2"), stamp), false);
  assert.equal(verifyStamp(body, { ...stamp, publicKey: turnkeyStyleKeyPair().publicKeyHex }), false);
});

test("claims come only from a well-formed body", () => {
  assert.deepEqual(proofClaims('{"organizationId":"o","activityId":"n"}'), { organizationId: "o", nonce: "n" });
  assert.equal(proofClaims('{"organizationId":"o"}'), undefined);
  assert.equal(proofClaims("not json"), undefined);
});

test("only P-256 stamps are accepted", () => {
  const header = Buffer.from(
    JSON.stringify({ publicKey: "02ab", scheme: "SIGNATURE_SCHEME_TK_WEBAUTHN_V2", signature: "00" }),
  ).toString("base64url");
  assert.throws(() => parseStamp(header), /not a Turnkey P-256 stamp/);
});
