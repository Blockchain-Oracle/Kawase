// Settings → Account (cards/access.md): devices and sessions, the email that follows the Turnkey user, the export
// record, and deleting the account step by step.
import { eq } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { z } from "zod";

import { DEVICE_NAME_MAX } from "@kawase/config";
import { sessions, type Db } from "@kawase/db";

import { requireAccount } from "../auth/middleware";
import { HTTP, problem } from "../http/problem";
import type { AppEnv } from "../types";
import { clientIp } from "./location";
import type { AccountService } from "./service";

const CONFIRM_MAX = 200;
const VERSION_MAX = 40;
const network = z.enum(["mainnet", "testnet"]);
const touchSchema = z.object({ name: z.string().min(1).max(DEVICE_NAME_MAX).optional(), appVersion: z.string().max(VERSION_MAX).optional() });
const deleteSchema = z.object({ confirm: z.string().min(1).max(CONFIRM_MAX) });
const revokeSchema = z.object({ network });

async function parse<T extends z.ZodType>(schema: T, body: unknown): Promise<z.infer<T>> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw problem(HTTP.badRequest, "validation", undefined, { issues: parsed.error.issues });
  return parsed.data;
}

export function accountRoutes(db: Db, account: AccountService) {
  const app = new Hono<AppEnv>();
  app.use("*", requireAccount);

  /** The device this request came from (its session's). */
  const currentDevice = async (c: Context<AppEnv>) => {
    const sessionId = c.get("sessionId");
    if (!sessionId) return undefined;
    const [row] = await db.select({ deviceId: sessions.deviceId }).from(sessions).where(eq(sessions.id, sessionId));
    return row?.deviceId;
  };

  app.get("/devices", async (c) => c.json({ devices: await account.devices(c.get("userId")!, await currentDevice(c)) }));

  app.patch("/devices/current", async (c) => {
    const input = await parse(touchSchema, await c.req.json());
    const deviceId = await currentDevice(c);
    if (deviceId) await account.touchCurrent(c.get("userId")!, deviceId, { ...input, ip: clientIp(c) });
    return c.body(null, HTTP.noContent);
  });

  app.post("/devices/:id/sign-out", async (c) =>
    c.json(await account.signOutDevice(c.get("user")!, c.req.param("id"), { deviceId: await currentDevice(c) })),
  );

  app.post("/sign-out-everywhere", async (c) => c.json(await account.signOutEverywhere(c.get("user")!, { deviceId: await currentDevice(c) })));

  app.post("/email/sync", async (c) => c.json(await account.syncEmail(c.get("user")!)));

  app.post("/export/recorded", async (c) => {
    await account.recordExport(c.get("user")!, { deviceId: await currentDevice(c) });
    return c.body(null, HTTP.noContent);
  });

  app.get("/holdings", async (c) => c.json(await account.holdings(c.get("user")!)));

  app.post("/grants/revoke/request", async (c) => {
    const input = await parse(revokeSchema, await c.req.json());
    return c.json({ revoke: await account.revokeAllRequest(c.get("user")!, input.network) });
  });

  app.post("/delete", async (c) => {
    const input = await parse(deleteSchema, await c.req.json());
    return c.json(await account.deleteAccount(c.get("user")!, input.confirm, { deviceId: await currentDevice(c) }));
  });

  return app;
}
