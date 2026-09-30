// The api, assembled from its parts so tests can build it with fakes (a Turnkey reader that answers from
// memory, a local chain) and main.ts with the real ones.
import { Hono } from "hono";
import { requestId } from "hono/request-id";

import type { Db } from "@kawase/db";
import { requestLogger, type Logger } from "@kawase/log";

import { attachSession } from "./auth/middleware";
import { authRoutes } from "./auth/routes";
import { AuthService } from "./auth/service";
import type { TurnkeyReader } from "./auth/turnkey";
import { capabilityView } from "./capabilities/service";
import { idempotency } from "./http/idempotency";
import { HTTP, ProblemError, problem, problemResponse } from "./http/problem";
import { createRateLimit } from "./http/rate-limit";
import { meRoutes } from "./me/routes";
import type { AppEnv } from "./types";
import type { Chains } from "./wallet/chain";
import { walletRoutes } from "./wallet/routes";
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
};

const DEFAULT_RATE_LIMIT_PER_MINUTE = 120;
const SIGN_IN_LIMIT_PER_MINUTE = 10;
const SECONDS_PER_MINUTE = 60;

export function createApp(deps: AppDeps) {
  const app = new Hono<AppEnv>();
  const auth = new AuthService(deps.db, deps.turnkey);
  const wallets = new WalletService(deps.db, deps.chains);
  const general = createRateLimit({
    limit: deps.rateLimitPerMinute ?? DEFAULT_RATE_LIMIT_PER_MINUTE,
    windowSeconds: SECONDS_PER_MINUTE,
  });
  const signIn = createRateLimit({
    limit: deps.signInLimitPerMinute ?? SIGN_IN_LIMIT_PER_MINUTE,
    windowSeconds: SECONDS_PER_MINUTE,
  });

  app.use("*", requestId());
  app.use("*", async (c, next) => {
    c.set("log", requestLogger(deps.log, c.get("requestId")));
    const startedAt = Date.now();
    await next();
    c.get("log").info(
      { method: c.req.method, path: c.req.path, status: c.res.status, ms: Date.now() - startedAt },
      "request",
    );
  });
  app.use("*", attachSession(deps.db));
  app.use("*", general.middleware);
  app.use("/auth/*", signIn.middleware);
  app.use("*", idempotency(deps.db));

  app.onError((error, c) => {
    const id = c.get("requestId");
    if (error instanceof ProblemError) return problemResponse(c, error, id);
    c.get("log").error({ err: error }, "unhandled");
    return problemResponse(c, problem(HTTP.internal, "internal"), id);
  });
  app.notFound((c) => problemResponse(c, problem(HTTP.notFound, "not_found"), c.get("requestId")));

  app.get("/health", (c) => c.json({ ok: true, networks: deps.chains.available }));
  app.get("/capabilities", async (c) => c.json({ capabilities: await capabilityView(deps.db, deps.chains.available) }));
  app.route("/auth", authRoutes(deps.db, auth));
  app.route("/me", meRoutes(deps.db, deps.chains));
  app.route("/wallet", walletRoutes(wallets, deps.turnkey));

  return app;
}

export type App = ReturnType<typeof createApp>;
