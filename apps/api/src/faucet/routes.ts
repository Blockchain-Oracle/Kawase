// `GET /faucet` (can the person claim now, and when next) and `POST /faucet/claim` (send it), over FaucetService.
import { Hono } from "hono";

import { requireAccount } from "../auth/middleware";
import { HTTP, problem } from "../http/problem";
import type { AppEnv } from "../types";
import type { FaucetService } from "./service";

export function faucetRoutes(faucet: FaucetService) {
  const app = new Hono<AppEnv>();
  app.use("*", requireAccount);

  app.get("/", async (c) => c.json(await faucet.status(c.get("userId")!)));

  app.post("/claim", async (c) => {
    const result = await faucet.claim(c.get("userId")!, c.get("user")!.activeNetwork, c.get("log"));
    switch (result.status) {
      case "sent":
        return c.json(result, HTTP.created);
      case "claimed_today":
        throw problem(HTTP.tooManyRequests, "faucet_claimed_today", undefined, { nextAt: result.nextAt });
      case "not_testnet":
        throw problem(HTTP.unprocessable, "faucet_testnet_only");
      case "needs_wallet":
        throw problem(HTTP.unprocessable, "wallet_not_registered");
      case "failed":
        throw problem(HTTP.badGateway, "upstream", "the faucet did not send", { fallbackUrl: result.fallbackUrl });
    }
  });

  return app;
}
