// Hono API: auth, wallet, settings, capabilities; later the agent chat stream, intents, webhooks and SSE.
import { serve } from "@hono/node-server";
import { config } from "dotenv";

import { createModels } from "@kawase/agent";
import { createDb } from "@kawase/db";
import type { ModelRef } from "@kawase/config";
import { loadApiEnv } from "@kawase/env";
import { AUTOMATION_TICK_MS, DEFAULT_MODELS, MARKET_WARM_MS, NOTIFY_TICK_MS, RECONCILE_INTERVAL_MS, WATCH_INTERVAL_MS, voiceAgentName } from "@kawase/config";
import { configureSocket } from "@kawase/integrations-bridges";
import { createLogger } from "@kawase/log";

import { createModelHealth } from "./agent/health";
import { createApp } from "./app";
import { circleFaucet } from "./faucet/circle-faucet";
import { circleOps } from "./send/ops";
import { Discovery } from "@kawase/integrations-x402";
import { circleAgentWallets } from "./marketplace/agent-wallets";
import { appKitBridges } from "./bridge/engine";
import { appKitEarn } from "./earn/engine";
import { liveMarketData } from "./market/sources";
import { LiveTrades } from "./market/live";
import { LiveTicker } from "./market/ticker";
import { appKitSwaps } from "./swap/engine";
import { onrampEngines } from "./onramp/engine";
import { ResendEmail } from "./notify/email";
import { ExpoPush } from "./notify/expo";
import { createChains } from "./wallet/chain";

config({ path: new URL("../../../.env", import.meta.url).pathname, quiet: true });

/** Each relayer's gas is read this often (send/relayer-watch.ts). */
const RELAYER_WATCH_MS = 600_000;

const env = loadApiEnv();
const log = createLogger({ service: "api", pretty: env.NODE_ENV === "development" });
const { db, pool } = createDb(env.DATABASE_URL);
const models = createModels(
  {
    ...(env.OPENAI_API_KEY ? { openai: env.OPENAI_API_KEY } : {}),
    ...(env.ANTHROPIC_API_KEY ? { anthropic: env.ANTHROPIC_API_KEY } : {}),
    ...(env.GOOGLE_GENERATIVE_AI_API_KEY ? { google: env.GOOGLE_GENERATIVE_AI_API_KEY } : {}),
  },
  {
    ...(env.KAWASE_MODEL_AGENT_CHAT ? { agentChat: env.KAWASE_MODEL_AGENT_CHAT as ModelRef } : {}),
    ...(env.KAWASE_MODEL_AGENT_VOICE ? { agentVoice: env.KAWASE_MODEL_AGENT_VOICE as ModelRef } : {}),
    ...(env.KAWASE_MODEL_UTILITY ? { utility: env.KAWASE_MODEL_UTILITY as ModelRef } : {}),
  },
);
// D10: one tiny call to the chat model now and every 10 minutes (every minute while it fails); /agent/health and
// /agent/chat read the same instance, so the app shows "agent offline" before the person types.
const health = createModelHealth({ models, modelId: env.KAWASE_MODEL_AGENT_CHAT ?? DEFAULT_MODELS.agentChat, log });
const stopHealth = health.start();
// Socket's dedicated tier when the server has its key and affiliate id; the shared public tier otherwise.
log.info({ tier: configureSocket({ apiKey: env.SOCKET_API_KEY, affiliate: env.SOCKET_AFFILIATE_ID }) }, "socket quotes");
const onrampPageUrl = env.ONRAMP_PAGE_URL ?? (env.ONRAMP_REFERRER_DOMAIN ? `https://${env.ONRAMP_REFERRER_DOMAIN}` : undefined);
const app = createApp({
  db,
  log,
  devSignIn: env.KAWASE_DEV_AUTH && env.NODE_ENV !== "production",
  chains: createChains(env),
  faucet: circleFaucet(env.CIRCLE_TEST_API_KEY),
  models,
  health,
  approvalSecret: env.AGENT_APPROVAL_SECRET,
  livekit:
    env.LIVEKIT_URL && env.LIVEKIT_API_KEY && env.LIVEKIT_API_SECRET
      ? { url: env.LIVEKIT_URL, apiKey: env.LIVEKIT_API_KEY, apiSecret: env.LIVEKIT_API_SECRET, agentName: voiceAgentName({ KAWASE_VOICE_AGENT: env.KAWASE_VOICE_AGENT }) }
      : undefined,
  ops: circleOps(env),
  agentWallets: circleAgentWallets(env),
  minAppVersion: env.KAWASE_MIN_APP_VERSION,
  deviceProofRequired: env.DEVICE_PROOF_REQUIRED,
  discovery: new Discovery({ demoSellerUrl: env.X402_DEMO_SELLER_URL }),
  swaps: appKitSwaps(env),
  bridges: appKitBridges(env),
  earn: appKitEarn(env),
  // Circle, plus Coinbase (Apple Pay → Base → Arc) when the CDP keys are set.
  onramp: onrampEngines(env),
  onrampPageUrl,
  circleWebhookKey: env.CIRCLE_LIVE_API_KEY ?? env.CIRCLE_TEST_API_KEY,
  market: liveMarketData({ alchemyApiKey: env.ALCHEMY_API_KEY }),
  liveTrades: new LiveTrades({ alchemyKey: env.ALCHEMY_API_KEY }),
  liveTicker: new LiveTicker(),
  alchemyApiKey: env.ALCHEMY_API_KEY,
  marketWarmMs: MARKET_WARM_MS,
  reconcileIntervalMs: RECONCILE_INTERVAL_MS,
  automationTickMs: AUTOMATION_TICK_MS,
  watchIntervalMs: WATCH_INTERVAL_MS,
  relayerWatchMs: RELAYER_WATCH_MS,
  webUrl: env.KAWASE_WEB_URL,
  push: new ExpoPush(env.EXPO_ACCESS_TOKEN),
  email: env.RESEND_API_KEY && env.EMAIL_FROM ? new ResendEmail(env.RESEND_API_KEY, env.EMAIL_FROM) : undefined,
  notifyTickMs: NOTIFY_TICK_MS,
  webOrigins: [
    ...env.KAWASE_WEB_ORIGINS.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
    ...(env.NODE_ENV === "development" ? ["http://localhost:8081"] : []),
  ],
});

const server = serve({ fetch: app.fetch, port: env.PORT, hostname: "::" }, (info) => {
  log.info({ port: info.port, networks: env.MAINNET_ENABLED ? ["testnet", "mainnet"] : ["testnet"] }, "api listening");
});

// A deploy (Coolify's rolling update) starts the new container, waits for it to be healthy, then stops this one. The
// proxy keeps sending this container its share of requests until it is gone, so closing the port at once answered
// those with 502 and no CORS header, for as long as the open live-market streams kept the process up (about 30 s,
// until Docker killed it; Abu's "Couldn't load markets", 10-15). Now it keeps serving a moment, then ends every
// connection (the streams reconnect to the new container) and exits, so it leaves the proxy's rotation at once.
const DRAIN_MS = 3_000;
const EXIT_DEADLINE_MS = 10_000;
let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    log.info({ signal }, "shutting down");
    stopHealth();
    setTimeout(() => process.exit(0), EXIT_DEADLINE_MS).unref();
    setTimeout(() => {
      server.close(() => {
        void pool.end().finally(() => process.exit(0));
      });
      if ("closeAllConnections" in server) server.closeAllConnections();
    }, DRAIN_MS);
  });
}
