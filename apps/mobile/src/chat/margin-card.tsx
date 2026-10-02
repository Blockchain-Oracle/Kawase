// Kawase Margin in the conversation: the perp ticket card (propose_perp_order, close_position) is the same ticket as
// the Long/Short screen, following the order live, so a reopened thread shows what really happened; the markets card
// (get_markets) lists each market's sides and caps with a tap into the ticket; the positions card (get_positions)
// lists the open positions, each opening its page. On testnet the markets card says mainnet only and offers it.
import { useRouter } from "expo-router";
import * as React from "react";
import { Pressable, View } from "react-native";

import type { MarginMarketsOutput, MarginPositionsOutput, ProposeMarginOutput } from "@kawase/api-client";
import { ListGroup } from "@kawase/ui-native/components/list-row";
import { Mark } from "@kawase/ui-native/components/mark";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { useT } from "@/i18n";
import { marketEntity, useMarginFormat } from "@/margin/copy";
import { MarginTicket } from "@/margin/margin-ticket";
import { PositionRow } from "@/margin/position-row";
import { useMarginOrder } from "@/margin/use-margin";

import { AgentCard } from "./card";

const MARK = 32;

const eyebrowFor = (t: (key: string) => string, network: "mainnet" | "testnet") =>
  `${t("margin.title")} · ${network === "mainnet" ? t("network.realMoney") : t("network.arcTestnet")}`;

export function MarginOrderCard({ output }: { output: ProposeMarginOutput }) {
  const { t } = useT();
  const controller = useMarginOrder(output.intent);
  const intent = controller.intent ?? output.intent;
  return (
    <AgentCard eyebrow={eyebrowFor(t, intent.network)}>
      <MarginTicket controller={controller} compact />
    </AgentCard>
  );
}

export function MarginMarketsCard({ output }: { output: MarginMarketsOutput }) {
  const { t } = useT();
  const router = useRouter();
  const format = useMarginFormat();
  if (!output.available) {
    return (
      <AgentCard eyebrow={eyebrowFor(t, output.network)}>
        <Text className={cn("text-foreground text-base", TEXT_START)}>{t("margin.mainnetOnly")}</Text>
        <Button variant="secondary" onPress={() => router.push("/margin")}>
          <Text>{t("margin.switchToMainnet")}</Text>
        </Button>
      </AgentCard>
    );
  }
  return (
    <AgentCard eyebrow={eyebrowFor(t, output.network)}>
      <ListGroup>
        {output.markets.map((market) => (
          <View key={market.market} className="flex-row items-center gap-3 px-3 py-2">
            <Mark entity={marketEntity(market.asset)} size={MARK} />
            <View className="min-w-0 flex-1">
              <Text className={cn("text-foreground text-sm font-semibold", TEXT_START)}>{market.market}</Text>
              <Text className={cn("text-muted-foreground text-xs", TEXT_START)}>{format.price(market.price)}</Text>
            </View>
            {(["short", "long"] as const).map((side) => (
              <Pressable
                key={side}
                accessibilityRole="button"
                disabled={!market[side].available}
                onPress={() => router.push(`/margin?market=${encodeURIComponent(market.market)}&side=${side}`)}
                className={cn("items-center rounded-xl px-2 py-1", market[side].available ? (side === "long" ? "bg-success/15" : "bg-destructive/15") : "bg-muted")}
              >
                <Text className={cn("text-xs font-semibold", market[side].available ? (side === "long" ? "text-success" : "text-destructive") : "text-muted-foreground")}>{t(`margin.${side}`)}</Text>
                <Text className="text-muted-foreground text-[10px]">
                  {market[side].available ? format.leverage(market[side].maxLeverage) : t(`margin.unavailable_${market[side].reason ?? "not_borrowable"}`)}
                </Text>
              </Pressable>
            ))}
          </View>
        ))}
      </ListGroup>
    </AgentCard>
  );
}

export function MarginPositionsCard({ output }: { output: MarginPositionsOutput }) {
  const { t } = useT();
  return (
    <AgentCard eyebrow={`${t("margin.yourPositions")} · ${output.network === "mainnet" ? t("network.realMoney") : t("network.arcTestnet")}`}>
      {output.positions.length === 0 ? (
        <Text className={cn("text-muted-foreground text-base", TEXT_START)}>{t("margin.noPositions")}</Text>
      ) : (
        <ListGroup>
          {output.positions.map((position) => (
            <PositionRow key={position.id} position={position} />
          ))}
        </ListGroup>
      )}
    </AgentCard>
  );
}
