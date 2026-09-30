// Structured logging with request-id propagation. Server-only.
// One pino logger per process; request handlers take a child logger with the request id, so every line
// written while serving a request can be found again from the id the client got back.
import pino, { type Logger } from "pino";

export type { Logger };

export type LogOptions = {
  /** The service name, e.g. "api" or "executor". */
  service: string;
  level?: pino.LevelWithSilent;
  /** Human-readable output for local development; JSON otherwise. */
  pretty?: boolean;
};

/** Keys whose values are replaced with "[redacted]" in every log line. */
const REDACTED_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  "*.privateKey",
  "*.apiKey",
  "*.entitySecret",
  "*.token",
  "*.signature",
];

export function createLogger({ service, level = "info", pretty = false }: LogOptions): Logger {
  return pino({
    level,
    base: { service },
    redact: { paths: REDACTED_PATHS, censor: "[redacted]" },
    timestamp: pino.stdTimeFunctions.isoTime,
    ...(pretty ? { transport: { target: "pino/file", options: { destination: 1 } } } : {}),
  });
}

/** A child logger that stamps every line with the request id (and the user, once known). */
export function requestLogger(parent: Logger, requestId: string, userId?: string): Logger {
  return parent.child(userId ? { requestId, userId } : { requestId });
}
