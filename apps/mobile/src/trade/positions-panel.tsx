// The terminal's positions (visual spec: 21st.dev ssychui "Trade Journal Table", id 27124 — the open row lit, the
// outcome as a signed figure): the order on the ticket first, with a ring draining while its price is fresh, then
// each open long / short with live P&L in rolling digits (sign and colour together, never colour alone) and how far
// liquidation is. A tap opens the position. Desktop gets table columns; the phone gets two-line rows. Loading is a
// skeleton of the rows, held a moment; empty says why and offers the ticket; a failed read keeps the last rows, marked
// stale, with Retry.
import { useRouter } from "expo-router";
import * as React from "react";
import { Pressable, View } from "react-native";
import { formatUnits } from "viem";

import type { MarginIntent, MarginPositionView } from "@kawase/api-client";
import { Mark } from "@kawase/ui-native/components/mark";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Skeleton } from "@kawase/ui-native/components/ui/skeleton";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";
import { WEB_PRESSABLE } from "@kawase/ui-native/lib/wide";

import { useT } from "@/i18n";
import { marketEntity, useMarginFormat } from "@/margin/copy";
import { isMarginMoving, isMarginOpen } from "@/margin/use-margin";

import { DrainRing } from "./drain-ring";
import { RollingNumber } from "./rolling-number";
import { useHeld } from "./use-held";
import { QUOTE_FRESH_MS } from "./use-trade";
import { WaitingLine } from "./waiting-line";

const MARK = 32;
const PNL_SIZE = 16;
const SKELETON_ROWS = 3;
const SKELETON_HEIGHT = 52;
const RING = 22;
const USDC_DECIMALS = 6;

type Props = {
  positions: MarginPositionView[] | undefined;
  failed: boolean;
  onRetry: () => void;
  /** The order on the ticket, shown first while it is priced or on its way. */
  order?: MarginIntent | undefined;
  onOrder?: () => void;
  /** Open the ticket (the empty state's action). */
  onTrade: () => void;
  signedIn: boolean;
  wide: boolean;
};

function Column({ children, end, className }: { children: React.ReactNode; end?: boolean; className?: string }) {
  return <View className={cn("min-w-0 flex-1", end ? "items-end" : "items-start", className)}>{children}</View>;
}

function PositionLine({ position, wide }: { position: MarginPositionView; wide: boolean }) {
  const { t } = useT();
  const router = useRouter();
  const format = useMarginFormat();
  const up = position.pnlUsd >= 0;
  const pnl = (
    <View className="items-end">
      <RollingNumber text={format.signed(position.pnlUsd)} value={position.pnlUsd} size={PNL_SIZE} className={cn("font-semibold", up ? "text-success" : "text-destructive")} />
      <Text className={cn("font-mono text-xs tabular-nums", up ? "text-success" : "text-destructive")}>{`${up ? "+" : "−"}${format.percent(Math.abs(position.pnlPercent))}`}</Text>
    </View>
  );
  const identity = (
    <View className="min-w-0 flex-1 flex-row items-center gap-3">
      <Mark entity={marketEntity(position.asset)} size={MARK} />
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className={cn("text-foreground text-sm font-semibold", TEXT_START)}>
          {position.market}
        </Text>
        <Text numberOfLines={1} className={cn("text-xs font-semibold", position.side === "long" ? "text-success" : "text-destructive", TEXT_START)}>
          {`${t(`margin.${position.side}`)} ${format.leverage(position.leverage)}`}
        </Text>
      </View>
    </View>
  );
  const liquidation = position.liquidationPrice
    ? `${format.price(position.liquidationPrice)}${position.liquidationDistance !== null ? ` · ${format.percent(position.liquidationDistance, 0)}` : ""}`
    : t("desktop.noLiquidation");
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("desktop.openPosition", { market: position.market, side: t(`margin.${position.side}`) })}
      onPress={() => router.push(`/position/${position.id}`)}
      className={cn("active:bg-muted flex-row items-center gap-3 px-4 py-3", WEB_PRESSABLE)}
    >
      {identity}
      {wide ? (
        <>
          <Column end>
            <Text className="text-foreground font-mono text-sm tabular-nums">{format.usd(position.notionalUsd)}</Text>
          </Column>
          <Column end>
            <Text className="text-foreground font-mono text-sm tabular-nums">{format.price(position.entryPrice)}</Text>
          </Column>
          <Column end>
            <Text className="text-foreground font-mono text-sm tabular-nums">{format.price(position.markPrice)}</Text>
          </Column>
          <Column end>
            <Text className="text-destructive font-mono text-sm tabular-nums">{liquidation}</Text>
          </Column>
        </>
      ) : null}
      <Column end className={wide ? undefined : "flex-none"}>
        {position.protection === "closing" ? <Text className="text-muted-foreground text-xs">{t("protect.closing")}</Text> : null}
        {pnl}
        {!wide ? <Text className="text-muted-foreground font-mono text-[11px] tabular-nums">{`${t("desktop.liqTag")} ${liquidation}`}</Text> : null}
      </Column>
    </Pressable>
  );
}

