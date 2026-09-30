// Direction board: the story onboarding, composed from the shell and the art objects with sample copy.
import { MOTION } from "@kawase/config";
import { tokens } from "@kawase/ui-tokens";
import { CoinStack } from "@kawase/ui-native/components/art/coin-stack";
import { Float } from "@kawase/ui-native/components/art/float";
import { Hanko } from "@kawase/ui-native/components/art/hanko";
import { Koban } from "@kawase/ui-native/components/art/koban";
import { PaperPlane } from "@kawase/ui-native/components/art/paper-plane";
import { Direction } from "@kawase/ui-native/components/direction";
import { Mark } from "@kawase/ui-native/components/mark";
import { StoryShell, type StoryPanel } from "@kawase/ui-native/components/story-shell";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { VoiceOrb } from "@kawase/ui-native/components/voice-orb";
import { ChevronDown, ScanFace } from "lucide-react-native";
import * as React from "react";
import { Pressable, useWindowDimensions, View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BOARD, type SampleLocale } from "@/gallery/sample";
import type { Network } from "@/theme/theme-provider";

const CANVAS_RATIO = 0.52;
const ORB_STAGE = 196;
const INK = tokens.story.ink;
const FIELDS = tokens.story.fields;
const ORB_SIZE = 150;
const CHIP_PHASES = 5;
const TOP_GAP = 8;

/** A small ink card used inside the art (a receipt, an allowance). */
function ArtCard({ children, style }: { children: React.ReactNode; style?: object }) {
  return (
    <View className="rounded-2xl px-4 py-3" style={[{ backgroundColor: INK }, style]}>
      {children}
    </View>
  );
}

function LanguagePill({ label, ink }: { label: string; ink: string }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} className="flex-row items-center gap-1 rounded-full px-3 py-1.5" style={{ backgroundColor: `${ink}22` }}>
      <Text className="text-sm font-semibold" style={{ color: ink }}>
        {label}
      </Text>
      <Icon as={ChevronDown} className="size-4" color={ink} />
    </Pressable>
  );
}

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

  const panels: StoryPanel[] = [
    {
      key: "voice",
      field: FIELDS.lime,
      ...t.panels[0],
      art: (
        <View className="flex-1 items-center justify-center">
          <Float amplitude={6} phase={0.2}>
            <View className="items-center justify-center rounded-full" style={{ width: ORB_STAGE, height: ORB_STAGE, backgroundColor: INK }}>
              <View style={{ width: ORB_SIZE, height: ORB_SIZE }}>
                <VoiceOrb colors={tokens.orb[network]} level={0.4} />
              </View>
            </View>
          </Float>
          <Float amplitude={10} tilt={3} phase={0.7} style={{ position: "absolute", bottom: 56, end: 28 }}>
            <ArtCard>
              <Text className="font-display text-base font-semibold" style={{ color: tokens.themes.dark.foreground }}>
                {t.receiptTitle}
              </Text>
            </ArtCard>
          </Float>
          <Float amplitude={8} tilt={4} phase={0.4} style={{ position: "absolute", top: 64, start: 24 }}>
            <Koban width={96} id="story-koban" rotate={-14} />
          </Float>
        </View>
      ),
    },
    {
      key: "limits",
      field: FIELDS.ice,
      ...t.panels[1],
      art: (
        <View className="flex-1 items-center justify-center">
          <ArtCard style={{ minWidth: 220 }}>
            <Text className="text-xs font-semibold uppercase" style={{ color: tokens.themes.dark["muted-foreground"] }}>
              {t.allowanceTitle}
            </Text>
            <Text className="font-display text-3xl font-bold" style={{ color: tokens.themes.dark.foreground }}>
              {t.allowanceValue}
            </Text>
          </ArtCard>
          <Float amplitude={6} tilt={3} phase={0.5} style={{ position: "absolute", top: 70, end: 40 }}>
            <Hanko size={132} id="story-hanko" />
          </Float>
          <Float amplitude={8} phase={0.1} style={{ position: "absolute", bottom: 60, start: 36 }}>
            <View className="flex-row items-center gap-2 rounded-full px-3 py-2" style={{ backgroundColor: INK }}>
              <Icon as={ScanFace} className="size-5" color={tokens.themes.dark.primary} />
              <Text className="text-sm font-semibold" style={{ color: tokens.themes.dark.foreground }}>
                {t.faceId}
              </Text>
            </View>
          </Float>
        </View>
      ),
    },
    {
      key: "networks",
      field: FIELDS.mint,
      ...t.panels[2],
      art: (
        <View className="flex-1 items-center justify-center gap-4">
          <Float amplitude={6} phase={0.3}>
            <View className="flex-row items-center gap-3 rounded-full py-3 pe-6 ps-3" style={{ backgroundColor: INK }}>
              <Mark entity="chain:eip155:5042" size={36} />
              <Text className="font-display text-xl font-semibold" style={{ color: tokens.themes.dark.foreground }}>
                Arc
              </Text>
              <Mark entity="token:eip155:5042:0x3600000000000000000000000000000000000000" size={28} />
            </View>
          </Float>
          <Float amplitude={6} phase={0.8}>
            <View className="flex-row items-center gap-3 rounded-full py-3 pe-6 ps-3" style={{ backgroundColor: tokens.themes["testnet-dark"]["network-surface"] }}>
              <Mark entity="chain:eip155:5042002" size={36} />
              <Text className="font-display text-xl font-semibold" style={{ color: tokens.themes["testnet-dark"].network }}>
                Arc Testnet
              </Text>
            </View>
          </Float>
        </View>
      ),
    },
    {
      key: "languages",
      field: FIELDS.coral,
      ...t.panels[3],
      art: (
        <View className="flex-1 flex-row flex-wrap content-center items-center justify-center gap-3 px-8">
          {t.languages.map((name, i) => (
            <Float key={name} amplitude={5} tilt={2} phase={(i % CHIP_PHASES) / CHIP_PHASES}>
              <View className="rounded-full px-4 py-2" style={{ backgroundColor: i === 0 ? INK : `${INK}22` }}>
                <Text className="text-base font-semibold" style={{ color: i === 0 ? tokens.themes.dark.foreground : INK }}>
                  {name}
                </Text>
              </View>
            </Float>
          ))}
        </View>
      ),
    },
    {
      key: "more",
      field: FIELDS.periwinkle,
      ...t.panels[4],
      art: (
        <View className="flex-1 items-center justify-center">
          <Float amplitude={9} tilt={3} phase={0.2} style={{ position: "absolute", top: 60, end: 24 }}>
            <PaperPlane width={200} id="story-plane" />
          </Float>
          <Float amplitude={6} phase={0.6} style={{ position: "absolute", bottom: 40, start: 36 }}>
            <CoinStack width={140} id="story-stack" />
          </Float>
        </View>
      ),
    },
  ];

  return (
    <Direction rtl={locale === "ar"} className="bg-background flex-1" style={{ paddingTop: insets.top + TOP_GAP, paddingBottom: insets.bottom }}>
      <StoryShell
        panels={panels}
        index={index}
        onIndexChange={setIndex}
        progressLabel={t.panelOf}
        canvasHeight={canvasHeight}
        ink={INK}
        topEnd={<LanguagePill label={t.language} ink={INK} />}
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
