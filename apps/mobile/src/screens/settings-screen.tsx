// The Profile tab (journey 13, P / S21): the profile header (the authored default avatar, the @handle or name,
// how the person signed in), then every settings group the product has, each row working. The network row repeats
// the header's toggle (D15).
import * as Application from "expo-application";
import { useRouter } from "expo-router";
import {
  AtSign,
  Bell,
  BookUser,
  Bot,
  Briefcase,
  Brain,
  CalendarClock,
  Coins,
  Database,
  Globe,
  KeyRound,
  LifeBuoy,
  LogOut,
  Mail,
  Mic,
  Palette,
  ShieldCheck,
  Vibrate,
  Volume2,
  Waypoints,
  type LucideIcon,
} from "lucide-react-native";
import * as React from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { LANGUAGE_NAMES } from "@kawase/i18n";
import { DefaultAvatar } from "@kawase/ui-native/components/default-avatar";
import { Eyebrow } from "@kawase/ui-native/components/eyebrow";
import { ListGroup, ListRow } from "@kawase/ui-native/components/list-row";
import { TestnetStrip } from "@kawase/ui-native/components/network-chip";
import { SegmentedControl } from "@kawase/ui-native/components/segmented-control";
import { voiceName } from "@/screens/voice-settings-screen";
import { DEFAULT_VOICE_PREFS } from "@kawase/config";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Switch } from "@kawase/ui-native/components/ui/switch";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { CurrencySheet, useCurrencyName } from "@/components/currency-sheet";
import { LanguageSheet } from "@/components/language-sheet";
import { MainnetConsentSheet } from "@/components/network-pill";
import { useDockClearance } from "@/dock/use-dock-clearance";
import { useLocale } from "@/i18n/locale-provider";
import { useT } from "@/i18n";
import { useSession } from "@/session/session-provider";
import { useSignIn } from "@/sign-in/sign-in-provider";
import { useNetworkSwitch } from "@/wallet/use-network-switch";
import { useTurnkeyAccount } from "@/wallet/use-turnkey-account";
import { setFeedbackPreference, useFeedbackPreferences } from "@/feedback/preferences";
import { stopInterfaceSounds } from "@/feedback/feedback";

const STRIP_INSET = 6;
const EDGE_INSET = 12;
const AVATAR_SIZE = 72;
const GUEST_SEED = "guest";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="gap-3">
      <Eyebrow className="px-1">{title}</Eyebrow>
      {children}
    </View>
  );
}

function RowIcon({ icon, className }: { icon: LucideIcon; className?: string }) {
  return <Icon as={icon} className={cn("text-muted-foreground size-5", className)} />;
}

