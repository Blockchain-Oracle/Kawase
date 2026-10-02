// The chip a token carries wherever it is listed (R1, the copycat rule): nothing for verified and listed tokens,
// "Unverified" or "Lookalike" as a warning, "Fake" for an impersonator, "Test" for test money.
import type { TFunction } from "i18next";

import type { TokenView } from "@kawase/api-client";

type Translate = TFunction;
export type TokenChip = { label: string; tone: "muted" | "warn" | "danger" };

export function tokenChip(token: TokenView, t: Translate): TokenChip | undefined {
  switch (token.status) {
    case "impersonator":
      return { label: t("assets.statusImpersonator"), tone: "danger" };
    case "lookalike":
      return { label: t("assets.statusLookalike"), tone: "warn" };
    case "unverified":
      return { label: t("assets.statusUnverified"), tone: "warn" };
    default:
      return token.isTest ? { label: t("assets.test"), tone: "muted" } : undefined;
  }
}
