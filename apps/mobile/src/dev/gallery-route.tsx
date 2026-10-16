// Internal route /dev/gallery: every part of the Senryo kit in every state, on the live tokens. The theme switch at the
// top drives the whole app's theme (light, dark, testnet, testnet-dark), and the swatches show all four at once. Sample
// figures, names and series live ONLY here (the premium bar: no sample data anywhere else). Preview links take
// ?mode=light|dark&network=mainnet|testnet&lang=en|ar.
import { arcIdentity } from "@kawase/identity";
import { tokens, type ThemeName } from "@kawase/ui-tokens";
import { Mark } from "@kawase/ui-native/components/mark";
import * as React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { cancelAnimation, Easing, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  ActionCircle,
  ActionCircles,
  AmountPad,
  Button,
  ChangeChip,
  CountdownRing,
  DisclosureRow,
  EmptyState,
  ErrorState,
  FilterChips,
  GlassPlate,
  HoldButton,
  Icon,
  KeyValue,
  ListRow,
  LiveOdometer,
  type LiveFigure,
  LoadingState,
  type LoadingShape,
  OfflineStrip,
  Panel,
  ProgressBar,
  QuietLine,
  RollingFigure,
  Rule,
  SearchField,
  SectionLabel,
  Segmented,
  SlideToConfirm,
  Sparkline,
  StaleTick,
  Switch,
  TYPE,
  SPACE,
  RADIUS,
  SIZE,
  paletteOf,
  useHeldLoading,
  useTheme as useKitTheme,
  WaitingText,
} from "@/components/kit";
import { useDisplayFont } from "@/components/kit/fonts";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Home,
  Inbox,
  LineChart,
  MessageCircle,
  Plus,
  Search,
  Settings,
} from "@/components/kit/icons";
import { Sheet, useSheetClose } from "@/components/sheet/Sheet";
import { LIST_DETENTS } from "@/components/sheet/constants";
import { SheetPortalProvider } from "@/components/sheet/SheetHost";
import { SheetHeading } from "@/components/sheet/SheetRoute";
import { SheetRow } from "@/components/sheet/SheetRow";
import { Dock, type DockItem } from "@/components/shell/Dock";
import { DockProvider } from "@/components/shell/dock-context";
import { ModeCapsule } from "@/components/shell/ModeCapsule";
import { Rail, type RailSection } from "@/components/shell/Rail";
import { RaceGallery } from "@/chat/race-gallery";
import { RouteListGallery } from "@/routes/route-list-gallery";
import { notify } from "@/components/toast/notify";
import { BlockedCta, TxCta, TxFailureCard, TxSteps, type TxState, useTxLifecycle } from "@/components/tx";
import { fire, type HapticEvent, type SoundName } from "@/feedback/fire";
import { usePreviewParams } from "@/gallery/use-preview-params";
import { useT } from "@/i18n";
import { useTheme as useAppTheme } from "@/theme/theme-provider";
import { NEON_WEIGHT } from "@/voice/neon-shared";
import { NeonRing } from "@/voice/neon-ring";
import { VoiceIsland } from "@/voice/voice-island";
import { voiceStore, type VoicePhase } from "@/voice/voice-store";

