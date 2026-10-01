// Internal route: every art object at rest, on the stage, so the material can be judged before it is placed.
import { CoinStack } from "@kawase/ui-native/components/art/coin-stack";
import { Flag } from "@kawase/ui-native/components/art/flag";
import { Hanko } from "@kawase/ui-native/components/art/hanko";
import { KawaseMark } from "@kawase/ui-native/components/art/kawase-mark";
import { Koban } from "@kawase/ui-native/components/art/koban";
import { PaperPlane } from "@kawase/ui-native/components/art/paper-plane";
import { Mark } from "@kawase/ui-native/components/mark";
import { Text } from "@kawase/ui-native/components/ui/text";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Orb } from "@/components/orb";
import { usePreviewParams } from "@/gallery/use-preview-params";

const ORB_SIZE = 160;
const MARK_SIZE = 96;
const ENTITY_MARK_SIZE = 44;
const TOP_GAP = 16;

function Row({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="gap-3">
      <Text className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">{title}</Text>
      <View className="flex-row flex-wrap items-end gap-6">{children}</View>
    </View>
  );
}

export default function ArtRoute() {
  usePreviewParams();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView className="bg-background flex-1" contentContainerClassName="gap-10 px-5 pb-16" contentContainerStyle={{ paddingTop: insets.top + TOP_GAP }}>
      <Row title="Koban · silver and gold">
        <Koban width={200} id="k1" />
        <Koban width={120} metal="gold" id="k2" rotate={-10} />
      </Row>
      <Row title="Coin stack">
        <CoinStack width={160} id="s1" />
        <CoinStack width={110} metal="gold" id="s2" />
      </Row>
      <Row title="Hanko">
        <Hanko size={140} id="h1" />
        <Hanko size={72} id="h2" />
      </Row>
      <Row title="Paper plane">
        <PaperPlane width={220} id="p1" />
      </Row>
      <Row title="Flag">
        <Flag width={220} id="f1" wave />
      </Row>
      <Row title="Brand mark">
        <KawaseMark size={MARK_SIZE} />
        <KawaseMark size={48} />
        <KawaseMark size={48} mono="#F4F5F7" />
      </Row>
      <Row title="Glass orb">
        <View style={{ width: ORB_SIZE, height: ORB_SIZE }}>
          <Orb level={0.1} />
        </View>
        <View style={{ width: 96, height: 96 }}>
          <Orb level={0.8} />
        </View>
      </Row>
      <Row title="Real marks (delivered · pending)">
        <Mark entity="chain:eip155:1" size={ENTITY_MARK_SIZE} />
        <Mark entity="chain:eip155:8453" size={ENTITY_MARK_SIZE} />
        <Mark entity="chain:solana:mainnet" size={ENTITY_MARK_SIZE} />
        <Mark entity="chain:eip155:1" size={ENTITY_MARK_SIZE} variant="mono" tint="#F4F5F7" />
        <Mark entity="chain:eip155:8453" size={ENTITY_MARK_SIZE} variant="mono" tint="#F4F5F7" />
        <Mark entity="token:eip155:5042:0x3600000000000000000000000000000000000000" size={ENTITY_MARK_SIZE} chainBadge="chain:eip155:8453" />
        <Mark entity="provider:apple" size={ENTITY_MARK_SIZE} />
        <Mark entity="chain:eip155:137" size={ENTITY_MARK_SIZE} />
      </Row>
    </ScrollView>
  );
}
