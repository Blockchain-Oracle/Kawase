// Home's one hero figure (D37 decision 1): the total of every asset, chain and position, rolling to each new value
// (the Skia odometer on the phone, NumberFlow on the web), today's change as a word-and-sign chip and a sparkline of
// the week beside it (Senryo: rolling digits and a sparkline beside every balance). Tapping it opens the portfolio
// sheet (your assets, hidden ones, other chains with Bring to Arc, positions). Loading is the hero's own skeleton,
// never a fake $0; a read that failed keeps the last total and says how old it is; hidden balances stay masked.
import * as React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { PortfolioView } from "@kawase/api-client";

import { ChangeChip, RollingFigure, Skeleton, Sparkline, SIZE, SPACE, StaleTick, TYPE, useTheme } from "@/components/kit";
import { useT } from "@/i18n";
import { useLocale } from "@/i18n/locale-provider";
import { money } from "@/portfolio/format";
import { ShareCardChip } from "@/share-card/share-chip";

const FIGURE_HEIGHT = TYPE.displayBalance.lineHeight ?? SIZE.avatarLg;
const CENTS = 100;
const PERCENT = 100;
const DAY_MS = 86_400_000;
const WEEK_DAYS = 7;
const WEEK_MS = WEEK_DAYS * DAY_MS;
const MIN_POINTS = 2;

export function BalanceHero({
  portfolio,
  loading,
  failedAt,
  onOpen,
  centered = false,
}: {
  portfolio: PortfolioView | undefined;
  loading: boolean;
  /** When the last good read was, if the latest one failed. */
  failedAt?: number | undefined;
  onOpen: () => void;
  /** The desktop Home's fixed header: the figure in the middle of the agent's column (Abu, 10-15). */
  centered?: boolean;
}) {
  const { t } = useT();
  const { locale } = useLocale();
  const { color } = useTheme();
  const fx = portfolio?.fx ?? { currency: "USD", perUsd: 1 };
  const total = portfolio?.totalUsd ?? 0;
  const text = money(total, fx, locale);
  const week = React.useMemo(() => {
    const since = Date.now() - WEEK_MS;
    const points = (portfolio?.history ?? []).filter((point) => new Date(point.t).getTime() >= since).map((point) => point.usd);
    // A week of nothing is no line: an empty wallet's flat zero drew as a grey box under "$0.00".
    return points.length >= MIN_POINTS && points.some((usd) => usd > 0) ? points : null;
  }, [portfolio?.history]);
  const pct = portfolio?.change24hPct;

  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${t("feed.home.balance")} ${text}`} accessibilityHint={t("feed.home.balanceHint")} onPress={onOpen} style={({ pressed }) => [styles.hero, centered ? styles.centered : null, pressed ? styles.pressed : null]}>
      <Text style={[TYPE.caption, { color: color.text3 }]}>{t("feed.home.balance")}</Text>
      {portfolio ? (
        <RollingFigure text={text} value={BigInt(Math.round(total * CENTS))} color={total === 0 ? color.text3 : color.ink} height={FIGURE_HEIGHT} align={centered ? "center" : "left"} sensitive />
      ) : loading ? (
        <Skeleton width="60%" height={FIGURE_HEIGHT} />
      ) : (
        <Text style={[TYPE.body, { color: color.text3 }]}>{t("feed.home.balanceUnknown")}</Text>
      )}
      <View style={[styles.row, centered ? styles.rowCentered : null]}>
        {pct !== null && pct !== undefined ? <ChangeChip change={pct / PERCENT} /> : null}
        {week ? <Sparkline points={week} /> : null}
        {failedAt ? <StaleTick asOf={failedAt} reason="refresh-failed" compact /> : null}
        {/* Once the wallet has a story to tell (a line this week), it can be shared as a card. */}
        {week ? <ShareCardChip target={{ period: "7d" }} /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hero: { gap: SPACE.xs, paddingVertical: SPACE.sm },
  centered: { alignItems: "center" },
  rowCentered: { justifyContent: "center" },
  pressed: { opacity: 0.8 },
  row: { flexDirection: "row", alignItems: "center", gap: SPACE.sm, minHeight: SIZE.sparkline },
});
