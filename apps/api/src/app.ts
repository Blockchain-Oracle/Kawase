// The api, assembled from its parts so tests can build it with fakes (a Turnkey reader that answers from
// memory, a local chain) and main.ts with the real ones.
import { Hono } from "hono";
import { cors } from "hono/cors";
import { requestId } from "hono/request-id";

import { MEMO_SCAN_TICK_MS, MIN_APP_VERSION_DEFAULT, PUSH_RECEIPT_TICK_MS, RETENTION_SWEEP_MS } from "@kawase/config";
import type { Db } from "@kawase/db";
import { requestLogger, type Logger } from "@kawase/log";

import type { Models } from "@kawase/agent";

import { agentRoutes, createTurnRunner } from "./agent/routes";
import { attachSession } from "./auth/middleware";
import { authRoutes } from "./auth/routes";
import { AuthService } from "./auth/service";
import type { TurnkeyReader } from "./auth/turnkey";
import { capabilityView } from "./capabilities/service";
import { clientEventRoutes } from "./client-events/routes";
import { contactRoutes, recipientRoutes } from "./contacts/routes";
import { ContactService } from "./contacts/service";
import type { FaucetDrip } from "./faucet/circle-faucet";
import { faucetRoutes } from "./faucet/routes";
import { FaucetService } from "./faucet/service";
import { idempotency } from "./http/idempotency";
import { HTTP, ProblemError, problem, problemResponse } from "./http/problem";
import { createRateLimit } from "./http/rate-limit";
import { meRoutes } from "./me/routes";
import { IncomingWatcher } from "./incoming/watcher";
import { InboxService } from "./inbox/service";
import type { ResendEmail } from "./notify/email";
import type { ExpoPush } from "./notify/expo";
import { notifyRoutes } from "./notify/routes";
import { NotifyService } from "./notify/service";
import { publicRoutes } from "./public/routes";
import { PublicStatsService } from "./public/service";
import { inboxRoutes, publicRequestRoutes, requestRoutes } from "./requests/routes";
import { RequestService } from "./requests/service";
import type { OpsExecutor } from "./send/ops";
import { Recipients } from "./send/recipients";
import { sendRoutes } from "./send/routes";
import { SendService } from "./send/service";
import { automationRoutes, needsYouRoutes } from "./automations/routes";
import { automationMarket } from "./automations/market";
import { NeedsYouService } from "./automations/needs-you";
import { createSwapVenues } from "./swap/venues";
import { AutomationService } from "./automations/service";
import { noBridges, type BridgeEngine } from "./bridge/engine";
import { noEarn, type EarnEngine } from "./earn/engine";
import { earnRoutes } from "./earn/routes";
import { EarnService } from "./earn/service";
import { bridgeRoutes } from "./bridge/routes";
import { BridgeService } from "./bridge/service";
import { noMarketData, type MarketData } from "./market/sources";
import { noSwaps, type SwapEngine } from "./swap/engine";
import { swapRoutes } from "./swap/routes";
import { SwapService } from "./swap/service";
import { marginRoutes } from "./margin/routes";
import { MarginService } from "./margin/service";
import { noOnramp, type OnrampEngine } from "./onramp/engine";
import { onrampRoutes } from "./onramp/routes";
import { OnrampService } from "./onramp/service";
import { crossChainRoutes } from "./crosschain/routes";
import { CrossChainService } from "./crosschain/service";
import { lendRoutes } from "./lend/routes";
import { LendService } from "./lend/service";
import { placeRoutes, withdrawRoutes } from "./withdraw/routes";
import { WithdrawService } from "./withdraw/service";
import { tokenRulesRoutes } from "./tokens/rules-routes";
import { TokenRulesService } from "./tokens/rules";
import { marketRoutes, portfolioRoutes, tokenRoutes } from "./tokens/routes";
import { tokenLookup } from "./tokens/lookup";
import { AssetService } from "./tokens/service";
import type { AppEnv } from "./types";
import type { Discovery } from "@kawase/integrations-x402";
import type { AgentWalletProvider } from "./marketplace/agent-wallets";
import { marketplaceRoutes } from "./marketplace/routes";
import { accountRoutes } from "./account/routes";
import { AccountService } from "./account/service";
import { AuditWriter } from "./audit/writer";
import { auditWrites } from "./audit/middleware";
import { InvoiceService } from "./business/invoices";
import { PayoutService } from "./business/payouts";
import { PayrollService } from "./business/payroll";
import { businessRoutes, publicInvoiceRoutes } from "./business/routes";
import { PrivacyService } from "./history/privacy";
import { historyRoutes, privacyRoutes } from "./history/routes";
import { HistoryService } from "./history/service";
import { MarketplaceService } from "./marketplace/service";
import type { Chains } from "./wallet/chain";
import { voiceRoutes, type LiveKitConfig } from "./voice/routes";
import { walletRoutes } from "./wallet/routes";
import { safetyRoutes } from "./safety/routes";
import { activityRoutes } from "./activity/routes";
import { ActivityFeedService } from "./activity/service";
import { SafetyService } from "./safety/service";
import { memoryRoutes } from "./memory/routes";
import { MemoryService } from "./memory/service";
import { searchRoutes } from "./search/routes";
import { SearchService } from "./search/service";
import { suggestionRoutes } from "./suggestions/routes";
import { SuggestionService } from "./suggestions/service";
import { StatusService } from "./status/service";
import { WalletService } from "./wallet/service";

