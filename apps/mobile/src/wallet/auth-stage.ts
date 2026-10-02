import { ApiError } from "@kawase/api-client";

import { reportClientEvent } from "@/session/client-events";
import { describeError, summarize } from "./error-detail";
import { classifySignInFailure } from "./sign-in-errors";

export type AuthStage = "provider" | "code" | "session" | "proof" | "link" | "account" | "wallet";

/** Carries recovery context without putting credentials or provider responses in logs. */
export class AuthStageError extends Error {
  constructor(
    readonly stage: AuthStage,
    readonly attemptId: string,
    cause: unknown,
  ) {
    super(`Sign-in stage ${stage} failed`, { cause });
    this.name = "AuthStageError";
  }
}

export async function authStage<T>(stage: AuthStage, attemptId: string, action: () => Promise<T>): Promise<T> {
  const started = Date.now();
  try {
    const result = await action();
    console.info("[sign-in]", { stage, attemptId, durationMs: Date.now() - started, outcome: "ok" });
    return result;
  } catch (cause) {
    const category = classifySignInFailure(cause);
    const error = describeError(cause);
    console.warn("[sign-in]", {
      stage,
      attemptId,
      durationMs: Date.now() - started,
      outcome: "failed",
      category,
      ...(cause instanceof ApiError ? { code: cause.code, requestId: cause.problem.requestId } : {}),
      // A string, so the console's depth limit can't fold the cause chain into "[Object]".
      error: JSON.stringify(error),
    });
    // The person backing out of a provider's sheet is not a failure worth a report.
    if (category !== "cancelled") reportClientEvent({ stage, category, attemptId, ...summarize(error) });
    throw new AuthStageError(stage, attemptId, cause);
  }
}
