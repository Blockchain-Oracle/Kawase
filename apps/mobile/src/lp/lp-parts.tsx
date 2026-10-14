// Aero LP's building blocks, shared by the LP screen, Earn and the chat card: a pair's two marks, a pool row (Merkl's
// reward rate, the pool's size), and the positions block — each position's value, its range and whether the price is
// in it (earning) or not, with Withdraw, and Merkl's rewards with Claim — plus the "Advanced" note on what can go wrong.
import * as React from "react";
import { Pressable, View } from "react-native";

import type { LpPoolView, LpPositionsView, LpPositionView, LpRangeView } from "@kawase/api-client";
import { Amount } from "@kawase/ui-native/components/amount";
import { ListGroup } from "@kawase/ui-native/components/list-row";
import { Mark } from "@kawase/ui-native/components/mark";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { useLocale } from "@/i18n/locale-provider";
import { useT } from "@/i18n";
import { marketEntity, useMarginFormat } from "@/margin/copy";

const MARK = 28;
const OVERLAP = 10;
const PRICE_DIGITS = 5;
const COMPACT_DIGITS = 1;
const RATE_DIGITS = 1;
const PAIR = 2;
const NONE = 0n;

export function useLpFormat() {
  const { locale } = useLocale();
  const format = useMarginFormat();
  const price = (value: number) => new Intl.NumberFormat(locale, { style: "currency", currency: "USD", maximumSignificantDigits: PRICE_DIGITS }).format(value);
  return {
    ...format,
    price,
    range: (range: LpRangeView) => `${price(range.lower)} – ${price(range.upper)}`,
    compact: (value: number | null) => (value === null ? "—" : new Intl.NumberFormat(locale, { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: COMPACT_DIGITS }).format(value)),
    rate: (value: number | null) => (value === null ? "—" : format.percent(value, RATE_DIGITS)),
  };
}

/** The pair's two marks, the second tucked under the first. */
export function PairMark({ pool, size = MARK }: { pool: Pick<LpPoolView, "token0" | "token1">; size?: number }) {
  return (
    <View className="flex-row" style={{ width: size * PAIR - OVERLAP }}>
      <Mark entity={marketEntity(pool.token0.address)} size={size} />
      <View style={{ marginStart: -OVERLAP }}>
        <Mark entity={marketEntity(pool.token1.address)} size={size} />
      </View>
    </View>
  );
}

export function PoolRow({ pool, onPress, selected }: { pool: LpPoolView; onPress?: () => void; selected?: boolean }) {
  const { t } = useT();
  const format = useLpFormat();
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: Boolean(selected) }} disabled={!onPress} onPress={onPress} className={cn("flex-row items-center gap-3 px-4 py-3", selected ? "bg-muted" : "active:bg-muted")}>
      <PairMark pool={pool} />
      <View className="min-w-0 flex-1 gap-0.5">
        <Text numberOfLines={1} className={cn("text-foreground text-base font-semibold", TEXT_START)}>
          {`${pool.token0.symbol} · ${pool.token1.symbol}`}
        </Text>
        <Text numberOfLines={1} className={cn("text-muted-foreground text-xs", TEXT_START)}>
          {t("lp.poolLine", { size: format.compact(pool.tvlUsd), range: t(pool.stable ? "lp.rangeTight" : "lp.rangeWide") })}
        </Text>
      </View>
      <View className="items-end">
        <Text className="font-display text-foreground text-lg font-bold" style={{ fontVariant: ["tabular-nums"] }}>
          {format.rate(pool.rewardApr)}
        </Text>
        <Text className="text-muted-foreground text-[10px]">{t("lp.rewardsApr")}</Text>
      </View>
    </Pressable>
  );
}

/** What can go wrong, said plainly (earn-borrow.md: "Advanced: impermanent loss and range risk"). */
export function LpRiskNote() {
  const { t } = useT();
  return (
    <View className="bg-destructive/10 gap-1 rounded-2xl px-4 py-3">
      <Text className={cn("text-destructive text-xs font-semibold uppercase", TEXT_START)}>{t("lp.advanced")}</Text>
      <Text className={cn("text-foreground text-sm leading-5", TEXT_START)}>{t("lp.riskBody")}</Text>
    </View>
  );
}

