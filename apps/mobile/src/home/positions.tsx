// Home's "Positions" (surfaces.md Home §7; plan §D "Positions: earn, borrow (health), perps (P&L)"): long and short
// positions with their side, leverage and profit or loss (Kawase Margin, each opening its page); a loan with the
// account's health, its zone in words and colour (opens Borrow); and every earning position with its yearly rate
// (opens Earn). Hidden until one exists. The same positions count in the balance hero's total and its breakdown.
import { useRouter } from "expo-router";
import * as React from "react";
import { View } from "react-native";

import type { PortfolioView, PositionSummary } from "@kawase/api-client";
import { LEND } from "@kawase/config";
import { Amount } from "@kawase/ui-native/components/amount";
import { ListGroup, ListRow } from "@kawase/ui-native/components/list-row";
import { Mark } from "@kawase/ui-native/components/mark";
import { TokenMark } from "@kawase/ui-native/components/token-mark";
import { Text } from "@kawase/ui-native/components/ui/text";

import { protocolEntity } from "@/earn/vault-row";
import { useT } from "@/i18n";
import { useLocale } from "@/i18n/locale-provider";
import { zoneOf } from "@/lend/health-gauge";
import { PositionRow } from "@/margin/position-row";
import { useMarginPositions } from "@/margin/use-margin";
import { money } from "@/portfolio/format";

const MARK = 36;
const APY_DIGITS = 2;
const HEALTH_DIGITS = 2;
const BPS = 10_000;

/** The words for a loan's health: "Health 2.14 · Safe". */
export function useHealthLine() {
  const { t } = useT();
  return (health: number | null | undefined) => {
    const zone = zoneOf(health ?? null, LEND.minBorrowHealthBps / BPS, LEND.warnHealthBps / BPS);
    const value = health === null || health === undefined ? "∞" : health.toFixed(HEALTH_DIGITS);
    return { text: `${t("lend.health")} ${value} · ${t(`lend.zone_${zone}`)}`, zone };
  };
}

export function Positions({ portfolio }: { portfolio: PortfolioView | undefined }) {
  const { t } = useT();
  const { locale } = useLocale();
  const router = useRouter();
  const healthLine = useHealthLine();
  const { positions: margin } = useMarginPositions();
  const fx = portfolio?.fx ?? { currency: "USD", perUsd: 1 };
  const marginRows = (margin ?? []).filter((position) => position.status === "open");
  // Perps show through their own rows (live P&L, liquidation price); the portfolio's copy of them only counts them.
  const others = (portfolio?.positions ?? []).filter((position) => position.kind !== "perp");
  if (marginRows.length === 0 && others.length === 0) return null;

  const row = (position: PositionSummary) => {
    const leading = position.token ? (
      <TokenMark token={position.token} size={MARK} />
    ) : (
      <Mark entity={protocolEntity(position.provider)} size={MARK} />
    );
    if (position.kind === "borrow") {
      const health = healthLine(position.health);
      return (
        <ListRow
          key={position.id}
          title={t("assets.borrowed", { assets: position.title })}
          subtitle={health.text}
          leading={leading}
          trailing={
            <View className="items-end">
              <Amount className="text-foreground text-base">{money(position.valueUsd, fx, locale)}</Amount>
              {position.debtUsd ? (
                <Text className="text-muted-foreground text-xs">
                  {t("assets.owed", { amount: money(position.debtUsd, fx, locale) })}
                </Text>
              ) : null}
            </View>
          }
          chevron
          onPress={() => router.push("/borrow")}
        />
      );
    }
    return (
      <ListRow
        key={position.id}
        title={position.title}
        {...(position.apyPct ? { subtitle: t("assets.apy", { apy: position.apyPct.toFixed(APY_DIGITS) }) } : {})}
        leading={leading}
        trailing={<Amount className="text-foreground text-base">{money(position.valueUsd, fx, locale)}</Amount>}
        chevron
        onPress={() => router.push(position.kind === "earn" && position.provider === "aave" ? "/borrow" : "/earn")}
      />
    );
  };

  return (
    <ListGroup label={t("assets.positions")}>
      {marginRows.map((position) => (
        <PositionRow key={position.id} position={position} />
      ))}
      {others.map(row)}
    </ListGroup>
  );
}
