// Direction board: the receive page — the dotted QR assembling from particles with the chain mark at the centre,
// the identity row with the network selector, the Arc-only warning, Copy and Share. The QR encodes the sample
// address here and always the live address in the app.
import { tokens } from "@kawase/ui-tokens";
import { Amount } from "@kawase/ui-native/components/amount";
import { Direction } from "@kawase/ui-native/components/direction";
import { DottedQr } from "@kawase/ui-native/components/dotted-qr";
import { Mark } from "@kawase/ui-native/components/mark";
import { NetworkChip, TestnetStrip } from "@kawase/ui-native/components/network-chip";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { ChevronDown, ChevronLeft, Copy, Share2, TriangleAlert } from "lucide-react-native";
import { Pressable, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BOARD, SAMPLE, SAMPLE_ADDRESS, SAMPLE_FULL_ADDRESS, type SampleLocale } from "@/gallery/sample";
import type { Network } from "@/theme/theme-provider";

const STRIP_INSET = 6;
const EDGE_INSET = 12;
const QR_MARGIN = 40;
const QR_MAX = 300;
const QR_PADDING = 20;
const CENTER_MARK = 44;
const CENTER_PADDING = 6;
const FOOTER_GAP = 16;
const HALF = 0.5;

type ReceiveFrameProps = { locale: SampleLocale; network: Network };

export function ReceiveFrame({ locale, network }: ReceiveFrameProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const t = BOARD[locale];
  const s = SAMPLE[locale];
  const testnet = network === "testnet";
  const chain = testnet ? "chain:eip155:5042002" : "chain:eip155:5042";
  const qrSize = Math.min(QR_MAX, width - (QR_MARGIN + QR_PADDING) / HALF);
  const dark = tokens.themes.dark;

  return (
    <Direction rtl={locale === "ar"} className="bg-background flex-1">
      {testnet ? <TestnetStrip label={s.testnetStrip} style={{ paddingTop: insets.top + STRIP_INSET }} /> : null}
      <View className="flex-row items-center gap-3 px-5" style={{ paddingTop: testnet ? EDGE_INSET : insets.top + EDGE_INSET }}>
        <Button variant="secondary" size="icon" accessibilityLabel={s.cancel} className="size-11">
          <Icon as={ChevronLeft} className="size-5 rtl:-scale-x-100" />
        </Button>
        <Text className="font-display text-foreground text-2xl font-bold">{t.receive.title}</Text>
      </View>

      <View className="flex-1 items-center justify-center gap-6 px-5">
        {/* The code sits on an ink tile so it scans on both themes. */}
        <View className="items-center justify-center rounded-lg" style={{ padding: QR_PADDING, backgroundColor: dark.background }}>
          <DottedQr
            value={SAMPLE_FULL_ADDRESS}
            size={qrSize}
            dotColor={dark.foreground}
            background={dark.background}
            center={
              <View className="items-center justify-center rounded-2xl" style={{ backgroundColor: dark.background, padding: CENTER_PADDING }}>
                <Mark entity={chain} size={CENTER_MARK} />
              </View>
            }
          />
        </View>

        <View className="w-full gap-3">
          <Pressable accessibilityRole="button" accessibilityLabel={s.network} className="bg-card border-border flex-row items-center gap-3 rounded-full border py-3 pe-4 ps-3">
            <Mark entity={chain} size={32} />
            <View className="flex-1 flex-row items-center gap-2">
              <Text className="text-foreground text-base font-semibold">{t.receive.name}</Text>
              <Amount className="text-muted-foreground text-sm">{SAMPLE_ADDRESS}</Amount>
            </View>
            <NetworkChip label={testnet ? s.arcTestnet : s.arc} />
            <Icon as={ChevronDown} className="text-muted-foreground size-4" />
          </Pressable>
          <View className="bg-network-surface flex-row items-start gap-2 rounded-2xl px-4 py-3">
            <Icon as={TriangleAlert} className="text-network mt-0.5 size-4" />
            <Text className="text-network flex-1 text-sm">{t.receive.warning}</Text>
          </View>
        </View>
      </View>

      <View className="gap-3 px-5" style={{ paddingBottom: insets.bottom + FOOTER_GAP }}>
        <Button size="lg">
          <Icon as={Copy} className="text-primary-foreground size-5" />
          <Text>{t.receive.copy}</Text>
        </Button>
        <Button size="lg" variant="secondary">
          <Icon as={Share2} className="size-5" />
          <Text>{t.receive.share}</Text>
        </Button>
      </View>
    </Direction>
  );
}
