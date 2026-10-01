// The authority receipt's words, decoded from the grant receipt the api returns (which it decoded from the signed
// caveat bytes). Only what the caveats enforce is claimed: the amount per period on one token, the end date, and
// that nothing else is allowed; terms the decoder did not understand turn the receipt into a warning.
import type { GrantReceipt, NetworkId } from "@kawase/api-client";
import { amount, formatAmount } from "@kawase/money";

const SECONDS_PER_DAY = 86_400;
const MS_PER_SECOND = 1_000;
const USDC_UNIT = 1_000_000n;
const ZERO = 0n;

type Translate = (key: string, options?: Record<string, unknown>) => string;

export type AuthorityText = {
  labels: { can: string; never: string; worst: string };
  can: string[];
  never: string[];
  worst: string;
  meta: string;
  warning?: string;
};

export function authorityText(receipt: GrantReceipt, network: NetworkId, t: Translate, locale: string): AuthorityText {
  const baseUnits = BigInt(receipt.amountPerPeriod ?? "0");
  // Whole amounts read as "5,000 USDC", not "5,000.00 USDC".
  const perPeriod = formatAmount(amount("USDC", baseUnits), locale, baseUnits % USDC_UNIT === ZERO ? { fractionDigits: 0 } : {});
  // "Never another token" is only said when the caveats pin every call to the one token and allow no native value.
  const token = receipt.token?.toLowerCase();
  const oneToken = Boolean(token) && receipt.targets.length > 0 && receipt.targets.every((target) => target.toLowerCase() === token) && BigInt(receipt.maxNativeValue ?? "0") === ZERO;
  const daily = (receipt.periodSeconds ?? SECONDS_PER_DAY) === SECONDS_PER_DAY;
  const until = receipt.expiresAt
    ? new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(new Date(receipt.expiresAt * MS_PER_SECOND))
    : undefined;
  const networkName = network === "testnet" ? t("network.arcTestnet") : t("network.arc");
  return {
    labels: { can: t("authority.can"), never: t("authority.never"), worst: t("authority.worst") },
    can: [daily ? t("authority.canSendDaily", { amount: perPeriod }) : t("authority.canSendPeriod", { amount: perPeriod }), t("authority.canNoPrompt")],
    never: [t("authority.neverMore", { amount: perPeriod }), ...(oneToken ? [t("authority.neverOtherTokens")] : []), t("authority.neverLimits")],
    worst: t("authority.worstCase", { amount: perPeriod }),
    meta: until ? t("authority.meta", { network: networkName, date: until }) : networkName,
    warning: receipt.unknownCaveats.length > 0 ? t("authority.unknownTerms") : undefined,
  };
}
