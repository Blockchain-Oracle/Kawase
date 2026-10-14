// Internal gallery (native): every base component in light, dark, testnet and Arabic right-to-left.
import { tokens } from "@kawase/ui-tokens";
import { arcIdentity } from "@kawase/identity";
import { ActivityFeed } from "@kawase/ui-native/components/activity-feed";
import { Amount } from "@kawase/ui-native/components/amount";
import { BalanceCard } from "@kawase/ui-native/components/balance-card";
import { Bubble, BubbleContent } from "@kawase/ui-native/components/bubble";
import { Caption } from "@kawase/ui-native/components/caption";
import { Composer } from "@kawase/ui-native/components/composer";
import { ConfirmSheet } from "@kawase/ui-native/components/confirm-sheet";
import { Direction } from "@kawase/ui-native/components/direction";
import { HoldToConfirm } from "@kawase/ui-native/components/hold-to-confirm";
import { NetworkChip, TestnetStrip } from "@kawase/ui-native/components/network-chip";
import { ReceiptCard } from "@kawase/ui-native/components/receipt-card";
import { SegmentedControl } from "@kawase/ui-native/components/segmented-control";
import { StateLabel } from "@kawase/ui-native/components/state-label";
import { SuggestedActions } from "@kawase/ui-native/components/suggested-actions";
import { Badge } from "@kawase/ui-native/components/ui/badge";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Input } from "@kawase/ui-native/components/ui/input";
import { Skeleton } from "@kawase/ui-native/components/ui/skeleton";
import { Switch } from "@kawase/ui-native/components/ui/switch";
import { Text } from "@kawase/ui-native/components/ui/text";
import { VoiceOrb } from "@kawase/ui-native/components/voice-orb";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarClock,
  ScanFace,
} from "lucide-react-native";
import * as React from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SAMPLE, SAMPLE_ADDRESS, type SampleLocale } from "@/gallery/sample";
import { RouteListGallery } from "@/routes/route-list-gallery";
import { useTheme, type Mode, type Network } from "@/theme/theme-provider";

const EVENT_ICONS = { a: ArrowUpRight, b: ArrowDownLeft, c: CalendarClock } as const;
const ORB_LEVELS = { quiet: 0, speaking: 0.6 } as const;
// Space between the safe area and the page's first and last elements, in points.
const TOP_INSET = 12;
const BOTTOM_INSET = 32;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="gap-3">
      <Text className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">{title}</Text>
      {children}
    </View>
  );
}

type GalleryScreenProps = {
  initialLocale?: SampleLocale;
  /** Where the page starts scrolled to, for screenshots. */
  initialScroll?: number;
};

