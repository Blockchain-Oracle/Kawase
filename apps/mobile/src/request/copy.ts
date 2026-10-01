// Words for a payment request: who asks (the @handle, else the short address), each status, and dates in the
// person's language. Amounts reuse the send flow's formatting.
import type { PaymentRequestStatus } from "@kawase/api-client";

import { useLocale } from "@/i18n/locale-provider";
import { useT } from "@/i18n";
import { shortAddress } from "@/send/copy";

export const requesterName = (requester: { handle: string | null; address: string }) =>
  requester.handle ? `@${requester.handle}` : shortAddress(requester.address);

/** An open request past its time reads as expired even before the api says so. */
export function effectiveStatus(request: { status: PaymentRequestStatus; expiresAt: string }): PaymentRequestStatus {
  return request.status === "open" && new Date(request.expiresAt).getTime() < Date.now() ? "expired" : request.status;
}

export function useRequestStatusLabel() {
  const { t } = useT();
  return (status: PaymentRequestStatus) =>
    ({
      open: t("request.statusOpen"),
      paid: t("request.statusPaid"),
      canceled: t("request.statusCanceled"),
      expired: t("request.statusExpired"),
    })[status];
}

export function useRequestDates() {
  const { locale } = useLocale();
  return {
    day: (iso: string) => new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }).format(new Date(iso)),
    moment: (iso: string) =>
      new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso)),
  };
}
