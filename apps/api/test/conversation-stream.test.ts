import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { eq } from "drizzle-orm";
import { simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { threadMessages, threadTurns } from "@kawase/db";
import { createLogger } from "@kawase/log";
import { createApp } from "../src/app";
import { deleteUser, fakeTurnkey, jsonRequest, noChains, noOps, okFaucet, testApp } from "./helpers";

const turnkey = fakeTurnkey({});
const { db, close } = testApp(turnkey);
const model = new MockLanguageModelV4({
  doStream: async () => ({
    stream: simulateReadableStream({
      chunkDelayInMs: 5,
      chunks: [
        { type: "text-start", id: "answer" },
        { type: "text-delta", id: "answer", delta: "Hello from Kawase." },
        { type: "text-end", id: "answer" },
        {
          type: "finish",
          finishReason: { unified: "stop", raw: "stop" },
          usage: {
            inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
            outputTokens: { total: 4, text: 4, reasoning: 0 },
          },
        },
      ],
    }),
  }),
});
const app = createApp({
  db,
  turnkey,
  chains: noChains,
  ops: noOps,
  faucet: okFaucet,
  log: createLogger({ service: "turn-stream-test", level: "silent" }),
  models: { forRole: () => model, hasKeyFor: () => true },
});
const guest = await app.request(
  "/auth/guest",
  jsonRequest("POST", { device: { installationId: randomUUID(), platform: "ios" } }),
);
const { token, user } = (await guest.json()) as { token: string; user: { id: string } };
after(async () => {
  await deleteUser(db, user.id);
  await close();
});

test("a disconnected or unconsumed client cannot prevent turn persistence; duplicate HTTP delivery does not generate", async () => {
  const id = randomUUID();
  const request = { id, message: { id: "stable-http-turn", role: "user", parts: [{ type: "text", text: "Hello" }] } };
  const response = await app.request("/agent/chat", jsonRequest("POST", request, token));
  assert.equal(response.status, 200);
  // Deliberately don't consume the UI response. The persistence branch must finish independently.
  let status = "running";
  for (let i = 0; i < 100; i += 1) {
    const [turn] = await db.select().from(threadTurns).where(eq(threadTurns.threadId, id));
    status = turn?.status ?? "missing";
    if (status !== "running") break;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.equal(status, "completed");
  const rows = await db.select().from(threadMessages).where(eq(threadMessages.threadId, id));
  assert.equal(rows.length, 2);
  assert.ok(rows.some((row) => row.role === "assistant"));
  const duplicate = await app.request("/agent/chat", jsonRequest("POST", request, token));
  assert.equal(duplicate.status, 409);
  assert.equal(model.doStreamCalls.length, 1);
  await response.body?.cancel();
});
