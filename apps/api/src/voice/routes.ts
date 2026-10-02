// Voice (Stage 10; MASTER-PLAN "Voice" flow): the app asks for a session and joins a LiveKit room with the token it
// gets; the same token dispatches Kawase's voice worker into that room, carrying (in metadata only the worker reads)
// a voice token for this person and this thread. The worker turns speech into text and calls `POST /voice/turn`, which
// runs the very same agent turn as chat — one brain, one transcript — and streams the answer back to be spoken; the
// tool cards in that stream are put on the phone's screen by the worker over LiveKit RPC.
import { randomBytes, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { createUIMessageStreamResponse, type UIMessage } from "ai";
import { AccessToken, RoomAgentDispatch, RoomConfiguration } from "livekit-server-sdk";
import { z } from "zod";

import { MS_PER_SECOND, VOICE_SESSION_TTL_S, voiceAgentName } from "@kawase/config";
import type { Models } from "@kawase/agent";
import { threads, users, type Db } from "@kawase/db";

import { requireUser } from "../auth/middleware";
import { bearerToken } from "../auth/session";
import type { createTurnRunner } from "../agent/routes";
import { HTTP, problem } from "../http/problem";
import type { AppEnv, SessionUser } from "../types";
import { signVoiceToken, verifyVoiceToken } from "./token";

export type LiveKitConfig = { url: string; apiKey: string; apiSecret: string };

const ROOM_SUFFIX_BYTES = 6;
const TEXT_MAX = 2000;
const sessionSchema = z.object({ threadId: z.uuid().optional() });
const TURN_ID_MAX = 100;
const turnSchema = z.object({
  turnId: z.string().min(1).max(TURN_ID_MAX).optional(),
  text: z.string().trim().min(1).max(TEXT_MAX),
});

export function voiceRoutes(deps: {
  db: Db;
  models: Models;
  livekit: LiveKitConfig | undefined;
  runner: ReturnType<typeof createTurnRunner>;
}) {
  const app = new Hono<AppEnv>();

  /** A voice session: a LiveKit room for this person, the token to join it, and the worker dispatched into it. */
  app.post("/session", requireUser, async (c) => {
    const livekit = deps.livekit;
    if (!livekit || !deps.models.hasKeyFor("agentChat")) throw problem(HTTP.serviceUnavailable, "voice_unavailable");
    const parsed = sessionSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) throw problem(HTTP.badRequest, "validation", undefined, { issues: parsed.error.issues });
    const user = c.get("user")!;
    const threadId = parsed.data.threadId ?? randomUUID();
    // The conversation's thread exists from the start, so "type instead" can always open it.
    if (!(await deps.runner.ownThread(user.id, threadId)))
      await deps.db
        .insert(threads)
        .values({ id: threadId, userId: user.id, network: user.activeNetwork, title: null })
        .onConflictDoNothing();
    const room = `kawase-${randomBytes(ROOM_SUFFIX_BYTES).toString("hex")}`;
    const identity = `user-${user.id}`;
    const expiresAt = Math.floor(Date.now() / MS_PER_SECOND) + VOICE_SESSION_TTL_S;
    const voiceToken = signVoiceToken({ sub: user.id, thread: threadId, exp: expiresAt }, livekit.apiSecret);
    const token = new AccessToken(livekit.apiKey, livekit.apiSecret, {
      identity,
      ...(user.handle ? { name: user.handle } : {}),
      ttl: VOICE_SESSION_TTL_S,
    });
    token.addGrant({ room, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true });
    token.roomConfig = new RoomConfiguration({
      agents: [
        new RoomAgentDispatch({
          agentName: voiceAgentName(process.env),
          metadata: JSON.stringify({
            voiceToken,
            threadId,
            identity,
            locale: user.replyLanguage ?? user.locale,
            network: user.activeNetwork,
            turnNamespace: room,
          }),
        }),
      ],
    });
    return c.json({ url: livekit.url, token: await token.toJwt(), room, threadId }, HTTP.created);
  });

  /** One spoken turn, from the worker: the same agent turn as chat, in the session's thread, as the session's person. */
  app.post("/turn", async (c) => {
    const livekit = deps.livekit;
    if (!livekit) throw problem(HTTP.serviceUnavailable, "voice_unavailable");
    const claims = verifyVoiceToken(bearerToken(c.req.raw.headers) ?? "", livekit.apiSecret);
    if (!claims) throw problem(HTTP.unauthorized, "unauthenticated");
    const parsed = turnSchema.safeParse(await c.req.json());
    if (!parsed.success) throw problem(HTTP.badRequest, "validation", undefined, { issues: parsed.error.issues });
    // Legacy workers remain compatible during rollout; protocol 2 requires the durable request identity.
    if (c.req.header("x-kawase-voice-protocol") === "2" && !parsed.data.turnId)
      throw problem(HTTP.badRequest, "validation");
    const [user] = await deps.db.select().from(users).where(eq(users.id, claims.sub));
    if (!user) throw problem(HTTP.unauthorized, "unauthenticated");
    const incoming = {
      id: `voice-${parsed.data.turnId ?? randomUUID()}`,
      role: "user",
      parts: [{ type: "text", text: parsed.data.text }],
    } as UIMessage;
    const stream = await deps.runner.run({
      user: user as unknown as SessionUser,
      threadId: claims.thread,
      incoming,
      surface: "voice",
      signal: c.req.raw.signal,
      log: c.get("log").child({ userId: user.id, surface: "voice" }),
    });
    return createUIMessageStreamResponse({ stream });
  });

  return app;
}
