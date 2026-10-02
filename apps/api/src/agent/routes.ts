// The chat (Stage 4): `POST /chat` runs one agent turn and streams it to the app (AI SDK UI message stream, which
// passes through Coolify's Traefik unbuffered — spike 7). The app sends only the new message; the thread's
// history is loaded here and this turn is committed incrementally when the stream ends, so threads survive devices and
// restarts (M1). Guests can chat too: the agent tells them what needs an account.
import { randomBytes } from "node:crypto";
import { and, asc, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { createUIMessageStreamResponse, isToolUIPart, readUIMessageStream, type UIMessage } from "ai";
import { z } from "zod";

import { agentTurn, type Models } from "@kawase/agent";
import { threadMessages, threads, type Db } from "@kawase/db";

import { requireUser } from "../auth/middleware";
import { HTTP, problem } from "../http/problem";
import type { AppEnv, SessionUser } from "../types";
import type { Logger } from "@kawase/log";
import type { Chains } from "../wallet/chain";
import type { WalletService } from "../wallet/service";
import type { FaucetService } from "../faucet/service";
import type { ContactService } from "../contacts/service";
import type { RequestService } from "../requests/service";
import type { Recipients } from "../send/recipients";
import type { SendService } from "../send/service";
import type { AutomationService } from "../automations/service";
import type { BridgeService } from "../bridge/service";
import type { EarnService } from "../earn/service";
import type { MarginService } from "../margin/service";
import type { OnrampService } from "../onramp/service";
import type { CrossChainService } from "../crosschain/service";
import type { LendService } from "../lend/service";
import type { WithdrawService } from "../withdraw/service";
import type { SwapService } from "../swap/service";
import type { AssetService } from "../tokens/service";
import type { MarketplaceService } from "../marketplace/service";
import type { SafetyService } from "../safety/service";
import type { InvoiceService } from "../business/invoices";
import type { HistoryService } from "../history/service";
import { buildAgentContext } from "./context";
import { ConversationStore } from "./conversation-store";

const TITLE_MAX = 60;
const THREADS_PAGE = 50;
const SECRET_BYTES = 32;
const MESSAGE_ID_MAX = 100;
/** How long a voice turn waits for the wallet read (~170 ms warm on Arc testnet) before going on without it. */
const WALLET_FACTS_WAIT_MS = 600;
const TRANSCRIPT_CHECKPOINT_MS = 1000;
const TURN_LEASE_RENEW_MS = 10_000;

/** The value if it arrives in time; otherwise (late or failed) undefined. */
function settleWithin<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), ms);
  });
  return Promise.race([promise.catch(() => undefined), late]).finally(() => clearTimeout(timer));
}

const messageSchema = z.object({
  id: z.string().min(1).max(MESSAGE_ID_MAX),
  role: z.enum(["user", "assistant"]),
  parts: z.array(z.record(z.string(), z.unknown())),
  metadata: z.unknown().optional(),
});
const chatSchema = z.object({ id: z.uuid(), message: messageSchema });

export type AgentDeps = {
  db: Db;
  chains: Chains;
  wallets: WalletService;
  faucet: FaucetService;
  contacts: ContactService;
  recipients: Recipients;
  sends: SendService;
  swaps: SwapService;
  bridges: BridgeService;
  earn: EarnService;
  margin?: MarginService | undefined;
  onramp?: OnrampService | undefined;
  crosschain?: CrossChainService | undefined;
  lend?: LendService | undefined;
  withdraw?: WithdrawService | undefined;
  assets: AssetService;
  automations: AutomationService;
  requests: RequestService;
  models: Models;
  approvalSecret?: string | undefined;
  /** The x402 marketplace; paid services are off without it. */
  marketplace?: MarketplaceService | undefined;
  /** Wallet & limits (A3); the safety tools answer "unavailable" without it. */
  safety?: SafetyService | undefined;
  /** Business mode: invoices from chat. */
  invoices?: InvoiceService | undefined;
  history?: HistoryService | undefined;
};

/** The first words the person wrote, as the thread's title. */
function titleFrom(message: UIMessage): string | null {
  const text = message.parts
    .map((part) => (part.type === "text" ? part.text : ""))
    .join(" ")
    .trim();
  if (!text) return null;
  return text.length > TITLE_MAX ? `${text.slice(0, TITLE_MAX - 1)}…` : text;
}