/* eslint-disable @typescript-eslint/no-magic-numbers -- the gallery's sample data: figures, series and clocks */
const SAMPLE = {
  balance: 1_284_560_000n,
  zero: 0n,
  usdcDecimals: 6,
  series: {
    up: [1, 1.02, 0.99, 1.04, 1.08, 1.05, 1.11, 1.13, 1.12, 1.18],
    down: [1.2, 1.18, 1.19, 1.12, 1.1, 1.05, 1.07, 1.01, 0.98, 0.96],
    flat: [1, 1.001, 0.999, 1, 1.002, 0.998, 1, 1.001, 0.999, 1],
    gaps: [1, 1.03, null, null, 1.06, 1.04, 1.09, null, 1.12, 1.15],
  },
  changes: [0.0234, -0.0412, 0, null] as const,
  figureStep: 12_340_000n,
  presets: [5_000_000n, 20_000_000n, 50_000_000n],
  countdownSec: 30,
  waits: { quietMs: 0, elapsedMs: 6_000, lateMs: 20_000 },
  staleMinutes: 7,
  txHash: "0x9f2c4e1a7b3d5c6e8f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e",
  runMs: 1_400,
  secondMs: 1_000,
  tallRows: 4,
  tailRows: 2,
  progress: { calm: 34, near: 172, late: 198, max: 200 },
  dollars: (base: bigint) =>
    `$${(Number(base) / 1e6).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
  text: {
    title: "Kit gallery",
    sections: {
      tokens: "Tokens, four themes",
      type: "Type",
      buttons: "Buttons",
      surfaces: "Surfaces and rows",
      controls: "Controls",
      amount: "Amount entry",
      confirm: "Hold and slide",
      live: "Live figures",
      actions: "Quick actions and glass",
      states: "States",
      waits: "Waits",
      tx: "Money lifecycle",
      sheets: "Sheets and toasts",
      shell: "Shell",
      feedback: "Haptics and sound",
    },
    usdc: "USDC",
    eurc: "EURC",
    arc: "Arc",
    detail: "On Arc",
    send: "Send $5 to Ada",
    swap: "Swap 2 USDC to EURC",
    fee: "Network fee",
    feeValue: "$0.01",
    route: "Route",
    routeValue: "KyberSwap",
    routeDetail: "Best of 5 venues, 0.02% under the next.",
    receipt: "Sent $5 to Ada",
    enterAmount: "Enter an amount",
    overBudget: "Over your weekly budget",
    pricing: "Pricing",
    bridging: "Bridging",
    emptyWhy: "No activity yet",
    emptyDetail: "Your first move shows up here.",
    emptyAction: "Add money",
    filters: ["All", "Tokens", "Memes", "Perps"],
    segments: ["1D", "1W", "1M", "1Y"],
    searchPlaceholder: "Search tokens",
    sheetTitle: "Add money",
    sheetBody: "Pick how.",
    sheetRows: ["Apple Pay", "Debit card", "Bank transfer", "From an exchange", "From another chain"],
    listSheet: "Pick a token",
    openSheet: "Open a sheet",
    openList: "Open a list sheet (0.62 / 0.88 / 1)",
    toastSuccess: "Copied",
    toastArrived: "$25.00 arrived",
    toastError: "Couldn't refresh prices",
    toastInfo: "Prices paused",
    showDock: "Show the dock",
    holdReady: "Hold to send $5",
    slide: "Slide to swap",
    runIt: "Run a sample action",
    stillWorks: "Your balance is saved on this phone.",
    railLabel: "Navigation",
    mainnet: "Mainnet",
    testnet: "Testnet",
    switchTo: "Switch network",
  },
} as const;
/* eslint-enable @typescript-eslint/no-magic-numbers */

const THEMES: readonly ThemeName[] = ["light", "dark", "testnet", "testnet-dark"];
const SWATCHES = [
  "background",
  "card",
  "raised2",
  "foreground",
  "text2",
  "primary",
  "accent",
  "up",
  "down",
  "warn",
  "destructive",
  "networkSurface",
] as const;
const TYPE_ROLES = [
  "displayBalance",
  "pageTitle",
  "sheetTitle",
  "rowTitle",
  "row",
  "rowDetail",
  "buttonLabel",
  "meta",
] as const;
const SHAPES: readonly LoadingShape[] = ["line", "row", "list", "plate", "chart", "hero", "feed", "routes", "detail"];
const HAPTICS: readonly HapticEvent[] = [
  "tick",
  "press",
  "snap",
  "confirm",
  "filled",
  "close",
  "warn",
  "fail",
  "agentStep",
  "agentDone",
];
const SOUNDS: readonly SoundName[] = [
  "received",
  "send",
  "confirmed",
  "error",
  "agentStep",
  "agentDone",
  "sheetOpen",
  "sheetClose",
  "fanOpen",
  "voiceStart",
  "voiceEnd",
  "scene",
  "tap",
  "toggle",
];
const NOW = Date.now();
const VOICE_PREVIEW = { low: 0.08, high: 0.6, breathMs: 700, radius: 28, height: 220 } as const;
const MINUTE = 60_000;

export default function GalleryRoute() {
  usePreviewParams();
  return (
    <DockProvider>
      <SheetPortalProvider>
        <Gallery />
      </SheetPortalProvider>
    </DockProvider>
  );
}

function Gallery() {
  const { color } = useKitTheme();
  const app = useAppTheme();
  const insets = useSafeAreaInsets();
  const [dock, setDock] = React.useState(false);
  const theme = app.themeName;
  const pickTheme = (next: ThemeName) => {
    app.setMode(next === "dark" || next === "testnet-dark" ? "dark" : "light");
    app.setNetwork(next === "testnet" || next === "testnet-dark" ? "testnet" : "mainnet");
  };
  return (
    <View style={[styles.fill, { backgroundColor: color.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.page,
          { paddingTop: insets.top + SPACE.lg, paddingBottom: insets.bottom + SIZE.avatarXl * SAMPLE.tailRows },
        ]}
      >
        <Text accessibilityRole="header" style={[TYPE.pageTitle, { color: color.ink }]}>
          {SAMPLE.text.title}
        </Text>
        <Segmented
          options={THEMES.map((name) => ({ value: name, label: name }))}
          value={theme}
          onChange={pickTheme}
          label={SAMPLE.text.sections.tokens}
        />
        <VoiceSection />
        <TokensSection />
        <TypeSection />
        <ButtonsSection />
        <SurfacesSection />
        <ControlsSection />
        <AmountSection />
        <ConfirmSection />
        <LiveSection />
        <ActionsSection />
        <StatesSection />
        <WaitsSection />
        <TxSection />
        <Section title="Route race">
          <RouteListGallery />
        </Section>
        <Section title="Agent at work">
          <RaceGallery />
        </Section>
        <SheetsSection />
        <ShellSection dock={dock} setDock={setDock} />
        <FeedbackSection />
      </ScrollView>
      {dock ? <SampleDock /> : null}
    </View>
  );
}

/** Voice's neon and island with a pretend voice (no session): the level rises and falls like speech. */
function VoiceSection() {
  const { color } = useKitTheme();
  const level = useSharedValue<number>(VOICE_PREVIEW.low);
  const [phase, setPhase] = React.useState<VoicePhase>("speaking");
  const [island, setIsland] = React.useState(false);
  React.useEffect(() => {
    level.value = withRepeat(withTiming(VOICE_PREVIEW.high, { duration: VOICE_PREVIEW.breathMs, easing: Easing.inOut(Easing.quad) }), -1, true);
    return () => cancelAnimation(level);
  }, [level]);
  React.useEffect(() => {
    if (!island) return undefined;
    voiceStore.set({ phase, caption: "Okay, 5 USDC to about 5.86 EURC. Slide when you're ready." });
    return () => voiceStore.reset();
  }, [island, phase]);
  return (
    <Section title="Voice: neon and island">
      <View style={styles.wrapRow}>
        {(["speaking", "listening", "thinking", "muted"] as const).map((entry) => (
          <Chip key={entry} label={entry === phase ? `● ${entry}` : entry} onPress={() => setPhase(entry)} />
        ))}
        <Chip label={island ? "Hide the island" : "Show the island"} onPress={() => setIsland(!island)} />
      </View>
      <View style={[styles.voiceStage, { backgroundColor: color.raised2 }]}>
        <NeonRing intensity={NEON_WEIGHT[phase]} level={level} radius={VOICE_PREVIEW.radius} style={StyleSheet.absoluteFill} />
        <Text style={[TYPE.label, { color: color.text2 }]}>Where Kawase is talking</Text>
      </View>
      {island ? <VoiceIsland level={level} onOpen={() => undefined} onEnd={() => setIsland(false)} /> : null}
    </Section>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { color } = useKitTheme();
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={[TYPE.sectionTitle, { color: color.ink }]}>
        {title}
      </Text>
      {children}
    </View>
  );
}

function Label({ children }: { children: string }) {
  return <SectionLabel>{children}</SectionLabel>;
}

function TokensSection() {
  const { color } = useKitTheme();
  return (
    <Section title={SAMPLE.text.sections.tokens}>
      {THEMES.map((name) => {
        const p = paletteOf(name);
        return (
          <View key={name} style={[styles.swatchRow, { backgroundColor: p.background, borderRadius: RADIUS.md }]}>
            <Text style={[TYPE.meta, styles.swatchName, { color: p.foreground }]}>{name}</Text>
            <View style={styles.swatches}>
              {SWATCHES.map((role) => (
                <View
                  key={role}
                  accessibilityLabel={`${name} ${role}`}
                  style={[styles.swatch, { backgroundColor: p[role], borderColor: p.border }]}
                />
              ))}
            </View>
          </View>
        );
      })}
      <Text style={[TYPE.meta, { color: color.text3 }]}>{SWATCHES.join(" · ")}</Text>
    </Section>
  );
}

function TypeSection() {
  const { color } = useKitTheme();
  return (
    <Section title={SAMPLE.text.sections.type}>
      {TYPE_ROLES.map((role) => (
        <View key={role} style={styles.typeRow}>
          <Text style={[TYPE.meta, styles.typeName, { color: color.text3 }]}>{role}</Text>
          <Text numberOfLines={1} style={[TYPE[role], styles.grow, { color: color.ink }]}>
            {role === "displayBalance"
              ? SAMPLE.dollars(SAMPLE.balance)
              : `${tokens.fonts.body} / ${tokens.fonts.display}`}
          </Text>
        </View>
      ))}
    </Section>
  );
}

function ButtonsSection() {
  const variants = ["primary", "secondary", "outline", "ghost", "destructive"] as const;
  return (
    <Section title={SAMPLE.text.sections.buttons}>
      {variants.map((variant) => (
        <View key={variant} style={styles.stack}>
          <Label>{variant}</Label>
          <Button label={SAMPLE.text.send} variant={variant} onPress={() => undefined} />
          <View style={styles.row}>
            <Button label={variant} variant={variant} size="sm" block={false} onPress={() => undefined} />
            <Button label={variant} variant={variant} size="sm" block={false} loading />
            <Button label={variant} variant={variant} size="sm" block={false} disabled />
          </View>
        </View>
      ))}
      <Panel style={styles.panelPad}>
        <Label>on a group (level 1)</Label>
        <Button label={SAMPLE.text.swap} variant="secondary" onPress={() => undefined} />
      </Panel>
    </Section>
  );
}

function SurfacesSection() {
  const { network } = useAppTheme();
  const ids = arcIdentity(network);
  return (
    <Section title={SAMPLE.text.sections.surfaces}>
      <Panel>
        <ListRow
          title={SAMPLE.text.usdc}
          detail={SAMPLE.text.detail}
          leading={<Mark entity={ids.usdc} size={SIZE.markRow} chainBadge={ids.chain} />}
          onPress={() => undefined}
        />
        <ListRow
          title={SAMPLE.text.eurc}
          detail={SAMPLE.text.detail}
          leading={<Mark entity={ids.eurc} size={SIZE.markRow} />}
          trailing={<ChangeChip change={SAMPLE.changes[1]} />}
        />
        <ListRow
          title={SAMPLE.text.arc}
          leading={<Mark entity={ids.chain} size={SIZE.markRow} />}
          onPress={() => undefined}
        />
      </Panel>
      <Panel style={styles.panelPad}>
        <KeyValue label={SAMPLE.text.fee} value={SAMPLE.text.feeValue} />
        <Rule />
        <DisclosureRow title={SAMPLE.text.route} value={SAMPLE.text.routeValue}>
          <QuietLine>{SAMPLE.text.routeDetail}</QuietLine>
        </DisclosureRow>
      </Panel>
    </Section>
  );
}

function ControlsSection() {
  const [segment, setSegment] = React.useState<string>(SAMPLE.text.segments[0]);
  const [filter, setFilter] = React.useState<string>(SAMPLE.text.filters[0]);
  const [on, setOn] = React.useState(true);
  const [query, setQuery] = React.useState("");
  return (
    <Section title={SAMPLE.text.sections.controls}>
      <Segmented
        options={SAMPLE.text.segments.map((s) => ({ value: s, label: s }))}
        value={segment}
        onChange={setSegment}
        label={SAMPLE.text.sections.controls}
      />
      <FilterChips
        options={SAMPLE.text.filters.map((s) => ({ value: s, label: s }))}
        value={filter}
        onChange={setFilter}
        label={SAMPLE.text.sections.controls}
      />
      <View style={styles.row}>
        <Switch value={on} onValueChange={setOn} accessibilityLabel={SAMPLE.text.sections.controls} />
        <Switch value={!on} onValueChange={(v) => setOn(!v)} accessibilityLabel={SAMPLE.text.sections.controls} />
        <Switch value={on} onValueChange={setOn} accessibilityLabel={SAMPLE.text.sections.controls} disabled />
      </View>
      <SearchField value={query} onChange={setQuery} placeholder={SAMPLE.text.searchPlaceholder} />
      <SearchField value={SAMPLE.text.usdc} onChange={() => undefined} placeholder={SAMPLE.text.searchPlaceholder} />
    </Section>
  );
}

function AmountSection() {
  const [amount, setAmount] = React.useState<bigint>(SAMPLE.zero);
  const [preset, setPreset] = React.useState<bigint>(SAMPLE.zero);
  const over = amount > SAMPLE.balance;
  return (
    <Section title={SAMPLE.text.sections.amount}>
      <Label>balance chips (1/4 1/2 3/4 All, exact base units)</Label>
      <View style={styles.pad}>
        <AmountPad
          value={amount}
          onChange={setAmount}
          decimals={SAMPLE.usdcDecimals}
          balance={SAMPLE.balance}
          note={SAMPLE.dollars(SAMPLE.balance)}
          problem={over ? SAMPLE.text.overBudget : null}
        />
      </View>
      <Button
        label={`reset (${amount.toString()} base units)`}
        variant="ghost"
        size="sm"
        block={false}
        onPress={() => setAmount(SAMPLE.zero)}
      />
      <Label>presets, token suffix</Label>
      <View style={styles.pad}>
        <AmountPad
          value={preset}
          onChange={setPreset}
          decimals={SAMPLE.usdcDecimals}
          prefix=""
          suffix={SAMPLE.text.usdc}
          chips={SAMPLE.presets.map((v) => ({ label: SAMPLE.dollars(v), value: v }))}
        />
      </View>
    </Section>
  );
}

function ConfirmSection() {
  return (
    <Section title={SAMPLE.text.sections.confirm}>
      <HoldButton label={SAMPLE.text.holdReady} ready onConfirm={() => notify.success(SAMPLE.text.holdReady)} />
      <HoldButton label={SAMPLE.text.enterAmount} ready={false} onConfirm={() => undefined} />
      <HoldButton label={SAMPLE.text.holdReady} ready busy onConfirm={() => undefined} />
      {(["primary", "accent", "up", "down"] as const).map((tone) => (
        <SlideToConfirm
          key={tone}
          label={`${SAMPLE.text.slide} (${tone})`}
          tone={tone}
          onConfirm={() => notify.success(tone)}
        />
      ))}
      <SlideToConfirm label={SAMPLE.text.slide} surface="solid" onConfirm={() => undefined} />
      <SlideToConfirm label={SAMPLE.text.enterAmount} disabled onConfirm={() => undefined} />
      <SlideToConfirm label={SAMPLE.text.pricing} busy onConfirm={() => undefined} />
    </Section>
  );
}

function LiveSection() {
  const { color } = useKitTheme();
  const [value, setValue] = React.useState<bigint>(SAMPLE.balance);
  const source = useSharedValue<LiveFigure>({ text: SAMPLE.dollars(SAMPLE.balance), trend: 0 });
  const step = (direction: 1 | -1) => {
    const next = value + SAMPLE.figureStep * BigInt(direction);
    setValue(next);
    source.set({ text: SAMPLE.dollars(next), trend: direction });
  };
  const [start, setStart] = React.useState(() => Math.floor(Date.now() / SAMPLE.secondMs));
  // The sample window restarts when it runs out, so the ring is always draining here.
  React.useEffect(() => {
    const id = setInterval(
      () => setStart(Math.floor(Date.now() / SAMPLE.secondMs)),
      SAMPLE.countdownSec * SAMPLE.secondMs,
    );
    return () => clearInterval(id);
  }, []);
  const deadline = start + SAMPLE.countdownSec;
  const font = useDisplayFont(TYPE.positionPnl.fontSize ?? SIZE.icon);
  return (
    <Section title={SAMPLE.text.sections.live}>
      <RollingFigure
        text={SAMPLE.dollars(value)}
        value={value}
        color={color.ink}
        height={TYPE.displayBalance.lineHeight ?? SIZE.avatarLg}
        align="left"
        sensitive
      />
      <LiveOdometer
        source={source}
        font={font}
        color={color.text2}
        height={TYPE.positionPnl.lineHeight ?? SIZE.avatarSm}
      />
      <View style={styles.row}>
        <Button label="−" variant="secondary" size="sm" block={false} onPress={() => step(-1)} />
        <Button label="+" variant="secondary" size="sm" block={false} onPress={() => step(1)} />
      </View>
      <View style={styles.row}>
        {(Object.keys(SAMPLE.series) as (keyof typeof SAMPLE.series)[]).map((key) => (
          <View key={key} style={styles.center}>
            <Sparkline points={SAMPLE.series[key]} />
            <Text style={[TYPE.meta, { color: color.text3 }]}>{key}</Text>
          </View>
        ))}
      </View>
      <View style={styles.row}>
        {SAMPLE.changes.map((change, i) => (
          <ChangeChip key={i} change={change} />
        ))}
      </View>
      {(["calm", "near", "late"] as const).map((tone) => (
        <ProgressBar
          key={tone}
          tone={tone}
          value={SAMPLE.progress[tone]}
          max={SAMPLE.progress.max}
          label={tone}
          valueText={`${SAMPLE.progress[tone]} / ${SAMPLE.progress.max}`}
        />
      ))}
      <View style={styles.row}>
        <CountdownRing fromSec={start} toSec={deadline} />
        <CountdownRing fromSec={start} toSec={deadline} size={SIZE.avatarLg} stroke={SPACE.xs} color={color.accent} />
      </View>
    </Section>
  );
}

function ActionsSection() {
  const { color } = useKitTheme();
  return (
    <Section title={SAMPLE.text.sections.actions}>
      <ActionCircles>
        <ActionCircle icon={ArrowUpRight} label="Send" onPress={() => undefined} />
        <ActionCircle icon={ArrowDownLeft} label="Receive" onPress={() => undefined} />
        <ActionCircle icon={Plus} label="Add" onPress={() => undefined} primary />
        <ActionCircle icon={Search} label="Swap" onPress={() => undefined} reason={SAMPLE.text.enterAmount} />
      </ActionCircles>
      <GlassPlate style={styles.glass}>
        <Text style={[TYPE.rowStrong, { color: color.ink }]}>GlassPlate</Text>
      </GlassPlate>
    </Section>
  );
}

function StatesSection() {
  const [held, setHeld] = React.useState(false);
  const shown = useHeldLoading(held);
  return (
    <Section title={SAMPLE.text.sections.states}>
      {SHAPES.map((shape) => (
        <View key={shape} style={styles.stack}>
          <Label>{`loading: ${shape}`}</Label>
          <LoadingState shape={shape} />
        </View>
      ))}
      <Label>named loading (pixel loader + seconds)</Label>
      <LoadingState shape="routes" label={SAMPLE.text.pricing} named />
      <Label>useHeldLoading (120 ms delay, 300 ms minimum)</Label>
      <View style={styles.row}>
        <Button
          label={held ? "stop" : "start"}
          size="sm"
          variant="secondary"
          block={false}
          onPress={() => setHeld((v) => !v)}
        />
        <Text style={TYPE.meta}>{shown ? "skeleton up" : "no skeleton"}</Text>
      </View>
      <EmptyState
        why={SAMPLE.text.emptyWhy}
        detail={SAMPLE.text.emptyDetail}
        icon={Inbox}
        action={{ label: SAMPLE.text.emptyAction, onPress: () => undefined }}
      />
      <EmptyState why={SAMPLE.text.emptyWhy} size="inline" />
      <ErrorState
        diagnosis={{ kind: "offline", retryable: true }}
        retry={() => undefined}
        stillWorks={SAMPLE.text.stillWorks}
      />
      <ErrorState
        diagnosis={{ kind: "balance", retryable: false, technical: "INSUFFICIENT_BALANCE" }}
        onFix={() => undefined}
      />
      <ErrorState
        diagnosis={{ kind: "server", retryable: true, technical: "500 · upstream" }}
        retry={() => undefined}
        variant="strip"
      />
      <StaleTick asOf={NOW - SAMPLE.staleMinutes * MINUTE} />
      <StaleTick asOf={NOW - SAMPLE.staleMinutes * MINUTE} reason="offline" />
      <StaleTick asOf={NOW} reason="paused" compact />
      <OfflineStrip asOf={NOW - SAMPLE.staleMinutes * MINUTE} />
      <OfflineStrip />
    </Section>
  );
}

function WaitsSection() {
  return (
    <Section title={SAMPLE.text.sections.waits}>
      <WaitingText startedAtMs={NOW - SAMPLE.waits.quietMs}>{SAMPLE.text.pricing}</WaitingText>
      <WaitingText startedAtMs={NOW - SAMPLE.waits.elapsedMs}>{SAMPLE.text.bridging}</WaitingText>
      <WaitingText startedAtMs={NOW - SAMPLE.waits.lateMs} onRetry={() => undefined}>
        {SAMPLE.text.bridging}
      </WaitingText>
      <BlockedCta
        blocker={{ label: SAMPLE.text.overBudget, reason: SAMPLE.text.overBudget, fix: { kind: "set-budget" } }}
        onFix={() => undefined}
      />
      <BlockedCta blocker={{ label: SAMPLE.text.enterAmount }} />
      <BlockedCta blocker={{ label: SAMPLE.text.pricing, busy: true }} />
    </Section>
  );
}

const TX_STATES: readonly { name: string; state: TxState }[] = [
  { name: "idle", state: { kind: "idle" } },
  { name: "review", state: { kind: "review" } },
  { name: "blocked", state: { kind: "blocked", reason: "Enter an amount" } },
  { name: "signing", state: { kind: "signing", startedAt: NOW } },
  { name: "submitted", state: { kind: "submitted", txHash: SAMPLE.txHash, startedAt: NOW } },
  {
    name: "unknown",
    state: { kind: "unknown", txHash: SAMPLE.txHash, diagnosis: { kind: "timeout", retryable: true } },
  },
  { name: "confirmed", state: { kind: "confirmed", txHash: SAMPLE.txHash } },
  {
    name: "failed · no",
    state: { kind: "failed", moneyMoved: "no", txHash: null, diagnosis: { kind: "balance", retryable: false } },
  },
  {
    name: "failed · unknown",
    state: {
      kind: "failed",
      moneyMoved: "unknown",
      txHash: SAMPLE.txHash,
      diagnosis: { kind: "server", retryable: true },
    },
  },
];

function TxSection() {
  const { color } = useKitTheme();
  const runner = useTxLifecycle();
  const run = () =>
    void runner.run(
      async (progress) => {
        await new Promise((resolve) => setTimeout(resolve, SAMPLE.runMs));
        progress.submitted(SAMPLE.txHash);
        await new Promise((resolve) => setTimeout(resolve, SAMPLE.runMs));
        return { status: "confirmed", txHash: SAMPLE.txHash };
      },
      { identity: `gallery-${Date.now()}`, sound: "send" },
    );
  const receipt = (
    <Panel style={styles.panelPad}>
      <Text style={[TYPE.rowTitle, { color: color.ink }]}>{SAMPLE.text.receipt}</Text>
      <KeyValue label={SAMPLE.text.fee} value={SAMPLE.text.feeValue} />
      <Button label="again" variant="ghost" size="sm" block={false} onPress={runner.reset} />
    </Panel>
  );
  return (
    <Section title={SAMPLE.text.sections.tx}>
      <Label>live: idle → signing → sent → confirmed → receipt (with sound)</Label>
      <TxCta state={runner.state} action={SAMPLE.text.send} onConfirm={run} receipt={receipt} />
      {TX_STATES.map(({ name, state }) => (
        <View key={name} style={styles.stack}>
          <Label>{name}</Label>
          <TxCta
            state={state}
            action={SAMPLE.text.swap}
            tone={name === "review" ? "accent" : "primary"}
            onConfirm={() => undefined}
            onFix={() => undefined}
            blocker={
              state.kind === "blocked"
                ? { label: state.reason, fix: { kind: "add-money" }, reason: SAMPLE.text.enterAmount }
                : undefined
            }
          />
        </View>
      ))}
      <TxSteps state={{ kind: "submitted", txHash: SAMPLE.txHash, startedAt: NOW }} />
      <TxFailureCard
        state={{
          kind: "failed",
          moneyMoved: "no",
          txHash: SAMPLE.txHash,
          diagnosis: { kind: "gas", retryable: false, technical: "INSUFFICIENT_GAS" },
        }}
        onFix={() => undefined}
        explorerUrl={`https://testnet.arcscan.app/tx/${SAMPLE.txHash}`}
      />
      <TxFailureCard
        state={{
          kind: "failed",
          moneyMoved: "yes",
          txHash: SAMPLE.txHash,
          diagnosis: { kind: "slippage", retryable: true },
        }}
        onRetry={() => undefined}
      />
    </Section>
  );
}