export function SettingsScreen() {
  const { t } = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const clearance = useDockClearance();
  const { locale } = useLocale();
  const { status, user, update, signOut } = useSession();
  const signIn = useSignIn();
  const turnkey = useTurnkeyAccount();
  const { network, nextName, busy, toggle, consentNeeded, acceptMainnet, dismissConsent } = useNetworkSwitch();
  const [languageOpen, setLanguageOpen] = React.useState(false);
  const [currencyOpen, setCurrencyOpen] = React.useState(false);
  const currencyName = useCurrencyName();
  const displayCurrency = (user?.displayCurrency || "USD").toUpperCase();
  const feedback = useFeedbackPreferences();
  const [feedbackError, setFeedbackError] = React.useState(false);
  const changeFeedback = (key: "sounds" | "haptics" | "narration", enabled: boolean) => {
    setFeedbackError(false);
    if (key === "sounds" && !enabled) stopInterfaceSounds();
    void setFeedbackPreference(key, enabled).catch(() => setFeedbackError(true));
  };
  const testnet = network === "testnet";
  const account = status === "account";
  const name = !account
    ? t("common.guest")
    : user?.handle
      ? `@${user.handle}`
      : (user?.email?.split("@")[0] ?? t("common.guest"));

  const leave = async () => {
    await turnkey.signOutTurnkey();
    await signOut();
    router.replace("/welcome");
  };

  return (
    <View className="bg-background flex-1">
      {testnet ? (
        <TestnetStrip label={t("network.testnetStrip")} style={{ paddingTop: insets.top + STRIP_INSET }} />
      ) : null}
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-7 px-5"
        contentContainerStyle={{
          paddingTop: testnet ? EDGE_INSET : insets.top + EDGE_INSET,
          paddingBottom: clearance.scroll,
        }}
      >
        <View className="items-center gap-3 pt-2">
          <DefaultAvatar seed={user?.id ?? GUEST_SEED} size={AVATAR_SIZE} label={name} />
          <View className="items-center gap-1">
            <Text className="font-display text-foreground text-2xl font-bold">{name}</Text>
            <Text className="text-muted-foreground text-sm">
              {account ? (user?.email ?? "") : t("settings.guestBody")}
            </Text>
          </View>
          {!account ? (
            <Button className="mt-1 self-stretch" onPress={signIn.open}>
              <Text>{t("signIn.title")}</Text>
            </Button>
          ) : null}
        </View>

        {account ? (
          <Section title={t("settings.account")}>
            <ListGroup>
              <ListRow
                leading={<RowIcon icon={AtSign} />}
                title={t("handle.row")}
                trailing={
                  <Text className="text-muted-foreground text-base">
                    {user?.handle ? `@${user.handle}` : t("handle.none")}
                  </Text>
                }
                chevron
                onPress={() => router.push({ pathname: "/handle", params: { edit: "1" } })}
              />
              <ListRow
                leading={<RowIcon icon={Mail} />}
                title={t("signIn.email")}
                trailing={
                  <Text numberOfLines={1} className="text-muted-foreground max-w-48 text-base">
                    {user?.email ?? ""}
                  </Text>
                }
                chevron
                onPress={() => router.push("/account")}
              />
              <ListRow
                leading={<RowIcon icon={ShieldCheck} />}
                title={t("account.title")}
                subtitle={t("account.settingsBody")}
                chevron
                onPress={() => router.push("/account")}
              />
            </ListGroup>
          </Section>
        ) : null}

        <Section title={t("settings.money")}>
          <ListGroup>
            <ListRow
              leading={<RowIcon icon={ShieldCheck} />}
              title={t("limits.title")}
              subtitle={t("settings.limitsBody")}
              chevron
              onPress={() => router.push(account ? "/limits" : "/wallet")}
            />
            <ListRow
              leading={<RowIcon icon={Waypoints} className="text-network" />}
              title={t("settings.network")}
              subtitle={testnet ? t("network.testnetStrip") : t("network.realMoney")}
              accessibilityLabel={t("network.switchTo", { network: nextName })}
              trailing={
                <View className="flex-row items-center gap-2">
                  <Text className="text-muted-foreground text-base">
                    {testnet ? t("network.arcTestnet") : t("network.arc")}
                  </Text>
                  <Switch
                    checked={!testnet}
                    disabled={busy}
                    onCheckedChange={toggle}
                    accessibilityLabel={t("network.switchTo", { network: nextName })}
                  />
                </View>
              }
              onPress={toggle}
            />
            <ListRow
              leading={<RowIcon icon={BookUser} />}
              title={t("settings.contacts")}
              chevron
              onPress={() => router.push("/contacts")}
            />
            <ListRow
              leading={<RowIcon icon={CalendarClock} />}
              title={t("settings.automations")}
              chevron
              onPress={() => router.push("/automations")}
            />
            <ListRow
              leading={<RowIcon icon={Bot} />}
              title={t("agentWallet.title")}
              subtitle={t("agentWallet.settingsBody")}
              chevron
              onPress={() => router.push("/agent-wallet")}
            />
            <ListRow
              leading={<RowIcon icon={Briefcase} />}
              title={t("business.title")}
              subtitle={t("business.settingsBody")}
              chevron
              onPress={() => (account ? router.push("/business") : signIn.open())}
            />
            <ListRow
              leading={<RowIcon icon={Coins} />}
              title={t("settings.displayCurrency")}
              trailing={<Text className="text-muted-foreground text-base">{currencyName(displayCurrency)}</Text>}
              chevron
              onPress={() => setCurrencyOpen(true)}
            />
          </ListGroup>
        </Section>

        <Section title={t("settings.preferences")}>
          <ListGroup>
            <ListRow
              leading={<RowIcon icon={Globe} />}
              title={t("settings.language")}
              trailing={<Text className="text-muted-foreground text-base">{LANGUAGE_NAMES[locale]}</Text>}
              chevron
              onPress={() => setLanguageOpen(true)}
            />
            <ListRow
              leading={<RowIcon icon={Bell} />}
              title={t("settings.notifications")}
              chevron
              onPress={() => router.push("/notifications")}
            />
            <ListRow
              leading={<RowIcon icon={Mic} />}
              title={t("settings.voice")}
              trailing={
                <Text className="text-muted-foreground text-base">
                  {voiceName(user?.voicePrefs?.voice ?? DEFAULT_VOICE_PREFS.voice)}
                </Text>
              }
              chevron
              onPress={() => router.push("/voice-settings")}
            />
            <ListRow
              leading={<RowIcon icon={Brain} />}
              title={t("settings.memory")}
              subtitle={t("memory.settingsBody")}
              chevron
              onPress={() => router.push("/memory")}
            />
          </ListGroup>
          <View className="gap-2">
            <View className="flex-row items-center gap-2 px-1">
              <RowIcon icon={Palette} />
              <Text className={cn("text-foreground text-base", TEXT_START)}>{t("settings.theme")}</Text>
            </View>
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
          </View>
        </Section>

        <Section title={t("feedback.title")}>
          <ListGroup>
            <ListRow
              leading={<RowIcon icon={Volume2} />}
              title={t("feedback.sounds")}
              subtitle={t("feedback.soundsBody")}
              trailing={
                <Switch
                  checked={feedback.sounds}
                  onCheckedChange={(enabled) => changeFeedback("sounds", enabled)}
                  accessibilityLabel={t("feedback.sounds")}
                />
              }
            />
            <ListRow
              leading={<RowIcon icon={Vibrate} />}
              title={t("feedback.haptics")}
              subtitle={t("feedback.hapticsBody")}
              trailing={
                <Switch
                  checked={feedback.haptics}
                  onCheckedChange={(enabled) => changeFeedback("haptics", enabled)}
                  accessibilityLabel={t("feedback.haptics")}
                />
              }
            />
            <ListRow
              leading={<RowIcon icon={Mic} />}
              title={t("feedback.narration")}
              subtitle={t("feedback.narrationBody")}
              trailing={
                <Switch
                  checked={feedback.narration}
                  onCheckedChange={(enabled) => changeFeedback("narration", enabled)}
                  accessibilityLabel={t("feedback.narration")}
                />
              }
            />
          </ListGroup>
          {feedbackError ? (
            <Text accessibilityRole="alert" className="text-destructive text-sm">
              {t("feedback.saveFailed")}
            </Text>
          ) : null}
        </Section>

        <Section title={t("settings.security")}>
          <ListGroup>
            <ListRow
              leading={<RowIcon icon={KeyRound} />}
              title={t("settings.devices")}
              chevron
              {...(account ? { onPress: () => router.push("/account/devices") } : { onPress: signIn.open })}
            />
            <ListRow
              leading={<RowIcon icon={Database} />}
              title={t("settings.privacy")}
              chevron
              onPress={() => (account ? router.push("/privacy") : signIn.open())}
            />
          </ListGroup>
        </Section>

        <Section title={t("settings.help")}>
          <ListGroup>
            <ListRow leading={<RowIcon icon={LifeBuoy} />} title={t("settings.trust")} chevron onPress={() => router.push("/help")} />
            <ListRow
              title={t("settings.version")}
              trailing={
                <Text className="text-muted-foreground font-mono text-sm">
                  {Application.nativeApplicationVersion
                    ? `${Application.nativeApplicationVersion} (${Application.nativeBuildVersion ?? "?"})`
                    : "web"}
                </Text>
              }
            />
          </ListGroup>
        </Section>

        {account ? (
          <ListGroup>
            <ListRow
              leading={<RowIcon icon={LogOut} className="text-destructive" />}
              title={t("common.signOut")}
              onPress={() => void leave()}
            />
          </ListGroup>
        ) : null}
      </ScrollView>

      <LanguageSheet open={languageOpen} onClose={() => setLanguageOpen(false)} />
      <CurrencySheet open={currencyOpen} onClose={() => setCurrencyOpen(false)} />
      <MainnetConsentSheet
        open={consentNeeded}
        busy={busy}
        onAccept={() => void acceptMainnet()}
        onClose={dismissConsent}
      />
    </View>
  );
}
