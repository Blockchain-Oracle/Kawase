import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import { SUPPORTED_LOCALES } from "@kawase/config";
import { consents, users, type Db } from "@kawase/db";
import type { NetworkId } from "@kawase/networks";

import { requireAccount, requireUser } from "../auth/middleware";
import { publicUser } from "../auth/routes";
import { FIELD } from "../http/fields";
import { HTTP, problem } from "../http/problem";
import type { AppEnv } from "../types";
import type { Chains } from "../wallet/chain";

const MAINNET_CONSENT_VERSION = "1";

const settingsSchema = z
  .object({
    locale: z.enum(SUPPORTED_LOCALES),
    replyLanguage: z.string().max(FIELD.localeMax).nullable(),
    displayCurrency: z.string().length(FIELD.currencyCodeLength),
    timezone: z.string().max(FIELD.timezoneMax),
    theme: z.enum(["system", "light", "dark"]),
    riskMode: z.enum(["careful", "balanced", "autonomous"]),
    practiceMode: z.boolean(),
  })
  .partial();

const networkSchema = z.object({ network: z.enum(["mainnet", "testnet"]) });
const consentSchema = z.object({
  kind: z.enum(["terms", "mainnet_real_money", "meme_risk", "marketplace_risk", "voice_retention"]),
  version: z.string().min(1).max(FIELD.consentVersionMax),
  locale: z.string().max(FIELD.localeMax),
});

export function meRoutes(db: Db, chains: Chains) {
  const app = new Hono<AppEnv>();
  app.use("*", requireUser);

  app.get("/", (c) => c.json({ user: publicUser(c.get("user")!), availableNetworks: chains.available }));

  app.patch("/", async (c) => {
    const parsed = settingsSchema.safeParse(await c.req.json());
    if (!parsed.success) throw problem(HTTP.badRequest, "validation", undefined, { issues: parsed.error.issues });
    const [updated] = await db
      .update(users)
      .set(parsed.data)
      .where(eq(users.id, c.get("userId")!))
      .returning();
    return c.json({ user: publicUser(updated!) });
  });

  /** The network is server-authoritative (K6). Mainnet needs the real-money consent and a live mainnet. */
  app.put("/network", async (c) => {
    const parsed = networkSchema.safeParse(await c.req.json());
    if (!parsed.success) throw problem(HTTP.badRequest, "validation", undefined, { issues: parsed.error.issues });
    const network = parsed.data.network as NetworkId;
    if (!chains.available.includes(network))
      throw problem(HTTP.unprocessable, "network_unavailable", `${network} is not available`);
    const userId = c.get("userId")!;
    if (network === "mainnet") {
      const [consent] = await db
        .select()
        .from(consents)
        .where(
          and(
            eq(consents.userId, userId),
            eq(consents.kind, "mainnet_real_money"),
            eq(consents.version, MAINNET_CONSENT_VERSION),
          ),
        );
      if (!consent)
        throw problem(HTTP.forbidden, "consent_required", undefined, {
          consent: "mainnet_real_money",
          version: MAINNET_CONSENT_VERSION,
        });
    }
    const [updated] = await db.update(users).set({ activeNetwork: network }).where(eq(users.id, userId)).returning();
    return c.json({ user: publicUser(updated!) });
  });

  app.post("/consents", requireAccount, async (c) => {
    const parsed = consentSchema.safeParse(await c.req.json());
    if (!parsed.success) throw problem(HTTP.badRequest, "validation", undefined, { issues: parsed.error.issues });
    await db
      .insert(consents)
      .values({ userId: c.get("userId")!, ...parsed.data })
      .onConflictDoNothing();
    return c.json({ consents: await listConsents(db, c.get("userId")!) }, HTTP.created);
  });

  app.get("/consents", async (c) => c.json({ consents: await listConsents(db, c.get("userId")!) }));

  return app;
}

async function listConsents(db: Db, userId: string) {
  const rows = await db.select().from(consents).where(eq(consents.userId, userId));
  return rows.map((row) => ({ kind: row.kind, version: row.version, acceptedAt: row.acceptedAt }));
}
