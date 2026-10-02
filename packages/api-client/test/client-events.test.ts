import assert from "node:assert/strict";
import { test } from "node:test";

import { CLIENT_EVENT_LIMITS, redactDiagnostic } from "../src/index";

test("takes out emails, codes, keys and tokens and keeps the rest of the message", () => {
  const text = [
    "Failed for ama+test@sharklasers.com with code 482913",
    "key 02a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f9a",
    "Bearer abc.def-123",
    "jwt eyJhbGciOiJFUzI1NiJ9.eyJzdWIiOiJ4In0.c2ln",
    "crypto.getRandomValues must be defined",
  ].join("; ");
  const out = redactDiagnostic(text);
  assert.equal(
    out,
    "Failed for [email] with code [digits]; key [hex]; Bearer [token]; jwt [jwt]; crypto.getRandomValues must be defined",
  );
});

test("cuts long messages to the limit", () => {
  const out = redactDiagnostic("word ".repeat(200));
  assert.equal(out.length, CLIENT_EVENT_LIMITS.messageMax);
  assert.ok(out.endsWith("…"));
});
