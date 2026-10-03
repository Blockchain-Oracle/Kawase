// No database or network: pnpm --filter @kawase/api exec tsx --test test/turnkey-email.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";

import { emailIsProved } from "../src/auth/turnkey";

const ME = "user-me";

test("the email set at sign-up is kept when it was never changed", () => {
  assert.equal(emailIsProved([], ME, "amina@example.test"), true);
});

test("an email set without a verification token is not trusted (someone else's address)", () => {
  const changes = [{ at: 200, change: { userId: ME, userEmail: "victim@example.test" } }];
  assert.equal(emailIsProved(changes, ME, "victim@example.test"), false);
});

test("a change that carried an OTP verification token is trusted, whatever the case", () => {
  const changes = [{ at: 200, change: { userId: ME, userEmail: "New@Example.test", verificationToken: "jwt" } }];
  assert.equal(emailIsProved(changes, ME, "new@example.test"), true);
});

test("only the latest change counts: a verified change followed by an unverified one is refused", () => {
  const changes = [
    { at: 100, change: { userId: ME, userEmail: "mine@example.test", verificationToken: "jwt" } },
    { at: 300, change: { userId: ME, userEmail: "victim@example.test" } },
  ];
  assert.equal(emailIsProved(changes, ME, "victim@example.test"), false);
});

test("another user's changes in the same sub-organization don't decide mine", () => {
  const changes = [{ at: 200, change: { userId: "user-other", userEmail: "amina@example.test" } }];
  assert.equal(emailIsProved(changes, ME, "amina@example.test"), true);
});
