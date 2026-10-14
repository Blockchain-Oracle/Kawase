// Wallet setup (journey 4; Solflare C08/S11/S13, Phantom P10, M18): one page in three moments. First the
// automatic steps — the wallet is created, then set up on the active network through the relayer (nothing to pay)
// — each with its own retry; a wallet that cannot even be read says so with a Retry instead of spinning. Then
// "What you're allowing", once, right before the only tap: the authority receipt of the allowance the api
// proposes, decoded from its caveats, is the main content, and exactly that is what the device check approves and
// the wallet signs (Codex review R02). The button and the system prompt name the device's real check, and a
// cancel, a mismatch or a device with nothing to check with is said plainly and signs nothing (R03). "Not now"
// leaves it for later. Then "You're all set": the flag waves once — only after the allowance is accepted — over
// the accepted receipt. Continue records the terms.
import { Redirect, useRouter } from "expo-router";
import * as React from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { TERMS_VERSION } from "@kawase/config";
import { Koban } from "@kawase/ui-native/components/art/koban";
import { SetupSteps, type SetupStep } from "@kawase/ui-native/components/setup-steps";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { OnboardingBar } from "@/components/onboarding-bar";
import { useLocale } from "@/i18n/locale-provider";
import { BudgetIntro } from "@/budget/budget-intro";
import { useT } from "@/i18n";
import { finishOnboarding, forgetReturnTo } from "@/onboarding/continuation";
import { deferredAction } from "@/onboarding/deferred-action";
import { markNotificationsOwed } from "@/onboarding/notifications-ask";
import { arcIdentity } from "@kawase/identity";
import { Mark } from "@kawase/ui-native/components/mark";
import { Button as KitButton } from "@/components/kit/Button";
import { ListRow } from "@/components/kit/ListRow";
import { Panel } from "@/components/kit/Surface";
import { SIZE, SPACE, TYPE, useTheme as useKitTheme } from "@/components/kit/theme";
import { fire } from "@/feedback/fire";
import { StyleSheet } from "react-native";
import { api } from "@/session/api";
import { useSession } from "@/session/session-provider";
import { useSignIn } from "@/sign-in/sign-in-provider";
import { useThemeColors } from "@/theme/use-theme-colors";
import { useWalletSetup } from "@/wallet/use-wallet-setup";

const EDGE_INSET = 12;
const FOOTER_GAP = 16;
const KOBAN_WIDTH = 72;
/** The onboarding steps after sign-in: handle · wallet · weekly budget · the first job. */
const ONBOARDING_STEPS = 4;
const WALLET_STEP = 1;
const BUDGET_STEP = 2;
const FIRST_JOB_STEP = 3;
const PHASE_FADE_MS = 220;
/** One quiet second try of the terms record before saying it failed. */
const CONSENT_RETRY_MS = 800;