function PositionRow({ position, onWithdraw, busy }: { position: LpPositionView; onWithdraw?: (() => void) | undefined; busy: boolean }) {
  const { t } = useT();
  const format = useLpFormat();
  const { pool } = position;
  const held = `${format.amount(position.amount0, pool.token0.decimals, pool.token0.symbol)} · ${format.amount(position.amount1, pool.token1.decimals, pool.token1.symbol)}`;
  return (
    <View className="gap-2 px-4 py-3">
      <View className="flex-row items-center gap-3">
        <PairMark pool={pool} />
        <View className="min-w-0 flex-1 gap-0.5">
          <Text numberOfLines={1} className={cn("text-foreground text-base font-semibold", TEXT_START)}>
            {`${pool.token0.symbol} · ${pool.token1.symbol}`}
          </Text>
          <Text numberOfLines={1} className={cn("text-muted-foreground text-xs", TEXT_START)}>
            {held}
          </Text>
        </View>
        <Amount className="text-foreground text-base font-semibold">{format.usd(position.valueUsd)}</Amount>
      </View>
      <View className="flex-row flex-wrap items-center gap-2">
        <View className={cn("rounded-full px-2 py-0.5", position.inRange ? "bg-success/15" : "bg-destructive/15")}>
          <Text className={cn("text-[10px] font-semibold", position.inRange ? "text-success" : "text-destructive")}>{t(position.inRange ? "lp.inRange" : "lp.outOfRange")}</Text>
        </View>
        <Text className={cn("text-muted-foreground text-xs", TEXT_START)}>{t("lp.rangeLine", { base: pool.base, range: format.range(position.range), price: format.price(position.range.price) })}</Text>
      </View>
      {!position.inRange ? <Text className={cn("text-muted-foreground text-xs", TEXT_START)}>{t("lp.outOfRangeBody", { base: pool.base })}</Text> : null}
      {onWithdraw ? (
        <Button size="sm" variant="secondary" disabled={busy} onPress={onWithdraw} className="self-start">
          <Text>{t("lp.withdraw")}</Text>
        </Button>
      ) : null}
    </View>
  );
}

/** The wallet's positions and Merkl's rewards; hidden when there are neither. */
export function LpPositions({ view, busy, onWithdraw, onClaim }: { view: LpPositionsView | undefined; busy: boolean; onWithdraw?: (positionId: string) => void; onClaim?: () => void }) {
  const { t } = useT();
  const format = useLpFormat();
  if (!view) return null;
  const claimable = view.rewards.filter((reward) => BigInt(reward.claimable) > NONE);
  const pending = view.rewards.filter((reward) => BigInt(reward.pending) > NONE);
  if (view.positions.length === 0 && claimable.length === 0 && pending.length === 0) return null;
  return (
    <View className="gap-3">
      {view.positions.length > 0 ? (
        <ListGroup label={t("lp.positions")}>
          {view.positions.map((position) => (
            <PositionRow key={position.id} position={position} busy={busy} onWithdraw={onWithdraw ? () => onWithdraw(position.id) : undefined} />
          ))}
        </ListGroup>
      ) : null}
      {claimable.length > 0 || pending.length > 0 ? (
        <View className="border-border gap-2 rounded-2xl border px-4 py-3">
          <Text className={cn("text-foreground text-sm font-semibold", TEXT_START)}>{t("lp.rewards")}</Text>
          {claimable.map((reward) => (
            <Text key={`c${reward.token.address}`} className={cn("text-foreground text-sm", TEXT_START)}>
              {t("lp.claimable", { amount: format.amount(reward.claimable, reward.token.decimals, reward.token.symbol) })}
            </Text>
          ))}
          {pending.map((reward) => (
            <Text key={`p${reward.token.address}`} className={cn("text-muted-foreground text-xs", TEXT_START)}>
              {t("lp.pending", { amount: format.amount(reward.pending, reward.token.decimals, reward.token.symbol) })}
            </Text>
          ))}
          {claimable.length > 0 && onClaim ? (
            <Button size="sm" disabled={busy} onPress={onClaim} className="self-start">
              <Text>{t("lp.claim")}</Text>
            </Button>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
