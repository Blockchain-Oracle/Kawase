// An error as logs can show it: name, message, code and the `cause` chain the Turnkey kit wraps the real failure
// in, with emails, codes, keys and tokens taken out of every message. Without this a kit failure logs only as
// "UNKNOWN" and the reason is lost.
import { redactDiagnostic } from "@kawase/api-client";

/** How many `cause` levels are kept. */
const CAUSE_DEPTH = 3;

export type ErrorDetail = {
  name?: string;
  message?: string;
  code?: string;
  cause?: ErrorDetail;
};

type Shape = { name?: unknown; message?: unknown; code?: unknown; cause?: unknown };

export function describeError(error: unknown, depth = CAUSE_DEPTH): ErrorDetail {
  if (error === null || error === undefined) return {};
  if (typeof error !== "object") return { message: redactDiagnostic(String(error)) };
  const shape = error as Shape;
  const detail: ErrorDetail = {};
  if (typeof shape.name === "string") detail.name = shape.name;
  if (typeof shape.message === "string") detail.message = redactDiagnostic(shape.message);
  if (typeof shape.code === "string" || typeof shape.code === "number") detail.code = redactDiagnostic(String(shape.code));
  if (depth > 0 && shape.cause !== undefined && shape.cause !== error)
    detail.cause = describeError(shape.cause, depth - 1);
  return detail;
}

/** One line for a report: every message from the outside in, and the innermost code (the most specific one). */
export function summarize(detail: ErrorDetail): { message?: string; code?: string } {
  const messages: string[] = [];
  let code: string | undefined;
  for (let current: ErrorDetail | undefined = detail; current; current = current.cause) {
    if (current.message) messages.push(current.name ? `${current.name}: ${current.message}` : current.message);
    code = current.code ?? code;
  }
  const message = redactDiagnostic(messages.join(" <- "));
  return { ...(message ? { message } : {}), ...(code ? { code } : {}) };
}
