// Wallet setup (journey 4; Solflare C08/S11/S13, Phantom P10, M18): one page in three moments. First the
// automatic steps — the wallet is created, then set up on the active network through the relayer (nothing to pay)
// — each with its own retry. Then the Face ID primer, once, right before the only tap: "Accept with Face ID" signs
// the daily allowance ("Not now" leaves it for later; home's first steps keep the way back). Then "You're all
// set": the silver flag waves once — only after the allowance is on chain — and the authority receipt says in
// plain words what Kawase can and can never do, decoded from the signed grant. Continue records the terms.
import * as Haptics from "expo-haptics";
import { Redirect, useRouter } from "expo-router";
import * as React from "react";
import { ActivityIndicator, Platform, ScrollView, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { GrantReceipt } from "@kawase/api-client";
import { DEFAULT_LIMITS, TERMS_VERSION } from "@kawase/config";
import { amount, formatAmount } from "@kawase/money";
import { Flag } from "@kawase/ui-native/components/art/flag";
import { Hanko } from "@kawase/ui-native/components/art/hanko";
import { Koban } from "@kawase/ui-native/components/art/koban";
import { AuthorityReceipt } from "@kawase/ui-native/components/authority-receipt";
import { SetupSteps, type SetupStep } from "@kawase/ui-native/components/setup-steps";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { OnboardingBar } from "@/components/onboarding-bar";
import { useLocale } from "@/i18n/locale-provider";
import { useT } from "@/i18n";
import { api } from "@/session/api";
import { useSession } from "@/session/session-provider";
import { useSignIn } from "@/sign-in/sign-in-provider";
import { useThemeColors } from "@/theme/use-theme-colors";
import { authorityText } from "@/wallet/authority";
import { biometricKind, type BiometricKind } from "@/wallet/biometric";
import { useWalletSetup } from "@/wallet/use-wallet-setup";

const EDGE_INSET = 12;
const FOOTER_GAP = 16;
const KOBAN_WIDTH = 72;
const HANKO_SIZE = 168;
const FLAG_WIDTH = 220;
/** The onboarding steps after sign-in: handle · wallet · allowance. */
const ONBOARDING_STEPS = 3;
const WALLET_STEP = 1;
const ALLOWANCE_STEP = 2;
const PHASE_FADE_MS = 220;

type Phase = "steps" | "primer" | "done";

export function SetupScreen() {
  const { t } = useT();
  const { locale } = useLocale();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const signIn = useSignIn();
  const { status, user } = useSession();
  const network = user?.activeNetwork ?? "testnet";
  const setup = useWalletSetup(network);
  const [kind, setKind] = React.useState<BiometricKind>("faceId");
  const [receipt, setReceipt] = React.useState<GrantReceipt>();
  const [acceptError, setAcceptError] = React.useState(false);
  const [leaving, setLeaving] = React.useState(false);
  // An allowance that was already on when this page opened belongs to a returning account: nothing to set up.
  const arrivedDone = React.useRef<boolean | undefined>(undefined);

  React.useEffect(() => {
    void biometricKind().then(setKind);
  }, []);

  React.useEffect(() => {
    if (status === "guest") signIn.open();
  }, [status, signIn]);

  if (setup.loaded && arrivedDone.current === undefined) arrivedDone.current = Boolean(setup.allowance);

  if (status === "guest") return <Redirect href="/" />;
  if (arrivedDone.current && !receipt) return <Redirect href="/" />;

  const phase: Phase = receipt ? "done" : setup.setUp && setup.hasWallet ? "primer" : "steps";
  const networkName = network === "testnet" ? t("network.arcTestnet") : t("network.arc");
  const daily = formatAmount(amount("USDC", DEFAULT_LIMITS[network].daily), locale);
  const acceptLabel = kind === "faceId" ? t("setup.acceptFaceId") : kind === "touchId" ? t("setup.acceptTouchId") : kind === "fingerprint" ? t("setup.acceptFingerprint") : t("wallet.allowanceAccept");
  const goHome = () => router.replace("/");
  const leading = router.canGoBack() ? { kind: "back" as const, onPress: () => router.back() } : { kind: "close" as const, onPress: goHome };

  const steps: SetupStep[] = [
    {
      key: "wallet",
      label: t("setup.stepWallet"),
      state: setup.hasWallet ? "done" : setup.failed.wallet ? "failed" : setup.running === "wallet" || !setup.loaded ? "running" : "waiting",
      detail: setup.failed.wallet ? t("setup.failed") : setup.running === "wallet" ? t("wallet.creating") : undefined,
      onRetry: () => void setup.retry.wallet(),
    },
    {
      key: "setup",
      label: t("setup.stepNetwork", { network: networkName }),
      state: setup.setUp ? "done" : setup.failed.setup ? "failed" : setup.running === "setup" ? "running" : "waiting",
      detail: setup.failed.setup ? t("setup.failed") : setup.running === "setup" ? t("setup.settingUpDetail") : undefined,
      onRetry: () => void setup.retry.setup(),
    },
    { key: "allowance", label: t("home.stepApproveAllowance"), state: "waiting" },
  ];

  const accept = async () => {
    setAcceptError(false);
    const result = await setup.acceptAllowance({ message: t("setup.faceIdPrompt", { amount: daily }), cancel: t("common.cancel") });
    if (result.status === "accepted") {
      setReceipt(result.receipt);
      if (Platform.OS !== "web") void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else if (result.status === "failed") setAcceptError(true);
  };

  const finish = async () => {
    setLeaving(true);
    // The consent is a record, not a gate: a failure to store it must not strand the person here.
    await api.me.consent({ kind: "terms", version: TERMS_VERSION, locale }).catch(() => undefined);
    goHome();
  };

  const authority = receipt ? authorityText(receipt, network, t, locale) : undefined;
  const accepting = setup.running === "allowance";

  return (
    <View className="bg-background flex-1" style={{ paddingTop: insets.top + EDGE_INSET }}>
      <View className="px-5">
        {phase === "done" ? <View className="min-h-11" /> : <OnboardingBar leading={leading} step={{ index: phase === "primer" ? ALLOWANCE_STEP : WALLET_STEP, total: ONBOARDING_STEPS }} />}
      </View>

      {phase === "steps" ? (
        <Animated.View key="steps" entering={FadeIn.duration(PHASE_FADE_MS)} exiting={FadeOut.duration(PHASE_FADE_MS)} className="flex-1 gap-6 px-5 pt-6">
          <Koban width={KOBAN_WIDTH} id="setup-koban" rotate={-10} />
          <View className="gap-2">
            <Text className={cn("font-display text-foreground text-3xl font-bold", TEXT_START)}>{t("setup.title")}</Text>
            <Text className={cn("text-muted-foreground text-base leading-6", TEXT_START)}>{t("setup.subtitle", { network: networkName })}</Text>
          </View>
          <SetupSteps steps={steps} retryLabel={t("common.retry")} spinnerColor={colors["muted-foreground"]} />
        </Animated.View>
      ) : null}

      {phase === "primer" ? (
        <Animated.View key="primer" entering={FadeIn.duration(PHASE_FADE_MS)} exiting={FadeOut.duration(PHASE_FADE_MS)} className="flex-1">
          <View className="flex-1 items-center justify-center gap-6 px-6">
            <Hanko size={HANKO_SIZE} id="setup-hanko" />
            <View className="gap-3">
              <Text className="font-display text-foreground text-center text-3xl font-bold">{t("setup.primerTitle")}</Text>
              <Text className="text-muted-foreground text-center text-base leading-6">{t("setup.primerBody", { amount: daily })}</Text>
            </View>
          </View>
          <View className="gap-2 px-5" style={{ paddingBottom: insets.bottom + FOOTER_GAP }}>
            {acceptError ? <Text className="text-destructive pb-1 text-center text-sm">{t("setup.failed")}</Text> : null}
            <Button size="lg" disabled={accepting} onPress={() => void accept()}>
              {accepting ? <ActivityIndicator color={colors["primary-foreground"]} /> : null}
              <Text>{accepting ? t("setup.approving") : acceptLabel}</Text>
            </Button>
            <Button variant="ghost" disabled={accepting} onPress={goHome}>
              <Text className="text-muted-foreground">{t("setup.notNow")}</Text>
            </Button>
          </View>
        </Animated.View>
      ) : null}

      {phase === "done" && authority ? (
        <Animated.View key="done" entering={FadeIn.duration(PHASE_FADE_MS)} className="flex-1">
          <ScrollView className="flex-1" contentContainerClassName="items-center gap-6 px-5 pb-6">
            <Flag width={FLAG_WIDTH} id="setup-flag" wave />
            <View className="gap-2">
              <Text className="font-display text-foreground text-center text-3xl font-bold">{t("setup.doneTitle")}</Text>
              <Text className="text-muted-foreground text-center text-base leading-6">{t("setup.doneBody", { network: networkName })}</Text>
            </View>
            <AuthorityReceipt className="w-full" {...authority} />
          </ScrollView>
          <View className="gap-3 px-5 pt-2" style={{ paddingBottom: insets.bottom + FOOTER_GAP }}>
            <Text className="text-muted-foreground text-center text-xs">{t("setup.terms")}</Text>
            <Button size="lg" disabled={leaving} onPress={() => void finish()}>
              <Text>{t("common.continue")}</Text>
            </Button>
          </View>
        </Animated.View>
      ) : null}
    </View>
  );
}
