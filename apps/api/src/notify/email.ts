// Email through Resend (resend.com/docs/api-reference/emails/send-email, read 2026-10-01): one POST per email. The
// delivery's id is the Idempotency-Key (kept 24 h by Resend), so trying again after an unknown answer never sends a
// second copy. Emails only tell and link to the app; nothing is ever approved from an email (D31).
import { NOTIFY_HTTP_TIMEOUT_MS } from "@kawase/config";

const SEND_URL = "https://api.resend.com/emails";
const HTTP_TOO_MANY = 429;
const HTTP_SERVER_ERROR = 500;

export type Email = { to: string; subject: string; text: string; html: string; idempotencyKey: string };

/** Worth trying again later (network, rate limit, Resend's own error); anything else is final. */
export class EmailError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

export class ResendEmail {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send(email: Email): Promise<{ id: string }> {
    const response = await fetch(SEND_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json", "idempotency-key": email.idempotencyKey },
      body: JSON.stringify({ from: this.from, to: email.to, subject: email.subject, text: email.text, html: email.html }),
      signal: AbortSignal.timeout(NOTIFY_HTTP_TIMEOUT_MS),
    }).catch((error: unknown) => {
      throw new EmailError(error instanceof Error ? error.message : String(error), true);
    });
    const json = (await response.json().catch(() => undefined)) as { id?: string; message?: string } | undefined;
    if (response.ok && json?.id) return { id: json.id };
    const retryable = response.status === HTTP_TOO_MANY || response.status >= HTTP_SERVER_ERROR;
    throw new EmailError(`resend ${response.status}: ${json?.message ?? "no id"}`, retryable);
  }
}
