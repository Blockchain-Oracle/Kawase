// Live round trips for the agent's intelligence layer (A5), against the configured model (not part of `pnpm test`:
// it needs OPENAI_API_KEY and spends a few cents). Each scenario runs real agent turns through the real api as a
// guest, then reads back what was stored. Run:
//   pnpm --filter @kawase/api exec tsx test/intelligence-live.ts memory [--out <file.json>]
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { config } from "dotenv";
import { eq } from "drizzle-orm";

import { createModels, windowFor } from "@kawase/agent";
import { createDb, threadDigests, threadMessages, threads, threadTurns } from "@kawase/db";
import { createLogger } from "@kawase/log";

import { createApp } from "../src/app";
import { deleteUser, fakeTurnkey, jsonRequest, noChains, noOps, okFaucet } from "./helpers";

config({ path: new URL("../../../.env", import.meta.url).pathname, quiet: true });
// The schema-compatibility notes are known (z.record in tool inputs); keep the output to the evidence.
(globalThis as { AI_SDK_LOG_WARNINGS?: boolean }).AI_SDK_LOG_WARNINGS = false;

const url = process.env.DATABASE_URL;
const openai = process.env.OPENAI_API_KEY;
if (!url || !openai) throw new Error("DATABASE_URL and OPENAI_API_KEY are needed");

const { db, pool } = createDb(url, { poolSize: 4 });
const RATE = 10_000;
const app = createApp({
  db,
  log: createLogger({ service: "intelligence-live", level: (process.env.TEST_LOG_LEVEL ?? "silent") as "silent" }),
  turnkey: fakeTurnkey({}),
  chains: noChains,
  faucet: okFaucet,
  ops: noOps,
  models: createModels({ openai }),
  rateLimitPerMinute: RATE,
  signInLimitPerMinute: RATE,
});

type Part = { type: string; text?: string; state?: string; input?: unknown; output?: unknown };
type Message = { id: string; role: string; parts: Part[]; metadata?: unknown };

const guest = await app.request("/auth/guest", jsonRequest("POST", { device: { installationId: randomUUID(), platform: "ios" } }));
const { token, user } = (await guest.json()) as { token: string; user: { id: string } };

const POLL_MS = 200;
const POLLS = 300;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** One real turn: the person's words in, the stored assistant message out (text, tools and metadata). */
export async function turn(threadId: string, text: string) {
  const startedAt = Date.now();
  const response = await app.request(
    "/agent/chat",
    jsonRequest("POST", { id: threadId, message: { id: `msg-${randomUUID()}`, role: "user", parts: [{ type: "text", text }] } }, token),
  );
  if (response.status !== 200) throw new Error(`chat ${response.status}: ${await response.text()}`);
  await response.text();
  for (let i = 0; i < POLLS; i += 1) {
    const running = await db.select().from(threadTurns).where(eq(threadTurns.threadId, threadId));
    if (running.every((row) => row.status !== "running")) break;
    await wait(POLL_MS);
  }
  const stored = (await (await app.request(`/agent/threads/${threadId}`, { headers: { authorization: `Bearer ${token}` } })).json()) as {
    messages: Message[];
  };
  const reply = stored.messages.at(-1)!;
  return {
    asked: text,
    ms: Date.now() - startedAt,
    reply: reply.parts.filter((part) => part.type === "text").map((part) => part.text).join(""),
    tools: reply.parts
      .filter((part) => part.type.startsWith("tool-"))
      .map((part) => ({ tool: part.type.slice("tool-".length), state: part.state, input: part.input, output: part.output })),
    metadata: reply.metadata ?? null,
  };
}

export const api = (path: string, init: RequestInit = {}) =>
  app.request(path, { ...init, headers: { ...(init.headers ?? {}), authorization: `Bearer ${token}`, "content-type": "application/json" } });

