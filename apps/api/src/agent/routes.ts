// The chat (Stage 4): `POST /chat` runs one agent turn and streams it to the app (AI SDK UI message stream, which
// passes through Coolify's Traefik unbuffered — spike 7). The app sends only the new message; the thread's
// history is loaded here and the whole conversation is saved when the stream ends, so threads survive devices and
// restarts (M1). Guests can chat too: the agent tells them what needs an account.
import { randomBytes } from "node:crypto";
import { and, asc, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { createUIMessageStreamResponse, type UIMessage } from "ai";
import { z } from "zod";

import { agentTurn, type Models } from "@kawase/agent";
import { threadMessages, threads, type Db } from "@kawase/db";

import { requireUser } from "../auth/middleware";
import { HTTP, problem } from "../http/problem";
import type { AppEnv } from "../types";
import type { Chains } from "../wallet/chain";
import type { WalletService } from "../wallet/service";
import type { FaucetService } from "../faucet/service";
import type { ContactService } from "../contacts/service";
import type { RequestService } from "../requests/service";
import type { Recipients } from "../send/recipients";
import type { SendService } from "../send/service";
import type { BridgeService } from "../bridge/service";
import type { SwapService } from "../swap/service";
import { buildAgentContext } from "./context";

const TITLE_MAX = 60;
const THREADS_PAGE = 50;
const SECRET_BYTES = 32;
const MESSAGE_ID_MAX = 100;

const messageSchema = z.object({
  id: z.string().min(1).max(MESSAGE_ID_MAX),
  role: z.enum(["user", "assistant"]),
  parts: z.array(z.record(z.string(), z.unknown())),
  metadata: z.unknown().optional(),
});
const chatSchema = z.object({ id: z.uuid(), message: messageSchema });

type Deps = {
  db: Db;
  chains: Chains;
  wallets: WalletService;
  faucet: FaucetService;
  contacts: ContactService;
  recipients: Recipients;
  sends: SendService;
  swaps: SwapService;
  bridges: BridgeService;
  requests: RequestService;
  models: Models;
  approvalSecret?: string | undefined;
};

/** The first words the person wrote, as the thread's title. */
function titleFrom(message: UIMessage): string | null {
  const text = message.parts.map((part) => (part.type === "text" ? part.text : "")).join(" ").trim();
  if (!text) return null;
  return text.length > TITLE_MAX ? `${text.slice(0, TITLE_MAX - 1)}…` : text;
}

export function agentRoutes({ db, chains, wallets, faucet, contacts, recipients, sends, swaps, bridges, requests, models, approvalSecret }: Deps) {
  const app = new Hono<AppEnv>();
  app.use("*", requireUser);
  // Without a configured secret, approvals are still signed — they just do not outlive this process.
  const secret = approvalSecret ?? randomBytes(SECRET_BYTES).toString("hex");

  const ownThread = async (userId: string, threadId: string) => {
    const [thread] = await db.select().from(threads).where(eq(threads.id, threadId)).limit(1);
    if (thread && thread.userId !== userId) throw problem(HTTP.notFound, "not_found");
    return thread;
  };

  const loadMessages = async (threadId: string): Promise<UIMessage[]> => {
    const rows = await db.select().from(threadMessages).where(eq(threadMessages.threadId, threadId)).orderBy(asc(threadMessages.seq));
    return rows.map((row) => ({ id: row.id, role: row.role as UIMessage["role"], parts: row.parts as UIMessage["parts"], ...(row.metadata ? { metadata: row.metadata } : {}) }));
  };

  app.post("/chat", async (c) => {
    if (!models.hasKeyFor("agentChat")) throw problem(HTTP.internal, "agent_unavailable");
    const parsed = chatSchema.safeParse(await c.req.json());
    if (!parsed.success) throw problem(HTTP.badRequest, "validation", undefined, { issues: parsed.error.issues });
    const user = c.get("user")!;
    const log = c.get("log");
    const { id: threadId } = parsed.data;
    const incoming = parsed.data.message as unknown as UIMessage;

    const existing = await ownThread(user.id, threadId);
    if (!existing) await db.insert(threads).values({ id: threadId, userId: user.id, network: user.activeNetwork, title: titleFrom(incoming) });

    // The incoming message is either new (the person wrote) or the last assistant message again with a tool's
    // output or an approval added on the device; the latter replaces the stored copy.
    const history = existing ? await loadMessages(threadId) : [];
    const last = history.at(-1);
    const messages = last && last.id === incoming.id ? [...history.slice(0, -1), incoming] : [...history, incoming];

    const lastUserText = incoming.role === "user" ? incoming.parts.map((part) => (part.type === "text" ? part.text : "")).join(" ") : "";
    const context = buildAgentContext({ user, db, chains, wallets, faucet, contacts, recipients, sends, swaps, bridges, requests, threadId, lastUserText, log });
    const stream = await agentTurn({
      models,
      context,
      messages,
      approvalSecret: secret,
      abortSignal: c.req.raw.signal,
      onError: (error) => log.error({ err: error }, "agent turn failed"),
      onEnd: async ({ messages: finished }) => {
        try {
          await db.transaction(async (tx) => {
            await tx.delete(threadMessages).where(eq(threadMessages.threadId, threadId));
            if (finished.length > 0) {
              await tx.insert(threadMessages).values(
                finished.map((message, seq) => ({
                  threadId,
                  id: message.id,
                  userId: user.id,
                  seq,
                  role: message.role,
                  parts: message.parts as unknown[],
                  metadata: message.metadata ?? null,
                })),
              );
            }
            await tx.update(threads).set({ lastMessageAt: new Date() }).where(eq(threads.id, threadId));
          });
        } catch (error) {
          log.error({ err: error, threadId }, "thread not saved");
        }
      },
    });
    return createUIMessageStreamResponse({ stream });
  });

  app.get("/threads", async (c) => {
    const rows = await db
      .select({ id: threads.id, title: threads.title, network: threads.network, lastMessageAt: threads.lastMessageAt })
      .from(threads)
      .where(eq(threads.userId, c.get("userId")!))
      .orderBy(desc(threads.lastMessageAt))
      .limit(THREADS_PAGE);
    return c.json({ threads: rows });
  });

  app.get("/threads/:id", async (c) => {
    const id = z.uuid().safeParse(c.req.param("id"));
    if (!id.success) throw problem(HTTP.notFound, "not_found");
    const thread = await ownThread(c.get("userId")!, id.data);
    if (!thread) throw problem(HTTP.notFound, "not_found");
    return c.json({ thread: { id: thread.id, title: thread.title, network: thread.network, lastMessageAt: thread.lastMessageAt }, messages: await loadMessages(thread.id) });
  });

  app.delete("/threads/:id", async (c) => {
    const id = z.uuid().safeParse(c.req.param("id"));
    if (!id.success) throw problem(HTTP.notFound, "not_found");
    await db.delete(threads).where(and(eq(threads.id, id.data), eq(threads.userId, c.get("userId")!)));
    return c.body(null, HTTP.noContent);
  });

  return app;
}
