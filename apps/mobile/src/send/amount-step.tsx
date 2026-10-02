// How much (revamp journey 10, the amount ticket): who it goes to at the top (tap to change), the asset — any token
// the person holds, from the universal picker (R1) — with its real mark and what is available, the amount itself large in the display face (64 pt, tabular), Max, an
// optional private note, the keypad, and one button that carries the validation in words ("Enter an amount",
// "Not enough USDC", "Review"). Balances come from the wallet status; the policy checks everything again at review.
import { ChevronDown } from "lucide-react-native";
import * as React from "react";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { NetworkId } from "@kawase/api-client";
import { AmountParseError, decimalsOf, parseAmount, type AssetId } from "@kawase/money";
import { Amount } from "@kawase/ui-native/components/amount";
import { DefaultAvatar } from "@kawase/ui-native/components/default-avatar";
import { TokenMark } from "@kawase/ui-native/components/token-mark";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Input } from "@kawase/ui-native/components/ui/input";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { useT } from "@/i18n";
import { useLocale } from "@/i18n/locale-provider";

import { canonicalUnits, unitsFromCanonical, type TicketToken } from "@/portfolio/ticket-token";

import { useMoney } from "./copy";
import { applyKey, decimalSeparator, displayAmount, Keypad } from "./keypad";
import type { RecipientChoice } from "./recipient-step";

const AVATAR = 32;
const CHIP_MARK = 24;
const NOTE_MAX = 140;
const FOOTER_GAP = 12;
const TEN = 10n;
const ZERO = 0n;
/** The amount on a ticket (DESIGN.md type scale). */
const TICKET_SIZE = 64;
const TICKET_LINE_HEIGHT = 76;
/** Long amounts shrink to stay on one line. */
const TICKET_MIN_SCALE = 0.5;

/** Base units → the canonical decimal the keypad builds ("12.5"). */
export function canonicalFromBase(baseUnits: bigint, asset: AssetId): string {
  const divisor = TEN ** BigInt(decimalsOf(asset));
  const whole = baseUnits / divisor;
  const fraction = (baseUnits % divisor).toString().padStart(decimalsOf(asset), "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

/** The canonical decimal → base units; undefined while it is empty or not a number yet. */
export function baseFromCanonical(value: string, asset: AssetId): bigint | undefined {
  if (!value || value.endsWith(".")) return value.endsWith(".") ? baseFromCanonical(value.slice(0, -1), asset) : undefined;
  try {
    return parseAmount(value, asset, "en").baseUnits;
  } catch (error) {
    if (error instanceof AmountParseError) return undefined;
    throw error;
  }
}

export type AmountStepProps = {
  network: NetworkId;
  recipient: RecipientChoice;
  onChangeRecipient: () => void;
  /** The token being sent (any held asset). */
  token: TicketToken;
  /** Opens the universal asset picker. */
  onPickAsset: () => void;
  value: string;
  onValue: (value: string) => void;
  note: string;
  onNote: (note: string) => void;
  /** The token's balance in base units; undefined while loading. */
  balance: bigint | undefined;
  onReview: () => void;
  busy: boolean;
};

export function AmountStep(props: AmountStepProps) {
  const { recipient, token, value, balance, busy } = props;
  const asset = token.symbol;
  const { t } = useT();
  const { locale } = useLocale();
  const insets = useSafeAreaInsets();
  const money = useMoney();
  const separator = decimalSeparator(locale);
  const base = unitsFromCanonical(value, token.decimals);

  const cta =
    base === undefined || base === ZERO
      ? { label: t("send.enterAmount"), enabled: false }
      : balance !== undefined && base > balance
        ? { label: t("send.notEnough", { asset }), enabled: false }
        : { label: t("send.review"), enabled: true };

  return (
    <View className="flex-1">
      <View className="flex-1 gap-5 px-5 pt-4">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${t("send.to")} ${recipient.title}`}
          onPress={props.onChangeRecipient}
          className="bg-card border-border active:bg-muted flex-row items-center gap-3 self-start rounded-full border py-1.5 pe-4 ps-1.5"
        >
          <DefaultAvatar seed={recipient.seed} size={AVATAR} />
          <Text numberOfLines={1} className="text-foreground shrink text-base font-semibold">
            {t("send.to")} {recipient.title}
          </Text>
          {recipient.subtitle && recipient.subtitle !== recipient.title ? (
            <Amount numberOfLines={1} className="text-muted-foreground shrink text-sm">
              {recipient.subtitle}
            </Amount>
          ) : null}
          <Icon as={ChevronDown} className="text-muted-foreground size-4" />
        </Pressable>

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

        <View className="items-center gap-2 py-2">
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
          <View className="flex-row items-center gap-2">
            <Text className="text-muted-foreground text-sm">
              {balance !== undefined ? t("send.available", { amount: money(asset, balance.toString(), token.decimals) }) : " "}
            </Text>
            {balance !== undefined && balance > ZERO ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => props.onValue(canonicalUnits(balance, token.decimals))}
                className="bg-muted active:bg-secondary rounded-full px-3 py-1"
              >
                <Text className="text-foreground text-xs font-semibold">{t("send.max")}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        <View className="gap-1">
          <Input
            value={props.note}
            onChangeText={props.onNote}
            placeholder={t("send.notePlaceholder")}
            accessibilityLabel={t("send.notePlaceholder")}
            maxLength={NOTE_MAX}
            returnKeyType="done"
          />
          <Text className={cn("text-muted-foreground px-1 text-xs", TEXT_START)}>{t("send.noteHint")}</Text>
        </View>
      </View>

      <View className="gap-3 px-5" style={{ paddingBottom: insets.bottom + FOOTER_GAP }}>
        <Keypad decimal={separator} backspaceLabel={t("send.deleteDigit")} onKey={(key) => props.onValue(applyKey(value, key, token.decimals))} />
        <Button size="lg" disabled={!cta.enabled || busy} onPress={props.onReview}>
          <Text>{busy ? t("common.loading") : cta.label}</Text>
        </Button>
      </View>
    </View>
  );
}
