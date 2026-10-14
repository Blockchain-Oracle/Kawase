// Settings, the dock's last tab (Senryo kit: filled groups, ListRow, real marks, no explainers). The person first —
// avatar, name and email, or Sign in for a guest — then their money (the weekly budget with this week's spend, the
// agent wallet's balance, contacts, display currency), the app (network capsule, language, appearance, sound, haptics,
// hide balances, voice, notifications, the story's narration), privacy and help, and the account. Every row shows the
// live value it controls; a value that cannot load says so in place and the row still opens its page.
import * as Application from "expo-application";
import { useRouter } from "expo-router";
import {
  AtSign,
  Bell,
  BookUser,
  Brain,
  CalendarClock,
  Coins,
  EyeOff,
  Gauge,
  Globe,
  KeyRound,
  LifeBuoy,
  LogOut,
  Mail,
  Mic,
  Palette,
  ShieldCheck,
  Trash2,
  Vibrate,
  Volume2,
  BookOpenText,
  type LucideIcon,
} from "lucide-react-native";
import * as React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { DEFAULT_VOICE_PREFS } from "@kawase/config";
import { LANGUAGE_NAMES } from "@kawase/i18n/names";
import { arcIdentity } from "@kawase/identity";
import { DefaultAvatar } from "@kawase/ui-native/components/default-avatar";
import { Mark } from "@kawase/ui-native/components/mark";
import { useWide, WIDE_COLUMN_PX } from "@kawase/ui-native/lib/wide";

import { CurrencySheet, useCurrencyName } from "@/components/currency-sheet";
import { Button } from "@/components/kit/Button";
import { useHideBalances } from "@/components/kit/hide-balances";
import { Icon } from "@/components/kit/icons";
import { ListRow } from "@/components/kit/ListRow";
import { Segmented } from "@/components/kit/Segmented";
import { Skeleton } from "@/components/kit/states";
import { Panel, SectionLabel } from "@/components/kit/Surface";
import { Switch } from "@/components/kit/Switch";
import { CONTROL_FONT_SCALE, RADIUS, SIZE, SPACE, TYPE, useTheme } from "@/components/kit/theme";
import { LanguageSheet } from "@/components/language-sheet";
import { MainnetConsentSheet } from "@/components/network-pill";
import { ModeCapsule } from "@/components/shell/ModeCapsule";
import { useDockClearance } from "@/dock/use-dock-clearance";
import { stopInterfaceSounds } from "@/feedback/feedback";
import { setFeedbackPreference, useFeedbackPreferences } from "@/feedback/preferences";
import { formatUsd } from "@/budget/format";
import { useT } from "@/i18n";
import { useLocale } from "@/i18n/locale-provider";
import { voiceName } from "@/screens/voice-settings-screen";
import { api } from "@/session/api";
import { useSession } from "@/session/session-provider";
import { useSignIn } from "@/sign-in/sign-in-provider";
import { useNetworkSwitch } from "@/wallet/use-network-switch";
import { useTurnkeyAccount } from "@/wallet/use-turnkey-account";

const AVATAR = SIZE.avatarLg;
const GLYPH_PLATE = SIZE.avatarSm;
const GLYPH = 18;
const VALUE_SKELETON_W = 72;
const VALUE_MAX_W = 180;
const WIDE_TOP = SPACE.xxl;
const GUEST_SEED = "guest";

/** A value the row shows, as it loads: undefined while loading, null when it could not be read. */
type Loaded<T> = T | null | undefined;

function Glyph({ icon, tint }: { icon: LucideIcon; tint?: string }) {
  const { color } = useTheme();
  return (
    <View style={[styles.glyph, { backgroundColor: color.raised2 }]}>
      <Icon icon={icon} size={GLYPH} tint={tint ?? color.ink} />
    </View>
  );
}

