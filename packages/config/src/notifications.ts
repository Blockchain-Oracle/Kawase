// Notifications (Stage 9, D31): the inbox is the record; push and email tell the person about it. One place for the
// event kinds, what each channel does by default, and the timings of delivery, so the api and the app agree.

/** Every inbox event, in the order Settings → Notifications lists them. */
export const NOTIFICATION_KINDS = ["payment_received", "request_paid", "send_completed", "automation_skipped", "rule_alert", "position_health", "position_closed"] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export const NOTIFICATION_CHANNELS = ["push", "email"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

/** What the person turned on or off; anything not set follows `NOTIFICATION_DEFAULTS`. */
export type NotificationPrefs = Partial<Record<NotificationKind, Partial<Record<NotificationChannel, boolean>>>>;

/**
 * Push tells about everything. Email is for money that reached the person and for what Kawase did or skipped on its
 * own; a send they just made themselves is already on their screen.
 */
export const NOTIFICATION_DEFAULTS: Record<NotificationKind, Record<NotificationChannel, boolean>> = {
  payment_received: { push: true, email: true },
  request_paid: { push: true, email: true },
  send_completed: { push: true, email: false },
  automation_skipped: { push: true, email: true },
  rule_alert: { push: true, email: true },
  // Money at risk, and what Kawase did with a position on its own: always worth an email too.
  position_health: { push: true, email: true },
  position_closed: { push: true, email: true },
};

export function notificationOn(prefs: NotificationPrefs | null | undefined, kind: NotificationKind, channel: NotificationChannel): boolean {
  return prefs?.[kind]?.[channel] ?? NOTIFICATION_DEFAULTS[kind][channel];
}

/** Quiet hours in the person's own time zone ("HH:MM", end may be the next day). Push waits; email still goes. */
export type QuietHours = { start: string; end: string };
export const QUIET_HOURS_DEFAULT: QuietHours = { start: "22:00", end: "07:00" };

/** How often queued deliveries are picked up. */
export const NOTIFY_TICK_MS = 2_000;
/** Expo: check push receipts about 15 minutes after sending (docs: push-notifications/sending-notifications). */
export const PUSH_RECEIPT_DELAY_MS = 15 * 60_000;
export const PUSH_RECEIPT_TICK_MS = 5 * 60_000;
/** Expo accepts at most 100 messages per request and 1000 receipt ids per request. */
export const PUSH_BATCH = 100;
export const PUSH_RECEIPT_BATCH = 1000;
/** A delivery that could not go after this many tries, or this long after the event, is dropped (the inbox keeps it). */
export const NOTIFY_MAX_ATTEMPTS = 5;
export const NOTIFY_MAX_AGE_MS = 6 * 60 * 60_000;
/** A delivery left "sending" this long (the process died mid-send) is not retried: never twice. */
export const NOTIFY_SENDING_LEASE_MS = 2 * 60_000;
/** Retry backoff: base × 2^attempt. */
export const NOTIFY_RETRY_BASE_MS = 5_000;
/** Expo keeps receipts for a day; after that a push without one is left as sent. */
export const PUSH_RECEIPT_GIVE_UP_MS = 24 * 60 * 60_000;
/** How long a call to Expo or Resend may take. */
export const NOTIFY_HTTP_TIMEOUT_MS = 10_000;
