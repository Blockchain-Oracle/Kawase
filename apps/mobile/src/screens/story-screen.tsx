// Story onboarding (journey 1; Solflare S01–S06 / M01): five panels that each show one product event (Codex review
// R10: request → exact payment, the allowance's boundary, practice money, your language, the first task), the
// language pill on the first panel and every panel after (it opens the language sheet; the story re-renders in
// place, reading direction included), and a footer that never moves: "Start" makes a guest and goes home, "I
// already have an account" opens the sign-in sheet over the story. If the guest cannot be made (offline, the api
// down), the story stays, says so, and Start tries again (review R08).
//
// Auto-advance reads at a reading pace and is never in the way (review R11): it stops on the last panel instead of
// sweeping back to the first; it holds while the person drags, while a sheet covers the story, while the screen is
// not focused or the app is in the background, while a screen reader is on, and with reduced motion; after any
// interaction the dwell starts again from zero. The art moves only while the story is actually on screen.
import { useFocusEffect, useRouter } from "expo-router";
import * as React from "react";
import { AccessibilityInfo, ActivityIndicator, AppState, useWindowDimensions, View } from "react-native";
import { useReducedMotionLive } from "@kawase/ui-native/lib/accessibility";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { DEFAULT_LIMITS, FAUCET, MOTION, type SupportedLocale } from "@kawase/config";
import { CATALOGS, isRtlLocale, LANGUAGE_NAMES } from "@kawase/i18n";
import { amount, formatAmount } from "@kawase/money";
import { StoryShell } from "@kawase/ui-native/components/story-shell";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Text } from "@kawase/ui-native/components/ui/text";

import { LanguageSheet } from "@/components/language-sheet";
import { useLocale } from "@/i18n/locale-provider";
import { useT } from "@/i18n";
import { STORY_INK, StoryLanguagePill, storyPanels } from "@/onboarding/story-panels";
import { useSession } from "@/session/session-provider";
import { useSignIn } from "@/sign-in/sign-in-provider";
import { useThemeColors } from "@/theme/use-theme-colors";

/** The canvas leaves room under it for a two-line title and the copy in every language (review R13 layout). */
const CANVAS_RATIO = 0.44;
const TOP_GAP = 8;
const PANEL_COUNT = 5;
const LAST_PANEL = PANEL_COUNT - 1;
/** Panel 4 shows the same request in the person's language and in two others, picked from this order. */
const SHOWCASE_LOCALES: readonly SupportedLocale[] = ["es", "ar", "zh", "fr", "hi", "en"];
const OTHER_REQUESTS = 2;
const EXAMPLE_SEND = "10";
const EXAMPLE_RECIPIENT = "@amina";

/** True while the app is in the foreground. */
function useAppActive() {
  const [active, setActive] = React.useState(AppState.currentState === "active");
  React.useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => setActive(state === "active"));
    return () => subscription.remove();
  }, []);
  return active;
}

/** True while VoiceOver / TalkBack is on: the person moves through the story themselves. */
function useScreenReader() {
  const [on, setOn] = React.useState(false);
  React.useEffect(() => {
    void AccessibilityInfo.isScreenReaderEnabled().then(setOn);
    const subscription = AccessibilityInfo.addEventListener("screenReaderChanged", setOn);
    return () => subscription.remove();
  }, []);
  return on;
}

