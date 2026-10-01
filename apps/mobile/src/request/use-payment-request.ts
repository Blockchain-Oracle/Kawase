// A payment request kept fresh while it can still change: an open request is read again every few seconds until it
// is paid, cancelled or expired, so the share card and the chat card flip to "Paid" on their own. State lives in the
// component (no module-level store for the React Compiler to memoize), and a request is never moved backwards from
// a final status by a slow, older answer.
import * as React from "react";

import type { PaymentRequest, PaymentRequestStatus } from "@kawase/api-client";

import { api } from "@/session/api";

const POLL_MS = 4_000;
const FINAL: ReadonlySet<PaymentRequestStatus> = new Set(["paid", "canceled", "expired"]);

export const isFinalRequest = (request: Pick<PaymentRequest, "status">) => FINAL.has(request.status);

export function usePaymentRequest(initial: PaymentRequest | undefined) {
  const [request, setRequest] = React.useState<PaymentRequest | undefined>(initial);
  const id = request?.id;
  const open = request ? !isFinalRequest(request) : false;

  const refresh = React.useCallback(async () => {
    if (!id) return;
    try {
      const { request: fresh } = await api.requests.get(id);
      setRequest((current) => (current && isFinalRequest(current) && !isFinalRequest(fresh) ? current : fresh));
    } catch {
      // A missed read changes nothing on screen; the next one tries again.
    }
  }, [id]);

  React.useEffect(() => {
    if (initial) setRequest(initial);
  }, [initial]);

  React.useEffect(() => {
    if (!open) return undefined;
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [open, refresh]);

  return { request, setRequest, refresh };
}
