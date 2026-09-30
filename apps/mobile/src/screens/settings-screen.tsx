// The settings hub: language, appearance, network, account.
import { useRouter } from "expo-router";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { NetworkId } from "@kawase/api-client";
import { SUPPORTED_LOCALES, type SupportedLocale } from "@kawase/config";
import { LANGUAGE_NAMES } from "@kawase/i18n";
import { SegmentedControl } from "@kawase/ui-native/components/segmented-control";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Card } from "@kawase/ui-native/components/ui/card";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn } from "@kawase/ui-native/lib/utils";

import { useLocale } from "@/i18n/locale-provider";
import { useT } from "@/i18n";
import { useSession } from "@/session/session-provider";
import { useTurnkeyAccount } from "@/wallet/use-turnkey-account";

const EDGE_INSET = 24;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="gap-3">
      <Text className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">{title}</Text>
      {children}
    </View>
  );
}

export function SettingsScreen() {
  const { t } = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { locale, chooseLocale } = useLocale();
  const { status, user, availableNetworks, update, signOut } = useSession();
  const turnkey = useTurnkeyAccount();

  return (
    <ScrollView
      className="bg-background flex-1"
      contentContainerClassName="gap-6 px-5"
      contentContainerStyle={{ paddingTop: insets.top + EDGE_INSET, paddingBottom: insets.bottom + EDGE_INSET }}
    >
      <Text className="font-display text-[32px] font-semibold leading-10">{t("settings.title")}</Text>

      <Section title={t("settings.language")}>
        <View className="flex-row flex-wrap gap-2">
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
        </View>
      </Section>

      <Section title={t("settings.theme")}>
        <SegmentedControl
          label={t("settings.theme")}
          value={user?.theme ?? "system"}
          onValueChange={(value) => void update({ theme: value as "system" | "light" | "dark" })}
          options={[
            { value: "system", label: t("settings.themeSystem") },
            { value: "dark", label: t("settings.themeDark") },
            { value: "light", label: t("settings.themeLight") },
          ]}
        />
      </Section>

      <Section title={t("settings.network")}>
        <SegmentedControl
          label={t("settings.network")}
          value={user?.activeNetwork ?? "testnet"}
          onValueChange={(value) => {
            if (value !== user?.activeNetwork) router.push("/wallet");
          }}
          options={availableNetworks.map((id: NetworkId) => ({ value: id, label: id === "testnet" ? t("network.testnet") : t("network.mainnet") }))}
        />
      </Section>

      <Section title={t("settings.account")}>
        <Card className="gap-3 p-5">
          <Text className="text-sm">{status === "account" && user?.email ? t("settings.signedInAs", { email: user.email }) : t("common.guest")}</Text>
          {status === "account" ? (
            <Button
              variant="secondary"
              className="h-12"
              onPress={() =>
                void (async () => {
                  await turnkey.signOutTurnkey();
                  await signOut();
                  router.replace("/welcome");
                })()
              }
            >
              <Text>{t("common.signOut")}</Text>
            </Button>
          ) : (
            <Button className="h-12" onPress={() => router.push("/sign-in")}>
              <Text className="font-semibold">{t("signIn.title")}</Text>
            </Button>
          )}
        </Card>
      </Section>

      <Button variant="ghost" className="h-11" onPress={() => router.back()}>
        <Text className="text-muted-foreground">{t("common.back")}</Text>
      </Button>
    </ScrollView>
  );
}