/** A long thread written straight into storage: early facts, small talk, one card, then many exchanges. */
async function seedLongThread(threadId: string, exchanges: number) {
  await db.insert(threads).values({ id: threadId, userId: user.id, network: "testnet", title: "Long thread" });
  const lines: { role: "user" | "assistant"; parts: unknown[] }[] = [
    { role: "user", parts: [{ type: "text", text: "My landlord is Bola Adeyemi and rent is due on the 5th of every month. I pay it in euros." }] },
    { role: "assistant", parts: [{ type: "text", text: "Got it: Bola Adeyemi, rent on the 5th, in euros." }] },
    { role: "user", parts: [{ type: "text", text: "What's in my wallet?" }] },
    {
      role: "assistant",
      parts: [
        { type: "tool-get_wallet", toolCallId: "call-seed-wallet", state: "output-available", input: {}, output: { status: "guest", network: "testnet" } },
        { type: "text", text: "You're a guest, so there is no wallet yet. Sign in first." },
      ],
    },
  ];
  for (let i = 0; i < exchanges; i += 1) {
    lines.push({ role: "user", parts: [{ type: "text", text: `Quick question ${i + 1}: how do fees work on Arc?` }] });
    lines.push({ role: "assistant", parts: [{ type: "text", text: "Fees on Arc are paid in USDC and are usually a fraction of a cent." }] });
  }
  await db.insert(threadMessages).values(
    lines.map((line, seq) => ({ threadId, userId: user.id, id: `seed-${seq}`, seq, role: line.role, parts: line.parts })),
  );
  return lines.length;
}

const scenarios: Record<string, () => Promise<unknown>> = {
  async threads() {
    const threadId = randomUUID();
    const seeded = await seedLongThread(threadId, 14);
    const first = await turn(threadId, "Thanks. One more: is Arc fast?");
    // The fold runs after the answer; give it a moment.
    let digest: (typeof threadDigests.$inferSelect)[] = [];
    for (let i = 0; i < POLLS && digest.length === 0; i += 1) {
      digest = await db.select().from(threadDigests).where(eq(threadDigests.threadId, threadId));
      if (digest.length === 0) await wait(POLL_MS);
    }
    const stored = (await (await api(`/agent/threads/${threadId}`)).json()) as { messages: Message[] };
    const { window, summarized } = windowFor(stored.messages as never, digest[0] ?? null);
    const recall = await turn(threadId, "Remind me: who is my landlord, when is rent due, and in which currency do I pay it?");
    return {
      seeded,
      first,
      digest: digest[0] ?? null,
      nextTurnReads: { messages: window.length, of: stored.messages.length, summarized, earliestInWindow: window[0]?.id },
      recall,
    };
  },
  async memory() {
    const first = randomUUID();
    const second = randomUUID();
    const remembered = await turn(first, "Please remember that my mum is @adaeze and that I prefer euros.");
    const afterSave = await (await api("/memory")).json();
    const used = await turn(second, "Who is my mum on Kawase?");
    const forgotten = await turn(second, "Forget what you know about my mum.");
    const afterForget = await (await api("/memory")).json();
    await api("/memory/settings", { method: "PUT", body: JSON.stringify({ enabled: false }) });
    const off = await turn(randomUUID(), "Remember that my brother is @tunde.");
    return { remembered, afterSave, used, forgotten, afterForget, off };
  },
};

const name = process.argv[2] ?? "memory";
const outAt = process.argv.indexOf("--out");
try {
  const run = scenarios[name];
  if (!run) throw new Error(`unknown scenario ${name}; one of ${Object.keys(scenarios).join(", ")}`);
  const result = { scenario: name, model: process.env.KAWASE_MODEL_AGENT_CHAT ?? "default (packages/config)", at: new Date().toISOString(), result: await run() };
  const json = JSON.stringify(result, null, 2);
  if (outAt > 0) writeFileSync(process.argv[outAt + 1]!, `${json}\n`);
  console.log(json);
} finally {
  await deleteUser(db, user.id);
  await pool.end();
}
