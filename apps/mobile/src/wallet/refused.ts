// The phone refused to sign: what it was asked to sign is not what its card shows (security review M6). Said plainly
// once; the flow then ends as a failure, with nothing signed.
import { toast } from "sonner-native";

import { SigningRefused } from "@kawase/wallet";

export function sayIfRefused(error: unknown, t: (key: string) => string): boolean {
  if (!(error instanceof SigningRefused)) return false;
  toast(t("approval.refused"));
  return true;
}