export type AppDeps = {
  db: Db;
  log: Logger;
  turnkey: TurnkeyReader;
  chains: Chains;
  /** Requests per minute per client (ip before sign-in, user after). */
  rateLimitPerMinute?: number;
  /** Sign-in attempts per minute per client. */
  signInLimitPerMinute?: number;
  /** Browser origins allowed to call the api. */
  webOrigins?: string[];
  /** The testnet faucet's drip (Circle's faucet in production, a fake in tests). */
  faucet: FaucetDrip;
  /** The agent's models (D29 registry). */
  models: Models;
  /** HMAC key for the agent's tool approvals. */
  approvalSecret?: string | undefined;
  /** The agent's ops wallet (Circle in production, a fake in tests). */
  ops: OpsExecutor;
  /** Swap quotes and calls (Circle App Kit in production); swaps are refused when unset. */
  swaps?: SwapEngine | undefined;
  /** Bridge routes (Circle App Kit's CCTP in production); bridges are refused when unset. */
  bridges?: BridgeEngine | undefined;
  /** Earn vaults (Circle App Kit Earn in production); earning is refused when unset. */
  earn?: EarnEngine | undefined;
  /** Buy with Apple Pay / card (Circle Onramp Kit in production); buying is refused when unset. */
  onramp?: OnrampEngine | undefined;
  /** Circle's API key for verifying its webhook signatures (the LIVE key in production). */
  circleWebhookKey?: string | undefined;
  /** Token lists, prices, pools, safety and other-chain balances (LI.FI, GeckoTerminal, GoPlus); none when unset. */
  market?: MarketData | undefined;
  /** Alchemy's Transfers API for Activity (every token, in and out); the explorer's USDC/EURC page without it. */
  alchemyApiKey?: string | undefined;
  /** Refreshes the shared market cache this often; off when unset. */
  marketWarmMs?: number | undefined;
  /** Looks again at sends in flight this often; off when unset (tests drive tracking themselves). */
  reconcileIntervalMs?: number | undefined;
  /** Runs due automations this often; off when unset (tests drive the runner themselves). */
  automationTickMs?: number | undefined;
  /** Reads incoming transfers this often; off when unset. */
  watchIntervalMs?: number | undefined;
  /** LiveKit Cloud for voice; voice sessions are refused without it. */
  livekit?: LiveKitConfig | undefined;
  /** The web app's address, for shared links. */
  webUrl?: string | undefined;
  /** Push (Expo) and email (Resend), Stage 9; a channel is off when unset. */
  push?: ExpoPush | undefined;
  email?: ResendEmail | undefined;
  /** Sends due notifications this often; off when unset (tests drive delivery themselves). */
  notifyTickMs?: number | undefined;
  /** The x402 marketplace: per-user agent wallets (Circle DCW) and Circle's catalog; off when either is unset. */
  agentWallets?: AgentWalletProvider | undefined;
  discovery?: Discovery | undefined;
  /** The oldest app version this api serves; older apps show "Update required" (cards/access.md). */
  minAppVersion?: string | undefined;
};

