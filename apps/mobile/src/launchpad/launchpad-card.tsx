// A launchpad token on its page (LIFT on Arc): "On the LIFT curve: 51% to graduation" with the bar, the market cap and
// what a trade pays on the curve, and "Tell me when it graduates" (an inbox alert, then push). Once graduated it says
// so and when. Shown only for tokens a launchpad launched; others have no curve and trade like any token.
import { GraduationCap } from "lucide-react-native";
import * as React from "react";
import { View } from "react-native";

import type { LaunchpadView } from "@kawase/api-client";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { useLocale } from "@/i18n/locale-provider";
import { useT } from "@/i18n";
import { api } from "@/session/api";
import { useSession } from "@/session/session-provider";
import { useSignIn } from "@/sign-in/sign-in-provider";

const PERCENT = 100;
const BPS_PER_PERCENT = 100;
const PROGRESS_DIGITS = 1;

export function LaunchpadCard({ address }: { address: string }) {
  const { t } = useT();
  const { locale } = useLocale();
  const { status, user } = useSession();
  const signIn = useSignIn();
  const [view, setView] = React.useState<LaunchpadView | null>();
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    let live = true;
    // The card is shown for Arc mainnet tokens only: their curve is mainnet's, whatever network the session is on.
    void api.launchpad
      .token(address, "mainnet")
      .then((result) => live && setView(result.launchpad))
      .catch(() => live && setView(null));
    return () => {
      live = false;
    };
  }, [address, user?.activeNetwork, status]);
  if (!view) return null;

  const toggle = async () => {
    if (status !== "account") {
      signIn.open();
      return;
    }
    setBusy(true);
    try {
      setView((view.watching ? await api.launchpad.unwatch(address) : await api.launchpad.watch(address)).launchpad);
    } catch {
      // The card stays as it was; nothing changed.
    } finally {
      setBusy(false);
    }
  };
  const usd = (value: number | null) => (value === null ? "—" : new Intl.NumberFormat(locale, { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 }).format(value));
  const percent = (view.progress * PERCENT).toFixed(PROGRESS_DIGITS);

  return (
    <View className="bg-card border-border gap-3 rounded-2xl border p-4">
      <View className="flex-row items-center gap-2">
        <Icon as={GraduationCap} className="text-foreground size-5" />
        <Text className={cn("text-foreground flex-1 text-base font-semibold", TEXT_START)}>
          {view.graduated ? t("launchpad.graduated", { launchpad: view.launchpad }) : t("launchpad.onCurve", { launchpad: view.launchpad, percent })}
        </Text>
      </View>
      {view.graduated ? (
        view.graduatedAt ? (
          <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{t("launchpad.graduatedOn", { date: new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(new Date(view.graduatedAt)) })}</Text>
        ) : null
      ) : (
        <>
          <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: PERCENT, now: Math.round(view.progress * PERCENT) }} className="bg-muted h-2 overflow-hidden rounded-full">
            <View className="bg-primary h-2 rounded-full" style={{ width: `${Math.max(view.progress * PERCENT, 1)}%` }} />
          </View>
          <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{t("launchpad.marketCap", { amount: usd(view.marketCapUsd) })}</Text>
          {view.buyFeeBps > 0 || view.sellFeeBps > 0 ? (
            <Text className={cn("text-muted-foreground text-xs", TEXT_START)}>
              {t("launchpad.fees", { buy: view.buyFeeBps / BPS_PER_PERCENT, sell: view.sellFeeBps / BPS_PER_PERCENT, creator: view.creatorFeeBps / BPS_PER_PERCENT })}
            </Text>
          ) : null}
          <Text className={cn("text-muted-foreground text-xs", TEXT_START)}>{t("launchpad.explainer")}</Text>
          <Button variant={view.watching ? "secondary" : "default"} disabled={busy} onPress={() => void toggle()}>
            <Text>{view.watching ? t("launchpad.watching") : t("launchpad.watch")}</Text>
          </Button>
        </>
      )}
    </View>
  );
}