function Value({ text, loading }: { text?: string | undefined; loading?: boolean }) {
  const { color } = useTheme();
  if (loading) return <Skeleton width={VALUE_SKELETON_W} />;
  if (!text) return null;
  return (
    <Text numberOfLines={1} maxFontSizeMultiplier={CONTROL_FONT_SCALE} style={[TYPE.rowDetail, styles.value, { color: color.text3 }]}>
      {text}
    </Text>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.group}>
      <SectionLabel style={styles.label}>{title}</SectionLabel>
      <Panel>{children}</Panel>
    </View>
  );
}

export function SettingsScreen() {
  const { t } = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const clearance = useDockClearance();
  const wide = useWide();
  const { color } = useTheme();
  const { locale } = useLocale();
  const { status, user, update, signOut } = useSession();
  const signIn = useSignIn();
  const account = useTurnkeyAccount();
  const networkSwitch = useNetworkSwitch();
  const [hidden, setHidden] = useHideBalances();
  const feedback = useFeedbackPreferences();
  const currencyName = useCurrencyName();
  const [languageOpen, setLanguageOpen] = React.useState(false);
  const [currencyOpen, setCurrencyOpen] = React.useState(false);
  const [saveFailed, setSaveFailed] = React.useState(false);
  const signedIn = status === "account";
  const network = networkSwitch.network;
  const scope = `${user?.id ?? GUEST_SEED}:${network}`;

  // The two money rows read their live values; a guest has neither.
  const [budget, setBudget] = React.useState<Loaded<{ text: string }>>();
  const [agentBalance, setAgentBalance] = React.useState<Loaded<string>>();
  React.useEffect(() => {
    if (!signedIn) return undefined;
    let current = true;
    setBudget(undefined);
    setAgentBalance(undefined);
    // "$2 of $200": dollars, short, so the row never cuts its own value off.
    const usd = (base: string) => formatUsd(BigInt(base), locale);
    api.budget
      .get()
      .then(({ budget: view }) => {
        if (!current) return;
        if (!view) return setBudget({ text: t("settings.budgetNone") });
        if (view.paused) return setBudget({ text: t("settings.budgetPaused") });
        setBudget({
          text: t("settings.budgetUsed", { spent: usd(view.spentThisWeek), limit: usd(view.policy.weeklyCap) }),
        });
      })
      .catch(() => current && setBudget(null));
    api.marketplace
      .wallet()
      .then((view) => current && setAgentBalance(usd(view.balances.total)))
      .catch(() => current && setAgentBalance(null));
    return () => {
      current = false;
    };
    // Re-read per account and network; the words follow the language through `t`.
  }, [signedIn, scope, locale, t]);

  const name = !signedIn
    ? t("common.guest")
    : user?.handle
      ? `@${user.handle}`
      : (user?.email?.split("@")[0] ?? t("common.guest"));
  const displayCurrency = (user?.displayCurrency || "USD").toUpperCase();
  const arc = arcIdentity(network);

  const changeFeedback = (key: "sounds" | "haptics" | "narration", enabled: boolean) => {
    setSaveFailed(false);
    if (key === "sounds" && !enabled) stopInterfaceSounds();
    void setFeedbackPreference(key, enabled).catch(() => setSaveFailed(true));
  };
  const leave = async () => {
    await account.signOutTurnkey();
    await signOut();
    router.replace("/welcome");
  };
  /** A row that needs an account sends a guest to sign in instead. */
  const go = (href: Parameters<typeof router.push>[0]) => (signedIn ? router.push(href) : signIn.open());

  return (
    <View style={[styles.screen, { backgroundColor: color.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: wide ? WIDE_TOP : insets.top + SPACE.lg, paddingBottom: clearance.scroll },
          wide ? styles.wide : null,
        ]}
      >
        <Text accessibilityRole="header" style={[TYPE.pageTitle, { color: color.ink }]}>
          {t("settings.title")}
        </Text>

        <View style={styles.profile}>
          <DefaultAvatar seed={user?.id ?? GUEST_SEED} size={AVATAR} label={name} />
          <View style={styles.grow}>
            <Text numberOfLines={1} style={[TYPE.rowTitle, { color: color.ink }]}>
              {name}
            </Text>
            <Text numberOfLines={1} style={[TYPE.rowDetail, { color: color.text3 }]}>
              {signedIn ? (user?.email ?? "") : t("settings.guestBody")}
            </Text>
          </View>
        </View>
        {!signedIn ? <Button label={t("signIn.title")} onPress={() => signIn.open()} /> : null}

        <Group title={t("settings.money")}>
          <ListRow
            leading={<Glyph icon={Gauge} />}
            title={t("settings.budget")}
            trailing={signedIn ? <Value text={budget === null ? t("settings.loadFailed") : budget?.text} loading={budget === undefined} /> : undefined}
            onPress={() => go("/budget" as never)}
          />
          <ListRow
            leading={<Mark entity={arc.usdc} size={GLYPH_PLATE} />}
            title={t("settings.agentWallet")}
            trailing={signedIn ? <Value text={agentBalance === null ? t("settings.loadFailed") : agentBalance} loading={agentBalance === undefined} /> : undefined}
            onPress={() => go("/agent-wallet")}
          />
          <ListRow leading={<Glyph icon={BookUser} />} title={t("settings.contacts")} onPress={() => go("/contacts")} />
          <ListRow leading={<Glyph icon={CalendarClock} />} title={t("settings.automations")} onPress={() => go("/automations")} />
          <ListRow
            leading={<Glyph icon={Coins} />}
            title={t("settings.displayCurrency")}
            trailing={<Value text={currencyName(displayCurrency)} />}
            onPress={() => setCurrencyOpen(true)}
          />
        </Group>

        <Group title={t("settings.app")}>
          <ListRow
            leading={<Mark entity={arc.chain} size={GLYPH_PLATE} />}
            title={t("settings.network")}
            trailing={
              <ModeCapsule
                network={network}
                label={network === "testnet" ? t("network.testnet") : t("network.mainnet")}
                switchLabel={t("network.switchTo", { network: networkSwitch.nextName })}
                busy={networkSwitch.busy}
                compact
                onToggle={networkSwitch.toggle}
              />
            }
          />
          <ListRow
            leading={<Glyph icon={Globe} />}
            title={t("settings.language")}
            trailing={<Value text={LANGUAGE_NAMES[locale]} />}
            onPress={() => setLanguageOpen(true)}
          />
          <View style={styles.segmentRow}>
            <View style={styles.segmentHead}>
              <Glyph icon={Palette} />
              <Text style={[TYPE.row, { color: color.ink }]}>{t("settings.theme")}</Text>
            </View>
            <Segmented
              label={t("settings.theme")}
              value={user?.theme ?? "system"}
              onChange={(value) => void update({ theme: value })}
              options={[
                { value: "system", label: t("settings.themeSystem") },
                { value: "light", label: t("settings.themeLight") },
                { value: "dark", label: t("settings.themeDark") },
              ]}
            />
          </View>
          <ListRow
            leading={<Glyph icon={Volume2} />}
            title={t("settings.sound")}
            trailing={<Switch value={feedback.sounds} onValueChange={(on) => changeFeedback("sounds", on)} accessibilityLabel={t("settings.sound")} />}
          />
          <ListRow
            leading={<Glyph icon={Vibrate} />}
            title={t("settings.haptics")}
            trailing={<Switch value={feedback.haptics} onValueChange={(on) => changeFeedback("haptics", on)} accessibilityLabel={t("settings.haptics")} />}
          />
          <ListRow
            leading={<Glyph icon={EyeOff} />}
            title={t("settings.hideBalances")}
            trailing={<Switch value={hidden} onValueChange={setHidden} accessibilityLabel={t("settings.hideBalances")} />}
          />
          <ListRow
            leading={<Glyph icon={Mic} />}
            title={t("settings.voice")}
            trailing={<Value text={voiceName(user?.voicePrefs?.voice ?? DEFAULT_VOICE_PREFS.voice)} />}
            onPress={() => go("/voice-settings")}
          />
          <ListRow leading={<Glyph icon={Bell} />} title={t("settings.notifications")} onPress={() => go("/notifications")} />
          <ListRow leading={<Glyph icon={Brain} />} title={t("settings.memory")} onPress={() => go("/memory")} />
          <ListRow
            leading={<Glyph icon={BookOpenText} />}
            title={t("settings.narration")}
            trailing={<Switch value={feedback.narration} onValueChange={(on) => changeFeedback("narration", on)} accessibilityLabel={t("settings.narration")} />}
          />
        </Group>
        {saveFailed ? (
          <Text accessibilityRole="alert" style={[TYPE.rowDetail, { color: color.destructive }]}>
            {t("feedback.saveFailed")}
          </Text>
        ) : null}

        <Group title={t("settings.help")}>
          <ListRow leading={<Glyph icon={ShieldCheck} />} title={t("settings.privacy")} onPress={() => go("/privacy")} />
          <ListRow leading={<Glyph icon={LifeBuoy} />} title={t("settings.trust")} onPress={() => router.push("/help")} />
          <ListRow
            title={t("settings.version")}
            trailing={
              <Value
                text={
                  Application.nativeApplicationVersion
                    ? `${Application.nativeApplicationVersion} (${Application.nativeBuildVersion ?? "?"})`
                    : t("common.appName")
                }
              />
            }
          />
        </Group>

        {signedIn ? (
          <Group title={t("settings.account")}>
            <ListRow
              leading={<Glyph icon={AtSign} />}
              title={t("handle.row")}
              trailing={<Value text={user?.handle ? `@${user.handle}` : t("handle.none")} />}
              onPress={() => router.push({ pathname: "/handle", params: { edit: "1" } })}
            />
            <ListRow
              leading={<Glyph icon={Mail} />}
              title={t("settings.email")}
              trailing={<Value text={user?.email ?? undefined} />}
              onPress={() => router.push("/account")}
            />
            <ListRow leading={<Glyph icon={KeyRound} />} title={t("settings.devices")} onPress={() => router.push("/account/devices")} />
            <ListRow leading={<Glyph icon={LogOut} tint={color.destructive} />} title={t("settings.signOut")} onPress={() => void leave()} />
            <ListRow
              leading={<Glyph icon={Trash2} tint={color.destructive} />}
              title={t("settings.deleteAccount")}
              onPress={() => router.push("/account/delete")}
            />
          </Group>
        ) : null}
      </ScrollView>

      <LanguageSheet open={languageOpen} onClose={() => setLanguageOpen(false)} />
      <CurrencySheet open={currencyOpen} onClose={() => setCurrencyOpen(false)} />
      <MainnetConsentSheet
        open={networkSwitch.consentNeeded}
        busy={networkSwitch.busy}
        onAccept={() => void networkSwitch.acceptMainnet()}
        onClose={networkSwitch.dismissConsent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { gap: SPACE.xl, paddingHorizontal: SPACE.inset },
  wide: { width: "100%", maxWidth: WIDE_COLUMN_PX, alignSelf: "center" },
  profile: { flexDirection: "row", alignItems: "center", gap: SPACE.lg },
  grow: { flex: 1, minWidth: 0, gap: SPACE.xxs },
  group: { gap: SPACE.sm },
  label: { paddingHorizontal: SPACE.xs },
  glyph: {
    width: GLYPH_PLATE,
    height: GLYPH_PLATE,
    borderRadius: RADIUS.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  value: { maxWidth: VALUE_MAX_W },
  segmentRow: { gap: SPACE.md, paddingHorizontal: SPACE.lg, paddingVertical: SPACE.md },
  segmentHead: { flexDirection: "row", alignItems: "center", gap: SPACE.md },
});