export function StoryScreen() {
  const { t } = useT();
  const { locale } = useLocale();
  const { ensureGuest } = useSession();
  const signIn = useSignIn();
  const router = useRouter();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const reduced = useReducedMotionLive();
  const appActive = useAppActive();
  const screenReader = useScreenReader();
  const [focused, setFocused] = React.useState(true);
  const [index, setIndex] = React.useState(0);
  const [dragging, setDragging] = React.useState(false);
  const [interactions, setInteractions] = React.useState(0);
  const [languageOpen, setLanguageOpen] = React.useState(false);
  const [starting, setStarting] = React.useState(false);
  const [startFailed, setStartFailed] = React.useState(false);

  useFocusEffect(
    React.useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  const covered = languageOpen || signIn.isOpen;
  const visible = focused && appActive && !covered;
  const paused = reduced || screenReader || dragging || !visible;

  // One panel's dwell, restarted by every change and every interaction; the story rests on its last panel.
  React.useEffect(() => {
    if (paused || index >= LAST_PANEL) return undefined;
    const timer = setTimeout(() => setIndex((i) => Math.min(LAST_PANEL, i + 1)), MOTION.storyDwellMs);
    return () => clearTimeout(timer);
  }, [index, paused, interactions]);

  const onInteraction = React.useCallback((phase: "start" | "end") => {
    setDragging(phase === "start");
    if (phase === "end") setInteractions((n) => n + 1);
  }, []);
  const goTo = (next: number) => {
    setIndex(next);
    setInteractions((n) => n + 1);
  };

  const start = async () => {
    setStarting(true);
    setStartFailed(false);
    try {
      await ensureGuest(locale);
      router.replace("/");
    } catch {
      setStartFailed(true);
    } finally {
      setStarting(false);
    }
  };

  const money = (value: bigint) => formatAmount(amount("USDC", value), locale, { fractionDigits: 0 });
  const others = SHOWCASE_LOCALES.filter((candidate) => candidate !== locale)
    .slice(0, OTHER_REQUESTS)
    .map((candidate) => CATALOGS[candidate].story.exampleRequest);

  const panels = storyPanels(
    {
      panels: [
        { title: t("story.requestTitle"), body: t("story.requestBody") },
        { title: t("story.boundsTitle"), body: t("story.boundsBody") },
        { title: t("story.practiceTitle"), body: t("story.practiceBody") },
        { title: t("story.languageTitle"), body: t("story.languageBody") },
        { title: t("story.firstTitle"), body: t("story.firstBody") },
      ],
      example: t("story.example"),
      request: t("story.exampleRequest"),
      otherRequests: others,
      fields: { amount: t("story.fieldAmount"), to: t("story.fieldTo"), network: t("story.fieldNetwork") },
      typingNow: t("story.typingNow"),
      amount: `${EXAMPLE_SEND} USDC`,
      recipient: EXAMPLE_RECIPIENT,
      arc: t("network.arc"),
      arcTestnet: t("network.arcTestnet"),
      // The testnet default, labelled as such on the card: never an unqualified promise about real money.
      allowance: {
        amount: money(DEFAULT_LIMITS.testnet.daily),
        perDay: t("story.perDay"),
        inside: t("story.boundsInside"),
        above: t("story.boundsAbove"),
        never: t("story.boundsNever"),
      },
      practice: {
        faucetLine: t("story.faucetLine"),
        faucetAmount: `+${money(FAUCET.expected.USDC)}`,
        testMoney: t("story.testMoney"),
        realMoney: t("story.realMoney"),
      },
      sameMeaning: t("story.sameMeaning"),
      first: { step1: t("story.firstStep1"), step2: t("story.firstStep2") },
    },
    { active: index, animate: !reduced && visible },
  );

  return (
    <View className="bg-background flex-1" style={{ paddingTop: insets.top + TOP_GAP, paddingBottom: insets.bottom }}>
      <StoryShell
        panels={panels}
        index={index}
        onIndexChange={goTo}
        onInteraction={onInteraction}
        rtl={isRtlLocale(locale)}
        progressLabel={(n, total) => t("story.panelOf", { n, total })}
        segmentLabel={(n) => t("story.goTo", { n })}
        canvasHint={t("story.canvasHint")}
        canvasHeight={Math.round(height * CANVAS_RATIO)}
        ink={STORY_INK}
        topEnd={
          <StoryLanguagePill
            label={LANGUAGE_NAMES[locale]}
            accessibilityLabel={t("settings.language")}
            onPress={() => setLanguageOpen(true)}
          />
        }
        footer={
          <>
            {startFailed ? (
              <Text accessibilityRole="alert" className="text-destructive text-center text-sm">
                {t("errors.startFailed")}
              </Text>
            ) : null}
            <Button size="lg" disabled={starting} onPress={() => void start()}>
              {starting ? <ActivityIndicator color={colors["primary-foreground"]} /> : null}
              <Text className="text-center">{t("welcome.tryFirst")}</Text>
            </Button>
            <Button size="lg" variant="secondary" disabled={starting} onPress={signIn.open}>
              <Text className="text-center">{t("story.haveAccount")}</Text>
            </Button>
          </>
        }
      />
      <LanguageSheet open={languageOpen} onClose={() => setLanguageOpen(false)} />
    </View>
  );
}