/**
 * One agent turn in a thread, for any surface (K1: one brain — chat and voice run this same function, so the voice
 * conversation is the chat's transcript). The incoming message is either new (the person wrote or spoke) or the last
 * assistant message again with a tool's output or an approval added on the device; the latter replaces the stored
 * copy. Durable claims prevent duplicate execution; the turn's messages are committed when the stream ends.
 */
export function createTurnRunner(deps: AgentDeps) {
  const {
    db,
    chains,
    wallets,
    faucet,
    contacts,
    recipients,
    sends,
    swaps,
    bridges,
    earn,
    margin,
    onramp,
    crosschain,
    lend,
    withdraw,
    assets,
    automations,
    requests,
    models,
    approvalSecret,
    marketplace,
    invoices,
    history: historyService,
  } = deps;
  // Without a configured secret, approvals are still signed — they just do not outlive this process.
  const conversations = new ConversationStore(db);
  const secret = approvalSecret ?? randomBytes(SECRET_BYTES).toString("hex");

  const ownThread = async (userId: string, threadId: string) => {
    const [thread] = await db.select().from(threads).where(eq(threads.id, threadId)).limit(1);
    if (thread && thread.userId !== userId) throw problem(HTTP.notFound, "not_found");
    return thread;
  };

  const loadMessages = async (threadId: string): Promise<UIMessage[]> => {
    const rows = await db
      .select()
      .from(threadMessages)
      .where(eq(threadMessages.threadId, threadId))
      .orderBy(asc(threadMessages.seq));
    return rows.map((row) => ({
      id: row.id,
      role: row.role as UIMessage["role"],
      parts: row.parts as UIMessage["parts"],
      ...(row.metadata ? { metadata: row.metadata } : {}),
    }));
  };

  const run = async (input: {
    user: SessionUser;
    threadId: string;
    incoming: UIMessage;
    surface: "chat" | "voice";
    signal?: AbortSignal | undefined;
    log: Logger;
  }) => {
    const { user, threadId, incoming, surface, log } = input;
    const startedAt = Date.now();
    const lastUserText =
      incoming.role === "user" ? incoming.parts.map((part) => (part.type === "text" ? part.text : "")).join(" ") : "";
    const context = buildAgentContext({
      user,
      db,
      chains,
      wallets,
      faucet,
      contacts,
      recipients,
      sends,
      swaps,
      bridges,
      earn,
      margin,
      onramp,
      crosschain,
      lend,
      withdraw,
      assets,
      automations,
      requests,
      marketplace,
      safety: deps.safety,
      invoices,
      history: historyService,
      threadId,
      lastUserText,
      log,
      surface,
    });
    // Talking: the wallet is read while the thread loads, so "how much do I have?" is answered in one model step
    // instead of a tool call and a second step (~2 s of silence). Never waited on for long, never fatal.
    let walletMs: number | undefined;
    const walletNow =
      surface === "voice"
        ? settleWithin(
            context.wallet().finally(() => {
              walletMs = Date.now() - startedAt;
            }),
            WALLET_FACTS_WAIT_MS,
          )
        : Promise.resolve(undefined);
    // Likewise what works here, so "what can you do?" by voice skips the get_capabilities step (~1.5 s).
    const capabilitiesNow =
      surface === "voice" ? settleWithin(context.capabilities(), WALLET_FACTS_WAIT_MS) : Promise.resolve(undefined);
    const existing = await ownThread(user.id, threadId);
    if (!existing)
      await db
        .insert(threads)
        .values({ id: threadId, userId: user.id, network: user.activeNetwork, title: titleFrom(incoming) })
        .onConflictDoNothing();
    // A thread opened before its first words (a voice session) takes its title from them.
    else if (!existing.title && incoming.role === "user")
      await db
        .update(threads)
        .set({ title: titleFrom(incoming) })
        .where(eq(threads.id, threadId));
    const claim = await conversations.claim({ userId: user.id, threadId, incoming, surface });
    const ownership = new AbortController();
    const signal = input.signal ? AbortSignal.any([input.signal, ownership.signal]) : ownership.signal;
    const lease = setInterval(() => {
      void conversations
        .renew(claim)
        .then((owned) => {
          if (!owned) ownership.abort();
        })
        .catch(() => ownership.abort());
    }, TURN_LEASE_RENEW_MS);
    lease.unref();
    const history = claim.history;
    const last = history.at(-1);
    const messages = last && last.id === incoming.id ? [...history.slice(0, -1), incoming] : [...history, incoming];

    const [wallet, capabilities] = await Promise.all([walletNow, capabilitiesNow]);
    const preparedMs = Date.now() - startedAt;
    let failed = false;
    try {
      const stream = await agentTurn({
        wallet,
        capabilities,
        timings: {
          onFirstChunk: (ms) =>
            log.info(
              {
                surface,
                preparedMs,
                walletMs,
                walletLine: wallet !== undefined,
                capabilityLines: capabilities !== undefined,
                firstVisibleMs: ms,
              },
              "turn first visible",
            ),
          onStep: (ms, tools) => log.info({ surface, stepMs: ms, tools }, "turn step"),
        },
        models,
        context,
        messages,
        approvalSecret: secret,
        abortSignal: signal,
        onError: (error) => {
          failed = true;
          log.error({ err: error }, "agent turn failed");
        },
        onEnd: async ({ messages: finished, isAborted, isCancelled }) => {
          clearInterval(lease);
          await conversations.finish(
            claim,
            finished,
            isAborted || isCancelled || signal.aborted ? "interrupted" : failed ? "failed" : "completed",
          );
        },
      });
      // Drain a second branch so disconnecting the UI cannot prevent partial messages and turn status being saved.
      const [client, persistence] = stream.tee();
      void (async () => {
        let checkpointAt = 0;
        let tools = "";
        for await (const message of readUIMessageStream({
          stream: persistence,
          onError: (error) => log.error({ err: error }, "turn persistence stream failed"),
        })) {
          // Commit tool transitions immediately; throttle partial text. A process crash must not erase a submitted
          // action's card just because the final assistant sentence had not arrived.
          const nextTools = JSON.stringify(message.parts.filter(isToolUIPart));
          if (nextTools !== tools || Date.now() - checkpointAt >= TRANSCRIPT_CHECKPOINT_MS) {
            await conversations.checkpoint(claim, message);
            tools = nextTools;
            checkpointAt = Date.now();
          }
        }
      })().catch(async (error) => {
        clearInterval(lease);
        ownership.abort();
        log.error({ err: error }, "turn checkpoint failed");
        await conversations
          .finish(claim, [], "failed")
          .catch((error) => log.error({ err: error }, "turn finalization failed"));
      });
      return client;
    } catch (error) {
      clearInterval(lease);
      await conversations.finish(claim, [], signal.aborted ? "interrupted" : "failed");
      throw error;
    }
  };

  return { run, ownThread, loadMessages };
}

