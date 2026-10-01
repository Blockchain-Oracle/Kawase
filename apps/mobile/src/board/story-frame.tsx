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

import { BOARD, type SampleLocale } from "@/gallery/sample";
import { STORY_INK, StoryLanguagePill, storyPanels } from "@/onboarding/story-panels";
import type { Network } from "@/theme/theme-provider";

const CANVAS_RATIO = 0.52;
const INK = STORY_INK;
const TOP_GAP = 8;

type StoryFrameProps = { locale: SampleLocale; network: Network; index?: number; autoAdvance?: boolean };

export function StoryFrame({ locale, network, index: initial = 0, autoAdvance = true }: StoryFrameProps) {
  const t = BOARD[locale];
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const reduced = useReducedMotion();
  const [index, setIndex] = React.useState(initial);
  const canvasHeight = Math.round(height * CANVAS_RATIO);

  React.useEffect(() => setIndex(initial), [initial]);

  React.useEffect(() => {
    if (!autoAdvance || reduced) return undefined;
    const timer = setInterval(() => setIndex((i) => (i + 1) % t.panels.length), MOTION.storyDwellMs);
    return () => clearInterval(timer);
  }, [autoAdvance, reduced, t.panels.length]);

  const panels = storyPanels(
    {
      panels: t.panels,
      receiptTitle: t.receiptTitle,
      allowanceTitle: t.allowanceTitle,
      allowanceValue: t.allowanceValue,
      faceId: t.faceId,
      arc: "Arc",
      arcTestnet: "Arc Testnet",
      languages: t.languages.map((name, i) => ({ key: name, name, selected: i === 0 })),
    },
    network,
  );

  return (
    <Direction rtl={locale === "ar"} className="bg-background flex-1" style={{ paddingTop: insets.top + TOP_GAP, paddingBottom: insets.bottom }}>
      <StoryShell
        panels={panels}
        index={index}
        onIndexChange={setIndex}
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