function SheetsSection() {
  const { t } = useT();
  const [open, setOpen] = React.useState<"content" | "list" | null>(null);
  return (
    <Section title={SAMPLE.text.sections.sheets}>
      <Button label={SAMPLE.text.openSheet} variant="secondary" onPress={() => setOpen("content")} />
      <Button label={SAMPLE.text.openList} variant="secondary" onPress={() => setOpen("list")} />
      <View style={styles.row}>
        <Button
          label="success"
          size="sm"
          variant="secondary"
          block={false}
          onPress={() => notify.success(SAMPLE.text.toastSuccess)}
        />
        <Button
          label="arrived"
          size="sm"
          variant="secondary"
          block={false}
          onPress={() => notify.arrived(SAMPLE.text.toastArrived, { identity: `gallery-${Date.now()}` })}
        />
        <Button
          label="error"
          size="sm"
          variant="secondary"
          block={false}
          onPress={() => notify.error(SAMPLE.text.toastError)}
        />
        <Button
          label="info"
          size="sm"
          variant="secondary"
          block={false}
          onPress={() => notify.info(SAMPLE.text.toastInfo)}
        />
      </View>
      {open === "content" ? (
        <Sheet onClose={() => setOpen(null)} closeLabel={t("shell.kit.closeNamed", { name: SAMPLE.text.sheetTitle })}>
          <SheetHeading title={SAMPLE.text.sheetTitle} body={SAMPLE.text.sheetBody} />
          <SheetBody />
        </Sheet>
      ) : null}
      {open === "list" ? (
        <Sheet
          onClose={() => setOpen(null)}
          closeLabel={t("shell.kit.closeNamed", { name: SAMPLE.text.listSheet })}
          detents={LIST_DETENTS}
        >
          <SheetHeading title={SAMPLE.text.listSheet} />
          {SAMPLE.text.sheetRows.concat(SAMPLE.text.sheetRows).map((row, i) => (
            <SheetRow key={`${row}-${i}`} title={row} detail={SAMPLE.text.detail} index={i} onPress={() => undefined} />
          ))}
        </Sheet>
      ) : null}
    </Section>
  );
}

