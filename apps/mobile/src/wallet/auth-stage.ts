import { ApiError } from "@kawase/api-client";
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
    console.warn("[sign-in]", {
      stage,
      attemptId,
      durationMs: Date.now() - started,
      outcome: "failed",
      category: classifySignInFailure(cause),
      ...(cause instanceof ApiError ? { code: cause.code, requestId: cause.problem.requestId } : {}),
    });
    throw new AuthStageError(stage, attemptId, cause);
  }
}
