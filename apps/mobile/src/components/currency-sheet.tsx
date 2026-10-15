// The display currency sheet (B2-3, plan §A.4 14): every common fiat Kawase has a daily rate for, each with its
// issuer's flag (packages/identity, circle-flags), named in the person's language with its symbol (Intl.DisplayNames —
// no names are written into the app), the current one ticked.
// A tap saves it to the account; balances, Home, Markets, token pages, cards and the agent's replies follow.
import * as React from "react";
import { toast } from "sonner-native";
import { ScrollView, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { DISPLAY_CURRENCIES } from "@kawase/config";
import { fiatKey } from "@kawase/identity";
import { Mark } from "@kawase/ui-native/components/mark";
import { ListGroup, ListRow } from "@kawase/ui-native/components/list-row";
import { Sheet } from "@kawase/ui-native/components/sheet";

import { useLocale } from "@/i18n/locale-provider";
import { useT } from "@/i18n";
import { useSession } from "@/session/session-provider";
import { useThemeColors } from "@/theme/use-theme-colors";

/** The list takes at most this share of the screen; it scrolls. */
const LIST_HEIGHT_SHARE = 0.6;
const FLAG = 32;

/** "Euro" in the person's language, or the code when the device cannot name it. */
export function useCurrencyName() {
  const { locale } = useLocale();
  return React.useCallback(
    (code: string) => {
      try {
        return new Intl.DisplayNames([locale], { type: "currency" }).of(code) ?? code;
      } catch {
        return code;
      }
    },
    [locale],
  );
}

/** "€" / "₦" / "US$" as the person's locale writes it. */
function symbolOf(code: string, locale: string) {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency: code, currencyDisplay: "narrowSymbol" }).formatToParts(0).find((part) => part.type === "currency")?.value ?? code;
  } catch {
    return code;
  }
}

export function CurrencySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useT();
  const { locale } = useLocale();
  const { user, update } = useSession();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const name = useCurrencyName();
  const current = (user?.displayCurrency || "USD").toUpperCase();
  const { height } = useWindowDimensions();

  const choose = async (code: string) => {
    onClose();
    if (code === current) return;
    try {
      await update({ displayCurrency: code });
    } catch {
      toast(t("common.error"));
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title={t("settings.displayCurrency")} colors={{ background: colors.card, handle: colors.muted, scrim: colors.scrim }} closeLabel={t("common.close")} bottomInset={insets.bottom}>
      <ScrollView style={{ maxHeight: height * LIST_HEIGHT_SHARE }}>
      <ListGroup>
        {DISPLAY_CURRENCIES.map((code) => (
          <ListRow key={code} leading={<Mark entity={fiatKey(code)} size={FLAG} />} title={name(code)} subtitle={`${code} · ${symbolOf(code, locale)}`} selected={code === current} accessibilityRole="radio" onPress={() => void choose(code)} />
        ))}
      </ListGroup>
      </ScrollView>
    </Sheet>
  );
}
