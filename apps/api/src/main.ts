// Hono API: auth, wallet, settings, capabilities; later the agent chat stream, intents, webhooks and SSE.
import { serve } from "@hono/node-server";
import { config } from "dotenv";

import { createModels } from "@kawase/agent";
import { createDb } from "@kawase/db";
import type { ModelRef } from "@kawase/config";
import { loadApiEnv } from "@kawase/env";
import { AUTOMATION_TICK_MS, MARKET_WARM_MS, NOTIFY_TICK_MS, RECONCILE_INTERVAL_MS, WATCH_INTERVAL_MS } from "@kawase/config";
import { createLogger } from "@kawase/log";

import { createApp } from "./app";
import { createTurnkeyReader } from "./auth/turnkey";
import { circleFaucet } from "./faucet/circle-faucet";
import { circleOps } from "./send/ops";
import { Discovery } from "@kawase/integrations-x402";
import { circleAgentWallets } from "./marketplace/agent-wallets";
import { appKitBridges } from "./bridge/engine";
import { appKitEarn } from "./earn/engine";
import { liveMarketData } from "./market/sources";
import { appKitSwaps } from "./swap/engine";
import { circleOnramp } from "./onramp/engine";
import { ResendEmail } from "./notify/email";
import { ExpoPush } from "./notify/expo";
import { createChains } from "./wallet/chain";

config({ path: new URL("../../../.env", import.meta.url).pathname, quiet: true });

const env = loadApiEnv();
const log = createLogger({ service: "api", pretty: env.NODE_ENV === "development" });
const { db, pool } = createDb(env.DATABASE_URL);
const app = createApp({
  db,
  log,
  turnkey: createTurnkeyReader({
    baseUrl: env.TURNKEY_API_BASE_URL,
    apiPublicKey: env.TURNKEY_API_PUBLIC_KEY,
    apiPrivateKey: env.TURNKEY_API_PRIVATE_KEY,
  }),
  chains: createChains(env),
  faucet: circleFaucet(env.CIRCLE_TEST_API_KEY),
  models: createModels(
    { ...(env.OPENAI_API_KEY ? { openai: env.OPENAI_API_KEY } : {}), ...(env.ANTHROPIC_API_KEY ? { anthropic: env.ANTHROPIC_API_KEY } : {}) },
    {
      ...(env.KAWASE_MODEL_AGENT_CHAT ? { agentChat: env.KAWASE_MODEL_AGENT_CHAT as ModelRef } : {}),
      ...(env.KAWASE_MODEL_AGENT_VOICE ? { agentVoice: env.KAWASE_MODEL_AGENT_VOICE as ModelRef } : {}),
      ...(env.KAWASE_MODEL_UTILITY ? { utility: env.KAWASE_MODEL_UTILITY as ModelRef } : {}),
    },
  ),
  approvalSecret: env.AGENT_APPROVAL_SECRET,
  livekit: env.LIVEKIT_URL && env.LIVEKIT_API_KEY && env.LIVEKIT_API_SECRET ? { url: env.LIVEKIT_URL, apiKey: env.LIVEKIT_API_KEY, apiSecret: env.LIVEKIT_API_SECRET } : undefined,
  ops: circleOps(env),
  agentWallets: circleAgentWallets(env),
  minAppVersion: env.KAWASE_MIN_APP_VERSION,
  discovery: new Discovery({ demoSellerUrl: env.X402_DEMO_SELLER_URL }),
  swaps: appKitSwaps(env),
  bridges: appKitBridges(env),
  earn: appKitEarn(env),
  onramp: circleOnramp(env),
  circleWebhookKey: env.CIRCLE_LIVE_API_KEY ?? env.CIRCLE_TEST_API_KEY,
  market: liveMarketData({ alchemyApiKey: env.ALCHEMY_API_KEY }),
  alchemyApiKey: env.ALCHEMY_API_KEY,
  marketWarmMs: MARKET_WARM_MS,
  reconcileIntervalMs: RECONCILE_INTERVAL_MS,
  automationTickMs: AUTOMATION_TICK_MS,
  watchIntervalMs: WATCH_INTERVAL_MS,
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

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    log.info({ signal }, "shutting down");
    server.close(() => {
      void pool.end().then(() => process.exit(0));
    });
  });
}
