import assert from "node:assert/strict";
import test from "node:test";
import { AudioOwnership } from "../src/feedback/audio-ownership";

test("a voice claim invalidates an effect already configuring and waits for its handoff", async () => {
  const ownership = new AudioOwnership();
  let continueConfiguration!: () => void;
  const configuring = new Promise<void>((resolve) => {
    continueConfiguration = resolve;
  });
  const events: string[] = [];
  const effect = ownership.effect(async (allowed) => {
    events.push("configuring");
    await configuring;
    if (allowed()) events.push("played");
  });
  await Promise.resolve();
  await Promise.resolve();
  const claim = ownership.claimCommunication(async () => {
    events.push("handoff");
  });
  assert.equal(ownership.communicationActive, true);
  continueConfiguration();
  await effect;
  const release = await claim;
  assert.deepEqual(events, ["configuring", "handoff"]);
  await ownership.effect(async () => {
    events.push("during-voice");
  });
  assert.deepEqual(events, ["configuring", "handoff"]);
  release();
  await ownership.effect(async () => {
    events.push("after-voice");
  });
  assert.deepEqual(events, ["configuring", "handoff", "after-voice"]);
});

test("background cancellation and failed handoffs do not retain ownership or replay queued effects", async () => {
  const ownership = new AudioOwnership();
  let played = false;
  const queued = ownership.effect(async () => {
    played = true;
  });
  ownership.cancelEffects();
  await queued;
  assert.equal(played, false);
  await assert.rejects(
    ownership.claimCommunication(async () => {
      throw new Error("handoff failed");
    }),
  );
  assert.equal(ownership.communicationActive, false);
  await ownership.effect(async () => {
    played = true;
  });
  assert.equal(played, true);
});

test("a retry waits for the previous communication session to finish stopping", async () => {
  const ownership = new AudioOwnership();
  const events: string[] = [];
  const release = await ownership.claimCommunication(async () => {
    events.push("first");
  });
  const retry = ownership.claimCommunication(async () => {
    events.push("retry");
  });
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(events, ["first"]);
  release();
  const releaseRetry = await retry;
  assert.deepEqual(events, ["first", "retry"]);
  releaseRetry();
  assert.equal(ownership.communicationActive, false);
});
