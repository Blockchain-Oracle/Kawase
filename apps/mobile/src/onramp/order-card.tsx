// One Buy order as its own card (`/i/<orderId>`, A5-3): what was bought and how it stands — on its way (read again
// until the watcher settles it), arrived with the transfer that brought it, or not completed with the provider's
// reason — and the one next step: the "then" token's swap, the transaction, or try again with the same numbers.
import { useRouter } from "expo-router";
import * as React from "react";
import { Linking, View } from "react-native";

import type { OnrampOrderView } from "@kawase/api-client";
import { Mark } from "@kawase/ui-native/components/mark";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { AgentCard } from "@/chat/card";
import { useT } from "@/i18n";
import { useLocale } from "@/i18n/locale-provider";
import { useBuy } from "@/onramp/buy-provider";
import { useMoney } from "@/send/copy";
import { api } from "@/session/api";
import { useThemeColors } from "@/theme/use-theme-colors";

const MARK = 28;
const POLL_MS = 5_000;
const OPEN = new Set(["created", "opened", "submitted"]);
const KNOWN_REASONS = new Set(["SESSION_TIMEOUT", "CANCELED_BY_CUSTOMER", "NO_PAYMENT_OPTIONS", "CUSTOMER_PENDING_REVIEW", "CUSTOMER_REJECTED", "PAYMENT_PROVIDER_ERROR"]);
const USDC_UNIT = 1_000_000;

export function OnrampOrderCard({ order: initial }: { order: OnrampOrderView }) {
  const { t } = useT();
  const { locale } = useLocale();
  const router = useRouter();
  const colors = useThemeColors();
  const money = useMoney();
  const buy = useBuy();
  const [order, setOrder] = React.useState(initial);
  const open = OPEN.has(order.status);

  // On its way: read again until the delivery is seen on chain (or the provider says it did not complete).
  React.useEffect(() => {
    if (!open) return undefined;
    const timer = setInterval(() => {
      void api.onramp
        .get(order.id)
        .then(({ order: next }) => setOrder(next))
        .catch(() => undefined);
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [open, order.id]);

  const fiat =
    order.fiatAmount && order.fiatCurrency
      ? new Intl.NumberFormat(locale, { style: "currency", currency: order.fiatCurrency, maximumFractionDigits: 2 }).format(Number(order.fiatAmount))
      : null;
  const eyebrow = `${t("buy.title")} · ${order.network === "mainnet" ? t("network.realMoney") : t("network.arcTestnet")}`;
  const title = order.status === "settled" ? t("buy.funded") : open ? t("buy.waiting") : t("buy.notCompleted");
  const body =
    order.status === "settled"
      ? t("buy.fundedBody", { amount: money(order.asset, order.received) })
      : open
        ? t("buy.stillWatching")
        : order.status === "expired"
          ? t("buy.expired")
          : t(order.reason && KNOWN_REASONS.has(order.reason) ? `buy.reason_${order.reason}` : "buy.reason_other");

  return (
    <AgentCard eyebrow={eyebrow}>
      <View className="flex-row items-center gap-3">
        <Mark entity="provider:apple" size={MARK} variant="mono" tint={colors.foreground} disc />
        <View className="min-w-0 flex-1">
          <Text className={cn("font-display text-foreground text-xl font-bold", TEXT_START)}>{title}</Text>
          {fiat ? <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{t("buy.cardReady", { amount: fiat, asset: order.asset })}</Text> : null}
        </View>
      </View>
      <Text className={cn("text-foreground text-base leading-6", TEXT_START)}>{body}</Text>
      {order.status === "settled" && order.thenToken && order.received ? (
        <Button onPress={() => router.push({ pathname: "/swap", params: { from: order.asset, amount: (Number(order.received) / USDC_UNIT).toString() } })}>
          <Text>{t("buy.thenAction", { token: order.thenToken })}</Text>
        </Button>
      ) : null}
      {order.status === "settled" && order.tx ? (
        <Button variant="secondary" onPress={() => void Linking.openURL(order.tx!.explorerUrl)}>
          <Text>{t("send.viewExplorer")}</Text>
        </Button>
      ) : null}
      {order.status === "not_completed" || order.status === "expired" ? (
        <Button onPress={() => buy.open({ asset: order.asset, amount: order.fiatAmount, currency: order.fiatCurrency, then: order.thenToken })}>
          <Text>{t("buy.tryAgain")}</Text>
        </Button>
      ) : null}
    </AgentCard>
  );
}
