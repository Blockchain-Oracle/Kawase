import { and, eq, gt, ne, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import { handleProblem, MAINNET_CONSENT_VERSION, normalizeHandle, SUPPORTED_LOCALES, type HandleProblem } from "@kawase/config";
import { consents, handleHolds, users, type Db } from "@kawase/db";
import type { NetworkId } from "@kawase/networks";

import { requireAccount, requireUser } from "../auth/middleware";
import { publicUser } from "../auth/routes";
import { FIELD } from "../http/fields";
import { HTTP, problem } from "../http/problem";
import type { AppEnv } from "../types";
import type { Chains } from "../wallet/chain";

const settingsSchema = z
  .object({
    locale: z.enum(SUPPORTED_LOCALES),
    replyLanguage: z.string().max(FIELD.localeMax).nullable(),
    displayCurrency: z.string().length(FIELD.currencyCodeLength),
    timezone: z.string().max(FIELD.timezoneMax),
    theme: z.enum(["system", "light", "dark"]),
    /** The @handle; null clears it. Checked against the shared rules and for uniqueness below. */
    handle: z.string().max(FIELD.handleInputMax).nullable(),
    /** The optional handle step was answered (Skip); onboarding does not ask again (review R07). */
    handlePrompted: z.literal(true),
  })
  .partial();

const HANDLE_PROBLEMS: Record<HandleProblem, "handle_invalid" | "handle_reserved"> = {
  too_short: "handle_invalid",
  too_long: "handle_invalid",
  invalid: "handle_invalid",
  reserved: "handle_reserved",
};

/**
 * Whether another user already has this handle (handles are unique without regard to case), or a deleted account's
 * hold on it has not run out (cards/access.md: the @handle is held 30 days).
 */
async function handleTaken(db: Db, handle: string, exceptUserId: string) {
  const [[row], [held]] = await Promise.all([
    db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(sql`lower(${users.handle})`, handle), ne(users.id, exceptUserId)))
      .limit(1),
    db
      .select({ handle: handleHolds.handle })
      .from(handleHolds)
      .where(and(eq(handleHolds.handle, handle.toLowerCase()), gt(handleHolds.heldUntil, new Date())))
      .limit(1),
  ]);
  return Boolean(row ?? held);
}

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
    const userId = c.get("userId")!;
    const { handlePrompted, ...settings } = parsed.data;
    const changes: typeof settings & { handlePromptedAt?: Date } = { ...settings };
    // Saving a handle answers the step too; either way it is recorded once and kept.
    if ((handlePrompted || typeof changes.handle === "string") && !c.get("user")!.handlePromptedAt) changes.handlePromptedAt = new Date();
    if (typeof changes.handle === "string") {
      // A handle is a public name for an account; a guest has nothing to be paid at yet.
      if (c.get("user")!.isAnonymous) throw problem(HTTP.forbidden, "forbidden", "sign in to choose a handle");
      const reason = handleProblem(changes.handle);
      if (reason) throw problem(HTTP.unprocessable, HANDLE_PROBLEMS[reason], undefined, { reason });
      changes.handle = normalizeHandle(changes.handle);
      if (await handleTaken(db, changes.handle, userId)) throw problem(HTTP.conflict, "handle_taken");
    }
    try {
      const [updated] = await db.update(users).set(changes).where(eq(users.id, userId)).returning();
      return c.json({ user: publicUser(updated!) });
    } catch (failure) {
      // Two people saving the same handle at once: the unique index decides, and the loser is told it is taken.
      if (isUniqueViolation(failure, "users_handle_idx")) throw problem(HTTP.conflict, "handle_taken");
      throw failure;
    }
  });

  /** Live check for the handle field: the first rule it breaks, or whether someone has it. */
  app.get("/handle/availability", async (c) => {
    const raw = c.req.query("handle") ?? "";
    const handle = normalizeHandle(raw);
    const reason = handleProblem(raw);
    if (reason) return c.json({ handle, available: false, reason });
    const taken = await handleTaken(db, handle, c.get("userId")!);
    return c.json(taken ? { handle, available: false, reason: "taken" } : { handle, available: true });
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

const PG_UNIQUE_VIOLATION = "23505";
function isUniqueViolation(failure: unknown, constraint: string): boolean {
  const cause = (failure as { cause?: unknown }).cause ?? failure;
  const error = cause as { code?: string; constraint?: string };
  return error.code === PG_UNIQUE_VIOLATION && error.constraint === constraint;
}

async function listConsents(db: Db, userId: string) {
  const rows = await db.select().from(consents).where(eq(consents.userId, userId));
  return rows.map((row) => ({ kind: row.kind, version: row.version, acceptedAt: row.acceptedAt }));
}
