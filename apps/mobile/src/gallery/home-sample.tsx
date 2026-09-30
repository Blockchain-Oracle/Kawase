// The Koe home screen composed from the native components, with sample content (internal; not the live screen).
import { tokens } from "@kawase/ui-tokens";
import { Amount } from "@kawase/ui-native/components/amount";
import { Caption } from "@kawase/ui-native/components/caption";
import { ConfirmSheet } from "@kawase/ui-native/components/confirm-sheet";
import { Direction } from "@kawase/ui-native/components/direction";
import { NetworkChip, TestnetStrip } from "@kawase/ui-native/components/network-chip";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { StateLabel } from "@kawase/ui-native/components/state-label";
import { Text } from "@kawase/ui-native/components/ui/text";
import { VoiceOrb } from "@kawase/ui-native/components/voice-orb";
import { Keyboard, ScanFace } from "lucide-react-native";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SAMPLE, SAMPLE_ADDRESS, type SampleLocale } from "@/gallery/sample";
import type { Network } from "@/theme/theme-provider";

// Space between the safe area and the first or last element, in points.
const STRIP_INSET = 6;
const EDGE_INSET = 12;

type HomeSampleProps = {
  network: Network;
  locale: SampleLocale;
  /** Voice level for the orb, 0 to 1. */
  level?: number;
  /** False when embedded in the gallery, where the page already handles the safe area. */
  fullScreen?: boolean;
};

export function HomeSample({ network, locale, level = 0.35, fullScreen = true }: HomeSampleProps) {
  const insets = useSafeAreaInsets();
  const t = SAMPLE[locale];
  const testnet = network === "testnet";
  const top = fullScreen ? insets.top : 0;

  return (
    <Direction rtl={locale === "ar"} className="bg-background flex-1">
      {testnet ? <TestnetStrip label={t.testnetStrip} style={{ paddingTop: top + STRIP_INSET }} /> : null}
      <View
        className="flex-row items-center justify-between px-5 pt-3"
        style={testnet ? undefined : { paddingTop: top + EDGE_INSET }}
      >
        <NetworkChip label={testnet ? t.arcTestnet : t.arc} />
        <View className="flex-row items-center gap-3">
          <Amount className="text-muted-foreground text-sm">{t.balance}</Amount>
          <Button variant="secondary" size="icon" accessibilityLabel={t.typeInstead} className="size-11">
            <Icon as={Keyboard} className="size-5" />
          </Button>
        </View>
      </View>

      <View className="flex-1 items-center justify-center gap-4 px-6">
        <VoiceOrb colors={tokens.orb[network]} level={level} accessibilityLabel={t.listening} className="w-56" />
        <StateLabel>{t.listening}</StateLabel>
        <Text className="text-muted-foreground text-center text-sm">{t.heard}</Text>
        <Caption
          text={t.agentLine}
          className="justify-center"
          textClassName="font-display text-[26px] font-medium leading-8 tracking-tight"
        />
      </View>

      <ConfirmSheet
        rows={[
          { label: t.send, value: "25.00 USDC", emphasis: true },
          { label: t.to, value: t.amina, detail: SAMPLE_ADDRESS },
        ]}
        style={fullScreen ? { paddingBottom: insets.bottom + EDGE_INSET } : undefined}
      >
        <Button className="bg-network active:bg-network/90 h-14">
          <Icon as={ScanFace} className="text-network-foreground size-5" />
          <Text className="text-network-foreground text-base font-semibold">{t.confirm}</Text>
        </Button>
        <Button variant="ghost" className="h-11">
          <Text className="text-muted-foreground">{t.cancel}</Text>
        </Button>
      </ConfirmSheet>
    </Direction>
  );
}
