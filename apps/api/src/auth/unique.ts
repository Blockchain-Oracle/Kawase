// Two requests that race to create the same row (a person tapping twice, two tabs finishing the same sign-in) end with
// one of them hitting a unique index. That is not a server fault: the loser reads the winner's row, or is told the
// work is already in progress (409), never a 500.
const PG_UNIQUE_VIOLATION = "23505";
/** How many `cause` links to follow (drizzle's query error → the driver's error). */
const MAX_CAUSE_DEPTH = 3;

/** The unique index a failed write hit, when that is why it failed (drizzle wraps the driver's error in `cause`). */
export function uniqueViolation(failure: unknown): string | undefined {
  for (let error: unknown = failure, depth = 0; error && typeof error === "object" && depth < MAX_CAUSE_DEPTH; depth++) {
    const fields = error as { code?: unknown; constraint?: unknown; cause?: unknown };
    if (fields.code === PG_UNIQUE_VIOLATION) return typeof fields.constraint === "string" ? fields.constraint : "";
    error = fields.cause;
  }
  return undefined;
}

/**
 * Runs `work`; when it loses a race on one of `indexes`, runs it once more (it now finds the row the winner wrote).
 * A second loss is the caller's conflict, answered by `onConflict`.
 */
export async function retryOnRace<T>(work: () => Promise<T>, indexes: readonly string[], onConflict: () => Error): Promise<T> {
  const lost = (failure: unknown) => {
    const index = uniqueViolation(failure);
    return index !== undefined && (index === "" || indexes.includes(index));
  };
  try {
    return await work();
  } catch (failure) {
    if (!lost(failure)) throw failure;
  }
  try {
    return await work();
  } catch (failure) {
    if (lost(failure)) throw onConflict();
    throw failure;
  }
}
