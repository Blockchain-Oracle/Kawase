// The weekly report card (cards/automate-safety.md "Records: weekly report card"): what came in and went out per
// currency, then the week's moves in one line each — swaps, bridges, earn, what the agent spent on services,
// automations that ran or skipped, invoices paid. Shown on Activity and in chat.
import { View } from "react-native";

import type { ReportView } from "@kawase/api-client";
import { amount as toAmount, formatAmount, type AssetId } from "@kawase/money";
import { Amount } from "@kawase/ui-native/components/amount";
import { Eyebrow } from "@kawase/ui-native/components/eyebrow";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { useLocale } from "@/i18n/locale-provider";
import { useT } from "@/i18n";
import { usePrice } from "@/marketplace/use-agent-wallet";

export function ReportCard({ report, compact }: { report: ReportView; compact?: boolean }) {
  const { t } = useT();
  const { locale } = useLocale();
  const price = usePrice();
  const sums = (bucket: Record<string, string>) =>
    Object.entries(bucket)
      .map(([asset, baseUnits]) => formatAmount(toAmount(asset as AssetId, BigInt(baseUnits)), locale))
      .join(" · ") || "—";
  const lines = [
    report.counts.swaps > 0 ? t("report.swaps", { count: String(report.counts.swaps) }) : null,
    report.counts.bridges > 0 ? t("report.bridges", { count: String(report.counts.bridges) }) : null,
    report.counts.earn > 0 ? t("report.earn", { count: String(report.counts.earn) }) : null,
    report.services.purchases > 0 ? t("report.services", { amount: price(report.services.spent), count: String(report.services.purchases) }) : null,
    report.automations.ran + report.automations.skipped > 0 ? t("report.automations", { ran: String(report.automations.ran), skipped: String(report.automations.skipped) }) : null,
    report.invoices.paid > 0 ? t("report.invoices", { count: String(report.invoices.paid), amount: sums(report.invoices.amount) }) : null,
  ].filter((line): line is string => Boolean(line));
  return (
    <View className={cn("bg-card border-border gap-3 rounded-3xl border", compact ? "p-0 border-0 bg-transparent" : "p-4")}>
      {!compact ? <Eyebrow>{t("report.title")}</Eyebrow> : null}
      <View className="flex-row gap-3">
        <View className="flex-1 gap-0.5">
          <Text className={cn("text-muted-foreground text-xs", TEXT_START)}>{t("report.in", { count: String(report.counts.received) })}</Text>
          <Amount className="text-success text-base font-semibold">{sums(report.received)}</Amount>
        </View>
        <View className="flex-1 gap-0.5">
          <Text className={cn("text-muted-foreground text-xs", TEXT_START)}>{t("report.out", { count: String(report.counts.sent) })}</Text>
          <Amount className="text-foreground text-base font-semibold">{sums(report.sent)}</Amount>
        </View>
      </View>
      {lines.length > 0 ? <Text className={cn("text-muted-foreground text-sm leading-5", TEXT_START)}>{lines.join(" · ")}</Text> : null}
      {!report.complete ? <Text className={cn("text-muted-foreground text-xs", TEXT_START)}>{t("report.partial")}</Text> : null}
    </View>
  );
}