export function GalleryScreen({ initialLocale = "en", initialScroll = 0 }: GalleryScreenProps) {
  const insets = useSafeAreaInsets();
  const { mode, network, themeName, setMode, setNetwork } = useTheme();
  const [locale, setLocale] = React.useState<SampleLocale>(initialLocale);
  const [orb, setOrb] = React.useState<keyof typeof ORB_LEVELS>("speaking");
  const [message, setMessage] = React.useState("");
  const [enabled, setEnabled] = React.useState(true);
  const [log, setLog] = React.useState("");
  const t = SAMPLE[locale];
  const testnet = network === "testnet";
  const arc = arcIdentity(network);

  return (
    <ScrollView
      className="bg-background flex-1"
      contentContainerStyle={{ paddingTop: insets.top + TOP_INSET, paddingBottom: insets.bottom + BOTTOM_INSET }}
      contentOffset={{ x: 0, y: initialScroll }}
      keyboardShouldPersistTaps="handled"
    >
      <View className="gap-3 px-4 pb-6">
        <Text className="font-display text-2xl font-semibold">Gallery</Text>
        <View className="flex-row flex-wrap gap-2">
          <SegmentedControl
            label="Mode"
            value={mode}
            onValueChange={(value) => setMode(value as Mode)}
            options={[
              { value: "dark", label: "Dark" },
              { value: "light", label: "Light" },
            ]}
          />
          <SegmentedControl
            label="Network"
            value={network}
            onValueChange={(value) => setNetwork(value as Network)}
            options={[
              { value: "mainnet", label: "Mainnet" },
              { value: "testnet", label: "Testnet" },
            ]}
          />
          <SegmentedControl
            label="Language"
            value={locale}
            onValueChange={(value) => setLocale(value as SampleLocale)}
            options={[
              { value: "en", label: "English" },
              { value: "ar", label: "العربية" },
            ]}
          />
        </View>
      </View>

      <Direction rtl={locale === "ar"} className="gap-8 px-4">
        <Section title="Type">
          <Text className="font-display text-[32px] font-semibold leading-10">Kawase 為替 · {t.listening}</Text>
          <Text className="font-display text-[26px] font-medium leading-8">{t.agentLine}</Text>
          <Text className="text-base">{t.agentReply}</Text>
          <Text className="text-muted-foreground text-sm">{t.heard}</Text>
          <Amount className="text-2xl font-semibold">1,240.50 USDC</Amount>
          <Amount className="text-muted-foreground text-sm">{SAMPLE_ADDRESS}</Amount>
          <Text className="text-base">हिन्दी · বাংলা · اردو · 中文 · Русский</Text>
        </Section>

        <Section title="Network">
          <TestnetStrip label={t.testnetStrip} className="rounded-lg" />
          <View className="flex-row">
            <NetworkChip label={testnet ? t.arcTestnet : t.arc} />
          </View>
        </Section>

        <Section title="Buttons">
          <View className="flex-row flex-wrap gap-2">
            <Button>
              <Text>{t.send}</Text>
            </Button>
            <Button variant="secondary">
              <Text>{t.request}</Text>
            </Button>
            <Button variant="outline">
              <Text>{t.swap}</Text>
            </Button>
            <Button variant="ghost">
              <Text>{t.cancel}</Text>
            </Button>
            <Button variant="destructive">
              <Text>Delete</Text>
            </Button>
            <Button disabled>
              <Text>Disabled</Text>
            </Button>
          </View>
          <View className="flex-row flex-wrap items-center gap-2">
            <Badge>
              <Text>Primary</Text>
            </Badge>
            <Badge variant="secondary">
              <Text>Secondary</Text>
            </Badge>
            <Badge variant="outline">
              <Text>Outline</Text>
            </Badge>
            <Badge variant="destructive">
              <Text>Failed</Text>
            </Badge>
          </View>
        </Section>

        <Section title="Inputs">
          <Input placeholder={t.composer.placeholder} />
          <View className="flex-row items-center gap-3">
            <Switch checked={enabled} onCheckedChange={setEnabled} accessibilityLabel={t.testnet} />
            <Text className="text-sm">{t.testnet}</Text>
          </View>
          <SegmentedControl
            label={t.network}
            defaultValue="mainnet"
            options={[
              { value: "mainnet", label: t.mainnet },
              { value: "testnet", label: t.testnet },
            ]}
          />
          <Skeleton className="h-10 w-full" />
        </Section>

        <Section title="Orb and caption">
          <View className="items-center gap-4">
            <VoiceOrb
              colors={tokens.orb[network]}
              level={ORB_LEVELS[orb]}
              accessibilityLabel={t.listening}
              className="w-56"
            />
            <StateLabel>{t.listening}</StateLabel>
            <SegmentedControl
              label="Voice level"
              value={orb}
              onValueChange={(value) => setOrb(value as keyof typeof ORB_LEVELS)}
              options={[
                { value: "quiet", label: "Quiet" },
                { value: "speaking", label: "Speaking" },
              ]}
            />
            <Caption
              key={`${locale}-${orb}`}
              text={t.agentLine}
              className="justify-center"
              textClassName="font-display text-[26px] font-medium leading-8 tracking-tight"
            />
          </View>
        </Section>

        <Section title="Confirm">
          <View className="border-border overflow-hidden rounded-xl border">
            <ConfirmSheet
              rows={[
                { label: t.send, value: "25.00 USDC", emphasis: true },
                { label: t.to, value: t.amina, detail: SAMPLE_ADDRESS },
              ]}
            >
              <Button className="bg-network active:bg-network/90 h-14" onPress={() => setLog("confirm pressed")}>
                <Icon as={ScanFace} className="text-network-foreground size-5" />
                <Text className="text-network-foreground text-base font-semibold">{t.confirm}</Text>
              </Button>
              <Button variant="ghost" className="h-11" onPress={() => setLog("cancel pressed")}>
                <Text className="text-muted-foreground">{t.cancel}</Text>
              </Button>
            </ConfirmSheet>
          </View>
          <HoldToConfirm
            confirmLabel={t.held}
            onConfirm={() => setLog("hold completed")}
            onAbort={() => setLog("hold released early")}
          >
            {t.hold}
          </HoldToConfirm>
          <Text className="text-muted-foreground text-xs">Last action: {log || "none"}</Text>
        </Section>

        <Section title="Receipt">
          <ReceiptCard
            title={t.receiptTitle}
            badge={testnet ? t.arcTestnet : t.arc}
            details={[
              { label: t.to, value: `${t.amina} · ${SAMPLE_ADDRESS}` },
              { label: t.fee, value: "0.0021 USDC" },
              { label: t.total, value: "25.0021 USDC", isBold: true },
            ]}
            buttonText={t.viewReceipt}
            onAction={() => setLog("receipt opened")}
          />
        </Section>

        <Section title="Balance card">
          <BalanceCard
            name="@abu"
            address={SAMPLE_ADDRESS}
            copyLabel={t.send}
            eyebrow={testnet ? t.testnet : "Real money"}
            eyebrowTone={testnet ? "testnet" : "real"}
            balanceLabel={t.totalBalance}
            total="1,240.50"
            symbol="USDC"
            subline={t.subBalance}
            feeReserve="~40"
            rows={[
              { key: "usdc", entity: arc.usdc, chainBadge: arc.chain, symbol: "USDC", amount: "1,194.38" },
              { key: "eurc", entity: arc.eurc, chainBadge: arc.chain, symbol: "EURC", amount: "42.30" },
            ]}
            lineColor={tokens.themes[themeName].texture}
          />
        </Section>

        <Section title="Activity">
          <ActivityFeed
            events={t.events.map((event, index) => ({
              ...event,
              icon: <Icon as={EVENT_ICONS[event.id]} className="size-4" />,
              tone: index === 1 ? "in" : "out",
            }))}
          />
        </Section>

        <Section title="Route race">
          <RouteListGallery />
        </Section>

        <Section title="Conversation">
          <Bubble align="end">
            <BubbleContent>{t.userMessage}</BubbleContent>
          </Bubble>
          <Bubble variant="muted">
            <BubbleContent>{t.agentReply}</BubbleContent>
          </Bubble>
          <SuggestedActions
            suggestions={t.suggestions.map((label) => ({ label, prompt: label }))}
            onSelect={(prompt) => setMessage(prompt)}
          />
          <Composer
            value={message}
            onValueChange={setMessage}
            onSubmit={() => {
              setLog(`sent: ${message}`);
              setMessage("");
            }}
            onTalk={() => setLog("talk pressed")}
            labels={t.composer}
          />
        </Section>
      </Direction>
    </ScrollView>
  );
}
