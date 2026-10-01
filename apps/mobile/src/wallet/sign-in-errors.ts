// What the Turnkey kit and Apple say when the person closed the provider's sheet: not an error to show.
const CANCELLED = /cancel|did not complete successfully|1001/i;

/** True when the person backed out of a provider's sheet, which the screen treats as "nothing happened". */
export const isCancelled = (failure: unknown) =>
  failure instanceof Error && CANCELLED.test(`${failure.message} ${String((failure as { code?: unknown }).code ?? "")}`);
