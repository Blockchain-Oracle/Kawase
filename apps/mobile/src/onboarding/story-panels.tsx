// The five story panels' layered art (journey 1): Kawase objects on colour fields, each layer floating on its own
// phase. Shared by the real story (copy from the catalogs) and the direction board (sample copy), so the two
// cannot drift apart. Panel 4's language chips are live: a tap changes the app's language in place.
import { Orb } from "@/components/orb";
import { ChevronDown, Globe, ScanFace } from "lucide-react-native";
import { Pressable, View } from "react-native";

import { arcIdentity } from "@kawase/identity";
import { CoinStack } from "@kawase/ui-native/components/art/coin-stack";
import { Float } from "@kawase/ui-native/components/art/float";
import { Hanko } from "@kawase/ui-native/components/art/hanko";
import { Koban } from "@kawase/ui-native/components/art/koban";
import { PaperPlane } from "@kawase/ui-native/components/art/paper-plane";
import { Mark } from "@kawase/ui-native/components/mark";
import type { StoryPanel } from "@kawase/ui-native/components/story-shell";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { tokens } from "@kawase/ui-tokens";

export const STORY_INK = tokens.story.ink;
const FIELDS = tokens.story.fields;
const DARK = tokens.themes.dark;
const TESTNET_DARK = tokens.themes["testnet-dark"];
const ORB_STAGE = 196;
const ORB_SIZE = 150;
const ORB_LEVEL = 0.4;
const CHIP_PHASES = 5;
const CHIP_TINT = `${STORY_INK}22`;
const KOBAN_WIDTH = 96;
const HANKO_SIZE = 132;
const PLANE_WIDTH = 200;
const STACK_WIDTH = 140;
const MARK_LARGE = 36;
const MARK_SMALL = 28;
const ALLOWANCE_MIN_WIDTH = 220;

export type StoryCopy = {
  panels: readonly { title: string; body: string }[];
  receiptTitle: string;
  allowanceTitle: string;
  allowanceValue: string;
  faceId: string;
  arc: string;
  arcTestnet: string;
  languages: readonly { key: string; name: string; selected: boolean; onPress?: () => void }[];
};

/** A small ink card used inside the art (a receipt, an allowance). */
function ArtCard({ children, style }: { children: React.ReactNode; style?: object }) {
  return (
    <View className="rounded-2xl px-4 py-3" style={[{ backgroundColor: STORY_INK }, style]}>
      {children}
    </View>
  );
}

