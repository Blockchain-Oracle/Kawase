// What a swap will do, exactly, before the person says yes (Senryo grammar: one hero figure, at most four facts at
// rest, the rest behind one disclosure). The hero is what comes back, rolling as the price refreshes; under it the
// least that may arrive (the chain enforces it) and the price impact as a chip (amber past the warning line, the
// error tone when the rule refuses it, always with its words). Then every venue asked for this version on the one
// RouteList (21st 29368 / 28337 / 6955): real logos, what each delivers, how far below the best, the venue fee behind
// the chevron; a tap picks it (SwapRequest.venue, honoured by the api end to end). The quote's age drains in a ring and
// a fresh price is fetched when it runs out. Rate, market rate and fees open from one "Details" line. Shared by the
// swap screen and the chat card (`compact`: the picked venue in one line instead of the list).
import * as React from "react";
import { StyleSheet, Text, View } from "react-native";

import type { SwapIntent } from "@kawase/api-client";
import { SWAP_QUOTE_TTL_S } from "@kawase/config";
import { amount as toAmount, formatAmount, formatTokenAmount } from "@kawase/money";
import { Mark } from "@kawase/ui-native/components/mark";

import { DisclosureRow, KeyValue, Panel, RollingFigure, SIZE, SPACE, TYPE, useTheme } from "@/components/kit";
import { useLocale } from "@/i18n/locale-provider";
import { useT } from "@/i18n";
import { swapRace, venueName } from "@/routes/from-draft";
import { QuoteAge } from "@/routes/quote-age";
import { RouteList } from "@/routes/route-list";

import { useRateLines, useSwapPolicyText } from "./copy";
import { sideToken, SwapTokenMark, useSwapMoney } from "./swap-tokens";

const ZERO = 0n;
/** Fees on Arc are fractions of a cent, so they get four places instead of two. */
const FEE_DIGITS = 4;
const PERCENT_BPS = 100;
const IMPACT_DIGITS = 2;
const HERO_DIGITS = 4;
const MARK = SIZE.markToken;

export type ImpactTone = "calm" | "warn" | "blocked";

/** The impact's tone from the policy: refused (PRICE_IMPACT_HIGH), braked or wide (amber), else calm. */
export function impactTone(intent: SwapIntent): ImpactTone {
  const codes = new Set(intent.results.map((entry) => entry.code));
  if (codes.has("PRICE_IMPACT_HIGH") || intent.blocking?.code === "PRICE_IMPACT_HIGH") return "blocked";
  if (codes.has("RATE_BELOW_REFERENCE") || codes.has("BRAKE_PRICE_IMPACT")) return "warn";
  return "calm";
}

function ImpactChip({ intent }: { intent: SwapIntent }) {
  const { t } = useT();
  const { color } = useTheme();
  const gap = intent.draft?.rateGapBps;
  if (gap === null || gap === undefined) return null;
  const tone = impactTone(intent);
  const plate = tone === "blocked" ? color.destructiveSurface : tone === "warn" ? color.warnSurface : color.raised2;
  const ink = tone === "blocked" ? color.destructive : tone === "warn" ? color.warn : color.text2;
  const value = `${(Math.max(0, gap) / PERCENT_BPS).toFixed(IMPACT_DIGITS)}%`;
  return (
    <View style={[styles.chip, { backgroundColor: plate }]} accessibilityRole={tone === "calm" ? "text" : "alert"}>
      <Text style={[TYPE.chipLabel, { color: ink }]}>{tone === "blocked" ? t("swap.impactBlocked", { value }) : t("swap.impact", { value })}</Text>
    </View>
  );
}