type Phase = "steps" | "budget" | "first";

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
  const [leaving, setLeaving] = React.useState(false);
  const [consentFailed, setConsentFailed] = React.useState(false);
  /** Setup's last step: the first real agent run (unless the person was already on their way to an action). */
  const [firstJob, setFirstJob] = React.useState(false);
  // An allowance that was already on when this page opened belongs to a returning account: nothing to set up.
  const arrivedDone = React.useRef<boolean | undefined>(undefined);

  React.useEffect(() => {
    if (status === "guest") signIn.open();
  }, [status, signIn]);

  if (setup.loaded && arrivedDone.current === undefined) arrivedDone.current = Boolean(setup.allowance);
  // Nothing to set up: back to where sign-in began (review R07), not always home.
  const nothingToDo = Boolean(arrivedDone.current);
  React.useEffect(() => {
    if (nothingToDo && status !== "guest") finishOnboarding();
  }, [nothingToDo, status]);

  if (status === "guest") return <Redirect href="/" />;
  if (nothingToDo) return null;

  // After the wallet is set up, the weekly budget (D38) — never the old daily allowance that could pay anyone.
  const phase: Phase = firstJob ? "first" : setup.setUp && setup.hasWallet ? "budget" : "steps";
  const networkName = network === "testnet" ? t("network.arcTestnet") : t("network.arc");
  const goHome = () => finishOnboarding();
  /**
   * Leaves setup. Its last step is the first real agent run — unless a money action the person tapped as a guest is
   * waiting, which is their first real action and opens as soon as setup ends. Notifications are asked after either.
   */
  const leaveSetup = () => {
    markNotificationsOwed();
    if (deferredAction()) return goHome();
    setFirstJob(true);
  };
  const startJob = (prompt: string) => {
    fire("press");
    forgetReturnTo();
    if (router.canDismiss()) router.dismissAll();
    // Home is the agent: the first job runs there, as the run card, and stays in its feed.
    router.replace({ pathname: "/", params: { run: prompt } });
  };
  const leading = router.canGoBack()
    ? { kind: "back" as const, onPress: () => router.back() }
    : { kind: "close" as const, onPress: goHome };

  const steps: SetupStep[] = [
    {
      key: "wallet",
      label: t("setup.stepWallet"),
      // A wallet that could not be read is a load failure with its own Retry, not a step "running" forever.
      state: setup.hasWallet
        ? "done"
        : setup.failed.wallet || (!setup.loaded && setup.loadError)
          ? "failed"
          : setup.running === "wallet" || !setup.loaded
            ? "running"
            : "waiting",
      detail:
        !setup.loaded && setup.loadError
          ? t("errors.walletLoadFailed")
          : setup.failed.wallet
            ? t("setup.failed")
            : setup.running === "wallet"
              ? t("wallet.creating")
              : undefined,
      onRetry: () => void (!setup.loaded && setup.loadError ? setup.refresh() : setup.retry.wallet()),
    },
    {
      key: "setup",
      label: t("setup.stepNetwork", { network: networkName }),
      state: setup.setUp ? "done" : setup.failed.setup ? "failed" : setup.running === "setup" ? "running" : "waiting",
      detail: setup.failed.setup
        ? setup.notReady
          ? t("setup.notReady", { network: networkName })
          : t("setup.failed")
        : setup.running === "setup"
          ? t("setup.settingUpDetail")
          : undefined,
      onRetry: () => void setup.retry.setup(),
    },
    { key: "budget", label: t("budget.intro.eyebrow"), state: "waiting" },
  ];

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
      leaveSetup();
    } catch {
      setConsentFailed(true);
      setLeaving(false);
    }
  };

  return (
    <View className="bg-background flex-1" style={{ paddingTop: insets.top + EDGE_INSET }}>
      <View className="px-5">
        {/* The language pill stays on the completion too; there is nothing to go back to once the allowance is on. */}
        <OnboardingBar
          leading={leading}
          step={{
            index: phase === "steps" ? WALLET_STEP : phase === "first" ? FIRST_JOB_STEP : BUDGET_STEP,
            total: ONBOARDING_STEPS,
          }}
        />
      </View>

      {phase === "steps" ? (
        <Animated.View
          key="steps"
          entering={FadeIn.duration(PHASE_FADE_MS)}
          exiting={FadeOut.duration(PHASE_FADE_MS)}
          className="flex-1 gap-6 px-5 pt-6"
        >
          <Koban width={KOBAN_WIDTH} id="setup-koban" rotate={-10} />
          <View className="gap-2">
            <Text className={cn("font-display text-foreground text-3xl font-bold", TEXT_START)}>
              {t("setup.title")}
            </Text>
            <Text className={cn("text-muted-foreground text-base leading-6", TEXT_START)}>
              {t("setup.subtitle", { network: networkName })}
            </Text>
          </View>
          <SetupSteps steps={steps} retryLabel={t("common.retry")} spinnerColor={colors["muted-foreground"]} />
        </Animated.View>
      ) : null}

      {phase === "budget" ? (
        <Animated.View
          key="budget"
          entering={FadeIn.duration(PHASE_FADE_MS)}
          exiting={FadeOut.duration(PHASE_FADE_MS)}
          style={[kit.budget, { paddingBottom: insets.bottom + FOOTER_GAP }]}
        >
          <BudgetIntro onDone={() => void finish()} onSkip={() => void finish()} />
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
          {leaving ? <ActivityIndicator color={colors.foreground} /> : null}
        </Animated.View>
      ) : null}

      {phase === "first" ? (
        <Animated.View key="first" entering={FadeIn.duration(PHASE_FADE_MS)} style={kit.first}>
          <FirstJob network={network} onStart={startJob} onLater={goHome} bottom={insets.bottom + FOOTER_GAP} />
        </Animated.View>
      ) : null}
    </View>
  );
}

/**
 * Setup's last step (Senryo: "the first call is the celebration, no done page"): three real first jobs for Kawase,
 * worded as the request itself, so a tap sends exactly that to the agent and the person watches it run.
 */
function FirstJob({
  network,
  onStart,
  onLater,
  bottom,
}: {
  network: "mainnet" | "testnet";
  onStart: (prompt: string) => void;
  onLater: () => void;
  bottom: number;
}) {
  const { t } = useT();
  const { color } = useKitTheme();
  const arc = arcIdentity(network);
  const jobs =
    network === "testnet"
      ? [
          { prompt: t("setup.firstRunFaucet"), leading: <Mark entity="provider:circle" size={SIZE.markRow} /> },
          { prompt: t("setup.firstRunTour"), leading: <Mark entity={arc.chain} size={SIZE.markRow} /> },
          { prompt: t("setup.firstRunBring"), leading: <Mark entity={arc.usdc} size={SIZE.markRow} chainBadge={arc.chain} /> },
        ]
      : [
          { prompt: t("setup.firstRunBring"), leading: <Mark entity={arc.usdc} size={SIZE.markRow} chainBadge={arc.chain} /> },
          { prompt: t("setup.firstRunIdle"), leading: <Mark entity="provider:aave" size={SIZE.markRow} /> },
          { prompt: t("setup.firstRunTour"), leading: <Mark entity={arc.chain} size={SIZE.markRow} /> },
        ];
  return (
    <>
      <ScrollView contentContainerStyle={kit.firstBody}>
        <Text accessibilityRole="header" style={[TYPE.pageTitle, { color: color.ink }]}>
          {t("setup.firstRunTitle")}
        </Text>
        <Text style={[TYPE.body, { color: color.text2 }]}>{t("setup.firstRunBody")}</Text>
        <Panel>
          {jobs.map((job) => (
            <ListRow key={job.prompt} leading={job.leading} title={job.prompt} onPress={() => onStart(job.prompt)} />
          ))}
        </Panel>
      </ScrollView>
      <View style={[kit.firstFooter, { paddingBottom: bottom }]}>
        <KitButton label={t("setup.firstRunLater")} variant="ghost" onPress={onLater} />
      </View>
    </>
  );
}

const kit = StyleSheet.create({
  first: { flex: 1 },
  budget: { flex: 1, gap: SPACE.md, paddingHorizontal: SPACE.inset, paddingTop: SPACE.xl },
  firstBody: { gap: SPACE.lg, paddingHorizontal: SPACE.inset, paddingTop: SPACE.xl, paddingBottom: SPACE.xl },
  firstFooter: { paddingHorizontal: SPACE.inset, paddingTop: SPACE.sm },
});
