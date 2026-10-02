// How much to ask for (C3): the same ticket as Send — any token (R1), chosen from the universal picker, with its real mark, the amount large in the
// display face, the keypad — without a balance limit (you can ask for more than you hold), and a note that the payer
// will see ("Dinner on Friday"), never written on the chain. One button carries the validation in words.
import * as React from "react";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ChevronDown } from "lucide-react-native";

import type { NetworkId } from "@kawase/api-client";
import { TokenMark } from "@kawase/ui-native/components/token-mark";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Input } from "@kawase/ui-native/components/ui/input";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { useLocale } from "@/i18n/locale-provider";
import { useT } from "@/i18n";
import { unitsFromCanonical, type TicketToken } from "@/portfolio/ticket-token";
import { applyKey, decimalSeparator, displayAmount, Keypad } from "@/send/keypad";

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
  /** The token asked for: any token on the network, held or not. */
  token: TicketToken;
  onPickAsset: () => void;
  value: string;
  onValue: (value: string) => void;
  note: string;
  onNote: (note: string) => void;
  onCreate: () => void;
  busy: boolean;
};

export function RequestAmount(props: RequestAmountProps) {
  const { token, value, busy } = props;
  const asset = token.symbol;
  const { t } = useT();
  const { locale } = useLocale();
  const insets = useSafeAreaInsets();
  const base = unitsFromCanonical(value, token.decimals);
  const ready = base !== undefined && base > ZERO;

  return (
    <View className="flex-1">
      <View className="flex-1 gap-5 px-5 pt-4">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${t("assets.pickerTitle")}: ${token.name}`}
          onPress={props.onPickAsset}
          className="border-border bg-secondary active:bg-muted flex-row items-center justify-center gap-2 self-center rounded-full border py-2 pe-4 ps-2"
        >
          <TokenMark token={token} size={CHIP_MARK} />
          <Text className="text-foreground text-base font-semibold">{asset}</Text>
          <Icon as={ChevronDown} className="text-muted-foreground size-4" />
        </Pressable>

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
        <Keypad decimal={decimalSeparator(locale)} backspaceLabel={t("send.deleteDigit")} onKey={(key) => props.onValue(applyKey(value, key, token.decimals))} />
        <Button size="lg" disabled={!ready || busy} onPress={props.onCreate}>
          <Text>{busy ? t("request.creating") : ready ? t("request.create") : t("send.enterAmount")}</Text>
        </Button>
      </View>
    </View>
  );
}