export function SwapReview({
  intent,
  compact,
  onRefresh,
  refreshing,
  onPick,
  hideRoutes = false,
  paused = false,
}: {
  intent: SwapIntent;
  compact?: boolean;
  /** A fresh price (the ring ran out, or a tap on the age). */
  onRefresh?: () => void;
  refreshing?: boolean;
  /** Pick a venue: a new version priced by it. Without it the list is read only. */
  onPick?: (venue: string) => void;
  /** The routes are drawn elsewhere (the desktop's right column). */
  hideRoutes?: boolean;
  /** Hold the price still (a slide or an approval in progress). */
  paused?: boolean;
}) {
  const { t } = useT();
  const { locale } = useLocale();
  const { color } = useTheme();
  const tokenMoney = useSwapMoney();
  const rateLines = useRateLines();
  const policyText = useSwapPolicyText();
  const race = React.useMemo(() => swapRace(intent), [intent]);
  const draft = intent.draft;
  if (!draft) return null;
  const out = sideToken(draft, "out", intent.network);
  const lines = rateLines(draft);
  const wide = intent.results.find((entry) => entry.code === "RATE_BELOW_REFERENCE" || entry.code === "TOKEN_UNVERIFIED");
  const fee = (baseUnits: string) => formatAmount(toAmount("USDC", BigInt(baseUnits)), locale, { fractionDigits: FEE_DIGITS });
  const routeFee = BigInt(draft.fees.route) > ZERO ? tokenMoney(draft, "in", draft.fees.route, intent.network) : null;
  const figure = formatTokenAmount(BigInt(draft.estimatedOut), out.decimals, "", locale, { fractionDigits: HERO_DIGITS, trimZeros: true }).trim();
  const heroHeight = (compact ? TYPE.numLg.lineHeight : TYPE.displayBalance.lineHeight) ?? SIZE.buttonHeight;
  const venue = draft.venue ?? race?.best ?? null;

  return (
    <View style={styles.wrap}>
      <View style={styles.hero}>
        <Text style={[TYPE.rowDetail, { color: color.text2 }]}>{t("swap.youGet")}</Text>
        <View style={styles.heroRow}>
          <SwapTokenMark draft={draft} side="out" network={intent.network} size={MARK} />
          <View style={styles.figure}>
            <RollingFigure text={figure} value={BigInt(draft.estimatedOut)} color={color.ink} height={heroHeight} align="left" accessibilityLabel={tokenMoney(draft, "out", draft.estimatedOut, intent.network)} />
          </View>
          <Text style={[TYPE.sectionTitle, { color: color.ink }]}>{out.symbol}</Text>
        </View>
        <View style={styles.subRow}>
          <Text style={[TYPE.rowDetail, styles.grow, { color: color.text2 }]}>
            {t("swap.forPaid", { paid: tokenMoney(draft, "in", draft.amountIn, intent.network), min: tokenMoney(draft, "out", draft.minOut, intent.network) })}
          </Text>
          <ImpactChip intent={intent} />
        </View>
      </View>

      {wide ? (
        <Panel style={[styles.note, { backgroundColor: color.warnSurface }]}>
          <Text style={[TYPE.rowDetail, { color: color.ink }]}>
            {policyText(wide, intent.network)}
            {intent.network === "testnet" ? ` ${t("swap.testnetPools")}` : ""}
          </Text>
        </Panel>
      ) : null}

      {compact || hideRoutes ? (
        venue ? (
          <View style={styles.via}>
            <Mark entity={`venue:${venue}`} size={SIZE.markInline} />
            <Text style={[TYPE.rowDetail, styles.grow, { color: color.text2 }]}>{t("swap.pricedBy", { venue: venueName(venue, draft.provider) })}</Text>
          </View>
        ) : null
      ) : race ? (
        <RouteList race={race} selected={venue} readOnly={!onPick} {...(onPick ? { onSelect: onPick } : {})} {...(onRefresh ? { onRetry: onRefresh } : {})} />
      ) : null}

      <View style={styles.footer}>
        {onRefresh ? <QuoteAge quotedAt={draft.quotedAt} ttlSeconds={SWAP_QUOTE_TTL_S} refreshing={Boolean(refreshing)} paused={paused} onExpire={onRefresh} /> : <View />}
      </View>

      <DisclosureRow title={t("swap.details")} value={lines.rate}>
        {lines.market ? <KeyValue label={t("swap.market")} value={lines.gap ? `${lines.market} · ${lines.gap}` : lines.market} /> : null}
        {routeFee ? <KeyValue label={t("swap.routeFee")} value={routeFee} /> : null}
        {draft.fees.network ? <KeyValue label={t("swap.networkFee")} value={t("swap.networkFeeValue", { amount: fee(draft.fees.network) })} /> : null}
        <KeyValue label={t("swap.network")} value={intent.network === "testnet" ? t("network.arcTestnet") : t("network.arc")} />
        <Text style={[TYPE.caption, { color: color.text3 }]}>{t("swap.together")}</Text>
      </DisclosureRow>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: SPACE.md },
  hero: { gap: SPACE.xs },
  heroRow: { flexDirection: "row", alignItems: "center", gap: SPACE.sm },
  figure: { flex: 1, minWidth: 0 },
  subRow: { flexDirection: "row", alignItems: "center", gap: SPACE.sm },
  grow: { flex: 1 },
  chip: { borderRadius: SIZE.chipHeight, paddingHorizontal: SPACE.sm, paddingVertical: SPACE.xxs },
  note: { padding: SPACE.md },
  via: { flexDirection: "row", alignItems: "center", gap: SPACE.sm },
  footer: { flexDirection: "row", justifyContent: "flex-end" },
});
