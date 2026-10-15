import { Hono } from "hono";

import { requireAccount } from "../auth/middleware";
import type { AppEnv } from "../types";
import type { LaunchpadService } from "./service";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const NETWORKS = new Set(["mainnet", "testnet"]);

export function launchpadRoutes(launchpads: LaunchpadService) {
  const app = new Hono<AppEnv>();
  // Public data (R13): a guest sees a token's curve too, on the network they name (mainnet by default).
  app.get("/tokens/:address", async (c) => {
    const address = c.req.param("address");
    if (!ADDRESS.test(address)) return c.json({ launchpad: null });
    const asked = c.req.query("network");
    // The network asked for (a token page names its token's own), else the session's, else mainnet.
    const network = asked && NETWORKS.has(asked) ? (asked as "mainnet" | "testnet") : (c.get("user")?.activeNetwork ?? "mainnet");
    return c.json({ launchpad: await launchpads.token(c.get("user"), network, address) });
  });
  app.post("/tokens/:address/watch", requireAccount, async (c) => c.json({ launchpad: await launchpads.watch(c.get("user")!, c.req.param("address")) }));
  app.delete("/tokens/:address/watch", requireAccount, async (c) => c.json({ launchpad: await launchpads.unwatch(c.get("user")!, c.req.param("address")) }));
  return app;
}
