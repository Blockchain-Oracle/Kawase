// Wallet setup (journey 4; Solflare C08/S11/S13, Phantom P10, M18): one page in three moments. First the
// automatic steps — the wallet is created, then set up on the active network through the relayer (nothing to pay)
// — each with its own retry; a wallet that cannot even be read says so with a Retry instead of spinning. Then
// "What you're allowing", once, right before the only tap: the authority receipt of the allowance the api
// proposes, decoded from its caveats, is the main content, and exactly that is what the device check approves and
// the wallet signs (Codex review R02). The button and the system prompt name the device's real check, and a
// cancel, a mismatch or a device with nothing to check with is said plainly and signs nothing (R03). "Not now"
// leaves it for later. Then "You're all set": the flag waves once — only after the allowance is accepted — over
// the accepted receipt. Continue records the terms.
import * as Haptics from "expo-haptics";
import { Redirect, useRouter } from "expo-router";
import * as React from "react";
import { ActivityIndicator, Platform, ScrollView, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { GrantReceipt } from "@kawase/api-client";
import { TERMS_VERSION } from "@kawase/config";
import { amount, formatAmount } from "@kawase/money";
import { Flag } from "@kawase/ui-native/components/art/flag";
import { Hanko } from "@kawase/ui-native/components/art/hanko";
import { Koban } from "@kawase/ui-native/components/art/koban";
import { AuthorityReceipt } from "@kawase/ui-native/components/authority-receipt";
import { Skeleton } from "@kawase/ui-native/components/ui/skeleton";
import { SetupSteps, type SetupStep } from "@kawase/ui-native/components/setup-steps";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { OnboardingBar } from "@/components/onboarding-bar";
import { useLocale } from "@/i18n/locale-provider";
import { useT } from "@/i18n";
import { finishOnboarding } from "@/onboarding/continuation";
import { api } from "@/session/api";
import { useSession } from "@/session/session-provider";
import { useSignIn } from "@/sign-in/sign-in-provider";
import { useThemeColors } from "@/theme/use-theme-colors";
import { authorityText } from "@/wallet/authority";
import { biometricKind, type BiometricKind } from "@/wallet/biometric";
import { useWalletSetup, type AcceptResult } from "@/wallet/use-wallet-setup";

const EDGE_INSET = 12;
const FOOTER_GAP = 16;
const KOBAN_WIDTH = 72;
const HANKO_SIZE = 64;
const SKELETON_ROWS = 3;
const USDC_UNIT = 1_000_000n;
const ZERO = 0n;
const FLAG_WIDTH = 220;
/** The onboarding steps after sign-in: handle · wallet · allowance. */
const ONBOARDING_STEPS = 3;
const WALLET_STEP = 1;
const ALLOWANCE_STEP = 2;
const PHASE_FADE_MS = 220;
/** One quiet second try of the terms record before saying it failed. */
const CONSENT_RETRY_MS = 800;

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
  /** What the last approval attempt ended as, when it did not succeed. */
  const [outcome, setOutcome] = React.useState<Exclude<AcceptResult["status"], "accepted">>();
  const [leaving, setLeaving] = React.useState(false);
  const [consentFailed, setConsentFailed] = React.useState(false);
  // An allowance that was already on when this page opened belongs to a returning account: nothing to set up.
  const arrivedDone = React.useRef<boolean | undefined>(undefined);

  React.useEffect(() => {
    void biometricKind().then(setKind);
  }, []);

  React.useEffect(() => {
    if (status === "guest") signIn.open();
  }, [status, signIn]);

  if (setup.loaded && arrivedDone.current === undefined) arrivedDone.current = Boolean(setup.allowance);
  // Nothing to set up: back to where sign-in began (review R07), not always home.
  const nothingToDo = Boolean(arrivedDone.current) && !receipt;
  React.useEffect(() => {
    if (nothingToDo && status !== "guest") finishOnboarding();
  }, [nothingToDo, status]);

  if (status === "guest") return <Redirect href="/" />;
  if (nothingToDo) return null;

  const phase: Phase = receipt ? "done" : setup.setUp && setup.hasWallet ? "primer" : "steps";
  const networkName = network === "testnet" ? t("network.arcTestnet") : t("network.arc");
  // The amount in the system prompt is the proposal's own, never a default from config.
  const proposed = BigInt(setup.proposal?.receipt.amountPerPeriod ?? "0");
  const perPeriod = formatAmount(amount("USDC", proposed), locale, proposed % USDC_UNIT === ZERO ? { fractionDigits: 0 } : {});
  const acceptLabel = {
    faceId: t("setup.acceptFaceId"),
    touchId: t("setup.acceptTouchId"),
    face: t("setup.acceptFace"),
    fingerprint: t("setup.acceptFingerprint"),
    passcode: t("setup.acceptPasscode"),
    emailCode: t("setup.acceptEmailCode"),
    none: t("wallet.allowanceAccept"),
  }[kind];
  const cannotCheck = kind === "none";
  const goHome = () => finishOnboarding();
  const leading = router.canGoBack() ? { kind: "back" as const, onPress: () => router.back() } : { kind: "close" as const, onPress: goHome };

  const steps: SetupStep[] = [
    {
      key: "wallet",
      label: t("setup.stepWallet"),
      // A wallet that could not be read is a load failure with its own Retry, not a step "running" forever.
      state: setup.hasWallet ? "done" : setup.failed.wallet || (!setup.loaded && setup.loadError) ? "failed" : setup.running === "wallet" || !setup.loaded ? "running" : "waiting",
      detail: !setup.loaded && setup.loadError ? t("errors.walletLoadFailed") : setup.failed.wallet ? t("setup.failed") : setup.running === "wallet" ? t("wallet.creating") : undefined,
      onRetry: () => void (!setup.loaded && setup.loadError ? setup.refresh() : setup.retry.wallet()),
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
    setOutcome(undefined);
    const result = await setup.acceptAllowance({ message: t("setup.faceIdPrompt", { amount: perPeriod }), cancel: t("common.cancel") });
    if (result.status === "accepted") {
      setReceipt(result.receipt);
      if (Platform.OS !== "web") void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else setOutcome(result.status);
  };

  const outcomeText = {
    refreshed: t("errors.scopeRefreshed"),
    cancelled: t("errors.notSigned"),
    unavailable: t("errors.biometricUnavailable"),
    biometricFailed: t("errors.biometricFailed"),
    failed: t("setup.failed"),
  };

  // The agreement is a versioned record on the api (idempotent), kept before leaving: a failed write is tried once
  // more, then said with Continue as the retry — never dropped silently (Codex review R15).
  const finish = async () => {
    setLeaving(true);
    setConsentFailed(false);
    const record = () => api.me.consent({ kind: "terms", version: TERMS_VERSION, locale });
    try {
      await record().catch(async () => {
        await new Promise((resolve) => setTimeout(resolve, CONSENT_RETRY_MS));
        return record();
      });
      goHome();
    } catch {
      setConsentFailed(true);
      setLeaving(false);
    }
  };

  const authority = receipt ? authorityText(receipt, network, t, locale) : undefined;
  const proposalAuthority = setup.proposal ? authorityText(setup.proposal.receipt, network, t, locale) : undefined;
  const accepting = setup.running === "allowance";

  return (
    <View className="bg-background flex-1" style={{ paddingTop: insets.top + EDGE_INSET }}>
      <View className="px-5">
        {/* The language pill stays on the completion too; there is nothing to go back to once the allowance is on. */}
        <OnboardingBar leading={phase === "done" ? undefined : leading} step={{ index: phase === "steps" ? WALLET_STEP : ALLOWANCE_STEP, total: ONBOARDING_STEPS }} />
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
          <ScrollView className="flex-1" contentContainerClassName="gap-5 px-5 pb-6 pt-6">
            <Hanko size={HANKO_SIZE} id="setup-hanko" />
            <View className="gap-2">
              <Text accessibilityRole="header" className={cn("font-display text-foreground text-3xl font-bold", TEXT_START)}>
                {t("setup.scopeTitle")}
              </Text>
              <Text className={cn("text-muted-foreground text-base leading-6", TEXT_START)}>{t("setup.scopeBody")}</Text>
            </View>
            {proposalAuthority ? (
              <AuthorityReceipt className="w-full" {...proposalAuthority} />
            ) : setup.proposalError ? (
              <View className="bg-muted gap-3 rounded-2xl p-4">
                <Text className={cn("text-foreground text-base", TEXT_START)}>{t("errors.scopeLoadFailed")}</Text>
                <Button variant="secondary" onPress={() => void setup.prepareAllowance()}>
                  <Text>{t("common.retry")}</Text>
                </Button>
              </View>
            ) : (
              <View accessibilityLabel={t("common.loading")} className="bg-card border-border gap-3 rounded-3xl border p-4">
                {Array.from({ length: SKELETON_ROWS }, (_, row) => (
                  <Skeleton key={row} className="h-4 w-full rounded-md" />
                ))}
              </View>
            )}
          </ScrollView>
          <View className="gap-2 px-5 pt-2" style={{ paddingBottom: insets.bottom + FOOTER_GAP }}>
            {cannotCheck || outcome ? (
              <Text
                accessibilityRole="alert"
                className={cn("pb-1 text-center text-sm", outcome === "cancelled" || outcome === "refreshed" ? "text-muted-foreground" : "text-destructive")}
              >
                {cannotCheck ? t("errors.biometricUnavailable") : outcomeText[outcome!]}
              </Text>
            ) : null}
            <Button size="lg" disabled={accepting || !setup.proposal || setup.preparing || cannotCheck} onPress={() => void accept()}>
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
            {consentFailed ? (
              <Text accessibilityRole="alert" className="text-destructive text-center text-sm">
                {t("setup.termsFailed")}
              </Text>
            ) : null}
            <Text className="text-muted-foreground text-center text-xs">
              {`${t("setup.terms")} `}
              <Text accessibilityRole="link" onPress={() => router.push("/terms")} className="text-foreground text-xs underline">
                {t("setup.readTerms")}
              </Text>
            </Text>
            <Button size="lg" disabled={leaving} onPress={() => void finish()}>
              {leaving ? <ActivityIndicator color={colors["primary-foreground"]} /> : null}
              <Text>{consentFailed ? t("common.retry") : t("common.continue")}</Text>
            </Button>
          </View>
        </Animated.View>
      ) : null}
    </View>
  );
}