export function agentRoutes(deps: AgentDeps, runner: ReturnType<typeof createTurnRunner> = createTurnRunner(deps)) {
  const { db, models } = deps;
  const app = new Hono<AppEnv>();
  app.use("*", requireUser);
  const { run, ownThread, loadMessages } = runner;

  app.post("/chat", async (c) => {
    if (!models.hasKeyFor("agentChat")) throw problem(HTTP.internal, "agent_unavailable");
    const parsed = chatSchema.safeParse(await c.req.json());
    if (!parsed.success) throw problem(HTTP.badRequest, "validation", undefined, { issues: parsed.error.issues });
    const stream = await run({
      user: c.get("user")!,
      threadId: parsed.data.id,
      incoming: parsed.data.message as unknown as UIMessage,
      surface: "chat",
      signal: c.req.raw.signal,
      log: c.get("log"),
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
    return c.json({
      thread: { id: thread.id, title: thread.title, network: thread.network, lastMessageAt: thread.lastMessageAt },
      messages: await loadMessages(thread.id),
    });
  });

  app.delete("/threads/:id", async (c) => {
    const id = z.uuid().safeParse(c.req.param("id"));
    if (!id.success) throw problem(HTTP.notFound, "not_found");
    await db.delete(threads).where(and(eq(threads.id, id.data), eq(threads.userId, c.get("userId")!)));
    return c.body(null, HTTP.noContent);
  });

  return app;
}
