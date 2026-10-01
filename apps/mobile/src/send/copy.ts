// Words for a send, in the person's language: each policy reason as one sentence with its numbers formatted here
// (the api sends base units and ISO times), where a recipient's address came from (the trust chip), and money.
import * as React from "react";

import type { PolicyResultView, SendIntent, SendRecipientView } from "@kawase/api-client";
import { amount, formatAmount, type AssetId } from "@kawase/money";

import { useLocale } from "@/i18n/locale-provider";
import { useT } from "@/i18n";
import { biometricKind, type BiometricKind } from "@/wallet/biometric";

const ADDRESS_HEAD = 6;
const ADDRESS_TAIL = 4;

export const shortAddress = (address: string) => `${address.slice(0, ADDRESS_HEAD)}…${address.slice(-ADDRESS_TAIL)}`;

/** A name as the person said it, with a capital first letter ("carol" → "Carol"); handles and addresses stay as typed. */
export const nameFromWords = (words: string) =>
  /^(@|0x)/i.test(words) ? words : words.charAt(0).toLocaleUpperCase() + words.slice(1);

export function useMoney() {
  const { locale } = useLocale();
  return (asset: string | null | undefined, baseUnits: string | null | undefined) =>
    asset && baseUnits ? formatAmount(amount(asset as AssetId, BigInt(baseUnits)), locale) : "";
}

export function useWhen() {
  const { locale } = useLocale();
  return (iso: string) =>
    new Intl.DateTimeFormat(locale, { weekday: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

/** Who, in words: the contact's name, their @handle, or the short address. */
export function recipientName(recipient: SendRecipientView | null | undefined, fallback: string | null) {
  if (!recipient) return fallback ? nameFromWords(fallback) : "";
  if (recipient.name) return recipient.name;
  if (recipient.handle) return `@${recipient.handle}`;
  return shortAddress(recipient.address);
}

export function usePolicyText() {
  const { t } = useT();
  const money = useMoney();
  const when = useWhen();
  return (result: PolicyResultView, network: SendIntent["network"]) => {
    const p = result.params ?? {};
    const other = network === "testnet" ? t("network.arc") : t("network.arcTestnet");
    return t(`policy.${result.code}`, {
      ...p,
      query: p.query ? nameFromWords(p.query) : "",
      limit: money(p.asset, p.limit),
      used: money(p.asset, p.used),
      balance: money(p.asset, p.balance),
      available: money(p.asset, p.available),
      needed: money("USDC", p.needed),
      until: p.until ? when(p.until) : "",
      network: other,
      defaultValue: result.code,
    });
  };
}

/** The trust chip: how this address reached the book, or that it was paid before. */
export function useTrustLabel() {
  const { t } = useT();
  return (recipient: SendRecipientView) => {
    if (recipient.paidBefore) return t("send.trustPaidBefore");
    if (recipient.via === "address") return t("send.trustUnsaved");
    switch (recipient.source) {
      case "handle":
        return t("send.trustHandle");
      case "scanned":
        return t("send.trustScanned");
      case "pasted":
        return t("send.trustPasted");
      case "received":
        return t("send.trustReceived");
      case "agent":
        return t("send.trustAgent");
      case "typed":
        return t("send.trustTyped");
      default:
        return t("send.trustNew");
    }
  };
}

const APPROVE_KEYS: Record<BiometricKind, string> = {
  faceId: "send.sendFaceId",
  touchId: "send.sendTouchId",
  face: "send.sendFace",
  fingerprint: "send.sendFingerprint",
  passcode: "send.sendPasscode",
  emailCode: "send.sendEmailCode",
  none: "send.sendFaceId",
};

/** "Send with Face ID", "…with your fingerprint", "…with your passcode": the device's real check (review R03). */
export function useApproveLabel() {
  const { t } = useT();
  const [kind, setKind] = React.useState<BiometricKind>("faceId");
  React.useEffect(() => {
    void biometricKind().then(setKind);
  }, []);
  return t(APPROVE_KEYS[kind]);
}