const DEFAULT_RATE_LIMIT_PER_MINUTE = 120;
const SIGN_IN_LIMIT_PER_MINUTE = 10;
const SECONDS_PER_MINUTE = 60;
const DEFAULT_WEB_URL = "http://localhost:8081";

export function createApp(deps: AppDeps) {
  const app = new Hono<AppEnv>();
  const auth = new AuthService(deps.db, deps.turnkey);
  const wallets = new WalletService(deps.db, deps.chains);
  const faucet = new FaucetService(deps.db, wallets, deps.faucet);
  const contacts = new ContactService(deps.db);
  const recipients = new Recipients(deps.db, contacts);
  const notify = new NotifyService(
    deps.db,
    { push: deps.push, email: deps.email, webUrl: deps.webUrl ?? DEFAULT_WEB_URL },
    deps.log,
  );
  if (deps.notifyTickMs) notify.start(deps.notifyTickMs, PUSH_RECEIPT_TICK_MS);
  const inbox = new InboxService(deps.db, deps.chains, notify);
  // Requests describe any token through the asset registry, created just below (the lookup is read lazily).
  const requests = new RequestService(deps.db, deps.chains, wallets, inbox, deps.webUrl ?? DEFAULT_WEB_URL, (network, value) => tokenLookup(deps.chains, assets)(network, value));
  // The asset registry (any token, prices, positions). Positions come from earn, read only when a portfolio is asked
  // for (earn is created further down).
  const assets = new AssetService(deps.db, deps.chains, wallets, deps.market ?? noMarketData, deps.log, async (user) => (await earn.overview(user)).positions);
  if (deps.marketWarmMs) assets.startWarmer(deps.marketWarmMs);
  const sends = new SendService(
    deps.db,
    deps.chains,
    wallets,
    contacts,
    recipients,
    deps.ops,
    deps.log,
    requests,
    inbox,
    assets,
  );
  if (deps.watchIntervalMs)
    new IncomingWatcher(deps.db, deps.chains, requests, inbox, deps.log, { backfill: !deps.market?.wallets, notice: (userId, network, token, amount) => assets.arrivalNotice(userId, network, token, amount) }).start(deps.watchIntervalMs);
  const swaps = new SwapService(deps.db, deps.chains, wallets, deps.swaps ?? noSwaps, deps.log, assets);
  const bridges = new BridgeService(deps.db, deps.chains, wallets, deps.bridges ?? noBridges, deps.log, deps.ops);
  const earn = new EarnService(deps.db, deps.chains, wallets, deps.earn ?? noEarn, deps.log, deps.ops);
  const margin = new MarginService(deps.db, deps.chains, wallets, deps.log);
  const needsYou = new NeedsYouService(deps.db, inbox, deps.log);
  needsYou.bind({ sends, swaps });
  const crosschain = new CrossChainService(deps.db, deps.chains, wallets, recipients, deps.bridges ?? noBridges, deps.log);
  const lend = new LendService(deps.db, deps.chains, wallets, earn, deps.log);
  const withdraw = new WithdrawService(deps.db, deps.chains, assets, deps.bridges ?? noBridges);
  const onramp = new OnrampService(deps.db, deps.chains, wallets, deps.onramp ?? noOnramp, deps.log, deps.circleWebhookKey);
  const automations = new AutomationService(
    deps.db,
    deps.chains,
    wallets,
    recipients,
    sends,
    earn,
    bridges,
    inbox,
    deps.log,
    needsYou,
    automationMarket(deps.chains, createSwapVenues(deps.swaps ?? noSwaps), assets),
  );
  // Round-ups: each of the person's own completed sends gives every round-up rule one run.
  sends.onSent((sent) => automations.queueRoundUps(sent));
  if (deps.automationTickMs) automations.start(deps.automationTickMs);
  const audit = new AuditWriter(deps.db, deps.log);
  needsYou.setAudit(audit);
  automations.setAudit(audit);
  const safety = new SafetyService(deps.db, deps.chains, wallets, audit, deps.log);
  const tokenRules = new TokenRulesService(deps.db, deps.chains, wallets, audit, (userId, network) => swaps.unverifiedSpentToday(userId, network, ""));
  const marketplace =
    deps.agentWallets && deps.discovery
      ? new MarketplaceService(deps.db, deps.chains, wallets, deps.ops, deps.agentWallets, deps.discovery, deps.log)
      : undefined;
  if (deps.reconcileIntervalMs) {
    sends.startSweeper(deps.reconcileIntervalMs);
    swaps.startSweeper(deps.reconcileIntervalMs);
    bridges.startSweeper(deps.reconcileIntervalMs);
    earn.startSweeper(deps.reconcileIntervalMs);
    margin.startSweeper(deps.reconcileIntervalMs);
    onramp.startReconciler(deps.reconcileIntervalMs);
    crosschain.startSweeper(deps.reconcileIntervalMs);
    lend.startSweeper(deps.reconcileIntervalMs);
  }
  const general = createRateLimit({
    limit: deps.rateLimitPerMinute ?? DEFAULT_RATE_LIMIT_PER_MINUTE,
    windowSeconds: SECONDS_PER_MINUTE,
  });
  const signIn = createRateLimit({
    limit: deps.signInLimitPerMinute ?? SIGN_IN_LIMIT_PER_MINUTE,
    windowSeconds: SECONDS_PER_MINUTE,
  });

  app.use("*", requestId());
  app.use(
    "*",
    cors({
      origin: (origin) => (deps.webOrigins?.includes(origin) ? origin : null),
      allowHeaders: ["authorization", "content-type", "idempotency-key", "x-kawase-auth-attempt"],
      exposeHeaders: ["x-request-id", "idempotent-replayed"],
      credentials: true,
    }),
  );
  app.use("*", async (c, next) => {
    c.set("log", requestLogger(deps.log, c.get("requestId")));
    const startedAt = Date.now();
    // Only bounded UUIDs are logged. Never trust an arbitrary header as diagnostic text.
    const attempt = c.req.header("x-kawase-auth-attempt");
    const authAttemptId =
      attempt && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(attempt) ? attempt : undefined;
    await next();
    c.get("log").info(
      {
        method: c.req.method,
        path: c.req.path,
        status: c.res.status,
        ms: Date.now() - startedAt,
        ...(authAttemptId ? { authAttemptId } : {}),
      },
      "request",
    );
  });
  app.use("*", attachSession(deps.db));
  app.use("*", general.middleware);
  app.use("/auth/*", signIn.middleware);
  app.use("*", idempotency(deps.db));
  app.use("*", auditWrites(audit));

  app.onError((error, c) => {
    const id = c.get("requestId");
    if (error instanceof ProblemError) {
      c.get("log").info({ code: error.code, status: error.status, detail: error.detail }, "problem");
      return problemResponse(c, error, id);
    }
    c.get("log").error({ err: error }, "unhandled");
    return problemResponse(c, problem(HTTP.internal, "internal"), id);
  });
  app.notFound((c) => problemResponse(c, problem(HTTP.notFound, "not_found"), c.get("requestId")));

  app.get("/health", (c) => c.json({ ok: true, networks: deps.chains.available, minAppVersion: deps.minAppVersion ?? MIN_APP_VERSION_DEFAULT }));
  app.get("/capabilities", async (c) => c.json({ capabilities: await capabilityView(deps.db, deps.chains.available) }));
  app.route("/client-events", clientEventRoutes());
  app.route("/public", publicRoutes(new PublicStatsService(deps.db)));
  app.route("/auth", authRoutes(deps.db, auth));
  app.route("/me", meRoutes(deps.db, deps.chains));
  app.route("/notifications", notifyRoutes(deps.db, notify));
  app.route("/wallet", walletRoutes(wallets, deps.turnkey));
  app.route("/faucet", faucetRoutes(faucet));
  app.route("/contacts", contactRoutes(contacts));
  app.route("/recipients", recipientRoutes(recipients));
  app.route("/sends", sendRoutes(sends));
  // Practice mode (cards/automate-safety.md): sends and automations are dry-run in their own pipelines; a swap, bridge,
  // savings move or margin order is never approved for real while it is on — refused plainly, before anything is signed.
  const PRACTICE_GUARDED = /^\/(swaps|bridges|earn\/intents|margin\/orders)\/[^/]+\/(approve|signature)$/;
  app.use("*", async (c, next) => {
    if (c.req.method === "POST" && PRACTICE_GUARDED.test(c.req.path) && c.get("user")?.practiceMode)
      throw problem(HTTP.conflict, "practice_mode", "practice mode is on: turn it off in Wallet & limits to do this for real");
    await next();
  });
  app.route("/swaps", swapRoutes(swaps));
  app.route("/bridges", bridgeRoutes(bridges));
  app.route("/earn", earnRoutes(earn));
  app.route("/margin", marginRoutes(margin));
  app.route("/onramp", onrampRoutes(onramp));
  app.route("/crosschain", crossChainRoutes(crosschain));
  app.route("/lend", lendRoutes(lend));
  app.route("/withdrawals", withdrawRoutes(withdraw));
  app.route("/places", placeRoutes(withdraw));
  app.route("/token-rules", tokenRulesRoutes(tokenRules));
  app.route("/portfolio", portfolioRoutes(assets));
  app.route("/tokens", tokenRoutes(assets));
  app.route("/markets", marketRoutes(assets));
  app.route("/automations", automationRoutes(automations));
  app.route("/needs-you", needsYouRoutes(needsYou));
  app.route("/requests", requestRoutes(requests));
  app.route("/r", publicRequestRoutes(requests));
  app.route("/inbox", inboxRoutes(inbox));
  if (marketplace) app.route("/marketplace", marketplaceRoutes(marketplace));
  app.route("/safety", safetyRoutes(safety));
  const invoices = new InvoiceService(deps.db, deps.chains, requests, audit, deps.log, deps.webUrl ?? DEFAULT_WEB_URL);
  if (deps.watchIntervalMs) invoices.start(MEMO_SCAN_TICK_MS);
  const payouts = new PayoutService(deps.db, deps.chains, wallets, recipients, audit);
  const payroll = new PayrollService(deps.db, automations, audit);
  app.route("/business", businessRoutes({ invoices, payouts, payroll }));
  app.route("/invoices/public", publicInvoiceRoutes(invoices));
  const history = new HistoryService(deps.db, deps.chains, wallets, contacts);
  const privacy = new PrivacyService(deps.db, audit, deps.log);
  if (deps.watchIntervalMs) privacy.start(RETENTION_SWEEP_MS);
  app.route("/history", historyRoutes(history));
  app.route("/activity", activityRoutes(new ActivityFeedService(deps.db, deps.chains, wallets, contacts, deps.log, deps.alchemyApiKey)));
  app.route("/privacy", privacyRoutes(privacy));
  app.route("/account", accountRoutes(deps.db, new AccountService(deps.db, deps.chains, deps.turnkey, wallets, audit, deps.log, marketplace)));
  const agentDeps = {
    marketplace,
    invoices,
    history,
    db: deps.db,
    chains: deps.chains,
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
    safety,
    models: deps.models,
    approvalSecret: deps.approvalSecret,
  };
  // One turn runner for chat and voice: the same brain, the same threads, the same approval key.
  const runner = createTurnRunner(agentDeps);
  app.route("/agent", agentRoutes(agentDeps, runner));
  app.route("/voice", voiceRoutes({ db: deps.db, models: deps.models, livekit: deps.livekit, runner }));
  app.route("/memory", memoryRoutes(new MemoryService(deps.db)));
  app.route("/search", searchRoutes(new SearchService(deps.db)));
  app.route("/suggestions", suggestionRoutes(new SuggestionService(deps.db, wallets, earn, requests, deps.log, assets, margin)));
  // Dependency health, public (the status card, docs and landing), cached for half a minute.
  const status = new StatusService(deps.db, deps.chains);
  app.get("/status", async (c) => c.json(await status.view()));

  return app;
}

export type App = ReturnType<typeof createApp>;