export function storyPanels(copy: StoryCopy, network: "mainnet" | "testnet"): StoryPanel[] {
  const [voice, limits, networks, languages, more] = copy.panels;
  const mainnetIds = arcIdentity("mainnet");
  const testnetIds = arcIdentity("testnet");
  return [
    {
      key: "voice",
      field: FIELDS.lime,
      title: voice?.title ?? "",
      body: voice?.body ?? "",
      art: (
        <View className="flex-1 items-center justify-center">
          <Float amplitude={6} phase={0.2}>
            <View className="items-center justify-center rounded-full" style={{ width: ORB_STAGE, height: ORB_STAGE, backgroundColor: STORY_INK }}>
              <View style={{ width: ORB_SIZE, height: ORB_SIZE }}>
                <Orb colors={tokens.orb[network]} level={ORB_LEVEL} />
              </View>
            </View>
          </Float>
          <Float amplitude={10} tilt={3} phase={0.7} style={{ position: "absolute", bottom: 56, end: 28 }}>
            <ArtCard>
              <Text className="font-display text-base font-semibold" style={{ color: DARK.foreground }}>
                {copy.receiptTitle}
              </Text>
            </ArtCard>
          </Float>
          <Float amplitude={8} tilt={4} phase={0.4} style={{ position: "absolute", top: 64, start: 24 }}>
            <Koban width={KOBAN_WIDTH} id="story-koban" rotate={-14} />
          </Float>
        </View>
      ),
    },
    {
      key: "limits",
      field: FIELDS.ice,
      title: limits?.title ?? "",
      body: limits?.body ?? "",
      art: (
        <View className="flex-1 items-center justify-center">
          <ArtCard style={{ minWidth: ALLOWANCE_MIN_WIDTH }}>
            <Text className="text-xs font-semibold uppercase" style={{ color: DARK["muted-foreground"] }}>
              {copy.allowanceTitle}
            </Text>
            <Text className="font-display text-3xl font-bold" style={{ color: DARK.foreground }}>
              {copy.allowanceValue}
            </Text>
          </ArtCard>
          <Float amplitude={6} tilt={3} phase={0.5} style={{ position: "absolute", top: 70, end: 40 }}>
            <Hanko size={HANKO_SIZE} id="story-hanko" />
          </Float>
          <Float amplitude={8} phase={0.1} style={{ position: "absolute", bottom: 60, start: 36 }}>
            <View className="flex-row items-center gap-2 rounded-full px-3 py-2" style={{ backgroundColor: STORY_INK }}>
              <Icon as={ScanFace} className="size-5" color={DARK.primary} />
              <Text className="text-sm font-semibold" style={{ color: DARK.foreground }}>
                {copy.faceId}
              </Text>
            </View>
          </Float>
        </View>
      ),
    },
    {
      key: "networks",
      field: FIELDS.mint,
      title: networks?.title ?? "",
      body: networks?.body ?? "",
      art: (
        <View className="flex-1 items-center justify-center gap-4">
          <Float amplitude={6} phase={0.3}>
            <View className="flex-row items-center gap-3 rounded-full py-3 pe-6 ps-3" style={{ backgroundColor: STORY_INK }}>
              <Mark entity={mainnetIds.chain} size={MARK_LARGE} />
              <Text className="font-display text-xl font-semibold" style={{ color: DARK.foreground }}>
                {copy.arc}
              </Text>
              <Mark entity={mainnetIds.usdc} size={MARK_SMALL} />
            </View>
          </Float>
          <Float amplitude={6} phase={0.8}>
            <View className="flex-row items-center gap-3 rounded-full py-3 pe-6 ps-3" style={{ backgroundColor: TESTNET_DARK["network-surface"] }}>
              <Mark entity={testnetIds.chain} size={MARK_LARGE} />
              <Text className="font-display text-xl font-semibold" style={{ color: TESTNET_DARK.network }}>
                {copy.arcTestnet}
              </Text>
            </View>
          </Float>
        </View>
      ),
    },
    {
      key: "languages",
      field: FIELDS.coral,
      title: languages?.title ?? "",
      body: languages?.body ?? "",
      art: (
        <View className="flex-1 flex-row flex-wrap content-center items-center justify-center gap-3 px-8">
          {copy.languages.map((language, i) => (
            <Float key={language.key} amplitude={5} tilt={2} phase={(i % CHIP_PHASES) / CHIP_PHASES}>
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ checked: language.selected }}
                accessibilityLabel={language.name}
                disabled={!language.onPress}
                onPress={language.onPress}
                className="rounded-full px-4 py-2 active:opacity-70"
                style={{ backgroundColor: language.selected ? STORY_INK : CHIP_TINT }}
              >
                <Text className="text-base font-semibold" style={{ color: language.selected ? DARK.foreground : STORY_INK }}>
                  {language.name}
                </Text>
              </Pressable>
            </Float>
          ))}
        </View>
      ),
    },
    {
      key: "more",
      field: FIELDS.periwinkle,
      title: more?.title ?? "",
      body: more?.body ?? "",
      art: (
        <View className="flex-1 items-center justify-center">
          <Float amplitude={9} tilt={3} phase={0.2} style={{ position: "absolute", top: 60, end: 24 }}>
            <PaperPlane width={PLANE_WIDTH} id="story-plane" />
          </Float>
          <Float amplitude={6} phase={0.6} style={{ position: "absolute", bottom: 40, start: 36 }}>
            <CoinStack width={STACK_WIDTH} id="story-stack" />
          </Float>
        </View>
      ),
    },
  ];
}

/** The language pill on the story's canvas: ink on the colour field, the current language in its own script. */
export function StoryLanguagePill({ label, accessibilityLabel, onPress }: { label: string; accessibilityLabel?: string; onPress?: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      hitSlop={8}
      className="flex-row items-center gap-1.5 rounded-full px-3 py-1.5 active:opacity-70"
      style={{ backgroundColor: CHIP_TINT }}
    >
      <Icon as={Globe} className="size-4" color={STORY_INK} />
      <Text className="text-sm font-semibold" style={{ color: STORY_INK }}>
        {label}
      </Text>
      <Icon as={ChevronDown} className="size-4" color={STORY_INK} />
    </Pressable>
  );
}
