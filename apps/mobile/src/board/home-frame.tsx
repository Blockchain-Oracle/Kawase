// Direction board: the home shell — header with the network pill (the toggle), inbox and settings; the textured
// balance card with real marks and the fee reserve; first steps; starter chips; recent activity; the glass dock
// with the orb; the plus and its fan; and the voice overlay over the live page. Sample data throughout.
import { DOCK } from "@kawase/config";
import { tokens } from "@kawase/ui-tokens";
import { ActivityFeed } from "@kawase/ui-native/components/activity-feed";
import { Amount } from "@kawase/ui-native/components/amount";
import { BlurOverlay } from "@kawase/ui-native/components/blur-overlay";
import { Caption } from "@kawase/ui-native/components/caption";
import { ConfirmSheet } from "@kawase/ui-native/components/confirm-sheet";
import { Direction } from "@kawase/ui-native/components/direction";
import { GlassDock } from "@kawase/ui-native/components/glass-dock";
import { Mark } from "@kawase/ui-native/components/mark";
import { NetworkChip, TestnetStrip } from "@kawase/ui-native/components/network-chip";
import { QuickActionFan } from "@kawase/ui-native/components/quick-action-fan";
import { StateLabel } from "@kawase/ui-native/components/state-label";
import { SuggestedActions } from "@kawase/ui-native/components/suggested-actions";
import { TexturedCard } from "@kawase/ui-native/components/textured-card";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { ArrowDownToLine, Bell, Check, Copy, Download, HandCoins, Home, MessageCircle, QrCode, ScanFace, Send, Settings2, Activity as ActivityIcon, UserRound } from "lucide-react-native";
import * as React from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Orb } from "@/components/orb";
import { BOARD, SAMPLE, SAMPLE_ADDRESS, type SampleLocale } from "@/gallery/sample";
import type { Mode, Network } from "@/theme/theme-provider";

const STRIP_INSET = 6;
const EDGE_INSET = 12;
const ORB_DOCK_SIZE = 40;
const ORB_OVERLAY_SIZE = 220;
const USDC = "token:eip155:5042:0x3600000000000000000000000000000000000000";
const EURC = "token:eip155:5042:0xbef5f6d51cb62b58e6a8f77868681825c6fe21c1";
const STEPS_DONE = 2;
const PLUS_CLEARANCE = 72;
const SCROLL_END_GAP = 24;
const FAN_GAP = 12;
const SHEET_BOTTOM_GAP = 12;

type HomeFrameProps = { locale: SampleLocale; network: Network; mode: Mode; voice?: boolean; fan?: boolean };

