// Scan to pay: a code (scanned, pasted) → what it means on the active network (the api reads it, so the scanner and
// the chat agree) → the flow it opens. Send opens filled in (the recipient check runs there, as always); a Kawase
// request or invoice opens its pay page; anything else stays on the scanner with the reason and its fix.
import { useRouter } from "expo-router";
import * as React from "react";

import type { PayCodeView } from "@kawase/api-client";

import { tapFeedback } from "@/feedback/feedback";
import { api } from "@/session/api";

/** Where the scanner was opened from: the fan's scan page and Send are replaced by the flow; chat keeps its thread. */
export type ScanOrigin = "fan" | "send" | "chat";

export function sendParams(view: Extract<PayCodeView, { status: "send" }>) {
  return {
    to: view.to,
    ...(view.amount ? { amount: view.amount } : {}),
    ...(view.asset ? { asset: view.asset } : {}),
    ...(view.memo ? { memo: view.memo } : {}),
    ...(view.memoId ? { memoId: view.memoId } : {}),
  };
}

export function usePayCode() {
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<PayCodeView>();
  const [failed, setFailed] = React.useState(false);
  const last = React.useRef<string | undefined>(undefined);

  /** Reads one code; the same code twice in a row is read once (a camera sees it many times a second). */
  const read = React.useCallback(async (code: string): Promise<PayCodeView | undefined> => {
    const text = code.trim();
    if (!text || text === last.current) return undefined;
    last.current = text;
    setBusy(true);
    setFailed(false);
    try {
      const view = await api.payCodes.resolve(text);
      tapFeedback("selection");
      setResult(view);
      return view;
    } catch {
      setFailed(true);
      last.current = undefined;
      return undefined;
    } finally {
      setBusy(false);
    }
  }, []);

  const reset = React.useCallback(() => {
    last.current = undefined;
    setResult(undefined);
    setFailed(false);
  }, []);

  return { read, reset, busy, result, failed };
}

/** Opens the flow a resolved code asks for; returns false when it stays on the scanner (unsupported). */
export function useOpenPayCode(origin: ScanOrigin) {
  const router = useRouter();
  return React.useCallback(
    (view: PayCodeView): boolean => {
      if (view.status === "send") {
        const params = sendParams(view);
        if (origin === "chat") router.push({ pathname: "/send", params });
        else router.replace({ pathname: "/send", params });
        return true;
      }
      if (view.status === "request") {
        if (origin === "fan") router.replace({ pathname: "/r/[token]", params: { token: view.token } });
        else router.push({ pathname: "/r/[token]", params: { token: view.token } });
        return true;
      }
      return false;
    },
    [origin, router],
  );
}
