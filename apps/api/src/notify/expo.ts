// Expo's push service (docs.expo.dev/push-notifications/sending-notifications, read 2026-10-01): up to 100 messages
// per request, a ticket for each in order; whether the phone's platform (FCM/APNs) took it is in the receipt, read
// about 15 minutes later (up to 1000 ids per request). "DeviceNotRegistered" means stop sending to that token.
// There is no idempotency key, so the caller sends each message at most once.
import { NOTIFY_HTTP_TIMEOUT_MS } from "@kawase/config";

const SEND_URL = "https://exp.host/--/api/v2/push/send";
const RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";

/** An Expo push token, as `getExpoPushTokenAsync` returns it. */
export const EXPO_PUSH_TOKEN = /^Expo(nent)?PushToken\[[\w-]+\]$/;

export type PushMessage = {
  to: string;
  title: string;
  body: string;
  data: Record<string, string>;
  sound: "default";
  priority: "high";
  /** Android: the channel the app created (`default`). */
  channelId: string;
};

type ProviderError = { status: "error"; message: string; details?: { error?: string } };
export type PushTicket = { status: "ok"; id: string } | ProviderError;
export type PushReceipt = { status: "ok" } | ProviderError;

/** The whole request failed (network, 4xx/5xx, rate limit): nothing in it was sent, so it can be tried again. */
export class PushRequestError extends Error {
  constructor(
    readonly status: number,
    detail: string,
  ) {
    super(`expo push ${status}: ${detail}`);
  }
}

export class ExpoPush {
  constructor(private readonly accessToken?: string) {}

  private headers() {
    return {
      accept: "application/json",
      "accept-encoding": "gzip, deflate",
      "content-type": "application/json",
      ...(this.accessToken ? { authorization: `Bearer ${this.accessToken}` } : {}),
    };
  }

  private async post<T>(url: string, body: unknown): Promise<T> {
    const response = await fetch(url, { method: "POST", headers: this.headers(), body: JSON.stringify(body), signal: AbortSignal.timeout(NOTIFY_HTTP_TIMEOUT_MS) }).catch(
      (error: unknown) => {
        throw new PushRequestError(0, error instanceof Error ? error.message : String(error));
      },
    );
    const json = (await response.json().catch(() => undefined)) as { data?: T; errors?: unknown } | undefined;
    if (!response.ok || json?.data === undefined) throw new PushRequestError(response.status, JSON.stringify(json?.errors ?? json ?? null));
    return json.data;
  }

  /** One ticket per message, in the same order. */
  async send(messages: PushMessage[]): Promise<PushTicket[]> {
    return this.post<PushTicket[]>(SEND_URL, messages);
  }

  /** Receipts by ticket id; an id that is not ready yet is simply missing. */
  async receipts(ids: string[]): Promise<Record<string, PushReceipt>> {
    return this.post<Record<string, PushReceipt>>(RECEIPTS_URL, { ids });
  }
}
