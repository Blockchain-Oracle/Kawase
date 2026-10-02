// Push and email (Stage 9, D31). Every inbox item queues one delivery per phone with a push token and one email, in
// the inbox item's own transaction. A loop sends what is due: the person's choices and quiet hours are read at send
// time, push goes to Expo in batches, email to Resend one by one, and push receipts are read later. A push is sent at
// most once (Expo has no idempotency key: a delivery cut off mid-send is never sent again); an email may be retried,
// because its idempotency key makes Resend send it once. The inbox keeps everything either way.
import { and, eq, inArray, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm";

import {
  isSupportedLocale,
  NOTIFY_MAX_AGE_MS,
  NOTIFY_MAX_ATTEMPTS,
  NOTIFY_RETRY_BASE_MS,
  NOTIFY_SENDING_LEASE_MS,
  PUSH_BATCH,
  PUSH_RECEIPT_BATCH,
  PUSH_RECEIPT_DELAY_MS,
  PUSH_RECEIPT_GIVE_UP_MS,
  notificationOn,
  type NotificationKind,
  type NotificationPrefs,
  type QuietHours,
} from "@kawase/config";
import { devices, inboxItems, notificationDeliveries, users, type Db } from "@kawase/db";
import { isRtlLocale, type CatalogLocale } from "@kawase/i18n";
import type { Logger } from "@kawase/log";

import type { Executor } from "../send/facts";
import { EmailError, type ResendEmail } from "./email";
import { EXPO_PUSH_TOKEN, PushRequestError, type ExpoPush, type PushMessage } from "./expo";
import { renderEmail, renderNotification } from "./render";

const MINUTES_PER_DAY = 1440;
const MINUTES_PER_HOUR = 60;
const MS_PER_MINUTE = 60_000;
const ANDROID_CHANNEL = "default";
const ERROR_TEXT_MAX = 200;
const BACKOFF_FACTOR = 2;

type Delivery = typeof notificationDeliveries.$inferSelect;
type Outcome = { status: "sent" | "skipped" | "failed" | "queued"; providerId?: string; error?: string; nextAttemptAt?: Date; countAttempt?: boolean };

/** Minutes after local midnight in an IANA time zone. */
function localMinutes(now: Date, timeZone: string): number {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
    const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
    const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
    return hour * MINUTES_PER_HOUR + minute;
  } catch {
    return now.getUTCHours() * MINUTES_PER_HOUR + now.getUTCMinutes();
  }
}

const toMinutes = (hhmm: string) => {
  const [hour, minute] = hhmm.split(":").map(Number);
  return (hour ?? 0) * MINUTES_PER_HOUR + (minute ?? 0);
};