function SheetBody() {
  const close = useSheetClose();
  return (
    <>
      {SAMPLE.text.sheetRows.map((row, i) => (
        <SheetRow key={row} title={row} index={i} onPress={() => close()} />
      ))}
    </>
  );
}

function ShellSection({ dock, setDock }: { dock: boolean; setDock: (next: boolean) => void }) {
  const { network } = useAppTheme();
  const { color } = useKitTheme();
  const [active, setActive] = React.useState("index");
  const sections: RailSection[] = [
    {
      key: "main",
      rows: [
        { key: "index", label: "Home", icon: Home },
        { key: "markets", label: "Markets", icon: LineChart },
        { key: "chat", label: "Chat", icon: MessageCircle, badge: 3 },
        { key: "settings", label: "Settings", icon: Settings, reason: SAMPLE.text.enterAmount },
      ],
    },
  ];
  return (
    <Section title={SAMPLE.text.sections.shell}>
      <View style={styles.row}>
        <ModeCapsule
          network="mainnet"
          label={SAMPLE.text.mainnet}
          switchLabel={SAMPLE.text.switchTo}
          onToggle={() => undefined}
        />
        <ModeCapsule
          network="testnet"
          label={SAMPLE.text.testnet}
          switchLabel={SAMPLE.text.switchTo}
          onToggle={() => undefined}
        />
        <ModeCapsule
          network={network}
          label={network}
          switchLabel={SAMPLE.text.switchTo}
          busy
          compact
          onToggle={() => undefined}
        />
      </View>
      <View style={[styles.railBox, { backgroundColor: color.secondary }]}>
        <Rail
          label={SAMPLE.text.railLabel}
          sections={sections}
          activeKey={active}
          onPress={setActive}
          compact={false}
        />
        <Rail label={SAMPLE.text.railLabel} sections={sections} activeKey={active} onPress={setActive} compact />
      </View>
      <View style={styles.row}>
        <Switch value={dock} onValueChange={setDock} accessibilityLabel={SAMPLE.text.showDock} />
        <Text style={[TYPE.row, { color: color.ink }]}>{SAMPLE.text.showDock}</Text>
      </View>
    </Section>
  );
}