function OrderLine({ order, onPress }: { order: MarginIntent; onPress?: (() => void) | undefined }) {
  const { t } = useT();
  const format = useMarginFormat();
  const draft = order.draft;
  if (!draft) return null;
  const quotedAt = Date.parse(draft.quotedAt);
  const moving = isMarginMoving(order);
  return (
    <Pressable accessibilityRole="button" onPress={onPress} disabled={!onPress} className={cn("bg-muted/50 flex-row items-center gap-3 px-4 py-3", onPress ? WEB_PRESSABLE : undefined)}>
      <View className="items-center justify-center" style={{ width: MARK, height: MARK }}>
        {moving ? <Mark entity={marketEntity(draft.asset)} size={MARK} /> : <DrainRing from={quotedAt} to={quotedAt + QUOTE_FRESH_MS} size={RING} accessibilityLabel={t("desktop.quoteFresh")} />}
      </View>
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className={cn("text-foreground text-sm font-semibold", TEXT_START)}>
          {t("desktop.orderRow", { side: t(`margin.${draft.side}`), market: draft.market })}
        </Text>
        {moving ? (
          <WaitingLine verb={t("margin.opening")} />
        ) : (
          <Text numberOfLines={1} className={cn("text-muted-foreground font-mono text-xs tabular-nums", TEXT_START)}>
            {t("desktop.orderDetail", { margin: format.usd(Number(formatUnits(BigInt(draft.margin), USDC_DECIMALS))), exposure: format.usd(draft.notionalUsd) })}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

export function PositionsPanel({ positions, failed, onRetry, order, onOrder, onTrade, signedIn, wide }: Props) {
  const { t } = useT();
  const loading = useHeld(signedIn && positions === undefined && !failed);
  const showOrder = order && order.draft && order.request.action === "open" && (isMarginOpen(order) || isMarginMoving(order));
  const list = positions ?? [];

  let body: React.ReactNode;
  if (loading) {
    body = (
      <View className="gap-2 px-4 py-3">
        {Array.from({ length: SKELETON_ROWS }, (_, index) => (
          <Skeleton key={index} className="rounded-xl" style={{ height: SKELETON_HEIGHT }} />
        ))}
      </View>
    );
  } else if (positions === undefined && failed) {
    body = (
      <View className="items-start gap-3 px-4 py-4">
        <Text className={cn("text-foreground text-sm", TEXT_START)}>{t("desktop.positionsFailed")}</Text>
        <Button variant="secondary" size="sm" onPress={onRetry}>
          <Text>{t("common.retry")}</Text>
        </Button>
      </View>
    );
  } else if (list.length === 0 && !showOrder) {
    body = (
      <View className="items-start gap-3 px-4 py-4">
        <View className="gap-1">
          <Text className={cn("text-foreground text-sm font-semibold", TEXT_START)}>{t("margin.noPositions")}</Text>
          <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{t("desktop.noPositionsWhy")}</Text>
        </View>
        <Button variant="secondary" size="sm" onPress={onTrade}>
          <Text>{t("desktop.openFirst")}</Text>
        </Button>
      </View>
    );
  } else {
    body = (
      <View>
        {wide && list.length > 0 ? (
          <View className="border-border flex-row gap-3 border-b px-4 py-2">
            <Column className="flex-1">
              <Text className="text-muted-foreground text-xs">{t("margin.markets")}</Text>
            </Column>
            {(["size", "entry", "mark"] as const).map((key) => (
              <Column key={key} end>
                <Text className="text-muted-foreground text-xs">{t(`margin.${key}`)}</Text>
              </Column>
            ))}
            <Column end>
              <Text className="text-muted-foreground text-xs">{t("margin.liquidation")}</Text>
            </Column>
            <Column end>
              <Text className="text-muted-foreground text-xs">{t("margin.pnl")}</Text>
            </Column>
          </View>
        ) : null}
        {showOrder ? <OrderLine order={order!} onPress={onOrder} /> : null}
        {list.map((position) => (
          <PositionLine key={position.id} position={position} wide={wide} />
        ))}
      </View>
    );
  }

  return (
    <View className="bg-card border-border overflow-hidden rounded-3xl border">
      <View className="flex-row items-center justify-between px-4 pb-1 pt-3">
        <Text accessibilityRole="header" className="text-foreground text-base font-semibold">
          {t("margin.yourPositions")}
        </Text>
        {failed && positions !== undefined ? (
          <Pressable accessibilityRole="button" onPress={onRetry} className="flex-row items-center gap-1">
            <Text className="text-muted-foreground text-xs">{t("desktop.stale")}</Text>
            <Text className="text-foreground text-xs font-semibold underline">{t("common.retry")}</Text>
          </Pressable>
        ) : null}
      </View>
      {body}
    </View>
  );
}