export function HomeFrame({ locale, network, mode, voice = false, fan = false }: HomeFrameProps) {
  const insets = useSafeAreaInsets();
  const t = BOARD[locale];
  const s = SAMPLE[locale];
  const theme = tokens.themes[network === "testnet" ? (mode === "dark" ? "testnet-dark" : "testnet") : mode];
  const testnet = network === "testnet";
  const [voiceOpen, setVoiceOpen] = React.useState(voice);
  const [fanOpen, setFanOpen] = React.useState(fan);
  const [tab, setTab] = React.useState("home");
  const top = insets.top;
  const dockClearance = DOCK.heightPt + DOCK.bottomInsetPt + insets.bottom;

  const dockItems = [
    { key: "home", label: t.home.dock.home, icon: Home },
    { key: "chat", label: t.home.dock.chat, icon: MessageCircle },
    {
      key: "voice",
      label: t.home.dock.voice,
      render: () => (
        <View style={{ width: ORB_DOCK_SIZE, height: ORB_DOCK_SIZE }}>
          <Orb colors={tokens.orb[network]} level={0.15} />
        </View>
      ),
    },
    { key: "activity", label: t.home.dock.activity, icon: ActivityIcon, badge: 1 },
    { key: "profile", label: t.home.dock.profile, icon: UserRound },
  ] as const;

  const actions = [
    { key: "send", label: s.send, icon: Send },
    { key: "request", label: s.request, icon: HandCoins },
    { key: "receive", label: t.receive.title, icon: QrCode },
    { key: "fund", label: t.home.fund, icon: ArrowDownToLine },
  ];

  return (
    <Direction rtl={locale === "ar"} className="bg-background flex-1">
      {testnet ? <TestnetStrip label={s.testnetStrip} style={{ paddingTop: top + STRIP_INSET }} /> : null}
      <ScrollView className="flex-1" contentContainerClassName="gap-6 px-5" contentContainerStyle={{ paddingTop: testnet ? EDGE_INSET : top + EDGE_INSET, paddingBottom: dockClearance + PLUS_CLEARANCE + SCROLL_END_GAP }}>
        {/* Header: the network pill is the toggle; the bell carries the inbox count. */}
        <View className="flex-row items-center justify-between">
          <Pressable accessibilityRole="switch" accessibilityLabel={s.network} accessibilityState={{ checked: !testnet }}>
            <NetworkChip label={testnet ? s.arcTestnet : s.arc} />
          </Pressable>
          <View className="flex-row items-center gap-2">
            <Button variant="secondary" size="icon" accessibilityLabel={t.home.inbox} className="size-11">
              <Icon as={Bell} className="size-5" />
              <View className="bg-accent absolute end-2 top-2 size-2 rounded-full" />
            </Button>
            <Button variant="secondary" size="icon" accessibilityLabel={t.home.settings} className="size-11">
              <Icon as={Settings2} className="size-5" />
            </Button>
          </View>
        </View>

        {/* The textured balance card. */}
        <TexturedCard lineColor={theme.texture} className="gap-5 p-5">
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-2">
              <Text className="text-foreground text-base font-semibold">{t.receive.name}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel={t.receive.copy} className="bg-secondary flex-row items-center gap-1 rounded-full px-2 py-1">
                <Amount className="text-muted-foreground text-xs">{SAMPLE_ADDRESS}</Amount>
                <Icon as={Copy} className="text-muted-foreground size-3" />
              </Pressable>
            </View>
            {testnet ? <StateLabel className="text-network">{s.testnet}</StateLabel> : <StateLabel className="text-muted-foreground">REAL MONEY</StateLabel>}
          </View>
          <View className="gap-1">
            <Text className="text-muted-foreground text-sm">{t.home.balanceLabel}</Text>
            <View className="flex-row items-baseline gap-2">
              <Amount className="font-display text-foreground text-5xl font-bold">1,240.50</Amount>
              <Text className="text-muted-foreground text-xl font-semibold">USDC</Text>
            </View>
            <View className="flex-row items-center gap-2">
              <Text className="text-muted-foreground text-sm">{s.subBalance}</Text>
              <View className="bg-secondary rounded-full px-2 py-0.5">
                <Text className="text-muted-foreground text-xs font-semibold">{t.home.feeReserve}</Text>
              </View>
            </View>
          </View>
          <View className="gap-3">
            <View className="flex-row items-center gap-3">
              <Mark entity={USDC} size={32} chainBadge="chain:eip155:5042" />
              <Text className="text-foreground flex-1 text-base font-medium">USDC</Text>
              <Amount className="text-foreground text-base">1,120.50</Amount>
            </View>
            <View className="flex-row items-center gap-3">
              <Mark entity={EURC} size={32} chainBadge="chain:eip155:5042" />
              <Text className="text-foreground flex-1 text-base font-medium">EURC</Text>
              <Amount className="text-foreground text-base">110.00</Amount>
            </View>
          </View>
          <View className="flex-row gap-3">
            <Button className="flex-1">
              <Icon as={ArrowDownToLine} className="text-primary-foreground size-5" />
              <Text>{t.home.fund}</Text>
            </Button>
            <Button variant="secondary" className="flex-1">
              <Icon as={HandCoins} className="size-5" />
              <Text>{t.home.request}</Text>
            </Button>
          </View>
        </TexturedCard>

        {/* First steps. */}
        <View className="bg-card border-border gap-3 rounded-lg border p-5">
          <Text className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">{t.home.firstSteps}</Text>
          {t.home.steps.map((step, i) => {
            const done = i < STEPS_DONE;
            return (
              <View key={step} className="flex-row items-center gap-3">
                <View className={done ? "bg-success size-6 items-center justify-center rounded-full" : "border-border size-6 items-center justify-center rounded-full border-2"}>
                  {done ? <Icon as={Check} className="text-background size-4" strokeWidth={3} /> : <Text className="text-muted-foreground text-xs font-bold">{i + 1}</Text>}
                </View>
                <Text className={done ? "text-muted-foreground flex-1 text-base line-through" : "text-foreground flex-1 text-base"}>{step}</Text>
                {i === STEPS_DONE ? (
                  <Button size="sm">
                    <Icon as={ScanFace} className="text-primary-foreground size-4" />
                    <Text>{t.faceId}</Text>
                  </Button>
                ) : null}
              </View>
            );
          })}
        </View>

        <SuggestedActions suggestions={t.home.chips.map((label) => ({ label, prompt: label }))} />

        <View className="gap-3">
          <Text className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">{t.home.recent}</Text>
          <ActivityFeed
            dense
            events={s.events.map((event, i) => ({
              ...event,
              icon: i === 1 ? <Mark entity={USDC} size={40} /> : <Mark entity="provider:kawase" size={40} />,
              tone: event.amount.startsWith("+") ? "in" : event.amount.startsWith("−") ? "out" : "neutral",
            }))}
          />
        </View>
      </ScrollView>

      <GlassDock items={dockItems} activeKey={tab} onPress={(key) => (key === "voice" ? setVoiceOpen(true) : setTab(key))} scheme={mode} tint={theme.glass} bottomInset={insets.bottom} />

      <BlurOverlay open={fanOpen} onClose={() => setFanOpen(false)} scheme={mode} scrim={theme.scrim} closeLabel={t.voice.close} close="none" />
      <QuickActionFan open={fanOpen} actions={actions} onToggle={() => setFanOpen((v) => !v)} onAction={() => setFanOpen(false)} toggleLabel={t.home.more} bottom={dockClearance + FAN_GAP} />

      <BlurOverlay open={voiceOpen} onClose={() => setVoiceOpen(false)} scheme={mode} scrim={theme.scrim} closeLabel={t.voice.close} topInset={top}>
        <View className="flex-1 items-center justify-center gap-4 px-6" style={{ paddingTop: top }}>
          <View style={{ width: ORB_OVERLAY_SIZE, height: ORB_OVERLAY_SIZE }}>
            <Orb colors={tokens.orb[network]} level={0.55} />
          </View>
          <StateLabel className="text-accent">{t.voice.listening}</StateLabel>
          <Text className="text-muted-foreground text-center text-base">{s.heard}</Text>
          <Caption text={s.agentLine} className="px-2" textClassName="font-display text-foreground text-center text-2xl font-semibold" />
          <Button variant="secondary" size="sm">
            <Icon as={Download} className="size-4" />
            <Text>{s.typeInstead}</Text>
          </Button>
        </View>
        <ConfirmSheet
          rows={[
            { label: s.send, value: "25.00 USDC", emphasis: true },
            { label: s.to, value: s.amina, detail: SAMPLE_ADDRESS },
          ]}
          style={{ paddingBottom: insets.bottom + SHEET_BOTTOM_GAP }}
        >
          <Button size="lg">
            <Icon as={ScanFace} className="text-primary-foreground size-5" />
            <Text>{s.confirm}</Text>
          </Button>
          <Button variant="ghost">
            <Text>{s.cancel}</Text>
          </Button>
        </ConfirmSheet>
      </BlurOverlay>
    </Direction>
  );
}