function SampleDock() {
  const [active, setActive] = React.useState("index");
  const items: DockItem[] = [
    { key: "index", label: "Home", icon: Home },
    { key: "markets", label: "Markets", icon: LineChart },
    { key: "voice", label: "Voice", icon: Plus, action: true },
    { key: "chat", label: "Chat", icon: MessageCircle, badge: 2 },
    { key: "settings", label: "Settings", icon: Settings },
  ];
  return <Dock items={items} activeKey={active} onPress={(key) => key !== "voice" && setActive(key)} />;
}

function FeedbackSection() {
  const { color } = useKitTheme();
  return (
    <Section title={SAMPLE.text.sections.feedback}>
      <View style={styles.wrapRow}>
        {HAPTICS.map((event) => (
          <Chip key={event} label={event} onPress={() => fire(event)} />
        ))}
      </View>
      <View style={styles.wrapRow}>
        {SOUNDS.map((sound) => (
          <Chip
            key={sound}
            label={`♪ ${sound}`}
            onPress={() => fire(sound === "error" ? "fail" : "confirm", { sound })}
          />
        ))}
      </View>
      <Text style={[TYPE.meta, { color: color.text3 }]}>{tokens.name}</Text>
    </Section>
  );
}

function Chip({ label, onPress }: { label: string; onPress: () => void }) {
  const { color } = useKitTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.chip, { backgroundColor: pressed ? color.rowPressed : color.raised2 }]}
    >
      <Icon icon={Plus} size={SIZE.iconSm} tint={color.text3} />
      <Text style={[TYPE.chipLabel, { color: color.ink }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  voiceStage: { height: VOICE_PREVIEW.height, borderRadius: VOICE_PREVIEW.radius, alignItems: "center", justifyContent: "center", marginTop: SPACE.md },
  fill: { flex: 1 },
  page: { paddingHorizontal: SPACE.inset, gap: SPACE.xxl },
  section: { gap: SPACE.md },
  stack: { gap: SPACE.sm },
  row: { flexDirection: "row", alignItems: "center", gap: SPACE.sm, flexWrap: "wrap" },
  wrapRow: { flexDirection: "row", flexWrap: "wrap", gap: SPACE.sm },
  center: { alignItems: "center", gap: SPACE.xs },
  grow: { flex: 1 },
  panelPad: { padding: SPACE.lg, gap: SPACE.sm },
  pad: { minHeight: SIZE.avatarXl * SAMPLE.tallRows },
  swatchRow: { padding: SPACE.md, gap: SPACE.sm },
  swatchName: { fontWeight: "600" },
  swatches: { flexDirection: "row", flexWrap: "wrap", gap: SPACE.xs },
  swatch: {
    width: SIZE.avatarSm,
    height: SIZE.avatarSm,
    borderRadius: RADIUS.xs,
    borderWidth: StyleSheet.hairlineWidth,
  },
  typeRow: { flexDirection: "row", alignItems: "center", gap: SPACE.md },
  typeName: { width: SIZE.avatarXl + SIZE.avatarSm },
  glass: { padding: SPACE.lg, borderRadius: RADIUS.lg, alignItems: "center" },
  railBox: {
    flexDirection: "row",
    gap: SPACE.md,
    padding: SPACE.md,
    borderRadius: RADIUS.lg,
    minHeight: SIZE.avatarXl * SAMPLE.tallRows,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.xs,
    height: SIZE.chipHeight,
    paddingHorizontal: SPACE.md,
    borderRadius: RADIUS.pill,
  },
});
