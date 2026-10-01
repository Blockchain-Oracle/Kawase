// Settings → Notifications (Stage 9): what to be told about, on which channel, quiet hours, and this phone's push
// token. The token belongs to the device the session was made on.
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import { NOTIFICATION_CHANNELS, NOTIFICATION_KINDS } from "@kawase/config";
import { sessions, type Db } from "@kawase/db";

import { requireUser } from "../auth/middleware";
import { HTTP, problem } from "../http/problem";
import type { AppEnv } from "../types";
import { EXPO_PUSH_TOKEN } from "./expo";
import type { NotifyService } from "./service";

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const TOKEN_MAX = 200;

const channels = z.object(Object.fromEntries(NOTIFICATION_CHANNELS.map((channel) => [channel, z.boolean().optional()]))).strict();
const settingsSchema = z
  .object({
    prefs: z.object(Object.fromEntries(NOTIFICATION_KINDS.map((kind) => [kind, channels.optional()]))).strict().optional(),
    quietHours: z.object({ start: z.string().regex(HHMM), end: z.string().regex(HHMM) }).nullable().optional(),
  })
  .strict();
const tokenSchema = z.object({ token: z.string().max(TOKEN_MAX).regex(EXPO_PUSH_TOKEN).nullable() });

export function notifyRoutes(db: Db, notify: NotifyService) {
  const app = new Hono<AppEnv>();
  app.use("*", requireUser);

  const deviceOf = async (sessionId: string | undefined) => {
    if (!sessionId) return undefined;
    const [session] = await db.select({ deviceId: sessions.deviceId }).from(sessions).where(eq(sessions.id, sessionId));
    return session?.deviceId ?? undefined;
  };

  app.get("/", async (c) => c.json(await notify.settings(c.get("userId")!, await deviceOf(c.get("sessionId")))));

  app.patch("/", async (c) => {
    const parsed = settingsSchema.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) throw problem(HTTP.badRequest, "validation", undefined, { issues: parsed.error.issues });
    await notify.updateSettings(c.get("userId")!, parsed.data);
    return c.json(await notify.settings(c.get("userId")!, await deviceOf(c.get("sessionId"))));
  });

  /** This phone's Expo push token, or null when notifications were turned off or the person signs out. */
  app.put("/push-token", async (c) => {
    const parsed = tokenSchema.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) throw problem(HTTP.badRequest, "validation", undefined, { issues: parsed.error.issues });
    const deviceId = await deviceOf(c.get("sessionId"));
    if (!deviceId) throw problem(HTTP.badRequest, "validation");
    await notify.registerPushToken(c.get("userId")!, deviceId, parsed.data.token);
    return c.body(null, HTTP.noContent);
  });

  return app;
}
