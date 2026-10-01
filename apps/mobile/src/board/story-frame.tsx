// Direction board: the story onboarding, composed from the shell and the art objects with sample copy.
import { MOTION } from "@kawase/config";
import { Direction } from "@kawase/ui-native/components/direction";
import { StoryShell } from "@kawase/ui-native/components/story-shell";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Text } from "@kawase/ui-native/components/ui/text";
import * as React from "react";
import { useWindowDimensions } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CATALOGS } from "@kawase/i18n";

import { BOARD, type SampleLocale } from "@/gallery/sample";
import { STORY_INK, StoryLanguagePill, storyPanels } from "@/onboarding/story-panels";
import type { Network } from "@/theme/theme-provider";

const CANVAS_RATIO = 0.44;
const INK = STORY_INK;
const TOP_GAP = 8;

type StoryFrameProps = { locale: SampleLocale; network: Network; index?: number; autoAdvance?: boolean };

// The story is always on Arc Testnet's examples, whichever network the board frame is set to.
export function StoryFrame({ locale, index: initial = 0, autoAdvance = true }: StoryFrameProps) {
  const t = BOARD[locale];
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const reduced = useReducedMotion();
  const [index, setIndex] = React.useState(initial);
  const canvasHeight = Math.round(height * CANVAS_RATIO);

  React.useEffect(() => setIndex(initial), [initial]);

  React.useEffect(() => {
    if (!autoAdvance || reduced) return undefined;
    // Like the real story: it rests on the last panel instead of sweeping back to the first.
    const timer = setInterval(() => setIndex((i) => Math.min(t.panels.length - 1, i + 1)), MOTION.storyDwellMs);
    return () => clearInterval(timer);
  }, [autoAdvance, reduced, t.panels.length]);

  // The board shows the real story copy from the catalogs (English or Arabic), so the two cannot drift apart.
  const story = CATALOGS[locale].story;
  const networkNames = CATALOGS[locale].network;
  const panels = storyPanels(
    {
      panels: [
        { title: story.requestTitle, body: story.requestBody },
        { title: story.boundsTitle, body: story.boundsBody },
        { title: story.practiceTitle, body: story.practiceBody },
        { title: story.languageTitle, body: story.languageBody },
        { title: story.firstTitle, body: story.firstBody },
      ],
      example: story.example,
      request: story.exampleRequest,
      otherRequests: [CATALOGS.es.story.exampleRequest, CATALOGS.zh.story.exampleRequest],
      fields: { amount: story.fieldAmount, to: story.fieldTo, network: story.fieldNetwork },
      typingNow: story.typingNow,
      amount: "10 USDC",
      recipient: "@amina",
      arc: networkNames.arc,
      arcTestnet: networkNames.arcTestnet,
      allowance: { amount: "5,000", perDay: story.perDay, inside: story.boundsInside, above: story.boundsAbove, never: story.boundsNever },
      practice: { faucetLine: story.faucetLine, faucetAmount: "+20", testMoney: story.testMoney, realMoney: story.realMoney },
      sameMeaning: story.sameMeaning,
      first: { step1: story.firstStep1, step2: story.firstStep2 },
    },
    { active: index, animate: autoAdvance && !reduced },
  );
  return (
    <Direction rtl={locale === "ar"} className="bg-background flex-1" style={{ paddingTop: insets.top + TOP_GAP, paddingBottom: insets.bottom }}>
      <StoryShell
        panels={panels}
        index={index}
        onIndexChange={setIndex}
        rtl={locale === "ar"}
        progressLabel={t.panelOf}
        canvasHeight={canvasHeight}
        ink={INK}
        topEnd={<StoryLanguagePill label={t.language} />}
        footer={
          <>
            <Button size="lg">
              <Text>{t.start}</Text>
            </Button>
            <Button size="lg" variant="secondary">
              <Text>{t.haveAccount}</Text>
            </Button>
            <Text className="text-muted-foreground text-center text-sm">{t.tryFirst}</Text>
          </>
        }
      />
    </Direction>
  );
}
