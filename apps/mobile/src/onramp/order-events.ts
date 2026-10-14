// What the buy page and the native frame share, with no screen in it: reading a provider's lifecycle event in either
// shape, the bridge a page uses to tell the app, what an order's reason means for the person's money, and the order
// poll. The widget's events are hints for the screen; the order settles only when the api sees the money on chain.
import * as React from "react";

import type { OnrampOrderView, OnrampStage } from "@kawase/api-client";

/** The post-message the page sends the app; Circle's and Coinbase's own events keep their names. */
export const HOST_EVENTS = { close: "KAWASE_CLOSE", settled: "KAWASE_SETTLED", expired: "KAWASE_SESSION_EXPIRED" } as const;

/** A provider event reduced to what `POST /onramp/orders/:id/events` takes. */
export type BuyEvent = { event: string; code: string | null; payload?: Record<string, unknown> | undefined };

const FIELD_MAX = 64;
/** The only payload fields passed on: what was bought and how it was paid, never anything the person typed. */
const PAYLOAD_KEYS = ["amount", "tokenSymbol", "paymentMethod", "settlementExpected", "orderId", "transactionHash", "canRetry"] as const;

const asText = (value: unknown): string | null => (typeof value === "string" && value.length > 0 ? value.slice(0, FIELD_MAX) : null);

/**
 * Circle's kit gives `{ event, code, payload }`; Coinbase's pay page gives `{ eventName, data: { errorCode, errorMessage } }`.
 * Anything else (a malformed or foreign message) is dropped.
 */
export function readBuyEvent(raw: unknown): BuyEvent | undefined {
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return undefined;
    }
  }
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const event = asText(record.event) ?? asText(record.eventName);
  if (!event) return undefined;
  const data = record.data && typeof record.data === "object" ? (record.data as Record<string, unknown>) : {};
  const code = asText(record.code) ?? asText(data.errorCode);
  const source = record.payload && typeof record.payload === "object" ? (record.payload as Record<string, unknown>) : {};
  const payload = Object.fromEntries(PAYLOAD_KEYS.flatMap((key) => (key in source && (typeof source[key] === "string" || typeof source[key] === "boolean" || typeof source[key] === "number") ? [[key, source[key]]] : [])));
  return { event, code, ...(Object.keys(payload).length > 0 ? { payload } : {}) };
}

type WebKitHost = { webkit?: { messageHandlers?: { ReactNativeWebView?: { postMessage: (message: string) => void } } }; ReactNativeWebView?: { postMessage: (message: string) => void } };

/**
 * Tells the app around this page (react-native-webview): on iOS with Apple Pay enabled there is no injected
 * `window.ReactNativeWebView`, only WebKit's own message handler; Android has the injected one. No host = a plain
 * browser tab, where this does nothing.
 */
export function postToHost(message: object): boolean {
  const host = globalThis as unknown as WebKitHost;
  const bridge = host.webkit?.messageHandlers?.ReactNativeWebView ?? host.ReactNativeWebView;
  if (!bridge) return false;
  bridge.postMessage(JSON.stringify(message));
  return true;
}

/** Whether a reason ends a purchase that still has money in play (nothing was paid in any of the codes we know). */
export const KNOWN_REASONS = new Set(["SESSION_TIMEOUT", "CANCELED_BY_CUSTOMER", "NO_PAYMENT_OPTIONS", "CUSTOMER_PENDING_REVIEW", "CUSTOMER_REJECTED", "PAYMENT_PROVIDER_ERROR", "SANDBOX_NO_FUNDS", "SESSION_MINT_FAILED"]);

/** Reasons a fresh session can fix: the person may try again with the same order's numbers. */
export const RETRYABLE_REASONS = new Set(["SESSION_TIMEOUT", "CANCELED_BY_CUSTOMER", "PAYMENT_PROVIDER_ERROR", "PAGE_NOT_LOADED", "INVALID_SESSION_TOKEN"]);

export const OPEN_STATUSES: ReadonlySet<string> = new Set(["created", "opened", "submitted"]);

export type RailStep = { id: OnrampStage; state: "done" | "active" | "pending" | "failed" };

/** The rail's steps for an order: Paying → Buying → On Arc, with Bridging in between for a delivery on Base. */
export function railSteps(order: Pick<OnrampOrderView, "engine" | "status" | "stage">): RailStep[] {
  const ids: OnrampStage[] = order.engine === "coinbase" ? ["paying", "buying", "bridging", "arrived"] : ["paying", "buying", "arrived"];
  const failed = order.status === "not_completed" || order.status === "expired";
  const stage: OnrampStage = order.stage ?? "paying";
  // `on_base` (delivered, the leg not started) reads as the bridging step.
  const at = ids.indexOf(stage === "on_base" ? "bridging" : stage);
  return ids.map((id, index) => ({
    id,
    state: failed && index === Math.max(at, 0) ? "failed" : index < at || stage === "arrived" ? "done" : index === at ? "active" : "pending",
  }));
}

const POLL_MS = 4_000;

type OrderApi = { get: (id: string) => Promise<{ order: OnrampOrderView }> };

export type OrderWatch = {
  order: OnrampOrderView | undefined;
  /** The first read has not answered yet. */
  loading: boolean;
  /** The last read failed (the order, if any, is the last one seen: show it stale). */
  failed: boolean;
  reload: () => void;
  /** Takes an order the api just returned (an event's answer) so the screen moves without waiting for the poll. */
  accept: (order: OnrampOrderView) => void;
};

/** Reads the order, then again every few seconds while it is open. A missed read keeps the last order and says so. */
export function useOrderWatch(orderId: string, api: OrderApi): OrderWatch {
  const [order, setOrder] = React.useState<OnrampOrderView>();
  const [loading, setLoading] = React.useState(true);
  const [failed, setFailed] = React.useState(false);
  const [tick, setTick] = React.useState(0);
  const open = !order || OPEN_STATUSES.has(order.status) || order.stage === "bridging";

  React.useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const read = async () => {
      try {
        const answer = await api.get(orderId);
        if (!live) return;
        setOrder(answer.order);
        setFailed(false);
      } catch {
        if (live) setFailed(true);
      } finally {
        if (live) setLoading(false);
      }
      if (live && open) timer = setTimeout(() => void read(), POLL_MS);
    };
    void read();
    return () => {
      live = false;
      if (timer) clearTimeout(timer);
    };
  }, [api, orderId, open, tick]);

  return { order, loading, failed, reload: () => setTick((value) => value + 1), accept: setOrder };
}
