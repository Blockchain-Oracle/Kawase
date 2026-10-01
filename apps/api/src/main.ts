// Hono API: auth, wallet, settings, capabilities; later the agent chat stream, intents, webhooks and SSE.
import { serve } from "@hono/node-server";
import { config } from "dotenv";

import { createDb } from "@kawase/db";
import { loadApiEnv } from "@kawase/env";
import { createLogger } from "@kawase/log";

import { createApp } from "./app";
import { createTurnkeyReader } from "./auth/turnkey";
import { circleFaucet } from "./faucet/circle-faucet";
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
