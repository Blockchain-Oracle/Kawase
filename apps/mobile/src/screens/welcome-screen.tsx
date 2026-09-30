// First launch: choose a language, start as a guest. Signing in comes when money needs it (D33 step 1).
import { useRouter } from "expo-router";
import * as React from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SUPPORTED_LOCALES, type SupportedLocale } from "@kawase/config";
import { LANGUAGE_NAMES } from "@kawase/i18n";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn } from "@kawase/ui-native/lib/utils";
import { tokens } from "@kawase/ui-tokens";

import { Orb } from "@/components/orb";
import { useLocale } from "@/i18n/locale-provider";
import { useT } from "@/i18n";
import { useSession } from "@/session/session-provider";

const EDGE_INSET = 24;
const IDLE_LEVEL = 0.15;

export function WelcomeScreen() {
  const { t } = useT();
  const { locale, chooseLocale } = useLocale();
  const { ensureGuest } = useSession();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = React.useState(false);

  const start = async () => {
    setBusy(true);
    try {
      await ensureGuest(locale);
      router.replace("/");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="bg-background flex-1" style={{ paddingTop: insets.top + EDGE_INSET, paddingBottom: insets.bottom + EDGE_INSET }}>
      <View className="flex-1 items-center justify-center gap-5 px-6">
        <Orb colors={tokens.orb.mainnet} level={IDLE_LEVEL} className="w-40" accessibilityLabel={t("common.appName")} />
        <Text className="font-display text-center text-[32px] font-semibold leading-10">{t("welcome.title")}</Text>
        <Text className="text-muted-foreground text-center text-base">{t("welcome.subtitle")}</Text>
      </View>
      <View className="gap-4 px-6">
        <Text className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">{t("welcome.chooseLanguage")}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
          {SUPPORTED_LOCALES.map((candidate: SupportedLocale) => {
            const selected = candidate === locale;
            return (
              <Pressable
                key={candidate}
                role="radio"
                accessibilityState={{ checked: selected }}
                onPress={() => void chooseLocale(candidate)}
                className={cn("rounded-full border px-4 py-2", selected ? "bg-foreground border-foreground" : "border-border bg-card")}
              >
                <Text className={cn("text-sm font-medium", selected ? "text-background" : "text-foreground")}>{LANGUAGE_NAMES[candidate]}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <Button className="h-14" disabled={busy} onPress={() => void start()}>
          <Text className="text-base font-semibold">{t("welcome.start")}</Text>
        </Button>
        <Text className="text-muted-foreground text-center text-xs">{t("welcome.tryFirst")}</Text>
      </View>
    </View>
  );
}
