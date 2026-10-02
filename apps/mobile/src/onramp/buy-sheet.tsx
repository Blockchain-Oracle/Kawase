// The Buy sheet: how much (presets or typed, in dollars or euros), the methods with their real marks, the network
// said plainly (real money on Arc, or Circle's sandbox on testnet), and one button that opens Circle's checkout.
// Then the states, each in words: opening → on its way (watching the chain) → "You're funded" with the koban (once,
// with the confirmed sound) and, for a token buy, "Buy {token} now" → or why it did not complete and Try again.
import { CreditCard } from "lucide-react-native";
import * as React from "react";
import { Pressable, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { OnrampOrderView, OnrampStartRequest } from "@kawase/api-client";
import { ONRAMP } from "@kawase/config";
import { Amount } from "@kawase/ui-native/components/amount";
import { Koban } from "@kawase/ui-native/components/art/koban";
import { Mark } from "@kawase/ui-native/components/mark";
import { Sheet } from "@kawase/ui-native/components/sheet";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { useLocale } from "@/i18n/locale-provider";
import { useT } from "@/i18n";
import { useMoney } from "@/send/copy";
import { useSession } from "@/session/session-provider";
import { useThemeColors } from "@/theme/use-theme-colors";

import type { BuyPhase } from "./buy-provider";

const PRESETS = ["20", "50", "100"] as const;
const METHOD_MARK = 24;
const KOBAN_WIDTH = 96;
const AMOUNT_MAX_LENGTH = 8;
const KNOWN_REASONS = new Set(["SESSION_TIMEOUT", "CANCELED_BY_CUSTOMER", "NO_PAYMENT_OPTIONS", "CUSTOMER_PENDING_REVIEW", "CUSTOMER_REJECTED", "PAYMENT_PROVIDER_ERROR"]);

export function BuySheet({
  open,
  onClose,
  prefill,
  phase,
  order,
  onStart,
  onThen,
}: {
  open: boolean;
  onClose: () => void;
  prefill: OnrampStartRequest;
  phase: BuyPhase;
  order: OnrampOrderView | undefined;
  onStart: (request: OnrampStartRequest) => void;
  onThen: () => void;
}) {
  const { t } = useT();
  const { locale } = useLocale();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const money = useMoney();
  const { user } = useSession();
  const network = user?.activeNetwork ?? "testnet";
  const asset = prefill.asset?.toUpperCase() === "EURC" ? "EURC" : "USDC";
  const currency = asset === "EURC" ? "EUR" : "USD";
  const [amount, setAmount] = React.useState(prefill.amount ?? ONRAMP.defaultAmount);
  React.useEffect(() => {
    if (open) setAmount(prefill.amount ?? ONRAMP.defaultAmount);
  }, [open, prefill.amount]);
  const fiat = (value: string) => new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 0 }).format(Number(value));
  const valid = /^\d+(\.\d{1,2})?$/.test(amount) && Number(amount) > 0;
  const reason = order?.reason && KNOWN_REASONS.has(order.reason) ? order.reason : "other";

  let body: React.ReactNode;
  if (phase === "settled" && order) {
    body = (
      <View className="items-center gap-3 py-2">
        <Koban width={KOBAN_WIDTH} id="buy-funded" metal="gold" />
        <Text className="font-display text-foreground text-2xl font-bold">{t("buy.funded")}</Text>
        <Text className="text-muted-foreground text-base">{t("buy.fundedBody", { amount: money(order.asset, order.received) })}</Text>
        {order.thenToken ? (
          <Button className="self-stretch" onPress={onThen}>
            <Text>{t("buy.thenAction", { token: order.thenToken })}</Text>
          </Button>
        ) : null}
        <Button variant={order.thenToken ? "ghost" : "default"} className="self-stretch" onPress={onClose}>
          <Text>{t("buy.done")}</Text>
        </Button>
      </View>
    );
  } else if (phase === "watching" || phase === "checkout" || phase === "starting") {
    body = (
      <View className="gap-3 py-2">
        <Text className={cn("font-display text-foreground text-xl font-bold", TEXT_START)}>{phase === "watching" ? t("buy.waiting") : t("buy.opening")}</Text>
        {phase === "watching" ? <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{t("buy.stillWatching")}</Text> : null}
        <Button variant="secondary" onPress={onClose}>
          <Text>{t("buy.done")}</Text>
        </Button>
      </View>
    );
  } else if (phase === "not_completed" || phase === "failed") {
    body = (
      <View className="gap-3 py-2">
        <Text className={cn("font-display text-foreground text-xl font-bold", TEXT_START)}>{t("buy.notCompleted")}</Text>
        <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{phase === "failed" ? t("buy.failedStart") : order?.status === "expired" ? t("buy.expired") : t(`buy.reason_${reason}`)}</Text>
        <Button onPress={() => onStart({ ...prefill, amount, asset })}>
          <Text>{t("buy.tryAgain")}</Text>
        </Button>
      </View>
    );
  } else {
    body = (
      <View className="gap-4">
        <View className="gap-2">
          <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{t("buy.amount")}</Text>
          <View className="flex-row items-center gap-2">
            <TextInput
              accessibilityLabel={t("buy.amount")}
              value={amount}
              onChangeText={(text) => setAmount(text.replace(",", ".").replace(/[^\d.]/g, ""))}
              keyboardType="decimal-pad"
              maxLength={AMOUNT_MAX_LENGTH}
              className="font-display text-foreground flex-1 text-4xl font-bold"
              style={{ color: colors.foreground }}
            />
            <Text className="font-display text-muted-foreground text-xl font-semibold">{currency}</Text>
          </View>
          <View className="flex-row gap-2">
            {PRESETS.map((preset) => (
              <Pressable key={preset} accessibilityRole="button" onPress={() => setAmount(preset)} className={cn("bg-muted active:bg-secondary flex-1 items-center rounded-full py-2", amount === preset && "bg-secondary")}>
                <Amount className="text-foreground text-sm font-semibold">{fiat(preset)}</Amount>
              </Pressable>
            ))}
          </View>
        </View>
        <View className="bg-muted flex-row items-center gap-3 rounded-2xl px-4 py-3">
          <Mark entity="provider:apple" size={METHOD_MARK} variant="mono" tint={colors.foreground} />
          <Mark entity="provider:google" size={METHOD_MARK} />
          <Icon as={CreditCard} className="text-foreground size-5" />
          <Text className={cn("text-foreground flex-1 text-sm", TEXT_START)}>{t("buy.methods")}</Text>
        </View>
        <Text className={cn("text-muted-foreground text-xs", TEXT_START)}>
          {[network === "testnet" ? t("buy.sandbox") : t("buy.realMoney"), t("buy.delivers", { asset, network: network === "testnet" ? t("network.arcTestnet") : t("network.arc") }), prefill.then ? t("buy.thenNote", { token: prefill.then }) : null]
            .filter(Boolean)
            .join(" ")}
        </Text>
        <Button size="lg" disabled={!valid} onPress={() => onStart({ ...prefill, amount, asset, currency })}>
          <Text>{t("buy.continue", { amount: valid ? fiat(amount) : "" })}</Text>
        </Button>
        <View className="flex-row items-center justify-center gap-1">
          <Mark entity="provider:circle" size={16} />
          <Text className="text-muted-foreground text-xs">{t("buy.byCircle")}</Text>
        </View>
      </View>
    );
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t("buy.title")}
      colors={{ background: colors.card, handle: colors.muted, scrim: colors.scrim }}
      closeLabel={t("common.close")}
      bottomInset={insets.bottom}
      className="gap-3"
    >
      {body}
    </Sheet>
  );
}
