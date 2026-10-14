// The welcome story (Senryo's pattern, plan research 04-senryo-flows): five scenes, each one picture of the product
// working, one headline and one sentence — ask and it's done, every route checked, one weekly budget, all of Arc,
// test money first. The swipe follows the finger; each settled scene plays a soft sound (and its narration, when the
// speaker is on). The language pill sits on the first scene: the story re-renders in place in the new language, reading
// direction included.
//
// Value first, sign last: "Look around" leads (a guest session, straight to Home, where the agent can be asked
// anything); "Create account" and "I already have an account" open the sign-in sheet over the story. If the guest can't
// be made (offline, the api down) the story stays and says so.
//
// Auto-advance moves at a reading pace and gets out of the way: it rests on the last scene, holds while the person
// drags, while a sheet covers the story, in the background, with a screen reader or reduced motion, and restarts its
// dwell after any interaction. With narration on, it waits for the clip.
import { useFocusEffect, useRouter, type Href } from "expo-router";
import { Globe, Volume2, VolumeOff } from "lucide-react-native";
import * as React from "react";
import { AccessibilityInfo, AppState, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FAUCET, MOTION } from "@kawase/config";
import { isRtlLocale, LANGUAGE_NAMES } from "@kawase/i18n";
import { amount, formatAmount } from "@kawase/money";
import { KawaseMark } from "@kawase/ui-native/components/art/kawase-mark";

import { LanguageSheet } from "@/components/language-sheet";
import { Button } from "@/components/kit/Button";
import { Icon } from "@/components/kit/icons";
import { CONTROL_FONT_SCALE, FONT, RADIUS, SIZE, SPACE, TYPE, useTheme } from "@/components/kit/theme";
import { fire } from "@/feedback/fire";
import { useT } from "@/i18n";
import { useLocale } from "@/i18n/locale-provider";
import { useStoryNarration } from "@/narration/use-story-narration";
import { takeDeepLink } from "@/onboarding/continuation";
import { useSession } from "@/session/session-provider";
import { useSignIn } from "@/sign-in/sign-in-provider";

import { ArcArt, AskArt, BudgetArt, RaceArt, type StoryArtCopy, TestArt } from "./story-art";
import { StoryPager, type StoryScene } from "./story-pager";

const MARK = 28;
const TOP_GAP = SPACE.sm;
/** Example figures on the art (labelled "Example" on screen). */
const EXAMPLE = {
  arrived: 4_980_000n,
  race: [
    { venue: "venue:relay", amount: 4_990_000n },
    { venue: "venue:across", amount: 4_980_000n },
    { venue: "venue:cctp", amount: 4_970_000n },
    { venue: "venue:lifi", amount: 4_950_000n },
  ],
  spent: 34_000_000n,
  limit: 200_000_000n,
} as const;

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
    // react-native-web answers "yes" whatever the browser does, so the web never holds the story for it.
    if (Platform.OS === "web") return undefined;
    void AccessibilityInfo.isScreenReaderEnabled().then(setOn);
    const subscription = AccessibilityInfo.addEventListener("screenReaderChanged", setOn);
    return () => subscription.remove();
  }, []);
  return on;
}

