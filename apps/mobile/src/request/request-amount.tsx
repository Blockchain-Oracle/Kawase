// How much to ask for (C3): the same ticket as Send — the asset chips with their real marks, the amount large in the
// display face, the keypad — without a balance limit (you can ask for more than you hold), and a note that the payer
// will see ("Dinner on Friday"), never written on the chain. One button carries the validation in words.
import * as React from "react";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { NetworkId } from "@kawase/api-client";
import { arcIdentity } from "@kawase/identity";
import { decimalsOf, type AssetId } from "@kawase/money";
import { Mark } from "@kawase/ui-native/components/mark";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Input } from "@kawase/ui-native/components/ui/input";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { useLocale } from "@/i18n/locale-provider";
import { useT } from "@/i18n";
import { baseFromCanonical } from "@/send/amount-step";
import { applyKey, decimalSeparator, displayAmount, Keypad } from "@/send/keypad";

const ASSETS: AssetId[] = ["USDC", "EURC"];
const CHIP_MARK = 24;
const NOTE_MAX = 140;
const FOOTER_GAP = 12;
const ZERO = 0n;
/** The amount on a ticket (DESIGN.md type scale), shrinking to stay on one line. */
const TICKET_SIZE = 64;
const TICKET_LINE_HEIGHT = 76;
const TICKET_MIN_SCALE = 0.5;

export type RequestAmountProps = {
  network: NetworkId;
  asset: AssetId;
  onAsset: (asset: AssetId) => void;
  value: string;
  onValue: (value: string) => void;
  note: string;
  onNote: (note: string) => void;
  onCreate: () => void;
  busy: boolean;
};

export function RequestAmount(props: RequestAmountProps) {
  const { network, asset, value, busy } = props;
  const { t } = useT();
  const { locale } = useLocale();
  const insets = useSafeAreaInsets();
  const ids = arcIdentity(network);
  const base = baseFromCanonical(value, asset);
  const ready = base !== undefined && base > ZERO;

  return (
    <View className="flex-1">
      <View className="flex-1 gap-5 px-5 pt-4">
        <View accessibilityRole="radiogroup" className="flex-row gap-2">
          {ASSETS.map((option) => {
            const selected = option === asset;
            return (
              <Pressable
                key={option}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                onPress={() => props.onAsset(option)}
                className={cn(
                  "flex-1 flex-row items-center justify-center gap-2 rounded-full border py-2.5",
                  selected ? "border-foreground bg-secondary" : "border-border bg-muted active:bg-secondary",
                )}
              >
                <Mark entity={option === "USDC" ? ids.usdc : ids.eurc} chainBadge={ids.chain} size={CHIP_MARK} />
                <Text className="text-foreground text-base font-semibold">{option}</Text>
              </Pressable>
            );
          })}
        </View>

        <View className="items-center py-4">
          <View className="flex-row items-baseline gap-2" style={{ direction: "ltr" }}>
            <Text
              accessibilityLiveRegion="polite"
              accessibilityLabel={`${value || "0"} ${asset}`}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={TICKET_MIN_SCALE}
              className={cn("font-display font-bold", value ? "text-foreground" : "text-muted-foreground")}
              style={{ fontSize: TICKET_SIZE, lineHeight: TICKET_LINE_HEIGHT, fontVariant: ["tabular-nums"] }}
            >
              {displayAmount(value, locale)}
            </Text>
            <Text className="font-display text-muted-foreground text-2xl font-semibold">{asset}</Text>
          </View>
        </View>

        <View className="gap-1">
          <Input
            value={props.note}
            onChangeText={props.onNote}
            placeholder={t("request.notePlaceholder")}
            accessibilityLabel={t("request.notePlaceholder")}
            maxLength={NOTE_MAX}
            returnKeyType="done"
          />
          <Text className={cn("text-muted-foreground px-1 text-xs", TEXT_START)}>{t("request.noteHint")}</Text>
        </View>
      </View>

      <View className="gap-3 px-5" style={{ paddingBottom: insets.bottom + FOOTER_GAP }}>
        <Keypad decimal={decimalSeparator(locale)} backspaceLabel={t("send.deleteDigit")} onKey={(key) => props.onValue(applyKey(value, key, decimalsOf(asset)))} />
        <Button size="lg" disabled={!ready || busy} onPress={props.onCreate}>
          <Text>{busy ? t("request.creating") : ready ? t("request.create") : t("send.enterAmount")}</Text>
        </Button>
      </View>
    </View>
  );
}
