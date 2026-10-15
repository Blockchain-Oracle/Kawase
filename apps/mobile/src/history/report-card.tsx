// The weekly report card (cards/automate-safety.md "Records: weekly report card"): what came in and went out per
// currency, then the week's moves in one line each — swaps, bridges, earn, what the agent spent on services,
// automations that ran or skipped. Shown on Activity and in chat.
import { StyleSheet, Text, View } from "react-native";

import type { ReportView } from "@kawase/api-client";
import { formatTokenAmount } from "@kawase/money";

import { ChangeChip, Panel, SectionLabel, Sparkline, SIZE, SPACE, TYPE, useTheme } from "@/components/kit";

import { useLocale } from "@/i18n/locale-provider";
import { useT } from "@/i18n";
import { usePrice } from "@/marketplace/use-agent-wallet";
import { usePortfolio } from "@/portfolio/use-portfolio";

const STABLE_DECIMALS = 6;
const STABLE_UNIT = 1_000_000;
const WEEK_MS = 604_800_000;
/** Under a cent either way the week reads flat, in ink. */
const PNL_FLAT = 0.005;

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
  return <WeekCard report={report} lines={lines} />;
}

const styles = StyleSheet.create({
  stack: { gap: SPACE.md },
  panel: { padding: SPACE.lg },
  columns: { flexDirection: "row", gap: SPACE.lg },
  column: { flex: 1, gap: SPACE.xxs },
  start: { alignItems: "flex-start" },
  weekRow: { flexDirection: "row", alignItems: "flex-end", gap: SPACE.lg },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: SPACE.xs },
  chip: { flexDirection: "row", alignItems: "center", gap: SPACE.xs, height: SIZE.chipHeight - SPACE.xs, borderRadius: SIZE.chipHeight, paddingHorizontal: SPACE.md },
});

/**
 * Activity's week (Abu, 10-15: "use P&L, a percentage, not In and Out"): what the week made or lost — the balance's
 * change over seven days less the money that came in or went out — as the one figure with its percentage and the
 * week's sparkline; In, Out and the moves as small chips under it. Without a week of history it says what moved.
 */
function WeekCard({ report, lines }: { report: ReportView; lines: string[] }) {
  const { t } = useT();
  const { color } = useTheme();
  const { locale } = useLocale();
  const { portfolio } = usePortfolio();
  const usd = (value: number, signed = false) =>
    new Intl.NumberFormat(locale, { style: "currency", currency: "USD", maximumFractionDigits: 2, ...(signed ? { signDisplay: "exceptZero" as const } : {}) }).format(value);
  const priceOf = (asset: string) => (asset === "USDC" ? 1 : (portfolio?.assets.find((holding) => holding.token.symbol === asset)?.priceUsd ?? null));
  const flow = (bucket: Record<string, string>) =>
    Object.entries(bucket).reduce((sum, [asset, base]) => sum + Number(BigInt(base)) / STABLE_UNIT * (priceOf(asset) ?? 0), 0);
  const inUsd = flow(report.received);
  const outUsd = flow(report.sent);
  const since = Date.now() - WEEK_MS;
  const week = (portfolio?.history ?? []).filter((point) => new Date(point.t).getTime() >= since);
  const start = week[0]?.usd ?? null;
  const now = portfolio?.totalUsd ?? null;
  const pnl = start !== null && now !== null ? now - start - (inUsd - outUsd) : null;
  const base = start !== null ? start + Math.max(inUsd - outUsd, 0) : 0;
  const pct = pnl !== null && base > 0 ? pnl / base : null;
  const tone = pnl === null || Math.abs(pnl) < PNL_FLAT ? color.ink : pnl > 0 ? color.up : color.down;
  return (
    <Panel style={[styles.stack, styles.panel]}>
      <SectionLabel>{t("report.title")}</SectionLabel>
      <View style={styles.weekRow}>
        <View style={[styles.column, styles.start]}>
          <Text style={[TYPE.meta, { color: color.text2 }]}>{t("report.pnl")}</Text>
          <Text style={[TYPE.displayPrice, { color: tone }]} numberOfLines={1} adjustsFontSizeToFit>
            {pnl !== null ? usd(pnl, true) : "—"}
          </Text>
          <ChangeChip change={pct} />
        </View>
        {week.length > 1 ? <Sparkline points={week.map((point) => point.usd)} /> : null}
      </View>
      <View style={styles.chips}>
        <Chip label={t("report.in", { count: String(report.counts.received) })} value={usd(inUsd)} tone={color.up} />
        <Chip label={t("report.out", { count: String(report.counts.sent) })} value={usd(outUsd)} />
        {lines.map((line) => (
          <View key={line} style={[styles.chip, { backgroundColor: color.raised2 }]}>
            <Text style={[TYPE.chipLabel, { color: color.text2 }]}>{line}</Text>
          </View>
        ))}
      </View>
      {!report.complete ? <Text style={[TYPE.meta, { color: color.text3 }]}>{t("report.partial")}</Text> : null}
    </Panel>
  );
}

function Chip({ label, value, tone }: { label: string; value: string; tone?: string }) {
  const { color } = useTheme();
  return (
    <View style={[styles.chip, { backgroundColor: color.raised2 }]}>
      <Text style={[TYPE.chipLabel, { color: color.text2 }]}>{label}</Text>
      <Text style={[TYPE.chipLabel, { color: tone ?? color.ink }]}>{value}</Text>
    </View>
  );
}
