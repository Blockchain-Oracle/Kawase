// The chat (Stage 4): `POST /chat` runs one agent turn and streams it to the app (AI SDK UI message stream, which
// passes through Coolify's Traefik unbuffered — spike 7). The app sends only the new message; the thread's
// history is loaded here and this turn is committed incrementally when the stream ends, so threads survive devices and
// restarts (M1). Guests can chat too: the agent tells them what needs an account.
import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, exists, sql } from "drizzle-orm";
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
import type { HistoryService } from "../history/service";
import type { AccountAgentDeps } from "./account-context";
import type { Context } from "hono";
import type { AgentBudget, BudgetPromptContext, BudgetSummary } from "@kawase/agent";
import type { AgentHealth } from "@kawase/api-client";

import { buildAgentContext, type AgentRaceRoutes } from "./context";
import { ConversationStore } from "./conversation-store";
import { createMemeCheck, type MemeCheck } from "./meme-check";
import type { ModelHealth } from "./health";

/** Provider answers that mean the model cannot serve anyone right now (a dead key, no credit, a rate wall, an outage). */
const PROVIDER_DOWN = new Set([HTTP.unauthorized, HTTP.forbidden, HTTP.tooManyRequests, HTTP.internal, HTTP.badGateway, HTTP.serviceUnavailable]);

/** "http_401" when a turn failed because the provider is down; null for anything else (a tool's error, a cancel). */
function providerFailure(error: unknown): string | null {
  const status = (error as { statusCode?: unknown } | null)?.statusCode;
  return typeof status === "number" && PROVIDER_DOWN.has(status as never) ? `http_${status}` : null;
}

