import type { MiddlewareHandler } from "hono";

import type { Db } from "@kawase/db";

import { HTTP, problem } from "../http/problem";
import type { AppEnv } from "../types";
import { bearerToken, findSession } from "./session";

/** Reads the bearer session; routes that need a user call `requireUser` after it. */
export function attachSession(db: Db): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const token = bearerToken(c.req.raw.headers);
    if (token) {
      const found = await findSession(db, token);
      if (found) {
        c.set("userId", found.user.id);
        c.set("sessionId", found.session.id);
        c.set("user", found.user);
        c.set("log", c.get("log").child({ userId: found.user.id }));
      }
    }
    await next();
  };
}

export const requireUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.get("userId")) throw problem(HTTP.unauthorized, "unauthenticated");
  await next();
};

/** Guests may read; money and settings need a signed-in account. */
export const requireAccount: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = c.get("user");
  if (!user) throw problem(HTTP.unauthorized, "unauthenticated");
  if (user.isAnonymous) throw problem(HTTP.forbidden, "forbidden", "sign in to do this");
  await next();
};
