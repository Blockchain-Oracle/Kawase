// The web's owner check (cards/access.md; a browser has no Face ID): before a signature that binds the person — accepting
// the allowance, a send or a swap above it — the app asks for a six-digit code emailed to the account's verified address
// and signs only once it checks out. Kawase checks it and Resend carries the email. Only the code's hash is kept; one
// live code per person; five tries; ten minutes; a new code at most every 30 s.
// The email tells, it never approves: the code is typed into Kawase (D31).
import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { and, desc, eq, gt, isNull } from "drizzle-orm";

import { isSupportedLocale } from "@kawase/config";
import { approvalCodes, type Db } from "@kawase/db";
import { isRtlLocale, type CatalogLocale } from "@kawase/i18n";

import { HTTP, problem } from "../http/problem";
import type { ResendEmail } from "../notify/email";
import { text } from "../notify/render";
import type { SessionUser } from "../types";

const CODE_DIGITS = 6;
const CODE_SPACE = 1_000_000;
const MS_PER_MINUTE = 60_000;
const CODE_TTL_MINUTES = 10;
const CODE_TTL_MS = CODE_TTL_MINUTES * MS_PER_MINUTE;
const RESEND_AFTER_MS = 30_000;
const MAX_TRIES = 5;
/** How much of the address's name shows before the dots ("ab•••@gmail.com"). */
const MASK_KEEP = 2;

const hashOf = (userId: string, code: string) => createHash("sha256").update(`${userId}:${code}`).digest("hex");
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

/** "abubakr@gmail.com" → "ab•••@gmail.com": enough to recognise, not to read off a screen. */
export function maskEmail(email: string): string {
  const [name = "", domain = ""] = email.split("@");
  return `${name.slice(0, MASK_KEEP)}•••@${domain}`;
}

export class ApprovalCodes {
  constructor(
    private readonly db: Db,
    private readonly email: ResendEmail | undefined,
    private readonly now: () => number = Date.now,
  ) {}

  /** Emails a fresh code (any earlier one stops working). */
  async send(user: SessionUser): Promise<{ sentTo: string; expiresAt: string }> {
    if (user.isAnonymous || !user.email) throw problem(HTTP.forbidden, "forbidden", "codes go to an account's verified email");
    if (!this.email) throw problem(HTTP.serviceUnavailable, "upstream", "email is not set up on this server");
    const [last] = await this.db
      .select({ createdAt: approvalCodes.createdAt })
      .from(approvalCodes)
      .where(eq(approvalCodes.userId, user.id))
      .orderBy(desc(approvalCodes.createdAt))
      .limit(1);
    if (last && this.now() - last.createdAt.getTime() < RESEND_AFTER_MS)
      throw problem(HTTP.tooManyRequests, "rate_limited", "a code was just sent; wait a moment for it");

    const code = randomInt(0, CODE_SPACE).toString().padStart(CODE_DIGITS, "0");
    const expiresAt = new Date(this.now() + CODE_TTL_MS);
    const row = await this.db.transaction(async (tx) => {
      await tx
        .update(approvalCodes)
        .set({ usedAt: new Date(this.now()) })
        .where(and(eq(approvalCodes.userId, user.id), isNull(approvalCodes.usedAt)));
      const [inserted] = await tx.insert(approvalCodes).values({ userId: user.id, codeHash: hashOf(user.id, code), expiresAt }).returning({ id: approvalCodes.id });
      return inserted!;
    });

    const locale: CatalogLocale = isSupportedLocale(user.locale) ? user.locale : "en";
    const subject = text(locale, "notify", "approvalCodeSubject", { code });
    const body = text(locale, "notify", "approvalCodeBody");
    const never = text(locale, "notify", "approvalCodeNever");
    await this.email.send({
      to: user.email,
      subject,
      text: [body, "", code, "", never].join("\n"),
      html: `<!doctype html><html dir="${isRtlLocale(locale) ? "rtl" : "ltr"}"><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#0A0A0A;background:#F5F5F5;line-height:1.5">
<p style="margin:0 0 12px">${escapeHtml(body)}</p>
<p style="font-size:32px;font-weight:700;letter-spacing:8px;font-family:ui-monospace,Menlo,monospace;margin:0 0 16px">${code}</p>
<p style="color:#5C5C5C;font-size:13px;margin-top:24px">${escapeHtml(never)}</p>
</body></html>`,
      idempotencyKey: `kawase-approval-${row.id}`,
    });
    return { sentTo: maskEmail(user.email), expiresAt: expiresAt.toISOString() };
  }

  /** Checks the live code; a right one is used up, a wrong one spends a try. */
  async verify(user: SessionUser, code: string): Promise<{ approved: true }> {
    const [live] = await this.db
      .select()
      .from(approvalCodes)
      .where(and(eq(approvalCodes.userId, user.id), isNull(approvalCodes.usedAt), gt(approvalCodes.expiresAt, new Date(this.now()))))
      .orderBy(desc(approvalCodes.createdAt))
      .limit(1);
    if (!live || live.attempts >= MAX_TRIES) throw problem(HTTP.badRequest, "code_invalid");
    const given = Buffer.from(hashOf(user.id, code.trim()));
    const kept = Buffer.from(live.codeHash);
    if (given.length !== kept.length || !timingSafeEqual(given, kept)) {
      await this.db.update(approvalCodes).set({ attempts: live.attempts + 1 }).where(eq(approvalCodes.id, live.id));
      throw problem(HTTP.badRequest, "code_invalid", undefined, { triesLeft: Math.max(0, MAX_TRIES - live.attempts - 1) });
    }
    const [used] = await this.db
      .update(approvalCodes)
      .set({ usedAt: new Date(this.now()) })
      .where(and(eq(approvalCodes.id, live.id), isNull(approvalCodes.usedAt)))
      .returning({ id: approvalCodes.id });
    if (!used) throw problem(HTTP.badRequest, "code_invalid");
    return { approved: true };
  }
}
