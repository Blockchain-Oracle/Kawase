// A price alert from a token page (capability-matrix "Markets × Alert"; surfaces.md token page More → Alert): "tell
// me when it goes above / below $X". It is the automations' price rule with a notify step — the same rule chat drafts
// — watched on the executable quote, so the alert means the price could really be had. Above: a few dollars' worth of
// the token sells for at least that many dollars at the line; below: those dollars buy at least that much of it. The
// draft then shows as the automation card (its read-back, the reason if it cannot run, and Turn on: an alert moves no
// money, so the tap is the yes).
import * as React from "react";
import { View } from "react-native";
import { toast } from "sonner-native";

import type { AutomationView, TokenView } from "@kawase/api-client";
import { SegmentedControl } from "@kawase/ui-native/components/segmented-control";
import { Sheet, SheetInput } from "@kawase/ui-native/components/sheet";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { AutomationCard } from "@/chat/automation-card";
import { useT } from "@/i18n";
import { useLocale } from "@/i18n/locale-provider";
import { api } from "@/session/api";
import { useThemeColors } from "@/theme/use-theme-colors";

/** The dollars the quote is taken on: large enough to price small tokens precisely, small enough to route anywhere. */
const NOTIONAL_USD = 10;
/** Significant digits kept in the amounts sent to the rule. */
const SIGNIFICANT = 6;
const USDC_DECIMALS = 6;
const POSITIVE = /^\d*[.,]?\d+$/;

type Side = "above" | "below";

/** A positive number as a plain decimal with at most `decimals` places and `SIGNIFICANT` significant digits. */
function decimal(value: number, decimals: number): string {
  const rounded = Number(value.toPrecision(SIGNIFICANT));
  const fixed = rounded.toFixed(Math.min(decimals, Math.max(0, SIGNIFICANT - Math.floor(Math.log10(rounded)) - 1)));
  return fixed.includes(".") ? fixed.replace(/0+$/, "").replace(/\.$/, "") : fixed;
}

export function PriceAlertSheet({ open, onClose, token, priceUsd }: { open: boolean; onClose: () => void; token: TokenView; priceUsd: number | null }) {
  const { t } = useT();
  const { locale } = useLocale();
  const colors = useThemeColors();
  const [side, setSide] = React.useState<Side>("above");
  const [text, setText] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [draft, setDraft] = React.useState<AutomationView>();

  const close = () => {
    onClose();
    setDraft(undefined);
    setText("");
  };

  const target = POSITIVE.test(text.trim()) ? Number(text.trim().replace(",", ".")) : NaN;
  const ready = Number.isFinite(target) && target > 0 && priceUsd !== null && priceUsd > 0;

  const review = async () => {
    if (!ready || priceUsd === null) return;
    setBusy(true);
    try {
      const input =
        side === "above"
          ? // This many tokens (about NOTIONAL_USD now) sell for at least that many dollars at the line.
            (() => {
              const amountIn = NOTIONAL_USD / priceUsd;
              return { tokenIn: token.address, tokenOut: "USDC", priceAmount: decimal(amountIn, token.decimals), minOut: decimal(amountIn * target, USDC_DECIMALS) };
            })()
          : // NOTIONAL_USD buys at least this many tokens once the price is at or under the line.
            { tokenIn: "USDC", tokenOut: token.address, priceAmount: String(NOTIONAL_USD), minOut: decimal(NOTIONAL_USD / target, token.decimals) };
      const { automation } = await api.automations.rule({ trigger: "price", action: "notify", ...input });
      setDraft(automation);
    } catch {
      toast(t("automation.failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={close}
      title={t("tokenPage.alertTitle", { symbol: token.symbol })}
      // The line is in US dollars (what the quote is taken in), so the price now is too.
      subtitle={priceUsd !== null ? t("tokenPage.alertNow", { price: new Intl.NumberFormat(locale, { style: "currency", currency: "USD", maximumSignificantDigits: SIGNIFICANT }).format(priceUsd) }) : undefined}
      colors={{ background: colors.card, handle: colors.muted, scrim: colors.scrim }}
      closeLabel={t("common.close")}
      {...(draft ? { onBack: () => setDraft(undefined), backLabel: t("common.back") } : {})}
    >
      {draft ? (
        <AutomationCard output={{ automation: draft }} />
      ) : (
        <View className="gap-4">
          <SegmentedControl
            label={t("tokenPage.alertTitle", { symbol: token.symbol })}
            options={[
              { value: "above", label: t("tokenPage.alertAbove") },
              { value: "below", label: t("tokenPage.alertBelow") },
            ]}
            value={side}
            onValueChange={(next) => setSide(next === "below" ? "below" : "above")}
          />
          <View className="gap-1.5">
            <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{t("tokenPage.alertPrice")}</Text>
            <SheetInput
              value={text}
              onChangeText={setText}
              keyboardType="decimal-pad"
              inputMode="decimal"
              placeholder={priceUsd !== null ? decimal(priceUsd, token.decimals) : "0"}
              accessibilityLabel={t("tokenPage.alertPrice")}
              onSubmitEditing={() => void review()}
            />
          </View>
          <Button disabled={!ready || busy} onPress={() => void review()}>
            <Text>{t("tokenPage.alertReview")}</Text>
          </Button>
        </View>
      )}
    </Sheet>
  );
}
