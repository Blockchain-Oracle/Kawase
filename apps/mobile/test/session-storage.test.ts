import assert from "node:assert/strict";
import { test } from "node:test";
import { orderedWrite } from "../src/session/write-queue";

test("a late old-session deletion cannot erase the token adopted after it", async () => {
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  let stored: string | undefined = "guest";
  const clearing = orderedWrite("test.session", async () => {
    await waiting;
    stored = undefined;
  });
  const adopting = orderedWrite("test.session", async () => {
    stored = "fresh-account";
  });
  await Promise.resolve();
  assert.equal(stored, "guest");
  release();
  await Promise.all([clearing, adopting]);
  assert.equal(stored, "fresh-account");
});

test("a failed storage operation does not prevent a later sign-in from writing its token", async () => {
  const failure = orderedWrite("test.failed-session", async () => {
    throw new Error("storage unavailable");
  });
  let stored: string | undefined;
  const recovery = orderedWrite("test.failed-session", async () => {
    stored = "retry-account";
  });
  await assert.rejects(failure, /storage unavailable/);
  await recovery;
  assert.equal(stored, "retry-account");
});
