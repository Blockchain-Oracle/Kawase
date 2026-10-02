// Now → After (cards/automate-safety.md: "loosening shows Now → After, then Face ID and a new on-chain grant"). The same
// panel sits in the Wallet & limits sheets and in the chat card, so a raise reads the same wherever it is asked.
import { ArrowRight, ShieldCheck } from "lucide-react-native";
import { View } from "react-native";

import type { LimitValue, SafetyChange } from "@kawase/api-client";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { useT } from "@/i18n";

import { useSafetyFormat, type Pending } from "./use-safety";

const USDC_DECIMALS = 6;

/** What the change is about, in a few words ("USDC allowance", "Per payment"). */
export function useChangeTitle() {
  const { t } = useT();
  return (change: SafetyChange | null, value?: LimitValue) => {
    if (!change) return t("safety.cardLimits");
    switch (change.kind) {
      case "allowance":
      case "allowance_off":
        return t("safety.changeAllowance", { symbol: value?.symbol ?? "" });
      case "boost":
        return t("safety.changeBoost", { symbol: value?.symbol ?? "" });
      case "per_payment":
      case "per_payment_temp":
        return t("safety.changePerPayment");
      case "cooldown":
        return t("safety.changeCooldown");
      case "allowlist_only":
        return t("safety.changeAllowlistOnly");
      case "allowlist":
        return t("safety.changeAllowlist", { name: value?.name ?? "" });
      case "risk_mode":
        return t("safety.changeRisk");
      case "practice":
        return t("safety.changePractice");
      case "pause":
        return t("safety.changePause");
    }
  };
}

/** One side of Now → After, in words. */
export function useLimitValueText() {
  const { t } = useT();
  const format = useSafetyFormat();
  return (value: LimitValue) => {
    if (value.mode) return t(value.mode === "careful" ? "safety.riskGuard" : value.mode === "autonomous" ? "safety.riskAutonomous" : "safety.riskBalanced");
    if (value.amount !== undefined) {
      const amount = format.money(value.amount, value.decimals ?? USDC_DECIMALS, value.symbol ?? "USDC");
      if (value.seconds !== undefined) return value.seconds > 0 ? t("safety.cooldownRow", { amount, hours: format.hours(value.seconds) }) : t("safety.cooldownOff");
      return value.until ? t("safety.perPaymentTemp", { amount, time: format.time(value.until) }) : amount;
    }
    if (value.on !== undefined) return t(value.on ? "safety.on" : "safety.off");
    return "";
  };
}

export function ApprovalPanel({ pending, busy, onApprove, className }: { pending: Pending; busy: boolean; onApprove: () => void; className?: string }) {
  const { t } = useT();
  const text = useLimitValueText();
  return (
    <View className={cn("gap-4", className)}>
      <View className="bg-muted flex-row items-center gap-3 rounded-2xl px-4 py-3">
        <View className="flex-1 gap-0.5">
          <Text className={cn("text-muted-foreground text-xs font-semibold uppercase", TEXT_START)}>{t("safety.now")}</Text>
          <Text className={cn("text-foreground text-base font-semibold", TEXT_START)}>{text(pending.before)}</Text>
        </View>
        <Icon as={ArrowRight} className="text-muted-foreground size-5 rtl:-scale-x-100" />
        <View className="flex-1 gap-0.5">
          <Text className={cn("text-muted-foreground text-xs font-semibold uppercase", TEXT_START)}>{t("safety.after")}</Text>
          <Text className={cn("text-foreground text-base font-semibold", TEXT_START)}>{text(pending.after)}</Text>
        </View>
      </View>
      <View className="flex-row items-start gap-2">
        <Icon as={ShieldCheck} className="text-muted-foreground mt-0.5 size-4" />
        <Text className={cn("text-muted-foreground flex-1 text-sm leading-5", TEXT_START)}>
          {pending.approval.kind === "grant" ? t("safety.approveGrantNote") : t("safety.approveMessageNote")}
        </Text>
      </View>
      <Button disabled={busy} onPress={onApprove}>
        <Text>{t("safety.approve")}</Text>
      </Button>
    </View>
  );
}