export function StoryScreen() {
  const { t } = useT();
  const { locale } = useLocale();
  const { color } = useTheme();
  const { ensureGuest } = useSession();
  const signIn = useSignIn();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const appActive = useAppActive();
  const screenReader = useScreenReader();
  const [focused, setFocused] = React.useState(true);
  const [index, setIndex] = React.useState(0);
  const dragging = React.useRef(false);
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
  const paused = reduce || screenReader || !visible;
  const narration = useStoryNarration({ locale, index, active: visible });
  const { holding, heard, cut, settle } = narration;
  const last = SCENE_COUNT - 1;

  // One scene's dwell, restarted by every change and every interaction; the story rests on its last scene.
  React.useEffect(() => {
    if (paused || holding || index >= last) return undefined;
    const timer = setTimeout(
      () => {
        if (!dragging.current) setIndex((i) => Math.min(last, i + 1));
      },
      heard ? MOTION.narrationTailMs : MOTION.storyDwellMs,
    );
    return () => clearTimeout(timer);
  }, [index, paused, holding, heard, interactions, last]);

  const onInteraction = React.useCallback(
    (phase: "start" | "end") => {
      if (phase === "start") {
        dragging.current = true;
        cut();
        return;
      }
      dragging.current = false;
      settle();
      setInteractions((n) => n + 1);
    },
    [cut, settle],
  );
  const onSettle = React.useCallback((next: number) => {
    fire("tick");
    setIndex(next);
    setInteractions((n) => n + 1);
  }, []);
  const onLanded = React.useCallback(
    (at: number) => {
      // The scene's own sound; with narration on, the voice is the sound.
      if (!narration.enabled) fire("snap", { sound: "scene" });
      else fire("snap");
      const title = titles.current[at];
      if (title) AccessibilityInfo.announceForAccessibility(title);
    },
    [narration.enabled],
  );
  const titles = React.useRef<string[]>([]);

  const lookAround = async () => {
    setStarting(true);
    setStartFailed(false);
    try {
      await ensureGuest(locale);
      // A link opened while signed out (a push, an email) is where the person was going (A5-2).
      router.replace((takeDeepLink() ?? "/") as Href);
    } catch {
      setStartFailed(true);
    } finally {
      setStarting(false);
    }
  };

  const money = (value: bigint, digits = 2) => formatAmount(amount("USDC", value), locale, { fractionDigits: digits });
  const copy: StoryArtCopy = {
    example: t("story.example"),
    ask: {
      prompt: t("story.askPrompt"),
      routed: t("story.askRouted"),
      picked: t("story.askPicked"),
      arrived: t("story.askArrived"),
      arrivedAmount: `+${money(EXAMPLE.arrived)}`,
    },
    race: {
      best: t("story.raceBest"),
      rows: EXAMPLE.race.map((row) => ({ venue: row.venue, amount: money(row.amount) })),
    },
    budget: {
      spent: money(EXAMPLE.spent, 0),
      of: t("story.budgetUsed", { limit: money(EXAMPLE.limit, 0) }),
      lines: [t("story.budgetSwaps"), t("story.budgetContacts"), t("story.budgetServices")],
      confirm: t("story.budgetNew"),
    },
    test: {
      capsule: t("network.testnet"),
      capsuleSwitch: t("network.switchTo", { network: t("network.mainnet") }),
      faucet: t("story.faucetLine"),
      faucetAmount: `+${money(FAUCET.expected.USDC, 0)}`,
    },
  };

  const scenes: StoryScene[] = [
    { key: "ask", title: t("story.askTitle"), body: t("story.askBody"), art: (s) => <AskArt copy={copy} {...s} /> },
    { key: "race", title: t("story.raceTitle"), body: t("story.raceBody"), art: (s) => <RaceArt copy={copy} {...s} /> },
    {
      key: "budget",
      title: t("story.budgetTitle"),
      body: t("story.budgetBody"),
      art: (s) => <BudgetArt copy={copy} {...s} />,
    },
    { key: "arc", title: t("story.arcTitle"), body: t("story.arcBody"), art: (s) => <ArcArt copy={copy} {...s} /> },
    { key: "test", title: t("story.testTitle"), body: t("story.testBody"), art: (s) => <TestArt copy={copy} {...s} /> },
  ];
  titles.current = scenes.map((scene) => scene.title);

  return (
    <View style={[styles.screen, { backgroundColor: color.background, paddingTop: insets.top + TOP_GAP, paddingBottom: insets.bottom + SPACE.lg }]}>
      <View style={styles.top}>
        <View style={styles.brand}>
          <KawaseMark size={MARK} />
          <Text style={[TYPE.sectionTitle, { color: color.ink, fontFamily: FONT.display }]}>{t("common.appName")}</Text>
        </View>
        <View style={styles.topEnd}>
          <RoundButton
            icon={narration.enabled ? Volume2 : VolumeOff}
            label={t("story.readAloud")}
            checked={narration.enabled}
            onPress={() => {
              fire("tick");
              narration.toggle();
            }}
          />
          {/* The language pill belongs to the first scene: choosing a language is where the story starts. */}
          {index === 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("settings.language")}
              onPress={() => setLanguageOpen(true)}
              style={({ pressed }) => [styles.pill, { backgroundColor: pressed ? color.rowPressed : color.raised2 }]}
            >
              <Icon icon={Globe} size={SIZE.iconSm} tint={color.text2} />
              <Text maxFontSizeMultiplier={CONTROL_FONT_SCALE} style={[TYPE.chipLabel, { color: color.ink }]}>
                {LANGUAGE_NAMES[locale]}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      <StoryPager
        scenes={scenes}
        index={index}
        onSettle={onSettle}
        onLanded={onLanded}
        onInteraction={onInteraction}
        rtl={isRtlLocale(locale)}
        reduce={reduce}
        animate={visible}
        progressLabel={(n, total) => t("story.panelOf", { n, total })}
        segmentLabel={(n) => t("story.goTo", { n })}
        hint={t("story.swipeHint")}
      />

      <View style={styles.footer}>
        {startFailed ? (
          <Text accessibilityRole="alert" style={[TYPE.rowDetail, styles.centre, { color: color.destructive }]}>
            {t("errors.startFailed")}
          </Text>
        ) : null}
        <Button label={t("story.lookAround")} loading={starting} onPress={() => void lookAround()} />
        <Button
          label={t("story.createAccount")}
          variant="secondary"
          disabled={starting}
          onPress={() => signIn.open({ intent: "create" })}
        />
        <Button
          label={t("story.haveAccount")}
          variant="ghost"
          disabled={starting}
          onPress={() => signIn.open({ intent: "signIn" })}
        />
      </View>
      <LanguageSheet open={languageOpen} onClose={() => setLanguageOpen(false)} />
    </View>
  );
}

/** ask · race · budget · arc · test */
const SCENE_COUNT = 5;

function RoundButton({
  icon,
  label,
  checked,
  onPress,
}: {
  icon: typeof Volume2;
  label: string;
  checked: boolean;
  onPress: () => void;
}) {
  const { color } = useTheme();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked }}
      onPress={onPress}
      hitSlop={SPACE.sm}
      style={({ pressed }) => [styles.round, { backgroundColor: pressed ? color.rowPressed : color.raised2 }]}
    >
      <Icon icon={icon} size={SIZE.iconSm} tint={color.ink} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, gap: SPACE.lg },
  top: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACE.inset,
    minHeight: SIZE.chipHeight,
  },
  brand: { flexDirection: "row", alignItems: "center", gap: SPACE.sm },
  topEnd: { flexDirection: "row", alignItems: "center", gap: SPACE.sm },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.xs + SPACE.xxs,
    height: SIZE.chipHeight,
    paddingHorizontal: SPACE.md,
    borderRadius: RADIUS.pill,
  },
  round: {
    width: SIZE.chipHeight,
    height: SIZE.chipHeight,
    borderRadius: RADIUS.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  footer: { gap: SPACE.sm, paddingHorizontal: SPACE.inset },
  centre: { textAlign: "center" },
});
