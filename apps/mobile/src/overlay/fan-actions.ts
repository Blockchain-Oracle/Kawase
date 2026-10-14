// The + fan's actions, in rising order from the plus: Add money nearest it, then Send, Receive, Swap and Bridge. The
// desktop rail lists the same five under "Move money". Each runs through the account gate (`useAccountGate`).
import { ArrowDownToLine, ArrowLeftRight, type LucideIcon, QrCode, Send, Waypoints } from "lucide-react-native";

import { useT } from "@/i18n";
import type { DeferredVerb } from "@/onboarding/deferred-action";

export type FanAction = { verb: DeferredVerb; label: string; icon: LucideIcon };

export function useFanActions(): FanAction[] {
  const { t } = useT();
  return [
    { verb: "fund", label: t("shell.fan.addMoney"), icon: ArrowDownToLine },
    { verb: "send", label: t("shell.fan.send"), icon: Send },
    { verb: "receive", label: t("shell.fan.receive"), icon: QrCode },
    { verb: "swap", label: t("shell.fan.swap"), icon: ArrowLeftRight },
    { verb: "bridge", label: t("shell.fan.bridge"), icon: Waypoints },
  ];
}
