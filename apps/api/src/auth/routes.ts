import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import { voicePrefs } from "@kawase/config";
import { devices, type Db } from "@kawase/db";

import { clientIp } from "../account/location";
import { FIELD } from "../http/fields";
import { HTTP, problem } from "../http/problem";
import type { AppEnv } from "../types";
import { bearerToken, findSession, revokeSession } from "./session";
import type { AuthService } from "./service";

const deviceSchema = z.object({
  platform: z.enum(["ios", "android", "web", "desktop"]),
  installationId: z.string().min(FIELD.installationIdMin).max(FIELD.installationIdMax),
  appVersion: z.string().max(FIELD.appVersionMax).optional(),
  locale: z.string().max(FIELD.localeMax).optional(),
});

const guestSchema = z.object({ device: deviceSchema, locale: z.string().max(FIELD.localeMax).optional() });

const turnkeySchema = z.object({
  proof: z.object({ body: z.string().min(1), stamp: z.string().min(1) }),
  turnkeyUserId: z.uuid(),
  device: deviceSchema,
});

async function parse<T extends z.ZodType>(schema: T, body: unknown): Promise<z.infer<T>> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw problem(HTTP.badRequest, "validation", undefined, { issues: parsed.error.issues });
  return parsed.data;
}

/** After an account sign-in: the device's place and the "new sign-in" notice (never delays or fails the sign-in). */
export type SignedInHook = (input: { userId: string; deviceId: string; deviceCreatedAt: Date; ip: string | undefined }) => Promise<void>;

export function authRoutes(db: Db, auth: AuthService, onSignedIn?: SignedInHook) {
  const app = new Hono<AppEnv>();

  app.post("/nonce", async (c) => c.json(await auth.issueNonce()));

  app.post("/guest", async (c) => {
    const input = await parse(guestSchema, await c.req.json());
    const { token, user } = await auth.signInAsGuest(input);
    return c.json({ token, user: publicUser(user) }, HTTP.created);
  });

  app.post("/turnkey", async (c) => {
    const input = await parse(turnkeySchema, await c.req.json());
    // A guest session in the Authorization header means "upgrade this guest".
    const guestToken = bearerToken(c.req.raw.headers);
    const guest = guestToken ? await findSession(db, guestToken) : undefined;
    const guestUserId = guest?.user.isAnonymous ? guest.user.id : undefined;
    const { token, user, device } = await auth.signInWithTurnkey({ ...input, guestUserId });
    if (guest) await revokeSession(db, guest.session.id);
    if (onSignedIn) void onSignedIn({ userId: user.id, deviceId: device.id, deviceCreatedAt: device.createdAt, ip: clientIp(c) }).catch(() => undefined);
    return c.json({ token, user: publicUser(user) }, HTTP.created);
  });

  app.post("/sign-out", async (c) => {
    const token = bearerToken(c.req.raw.headers);
    const current = token ? await findSession(db, token) : undefined;
    if (current) {
      await revokeSession(db, current.session.id);
      // A phone signed out gets no more of this person's notifications (the next person on it can take the token).
      await db.update(devices).set({ expoPushToken: null }).where(eq(devices.id, current.session.deviceId));
    }
    return c.body(null, HTTP.noContent);
  });

  return app;
}

/** The user as the app sees it: never the Turnkey ids of other users, never internal flags. */
export function publicUser(user: {
  id: string;
  email: string | null;
  handle: string | null;
  handlePromptedAt?: Date | null;
  isAnonymous: boolean;
  locale: string;
  replyLanguage: string | null;
  displayCurrency: string;
  timezone: string;
  theme: string;
  activeNetwork: string;
  riskMode: string;
  practiceMode: boolean;
  pausedAllAt?: Date | null;
  turnkeySubOrganizationId: string | null;
  voicePrefs?: unknown;
}) {
  return {
    id: user.id,
    email: user.email,
    handle: user.handle,
    /** The optional handle step was answered (a handle saved or skipped), so onboarding does not ask again. */
    handlePrompted: Boolean(user.handlePromptedAt) || Boolean(user.handle),
    isGuest: user.isAnonymous,
    locale: user.locale,
    replyLanguage: user.replyLanguage,
    displayCurrency: user.displayCurrency,
    timezone: user.timezone,
    theme: user.theme,
    activeNetwork: user.activeNetwork,
    riskMode: user.riskMode,
    practiceMode: user.practiceMode,
    pausedAllAt: user.pausedAllAt?.toISOString() ?? null,
    turnkeySubOrganizationId: user.turnkeySubOrganizationId,
    /** Settings → Voice, with the defaults filled in. */
    voicePrefs: voicePrefs(user.voicePrefs),
  };
}
