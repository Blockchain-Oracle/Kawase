// Story onboarding (journey 1; Solflare S01–S06 / M01): five panels on colour fields with layered art, the
// language pill on the first panel and every panel after (it opens the language sheet; the story re-renders in
// place, reading direction included), auto-advance that pauses while a sheet is up or motion is reduced, and a
// footer that never moves: "Start" makes a guest and goes home, "I already have an account" opens the sign-in
// sheet over the story, which keeps moving behind the scrim. If the guest cannot be made (offline, the api down),
// the story stays, says so, and Start tries again (Codex review R08).
import { useRouter } from "expo-router";
import * as React from "react";
import { ActivityIndicator, useWindowDimensions, View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { DEFAULT_LIMITS, MOTION, SUPPORTED_LOCALES } from "@kawase/config";
import { LANGUAGE_NAMES } from "@kawase/i18n";
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

const CANVAS_RATIO = 0.5;
const TOP_GAP = 8;
const PANEL_COUNT = 5;

export function StoryScreen() {
  const { t } = useT();
  const { locale, chooseLocale } = useLocale();
  const { ensureGuest } = useSession();
  const signIn = useSignIn();
  const router = useRouter();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const reduced = useReducedMotion();
  const [index, setIndex] = React.useState(0);
  const [languageOpen, setLanguageOpen] = React.useState(false);
  const [starting, setStarting] = React.useState(false);
  const [startFailed, setStartFailed] = React.useState(false);

  // One panel's dwell, restarted by every change (a swipe resets it); held while a sheet covers the story.
  const paused = reduced || languageOpen || signIn.isOpen;
  React.useEffect(() => {
    if (paused) return undefined;
    const timer = setTimeout(() => setIndex((i) => (i + 1) % PANEL_COUNT), MOTION.storyDwellMs);
    return () => clearTimeout(timer);
  }, [index, paused]);

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

  const panels = storyPanels(
    {
      panels: [
        { title: t("story.voiceTitle"), body: t("story.voiceBody") },
        { title: t("story.limitsTitle"), body: t("story.limitsBody") },
        { title: t("story.networksTitle"), body: t("story.networksBody") },
        { title: t("story.languagesTitle"), body: t("story.languagesBody") },
        { title: t("story.moreTitle"), body: t("story.moreBody") },
      ],
      receiptTitle: t("story.artReceipt"),
      allowanceTitle: t("wallet.allowanceTitle"),
      allowanceValue: formatAmount(amount("USDC", DEFAULT_LIMITS.testnet.daily), locale),
      faceId: t("story.artFaceId"),
      arc: t("network.arc"),
      arcTestnet: t("network.arcTestnet"),
      languages: SUPPORTED_LOCALES.map((candidate) => ({
        key: candidate,
        name: LANGUAGE_NAMES[candidate],
        selected: candidate === locale,
        onPress: () => void chooseLocale(candidate),
      })),
    },
    // The orb in the story is the brand's lime one (the board Abu signed off); the networks panel shows both.
    "mainnet",
  );

  return (
    <View className="bg-background flex-1" style={{ paddingTop: insets.top + TOP_GAP, paddingBottom: insets.bottom }}>
      <StoryShell
        panels={panels}
        index={index}
        onIndexChange={setIndex}
        progressLabel={(n, total) => t("story.panelOf", { n, total })}
        canvasHeight={Math.round(height * CANVAS_RATIO)}
        ink={STORY_INK}
        topEnd={<StoryLanguagePill label={LANGUAGE_NAMES[locale]} accessibilityLabel={t("settings.language")} onPress={() => setLanguageOpen(true)} />}
        footer={
          <>
            {startFailed ? (
              <Text accessibilityRole="alert" className="text-destructive text-center text-sm">
                {t("errors.startFailed")}
              </Text>
            ) : null}
            <Button size="lg" disabled={starting} onPress={() => void start()}>
              {starting ? <ActivityIndicator color={colors["primary-foreground"]} /> : null}
              <Text>{t("welcome.start")}</Text>
            </Button>
            <Button size="lg" variant="secondary" disabled={starting} onPress={signIn.open}>
              <Text>{t("story.haveAccount")}</Text>
            </Button>
            <Text className="text-muted-foreground text-center text-sm">{t("welcome.tryFirst")}</Text>
          </>
        }
      />
      <LanguageSheet open={languageOpen} onClose={() => setLanguageOpen(false)} />
    </View>
  );
}
