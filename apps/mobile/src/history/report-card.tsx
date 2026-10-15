// The weekly report card (cards/automate-safety.md "Records: weekly report card"): what came in and went out per
// currency, then the week's moves in one line each — swaps, bridges, earn, what the agent spent on services,
// automations that ran or skipped. Shown on Activity and in chat.
import { StyleSheet, Text, View } from "react-native";

import type { ReportView } from "@kawase/api-client";
import { formatTokenAmount } from "@kawase/money";

import { Panel, SectionLabel, SPACE, TYPE, useTheme } from "@/components/kit";

import { useLocale } from "@/i18n/locale-provider";
import { useT } from "@/i18n";
import { usePrice } from "@/marketplace/use-agent-wallet";

const STABLE_DECIMALS = 6;

export function ReportCard({ report, compact }: { report: ReportView; compact?: boolean }) {
  const { t } = useT();
  const { color } = useTheme();
  const { locale } = useLocale();
  const price = usePrice();
  const sums = (bucket: Record<string, string>) =>
    Object.entries(bucket)
      .map(([asset, baseUnits]) => formatTokenAmount(BigInt(baseUnits), STABLE_DECIMALS, asset, locale))
      .join(" · ") || "—";
  const lines = [
    report.counts.swaps > 0 ? t("report.swaps", { count: String(report.counts.swaps) }) : null,
    report.counts.bridges > 0 ? t("report.bridges", { count: String(report.counts.bridges) }) : null,
    report.counts.earn > 0 ? t("report.earn", { count: String(report.counts.earn) }) : null,
    report.services.purchases > 0 ? t("report.services", { amount: price(report.services.spent), count: String(report.services.purchases) }) : null,
    report.automations.ran + report.automations.skipped > 0 ? t("report.automations", { ran: String(report.automations.ran), skipped: String(report.automations.skipped) }) : null,
  ].filter((line): line is string => Boolean(line));
  const body = (
    <>
      <View style={styles.columns}>
        <View style={styles.column}>
          <Text style={[TYPE.meta, { color: color.text2 }]}>{t("report.in", { count: String(report.counts.received) })}</Text>
          <Text style={[TYPE.rowAmount, { color: color.up }]} numberOfLines={2}>
            {sums(report.received)}
          </Text>
        </View>
        <View style={styles.column}>
          <Text style={[TYPE.meta, { color: color.text2 }]}>{t("report.out", { count: String(report.counts.sent) })}</Text>
          <Text style={[TYPE.rowAmount, { color: color.ink }]} numberOfLines={2}>
            {sums(report.sent)}
          </Text>
        </View>
      </View>
      {lines.length > 0 ? <Text style={[TYPE.rowDetail, { color: color.text2 }]}>{lines.join(" · ")}</Text> : null}
      {!report.complete ? <Text style={[TYPE.meta, { color: color.text3 }]}>{t("report.partial")}</Text> : null}
    </>
  );
  // In chat the card around it is the message's; on Activity it is a panel like every other group on the page.
  if (compact) return <View style={styles.stack}>{body}</View>;
  return (
    <Panel style={[styles.stack, styles.panel]}>
      <SectionLabel>{t("report.title")}</SectionLabel>
      {body}
    </Panel>
  );
}

const styles = StyleSheet.create({
  stack: { gap: SPACE.md },
  panel: { padding: SPACE.lg },
  columns: { flexDirection: "row", gap: SPACE.lg },
  column: { flex: 1, gap: SPACE.xxs },
});
