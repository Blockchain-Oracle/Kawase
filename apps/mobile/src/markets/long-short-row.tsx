// Long or short on the Markets tab's front (plan §D Markets: "perps markets … search"): a row of cards for every
// market Kawase Margin lists on Arc — the mark, the live price and how far each side goes ("Long 3.4× · Short
// 2.4×", or why not) — each opening the Long/Short ticket; and the same markets in search ("btc", "long eth").
// Guests and testnet see them too (R13); a side that is mainnet-only says so on the ticket.
import { useRouter } from "expo-router";
import * as React from "react";
import { Pressable, ScrollView, View } from "react-native";

import type { MarginMarketView } from "@kawase/api-client";
import { Amount } from "@kawase/ui-native/components/amount";
import { Eyebrow } from "@kawase/ui-native/components/eyebrow";
import { ListGroup, ListRow } from "@kawase/ui-native/components/list-row";
import { Mark } from "@kawase/ui-native/components/mark";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn } from "@kawase/ui-native/lib/utils";

import { useT } from "@/i18n";
import { marketEntity, useMarginFormat } from "@/margin/copy";
import { useMarginMarkets } from "@/margin/use-margin";

const CARD_WIDTH = 156;
const MARK = 32;
const ROW_MARK = 36;
/** Words that only say "a trade" and are not part of a market's name. */
const TRADE_WORDS = /\b(long|short|perps?|leverage|margin)\b/;
const TRADE_WORDS_ALL = new RegExp(TRADE_WORDS.source, "g");

function useSideText() {
  const { t } = useT();
  const format = useMarginFormat();
  return (market: MarginMarketView) =>
    [
      market.long.available ? `${t("margin.long")} ${format.leverage(market.long.maxLeverage)}` : null,
      market.short.available ? `${t("margin.short")} ${format.leverage(market.short.maxLeverage)}` : null,
    ]
      .filter(Boolean)
      .join(" · ") || t(`margin.unavailable_${market.long.reason ?? "not_borrowable"}`);
}

/** The cards on the Markets front; hidden when the venue lists nothing here. "See all" opens the Long/Short segment. */
export function LongShortRow({ onSeeAll }: { onSeeAll: () => void }) {
  const { t } = useT();
  const router = useRouter();
  const format = useMarginFormat();
  const sides = useSideText();
  const { view } = useMarginMarkets();
  const markets = view?.markets ?? [];
  if (markets.length === 0) return null;
  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between">
        <Eyebrow className="px-1">{t("markets.longShort")}</Eyebrow>
        <Button variant="ghost" size="sm" onPress={onSeeAll}>
          <Text className="text-muted-foreground">{t("activity.seeAll")}</Text>
        </Button>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-3">
        {markets.map((market) => (
          <Pressable
            key={market.market}
            accessibilityRole="button"
            accessibilityLabel={[market.market, format.price(market.price), sides(market)].join(", ")}
            onPress={() => router.push({ pathname: "/margin", params: { market: market.market } })}
            className="bg-card border-border active:bg-muted gap-3 rounded-2xl border p-4"
            style={{ width: CARD_WIDTH }}
          >
            <Mark entity={marketEntity(market.asset)} size={MARK} />
            <View className="gap-0.5">
              <Text numberOfLines={1} className="text-foreground text-base font-semibold">
                {market.market}
              </Text>
              <Amount className="text-foreground text-sm">{format.price(market.price)}</Amount>
              <Text
                numberOfLines={1}
                className={cn(
                  "text-xs",
                  market.long.available || market.short.available
                    ? "text-muted-foreground"
                    : "text-muted-foreground/70",
                )}
              >
                {sides(market)}
              </Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

/** Long/Short markets a search names ("btc", "cirBTC", "long eth"), shown above the token results. */
export function LongShortMatches({ query }: { query: string }) {
  const { t } = useT();
  const router = useRouter();
  const format = useMarginFormat();
  const sides = useSideText();
  const { view } = useMarginMarkets();
  const wanted = query.toLowerCase().replace(TRADE_WORDS_ALL, "").trim();
  const asked = TRADE_WORDS.test(query.toLowerCase());
  const matches = (view?.markets ?? []).filter((market) => {
    if (!wanted) return asked;
    const names = [market.market, market.asset].map((name) => name.toLowerCase());
    return names.some((name) => name.includes(wanted) || name.replace(/^cir/, "").startsWith(wanted));
  });
  if (matches.length === 0) return null;
  return (
    <ListGroup label={t("markets.longShort")}>
      {matches.map((market) => (
        <ListRow
          key={market.market}
          leading={<Mark entity={marketEntity(market.asset)} size={ROW_MARK} />}
          title={market.market}
          subtitle={sides(market)}
          trailing={<Amount className="text-foreground text-base">{format.price(market.price)}</Amount>}
          chevron
          onPress={() => router.push({ pathname: "/margin", params: { market: market.market } })}
        />
      ))}
    </ListGroup>
  );
}