/** When quiet hours are on right now, the moment they end; otherwise undefined. */
export function quietUntil(quiet: QuietHours | null | undefined, timeZone: string, now = new Date()): Date | undefined {
  if (!quiet) return undefined;
  const start = toMinutes(quiet.start);
  const end = toMinutes(quiet.end);
  if (start === end) return undefined;
  const current = localMinutes(now, timeZone);
  const inside = start < end ? current >= start && current < end : current >= start || current < end;
  if (!inside) return undefined;
  const wait = (end - current + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return new Date(now.getTime() + wait * MS_PER_MINUTE);
}

export type NotifyChannels = { push?: ExpoPush | undefined; email?: ResendEmail | undefined; webUrl: string };

export class NotifyService {
  constructor(
    private readonly db: Db,
    private readonly channels: NotifyChannels,
    private readonly log: Logger,
  ) {}

  get emailEnabled() {
    return Boolean(this.channels.email);
  }

  /** In the inbox item's transaction: one delivery per phone that can get push, and one email. */
  async enqueue(executor: Executor, inboxItemId: string, userId: string) {
    const phones = await executor
      .select({ id: devices.id })
      .from(devices)
      .where(and(eq(devices.userId, userId), isNotNull(devices.expoPushToken), isNull(devices.revokedAt)));
    const rows = [
      ...phones.map((phone) => ({ userId, inboxItemId, channel: "push" as const, target: `device:${phone.id}`, deviceId: phone.id })),
      ...(this.channels.email ? [{ userId, inboxItemId, channel: "email" as const, target: "email", deviceId: null }] : []),
    ];
    if (rows.length > 0) await executor.insert(notificationDeliveries).values(rows).onConflictDoNothing();
  }

  /** This phone's Expo push token (or none): a token belongs to one device row, the newest to claim it. */
  async registerPushToken(userId: string, deviceId: string, token: string | null) {
    if (token !== null && !EXPO_PUSH_TOKEN.test(token)) throw new Error("not an Expo push token");
    await this.db.transaction(async (tx) => {
      if (token) await tx.update(devices).set({ expoPushToken: null }).where(and(eq(devices.expoPushToken, token), sql`${devices.id} <> ${deviceId}`));
      await tx
        .update(devices)
        .set({ expoPushToken: token, lastSeenAt: new Date() })
        .where(and(eq(devices.id, deviceId), eq(devices.userId, userId)));
    });
  }

  async settings(userId: string, deviceId: string | undefined) {
    const [user] = await this.db.select().from(users).where(eq(users.id, userId));
    const [device] = deviceId ? await this.db.select({ token: devices.expoPushToken }).from(devices).where(eq(devices.id, deviceId)) : [];
    return {
      prefs: (user?.notificationPrefs ?? {}) as NotificationPrefs,
      quietHours: (user?.quietHours ?? null) as QuietHours | null,
      email: user?.isAnonymous ? null : (user?.email ?? null),
      emailEnabled: this.emailEnabled,
      pushRegistered: Boolean(device?.token),
    };
  }

  async updateSettings(userId: string, change: { prefs?: NotificationPrefs | undefined; quietHours?: QuietHours | null | undefined }) {
    await this.db.transaction(async (tx) => {
      const [user] = await tx.select({ prefs: users.notificationPrefs }).from(users).where(eq(users.id, userId)).for("update");
      const merged: NotificationPrefs = { ...(user?.prefs ?? {}) };
      for (const [kind, channels] of Object.entries(change.prefs ?? {}) as [NotificationKind, NotificationPrefs[NotificationKind]][]) {
        merged[kind] = { ...merged[kind], ...channels };
      }
      await tx
        .update(users)
        .set({ notificationPrefs: merged, ...(change.quietHours !== undefined ? { quietHours: change.quietHours } : {}) })
        .where(eq(users.id, userId));
    });
  }

  /** One pass: give up on interrupted sends, then send what is due. */
  async tick() {
    const now = new Date();
    await this.db
      .update(notificationDeliveries)
      .set({ status: "failed", error: "interrupted" })
      .where(
        and(
          eq(notificationDeliveries.status, "sending"),
          eq(notificationDeliveries.channel, "push"),
          lt(notificationDeliveries.sendingAt, new Date(now.getTime() - NOTIFY_SENDING_LEASE_MS)),
        ),
      );
    // An email cut off mid-send goes again: Resend's idempotency key keeps it to one email.
    await this.db
      .update(notificationDeliveries)
      .set({ status: "queued" })
      .where(
        and(
          eq(notificationDeliveries.status, "sending"),
          eq(notificationDeliveries.channel, "email"),
          lt(notificationDeliveries.sendingAt, new Date(now.getTime() - NOTIFY_SENDING_LEASE_MS)),
        ),
      );

    const due = this.db
      .select({ id: notificationDeliveries.id })
      .from(notificationDeliveries)
      .where(and(eq(notificationDeliveries.status, "queued"), lte(notificationDeliveries.nextAttemptAt, now)))
      .orderBy(notificationDeliveries.nextAttemptAt)
      .limit(PUSH_BATCH)
      .for("update", { skipLocked: true });
    const claimed = await this.db
      .update(notificationDeliveries)
      .set({ status: "sending", sendingAt: now })
      .where(inArray(notificationDeliveries.id, due))
      .returning();
    if (claimed.length === 0) return;

    const itemIds = [...new Set(claimed.map((row) => row.inboxItemId))];
    const userIds = [...new Set(claimed.map((row) => row.userId))];
    const deviceIds = claimed.flatMap((row) => (row.deviceId ? [row.deviceId] : []));
    const [items, people, phones] = await Promise.all([
      this.db.select().from(inboxItems).where(inArray(inboxItems.id, itemIds)),
      this.db.select().from(users).where(inArray(users.id, userIds)),
      deviceIds.length > 0 ? this.db.select().from(devices).where(inArray(devices.id, deviceIds)) : Promise.resolve([]),
    ]);
    const itemById = new Map(items.map((item) => [item.id, item]));
    const userById = new Map(people.map((user) => [user.id, user]));
    const phoneById = new Map(phones.map((phone) => [phone.id, phone]));

    const outcomes = new Map<string, Outcome>();
    const pushes: { delivery: Delivery; message: PushMessage }[] = [];
    const emails: { delivery: Delivery; to: string; email: ReturnType<typeof renderEmail> }[] = [];

    for (const delivery of claimed) {
      const item = itemById.get(delivery.inboxItemId);
      const user = userById.get(delivery.userId);
      if (!item || !user) {
        outcomes.set(delivery.id, { status: "skipped", error: "gone" });
        continue;
      }
      const kind = item.kind as NotificationKind;
      if (!notificationOn(user.notificationPrefs as NotificationPrefs, kind, delivery.channel)) {
        outcomes.set(delivery.id, { status: "skipped", error: "turned_off" });
        continue;
      }
      // Quiet hours hold push (not email); a held push is still told when they end, however long the night.
      const held = delivery.error === "quiet_hours";
      if (!held && now.getTime() - item.createdAt.getTime() > NOTIFY_MAX_AGE_MS) {
        outcomes.set(delivery.id, { status: "skipped", error: "too_old" });
        continue;
      }
      if (delivery.channel === "push") {
        const until = quietUntil(user.quietHours as QuietHours | null, user.timezone, now);
        if (until) {
          outcomes.set(delivery.id, { status: "queued", nextAttemptAt: until, error: "quiet_hours", countAttempt: false });
          continue;
        }
      }
      const locale: CatalogLocale = isSupportedLocale(user.locale) ? user.locale : "en";
      const rendered = renderNotification({ kind: item.kind, network: item.network, params: item.params }, locale);
      if (delivery.channel === "push") {
        const phone = delivery.deviceId ? phoneById.get(delivery.deviceId) : undefined;
        if (!this.channels.push || !phone?.expoPushToken || phone.revokedAt) {
          outcomes.set(delivery.id, { status: "skipped", error: "no_token" });
          continue;
        }
        pushes.push({
          delivery,
          message: {
            to: phone.expoPushToken,
            title: rendered.title,
            body: rendered.body,
            data: { path: rendered.path, inboxItemId: item.id, network: item.network, kind: item.kind },
            sound: "default",
            priority: "high",
            channelId: ANDROID_CHANNEL,
          },
        });
      } else {
        if (!this.channels.email || user.isAnonymous || !user.email) {
          outcomes.set(delivery.id, { status: "skipped", error: "no_email" });
          continue;
        }
        emails.push({ delivery, to: user.email, email: renderEmail(rendered, locale, this.channels.webUrl, isRtlLocale(locale)) });
      }
    }

    if (pushes.length > 0 && this.channels.push) {
      try {
        const tickets = await this.channels.push.send(pushes.map((push) => push.message));
        pushes.forEach(({ delivery }, index) => {
          const ticket = tickets[index];
          if (ticket?.status === "ok") outcomes.set(delivery.id, { status: "sent", providerId: ticket.id });
          else {
            const code = ticket?.details?.error ?? ticket?.message ?? "no_ticket";
            outcomes.set(delivery.id, { status: "failed", error: code });
            if (code === "DeviceNotRegistered" && delivery.deviceId) void this.forgetToken(delivery.deviceId);
          }
        });
      } catch (error) {
        // Nothing in the request was taken: try again later (rate limit, network, Expo's own error).
        const detail = error instanceof PushRequestError ? `http_${error.status}` : "request_failed";
        for (const { delivery } of pushes) outcomes.set(delivery.id, this.retry(delivery, detail, now));
        this.log.warn({ err: error, count: pushes.length }, "push request failed");
      }
    }

    for (const { delivery, to, email } of emails) {
      try {
        const sent = await this.channels.email!.send({ to, ...email, idempotencyKey: `kawase-delivery-${delivery.id}` });
        outcomes.set(delivery.id, { status: "sent", providerId: sent.id });
      } catch (error) {
        const retryable = error instanceof EmailError ? error.retryable : true;
        const detail = error instanceof Error ? error.message.slice(0, ERROR_TEXT_MAX) : "email_failed";
        outcomes.set(delivery.id, retryable ? this.retry(delivery, detail, now) : { status: "failed", error: detail });
        this.log.warn({ err: error, deliveryId: delivery.id }, "email failed");
      }
    }

    await Promise.all(
      [...outcomes].map(([id, outcome]) =>
        this.db
          .update(notificationDeliveries)
          .set({
            status: outcome.status,
            error: outcome.error ?? null,
            ...(outcome.providerId ? { providerId: outcome.providerId } : {}),
            ...(outcome.status === "sent" ? { sentAt: new Date() } : {}),
            ...(outcome.nextAttemptAt ? { nextAttemptAt: outcome.nextAttemptAt } : {}),
            ...(outcome.countAttempt === false ? {} : { attempts: sql`${notificationDeliveries.attempts} + 1` }),
          })
          .where(eq(notificationDeliveries.id, id)),
      ),
    );
    const sent = [...outcomes.values()].filter((outcome) => outcome.status === "sent").length;
    if (sent > 0) this.log.info({ sent, claimed: claimed.length }, "notifications sent");
  }

  private retry(delivery: Delivery, error: string, now: Date): Outcome {
    if (delivery.attempts + 1 >= NOTIFY_MAX_ATTEMPTS) return { status: "failed", error };
    return { status: "queued", error, nextAttemptAt: new Date(now.getTime() + NOTIFY_RETRY_BASE_MS * BACKOFF_FACTOR ** delivery.attempts) };
  }

  private async forgetToken(deviceId: string) {
    await this.db.update(devices).set({ expoPushToken: null }).where(eq(devices.id, deviceId));
  }

  /** Expo's receipts: did the phone's platform take each push? A dead token is forgotten. */
  async checkReceipts() {
    if (!this.channels.push) return;
    const now = Date.now();
    const rows = await this.db
      .select()
      .from(notificationDeliveries)
      .where(
        and(
          eq(notificationDeliveries.status, "sent"),
          eq(notificationDeliveries.channel, "push"),
          isNotNull(notificationDeliveries.providerId),
          lt(notificationDeliveries.sentAt, new Date(now - PUSH_RECEIPT_DELAY_MS)),
          sql`${notificationDeliveries.sentAt} > ${new Date(now - PUSH_RECEIPT_GIVE_UP_MS)}`,
          or(isNull(notificationDeliveries.receiptCheckedAt), lt(notificationDeliveries.receiptCheckedAt, new Date(now - PUSH_RECEIPT_DELAY_MS))),
        ),
      )
      .limit(PUSH_RECEIPT_BATCH);
    if (rows.length === 0) return;
    const receipts = await this.channels.push.receipts(rows.map((row) => row.providerId!));
    for (const row of rows) {
      const receipt = receipts[row.providerId!];
      if (!receipt) {
        await this.db.update(notificationDeliveries).set({ receiptCheckedAt: new Date() }).where(eq(notificationDeliveries.id, row.id));
        continue;
      }
      const error = receipt.status === "error" ? (receipt.details?.error ?? receipt.message) : null;
      await this.db
        .update(notificationDeliveries)
        .set({ status: receipt.status === "ok" ? "delivered" : "failed", error, receiptCheckedAt: new Date() })
        .where(eq(notificationDeliveries.id, row.id));
      if (error === "DeviceNotRegistered" && row.deviceId) await this.forgetToken(row.deviceId);
    }
  }

  start(tickMs: number, receiptTickMs: number) {
    const loop = (ms: number, work: () => Promise<void>, label: string) => {
      let running = false;
      const timer = setInterval(() => {
        if (running) return;
        running = true;
        void work()
          .catch((error: unknown) => this.log.warn({ err: error }, label))
          .finally(() => {
            running = false;
          });
      }, ms);
      timer.unref();
      return () => clearInterval(timer);
    };
    const stops = [loop(tickMs, () => this.tick(), "notify tick failed"), loop(receiptTickMs, () => this.checkReceipts(), "push receipts failed")];
    return () => stops.forEach((stop) => stop());
  }
}
