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

import type { Catalog } from "@kawase/i18n/en";
import { loadCatalog } from "@kawase/i18n/lazy";

import { BOARD, type SampleLocale } from "@/gallery/sample";
import { STORY_INK, StoryLanguagePill, storyPanels } from "@/onboarding/story-panels";
import type { Network } from "@/theme/theme-provider";

const CANVAS_RATIO = 0.44;
const INK = STORY_INK;
const TOP_GAP = 8;

type StoryFrameProps = { locale: SampleLocale; network: Network; index?: number; autoAdvance?: boolean };
type BoardCatalogs = { story: Catalog; es: Catalog; zh: Catalog };

/**
 * The frame's languages, fetched the way the app fetches them. A static import of every catalog here made each
 * language a module shared between chunks, so the web export hoisted all ten into the first load (3.6 MB).
 */
function useBoardCatalogs(locale: SampleLocale): BoardCatalogs | null {
  const [catalogs, setCatalogs] = React.useState<BoardCatalogs | null>(null);
  React.useEffect(() => {
    let live = true;
    void Promise.all([loadCatalog(locale), loadCatalog("es"), loadCatalog("zh")]).then(([story, es, zh]) => {
      if (live) setCatalogs({ story, es, zh });
    });
    return () => {
      live = false;
    };
  }, [locale]);
  return catalogs;
}

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
  const catalogs = useBoardCatalogs(locale);
  if (!catalogs) return null;
  const story = catalogs.story.story;
  const networkNames = catalogs.story.network;
  const panels = storyPanels(
    {
      panels: [
        { title: story.requestTitle, body: story.requestBody },
        { title: story.boundsTitle, body: story.boundsBody },
        { title: story.practiceTitle, body: story.practiceBody },
        { title: story.languageTitle, body: story.languageBody },
        { title: story.everythingTitle, body: story.everythingBody },
      ],
      example: story.example,
      request: story.exampleRequest,
      otherRequests: [catalogs.es.story.exampleRequest, catalogs.zh.story.exampleRequest],
      fields: { amount: story.fieldAmount, to: story.fieldTo, network: story.fieldNetwork },
      typingNow: story.typingNow,
      amount: "10 USDC",
      recipient: "@amina",
      arc: networkNames.arc,
      arcTestnet: networkNames.arcTestnet,
      allowance: { amount: "5,000", perDay: story.perDay, inside: story.boundsInside, above: story.boundsAbove, never: story.boundsNever },
      practice: { faucetLine: story.faucetLine, faucetAmount: "+20", testMoney: story.testMoney, realMoney: story.realMoney },
      sameMeaning: story.sameMeaning,
      everything: { buy: story.everythingBuy, trade: story.everythingTrade, earn: story.everythingEarn, automate: story.everythingAutomate },
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