/** The typed answer the app turns into its offline state (a problem document, like every other refusal). */
function agentOffline(c: Context<AppEnv>, health: AgentHealth) {
  return c.json(
    {
      type: "https://kawase.xyz/problems/agent_offline",
      title: "The agent is offline",
      status: HTTP.serviceUnavailable,
      detail: "Kawase's model is not answering right now; balances, sends and every screen still work.",
      instance: c.req.path,
      health,
    },
    HTTP.serviceUnavailable,
    { "content-type": "application/problem+json" },
  );
}

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
const renameSchema = z.object({ title: z.string().trim().min(1).max(TITLE_MAX) });

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
  history?: HistoryService | undefined;
  /** Devices, export links and the fee reserve for chat (B2-2). */
  account?: AccountAgentDeps | undefined;
  /** One US dollar in a display currency (B2-3); replies stay in dollars without it. */
  fx?: ((currency: string) => Promise<number | null>) | undefined;
  /** M12: with device proofs required, a chat turn sends inside the allowance by itself only when it carried one. */
  deviceProofRequired?: boolean | undefined;
  /** The Routes lane's race (apps/api/src/routing/race.ts); race_routes says "routes_unavailable" without it. */
  raceRoutes?: AgentRaceRoutes | undefined;
  /** The person's weekly budget (the Budget lane); without it every money step waits for their tap (the safe default). */
  budget?: ((user: SessionUser) => AgentBudget | undefined) | undefined;
  /** The signed budget in plain numbers for the prompt (prompt-budget.ts); without it the agent knows no budget. */
  budgetSummary?: ((user: SessionUser) => Promise<BudgetSummary | null>) | undefined;
  /** The meme/copycat check before a buy; one is made per runner when not given (tests pass their own). */
  memeCheck?: MemeCheck | undefined;
  /** The model's self-test (health.ts): while it fails, /chat answers "agent_offline" at once. */
  health?: ModelHealth | undefined;
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
    history: historyService,
    account,
    fx,
  } = deps;
  // Without a configured secret, approvals are still signed, but a pending one dies with this process and fails on any
  // other instance: production must set AGENT_APPROVAL_SECRET (one value for every instance).
  if (!approvalSecret && process.env.NODE_ENV === "production") throw new Error("AGENT_APPROVAL_SECRET must be set in production: pending approvals must survive restarts and instances");
  const conversations = new ConversationStore(db);
  // One meme/copycat check for every turn: its GeckoTerminal cache and call budget are shared.
  const memeCheck = deps.memeCheck ?? createMemeCheck();
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
    /** The turn's request carried the proof from the person's own device (M12). */
    deviceProven?: boolean | undefined;
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
      history: historyService,
      account,
      threadId,
      lastUserText,
      log,
      surface,
      // M12: without the device's proof (once required) a send inside the allowance waits for the tap on its card.
      autoSendAllowed: !deps.deviceProofRequired || input.deviceProven === true,
      raceRoutes: deps.raceRoutes,
      budget: deps.budget?.(user),
      memeCheck,
    });
    // The weekly budget's numbers and rules for the prompt, read quickly; without them every step is described as asking.
    if (deps.budgetSummary) {
      const summary = await settleWithin(deps.budgetSummary(user), WALLET_FACTS_WAIT_MS).catch(() => null);
      if (summary) (context as BudgetPromptContext).budgetSummary = summary;
    }
    // The display currency (B2-3): today's rate, read quickly; dollars if it does not come.
    if (fx && user.displayCurrency && user.displayCurrency !== "USD") {
      const perUsd = await settleWithin(fx(user.displayCurrency), WALLET_FACTS_WAIT_MS).catch(() => undefined);
      if (perUsd) context.display = { currency: user.displayCurrency, perUsd };
    }
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
          // The provider refused or broke (a dead key, no credit, an outage, or one big turn's 429): a check confirms at
          // once and decides for everyone; this one failure never takes the agent offline by itself.
          const providerDown = providerFailure(error);
          if (providerDown) deps.health?.reportFailure(providerDown);
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
          // A live tool's preliminary snapshots (race_routes: one per venue answer) are not transitions: the final one is.
          const nextTools = JSON.stringify(message.parts.filter((part) => isToolUIPart(part) && !(part.state === "output-available" && part.preliminary === true)));
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

  // Whether the agent can answer now, before the person types (the app's offline state). While it is not online this is
  // also the app's "Check again": it runs a fresh self-test, at most one every few seconds for the whole api (health.ts).
  app.get("/health", async (c) => c.json({ health: (await deps.health?.recheck()) ?? { status: "unknown", checkedAt: null, model: "", reason: null } }));

  app.post("/chat", async (c) => {
    if (!models.hasKeyFor("agentChat")) throw problem(HTTP.internal, "agent_unavailable");
    // The self-test says the model is unreachable: say so at once, typed, instead of a turn that breaks halfway.
    const health = deps.health?.status();
    if (health?.status === "offline") return agentOffline(c, health);
    const parsed = chatSchema.safeParse(await c.req.json());
    if (!parsed.success) throw problem(HTTP.badRequest, "validation", undefined, { issues: parsed.error.issues });
    const stream = await run({
      user: c.get("user")!,
      threadId: parsed.data.id,
      incoming: parsed.data.message as unknown as UIMessage,
      surface: "chat",
      signal: c.req.raw.signal,
      log: c.get("log"),
      deviceProven: c.get("deviceProven"),
    });
    return createUIMessageStreamResponse({ stream });
  });

  app.get("/threads", async (c) => {
    const rows = await db
      .select({ id: threads.id, title: threads.title, network: threads.network, lastMessageAt: threads.lastMessageAt })
      .from(threads)
      // A thread with nothing said in it (a voice session opened and closed, or minted ahead of an open) is not listed.
      .where(and(eq(threads.userId, c.get("userId")!), exists(db.select({ one: sql`1` }).from(threadMessages).where(eq(threadMessages.threadId, threads.id)))))
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

  // Rename (capability matrix, Thread "rename"): the person's own title, in place of the first words.
  app.patch("/threads/:id", async (c) => {
    const id = z.uuid().safeParse(c.req.param("id"));
    const body = renameSchema.safeParse(await c.req.json().catch(() => undefined));
    if (!id.success) throw problem(HTTP.notFound, "not_found");
    if (!body.success) throw problem(HTTP.badRequest, "validation", undefined, { issues: body.error.issues });
    const [renamed] = await db
      .update(threads)
      .set({ title: body.data.title })
      .where(and(eq(threads.id, id.data), eq(threads.userId, c.get("userId")!)))
      .returning({ id: threads.id, title: threads.title, network: threads.network, lastMessageAt: threads.lastMessageAt });
    if (!renamed) throw problem(HTTP.notFound, "not_found");
    return c.json({ thread: renamed });
  });

  app.delete("/threads/:id", async (c) => {
    const id = z.uuid().safeParse(c.req.param("id"));
    if (!id.success) throw problem(HTTP.notFound, "not_found");
    await db.delete(threads).where(and(eq(threads.id, id.data), eq(threads.userId, c.get("userId")!)));
    return c.body(null, HTTP.noContent);
  });

  return app;
}
