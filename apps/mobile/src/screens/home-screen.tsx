// Home (surfaces.md "Home"; plan §D; R1, R13; journey 5), designed by state rather than one dashboard with different
// zeros (Codex review R09). One state is derived from the session, the wallet and the history:
//   guest      → the same layout with real market data: "Try Kawase" with Try in chat and Buy with Apple Pay, the
//                action row, First steps, and a live markets preview where the assets go. Every money action opens
//                the sign-in sheet in place and then resumes (session/use-after-sign-in.ts).
//   unknown    → the wallet is loading or cannot be read (offline): skeletons or last known, nothing "not done".
//   setup / fund / firstSend / firstAutomation → the checklist carries the next step.
//   ready      → the portfolio.
// Top to bottom (§D): 1 header (avatar → profile, network pill — hold it for both networks' totals — inbox bell);
// 2 the balance hero — the total of every asset, chain and position with the Balance Chart, tap for the breakdown;
// 3 the action row Add money · Send · Swap · Withdraw (one lime primary); 4 First steps; 5 Needs you; 6 Your assets,
// On other chains, Hidden (N), Explore; 7 Positions (earn, borrow with health, long/short with P&L); 8 For you;
// 9 Automations (next runs); 10 Contacts (quick send); 11 Recent activity. After test money is sent the balance is
// watched until it lands, and the first credit plays "You're funded" once (S2: the koban drops onto the card).
// On a desktop window (Stage 13) the same sections sit in two columns and the sidebar carries the header.
import * as Clipboard from "expo-clipboard";
import { useFocusEffect, useRouter } from "expo-router";
import { ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, MessageCircle, ScanFace, Send, Sparkles, Wallet } from "lucide-react-native";
import * as React from "react";
import { View } from "react-native";
import Animated, { FadeOut, useAnimatedScrollHandler, useSharedValue, ZoomIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { toast } from "sonner-native";

import type { ActivityItem } from "@kawase/api-client";
import { amount, formatAmount } from "@kawase/money";
import { Amount } from "@kawase/ui-native/components/amount";
import { AssetRow } from "@kawase/ui-native/components/asset-row";
import { Koban } from "@kawase/ui-native/components/art/koban";
import { PaperPlane } from "@kawase/ui-native/components/art/paper-plane";
import { CollapsingHeader } from "@kawase/ui-native/components/collapsing-header";
import { TexturedCard } from "@kawase/ui-native/components/textured-card";
import { EmptyState } from "@kawase/ui-native/components/empty-state";
import { Eyebrow } from "@kawase/ui-native/components/eyebrow";
import { FirstSteps, type FirstStep } from "@kawase/ui-native/components/first-steps";
import { ListGroup } from "@kawase/ui-native/components/list-row";
import { TestnetStrip } from "@kawase/ui-native/components/network-chip";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Skeleton } from "@kawase/ui-native/components/ui/skeleton";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";
import { useWide, WIDE_PAGE_PX } from "@kawase/ui-native/lib/wide";

import { ActivityRow, ActivityRowSkeleton } from "@/activity/activity-row";
import { ReceiptSheet } from "@/activity/receipt-sheet";
import { TabHeaderEnd, TabHeaderStart } from "@/components/tab-header";
import { useDockClearance } from "@/dock/use-dock-clearance";
import { confirmedFeedback } from "@/feedback/feedback";
import { useFund } from "@/fund/fund-provider";
import { AutomationsNext, useHomeAutomations } from "@/home/automations-next";
import { BreakdownSheet } from "@/home/breakdown-sheet";
import { ForYouSection } from "@/home/for-you";
import { NeedsYouSection } from "@/home/needs-you-section";
import { PortfolioHero } from "@/home/portfolio-hero";
import { Positions } from "@/home/positions";
import { QuickSend } from "@/home/quick-send";
import { FeeReserveChip, useFeeReserve } from "@/wallet/fee-reserve";
import { UpdatedAgo } from "@/session/updated-ago";
import { YourAssets } from "@/home/your-assets";
import { useT } from "@/i18n";
import { useLocale } from "@/i18n/locale-provider";
import { useMarket } from "@/markets/use-markets";
import { change, money, price, shortAddress } from "@/portfolio/format";
import { useFx } from "@/portfolio/use-fx";
import { tokenChip } from "@/portfolio/token-chip";
import { usePortfolio } from "@/portfolio/use-portfolio";
import { StaleBanner } from "@/session/stale-banner";
import { useSession } from "@/session/session-provider";
import { useAfterSignIn } from "@/session/use-after-sign-in";
import { useSignIn } from "@/sign-in/sign-in-provider";
import { useThemeColors } from "@/theme/use-theme-colors";
import { useActivity } from "@/wallet/use-activity";
import { useWalletStatus } from "@/wallet/use-wallet-status";

const STRIP_INSET = 6;
const EDGE_INSET = 12;
/** Roughly where the hero's big number leaves the screen; the compact total fades in there. */
const COLLAPSE_AT = 200;
const ZERO = 0n;
/** After test money is sent: when to look at the balance again (Circle's drip lands within seconds). */
const FIRST_CHECK_MS = 3_000;
const SECOND_CHECK_MS = 7_000;
const THIRD_CHECK_MS = 12_000;
const LAST_CHECK_MS = 20_000;
const CREDIT_CHECKS_MS = [FIRST_CHECK_MS, SECOND_CHECK_MS, THIRD_CHECK_MS, LAST_CHECK_MS];
const FUNDED_MOMENT_MS = 2_600;
const FUNDED_KOBAN_WIDTH = 120;
const RECENT_ROWS = 3;
const RECENT_SKELETONS = 2;
const GUEST_ART_WIDTH = 88;
const PREVIEW_ROWS = 5;
const PREVIEW_SKELETON_HEIGHT = 64;
/** The desktop layout's second column. */
const SIDE_COLUMN_PX = 400;

type HomePhase = "guest" | "unknown" | "setup" | "fund" | "firstSend" | "firstAutomation" | "ready";

export function HomeScreen() {
  const reserve = useFeeReserve();
  const wide = useWide();
  const { t } = useT();
  const { locale } = useLocale();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const clearance = useDockClearance();
  const { status, user, stale } = useSession();
  const { wallet, error: walletError, refresh } = useWalletStatus();
  const portfolio = usePortfolio();
  const fund = useFund();
  const signIn = useSignIn();
  // A guest's money action: the sign-in sheet in place, then the action itself (D13).
  const guard = useAfterSignIn();
  const automations = useHomeAutomations();
  const [breakdownOpen, setBreakdownOpen] = React.useState(false);
  const [funded, setFunded] = React.useState(false);
  const [receipt, setReceipt] = React.useState<ActivityItem>();

  const network = user?.activeNetwork ?? "testnet";
  const testnet = network === "testnet";
  const state = wallet?.networks[network];
  const activity = useActivity(network);
  const refreshActivity = activity.refresh;
  const refreshPortfolio = portfolio.refresh;
  const account = status === "account";

  // Fresh balances and history every time home comes back into view (after setup, the allowance, a switch, a trade).
  useFocusEffect(
    React.useCallback(() => {
      void refresh();
      void refreshActivity();
      void refreshPortfolio();
    }, [refresh, refreshActivity, refreshPortfolio]),
  );

  const name = !account ? t("common.guest") : user?.handle ? `@${user.handle}` : (user?.email?.split("@")[0] ?? t("common.guest"));
  const copyAddress = async () => {
    if (!wallet?.address) return;
    await Clipboard.setStringAsync(wallet.address);
    toast(t("home.addressCopied"));
  };

  const view = portfolio.portfolio;
  const hasMoney = view ? view.totalUsd > 0 : Boolean(state && (BigInt(state.usdcBalance) > ZERO || BigInt(state.eurcBalance ?? "0") > ZERO));
  // A payment out exists in the history; unknown while the history is not loaded (then nothing nags).
  const sentOnce = activity.status === "ready" ? activity.items.some((item) => item.direction === "out") : undefined;
  // Any automation made (on, paused or ended) counts; unknown while the list is not read.
  const automatedOnce = automations === undefined ? undefined : automations.some((automation) => automation.status !== "draft" && automation.status !== "canceled");
  const walletKnown = wallet !== undefined && !walletError;
  const phase: HomePhase = !account
    ? "guest"
    : !walletKnown
      ? "unknown"
      : !wallet.address || !state?.setUp
        ? "setup"
        : !hasMoney
          ? "fund"
          : sentOnce === false
            ? "firstSend"
            : automatedOnce === false
              ? "firstAutomation"
              : "ready";

  const fundAction = testnet ? { label: t("home.chipTestUsdc"), icon: ArrowDownToLine, onPress: fund.open } : { label: t("fund.title"), icon: ArrowDownToLine, onPress: fund.open };
  // Required setup and the first useful actions; the optional allowance is not a step (R09).
  const steps: FirstStep[] = [
    { key: "account", label: t("home.stepCreateAccount"), done: account, action: { label: t("signIn.title"), onPress: signIn.open } },
    { key: "wallet", label: t("home.stepSetUpWallet"), done: Boolean(state?.setUp), action: { label: t("wallet.setUp"), icon: Wallet, onPress: () => guard(() => router.push("/wallet")) } },
    { key: "funded", label: t("home.stepGetFunded"), done: account && hasMoney, action: { ...fundAction, onPress: () => guard(fund.open) } },
    { key: "send", label: t("home.stepSendFirst"), done: account && sentOnce !== false, action: { label: t("home.send"), icon: Send, onPress: () => guard(() => router.push("/send")) } },
    { key: "automation", label: t("home.stepFirstAutomation"), done: account && automatedOnce !== false, action: { label: t("home.stepAutomationAction"), icon: Sparkles, onPress: () => guard(() => router.push("/automations")) } },
  ];
  const currentStep = steps.findIndex((step) => !step.done);
  const showSteps = phase === "guest" || phase === "setup" || phase === "fund" || phase === "firstSend" || phase === "firstAutomation";
  const offerAllowance = account && walletKnown && Boolean(state?.setUp) && !state?.allowance;
  const allowancePerDay = state?.allowance?.receipt.amountPerPeriod;

  // After the fund hub sent test money, look again until the credit shows.
  React.useEffect(() => {
    if (!fund.fundedAt) return undefined;
    const timers = CREDIT_CHECKS_MS.map((delay) =>
      setTimeout(() => {
        void refresh();
        void refreshActivity();
        void refreshPortfolio();
      }, delay),
    );
    return () => timers.forEach(clearTimeout);
  }, [fund.fundedAt, refresh, refreshActivity, refreshPortfolio]);

  // "You're funded": the first time this wallet goes from empty to holding money while the app is open.
  const hadMoney = React.useRef<boolean | undefined>(undefined);
  React.useEffect(() => {
    if (!state && !view) return undefined;
    const before = hadMoney.current;
    hadMoney.current = hasMoney;
    if (before !== false || !hasMoney) return undefined;
    setFunded(true);
    toast(t("home.funded"));
    void confirmedFeedback(`funded:${user?.id}:${user?.activeNetwork}`);
    const timer = setTimeout(() => setFunded(false), FUNDED_MOMENT_MS);
    return () => clearTimeout(timer);
  }, [state, view, hasMoney, t, user?.id, user?.activeNetwork]);

  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
  });

  // Money actions: one lime primary — Add money while empty, Send once there is money. A guest's tap signs in first,
  // then goes on to the action.
  const actions = [
    // A guest's one lime action is Try in chat, on the hero itself.
    { key: "add", label: t("assets.addMoney"), icon: ArrowDownToLine, primary: account && !hasMoney, onPress: () => guard(fund.open) },
    { key: "send", label: t("assets.send"), icon: Send, primary: account && hasMoney, onPress: () => guard(() => router.push("/send")) },
    { key: "swap", label: t("assets.swap"), icon: ArrowLeftRight, primary: false, onPress: () => guard(() => router.push("/swap")) },
    { key: "withdraw", label: t("assets.withdraw"), icon: ArrowUpFromLine, primary: false, onPress: () => guard(() => router.push("/withdraw")) },
  ];
  const actionRow = actions.map((action) => (
    // Icon over label: the button grows to fit both (a fixed button height clipped the label's descenders on the web).
    <Button key={action.key} variant={action.primary ? "default" : "secondary"} className="h-auto min-h-14 flex-1 flex-col gap-1 px-1 py-2" onPress={action.onPress} accessibilityLabel={action.label}>
      <Icon as={action.icon} className={cn("size-5", action.primary && "text-primary-foreground")} />
      <Text numberOfLines={1} className="text-xs">
        {action.label}
      </Text>
    </Button>
  ));

  const hero =
    phase === "guest" ? (
      <GuestHero onTry={() => router.navigate({ pathname: "/chat", params: { prompt: t("home.chipWhatCanYouDo") } })} onBuy={() => guard(fund.open)}>
        {actionRow}
      </GuestHero>
    ) : (
      <>
        <PortfolioHero
          portfolio={view}
          name={name}
          address={wallet?.address ? shortAddress(wallet.address) : undefined}
          onCopy={() => void copyAddress()}
          onOpenBreakdown={() => setBreakdownOpen(true)}
        >
          {actionRow}
        </PortfolioHero>
        {/* Arc fees are paid in USDC: how many actions the wallet can still pay for (B2-3). */}
        <View className="flex-row flex-wrap items-center gap-3">
          <FeeReserveChip reserve={reserve} />
          {/* Offline or the last read failed: the values shown are the last good ones, and how old they are. */}
          {portfolio.error || stale ? <UpdatedAgo at={portfolio.updatedAt} /> : null}
        </View>
      </>
    );
  const fundedMoment = funded ? (
    <Animated.View pointerEvents="none" entering={ZoomIn.springify()} exiting={FadeOut} className="absolute items-center" style={{ top: 0, start: 0, end: 0 }}>
      <Koban width={FUNDED_KOBAN_WIDTH} id="funded-koban" metal="gold" />
    </Animated.View>
  ) : null;
  // Steps only from a known state: offline or unloaded is never "not done" (R01/R09).
  const firstSteps = showSteps && currentStep !== -1 ? <FirstSteps label={t("home.firstSteps")} progressLabel={t("home.stepsProgress", { n: currentStep + 1, total: steps.length })} steps={steps} /> : null;
  const allowance =
    offerAllowance && phase !== "setup" ? (
      <View className="bg-card border-border gap-3 rounded-2xl border p-5">
        <View className="flex-row items-start gap-3">
          <Icon as={ScanFace} className="text-muted-foreground mt-0.5 size-5" />
          <View className="flex-1 gap-1">
            <Text className={cn("text-foreground text-base font-semibold", TEXT_START)}>{t("home.allowanceOffTitle")}</Text>
            <Text className={cn("text-muted-foreground text-sm leading-5", TEXT_START)}>{t("home.allowanceOffBody")}</Text>
          </View>
        </View>
        <Button variant="secondary" onPress={() => router.push("/wallet")}>
          <Text>{t("home.allowanceOffAction")}</Text>
        </Button>
      </View>
    ) : allowancePerDay && phase === "ready" ? (
      <Text className="text-muted-foreground px-1 text-sm">{t("home.allowanceCue", { amount: formatAmount(amount("USDC", BigInt(allowancePerDay)), locale, { fractionDigits: 0 }) })}</Text>
    ) : null;
  // Steps automations may not take alone, waiting for the person (shown only when something waits).
  const needsYou = account ? <NeedsYouSection /> : null;
  const assets = account ? (
    <YourAssets portfolio={view} loading={portfolio.loading} error={portfolio.error} onRetry={() => void portfolio.refresh()} onAddMoney={fund.open} onVisibility={portfolio.setVisibility} />
  ) : (
    <MarketsPreview />
  );
  const positions = account ? <Positions portfolio={view} /> : null;
  // What the agent noticed (idle money, an expiring request, a slow bridge, a big move, a position near liquidation).
  const forYou = <ForYouSection />;
  const nextRuns = account ? <AutomationsNext automations={automations} /> : null;
  const contacts = account ? <QuickSend /> : null;
  const recent = account ? (
    <View className="gap-3">
      <View className="flex-row items-center justify-between">
        <Eyebrow>{t("home.recent")}</Eyebrow>
        {activity.items.length > RECENT_ROWS ? (
          <Button variant="ghost" size="sm" onPress={() => router.navigate("/activity")}>
            <Text className="text-muted-foreground">{t("activity.seeAll")}</Text>
          </Button>
        ) : null}
      </View>
      {activity.status === "loading" ? (
        <ListGroup>
          {Array.from({ length: RECENT_SKELETONS }, (_, i) => (
            <ActivityRowSkeleton key={i} />
          ))}
        </ListGroup>
      ) : activity.items.length > 0 ? (
        <ListGroup>
          {activity.items.slice(0, RECENT_ROWS).map((item) => (
            <ActivityRow key={item.id} item={item} onPress={() => setReceipt(item)} />
          ))}
        </ListGroup>
      ) : activity.status === "error" ? (
        <View className="bg-card border-border flex-row items-center gap-3 rounded-2xl border px-4 py-3">
          <Text className="text-muted-foreground flex-1 text-sm">{t("activity.loadFailed")}</Text>
          <Button size="sm" variant="secondary" onPress={() => void activity.refresh()}>
            <Text>{t("common.retry")}</Text>
          </Button>
        </View>
      ) : (
        <View className="bg-card border-border rounded-2xl border">
          <EmptyState layout="section" title={t("home.recentEmpty")} body={t("home.recentEmptyBody")} />
        </View>
      )}
    </View>
  ) : null;

  return (
    <View className="bg-background flex-1">
      {testnet ? <TestnetStrip label={t("network.testnetStrip")} style={{ paddingTop: insets.top + STRIP_INSET }} /> : null}
      {/* On a desktop window the sidebar carries the avatar, the network pill and the inbox. */}
      {wide ? null : (
        <View className="px-5" style={{ paddingTop: testnet ? EDGE_INSET : insets.top + EDGE_INSET }}>
          <CollapsingHeader
            scrollY={scrollY}
            collapseAt={COLLAPSE_AT}
            leading={<TabHeaderStart />}
            compact={view && account ? <Amount className="text-foreground text-sm font-semibold">{money(view.totalUsd, view.fx, locale)}</Amount> : undefined}
            trailing={<TabHeaderEnd />}
          />
        </View>
      )}

      <Animated.ScrollView
        className="flex-1"
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerClassName={cn("gap-6 px-5 pt-4", wide && "px-10 pt-8")}
        contentContainerStyle={{ paddingBottom: clearance.scroll }}
      >
        <StaleBanner />
        {wide ? (
          // Desktop (Stage 13): the balance, the steps and the recent activity on the left; what waits for the person,
          // the assets (a guest: the trending markets), positions and what the agent noticed on the right. Both columns
          // always have something, for a guest and for a new account alike.
          <View className="w-full flex-row items-start gap-8 self-center" style={{ maxWidth: WIDE_PAGE_PX }}>
            <View className="min-w-0 flex-1 gap-6">
              {hero}
              {fundedMoment}
              {firstSteps}
              {allowance}
              {recent}
              {contacts}
            </View>
            <View className="gap-6" style={{ width: SIDE_COLUMN_PX }}>
              {needsYou}
              {assets}
              {positions}
              {forYou}
              {nextRuns}
            </View>
          </View>
        ) : (
          <>
            {hero}
            {fundedMoment}
            {firstSteps}
            {allowance}
            {needsYou}
            {assets}
            {positions}
            {forYou}
            {nextRuns}
            {contacts}
            {recent}
          </>
        )}
      </Animated.ScrollView>

      <BreakdownSheet open={breakdownOpen} onClose={() => setBreakdownOpen(false)} portfolio={view} />
      <ReceiptSheet item={receipt} onClose={() => setReceipt(undefined)} onContactSaved={() => void activity.refresh()} />
    </View>
  );
}

/**
 * The guest's balance hero (§D "Guest Home has the same layout"): what Kawase is on the same textured card, Try in
 * chat, Buy with Apple Pay, and the same action row (each signs in first, then goes on).
 */
function GuestHero({ onTry, onBuy, children }: { onTry: () => void; onBuy: () => void; children: React.ReactNode }) {
  const { t } = useT();
  const colors = useThemeColors();
  return (
    <TexturedCard lineColor={colors.texture} className="gap-4 p-5">
      <View className="flex-row items-start gap-3">
        <View className="flex-1 gap-2">
          <Text accessibilityRole="header" className={cn("font-display text-foreground text-2xl font-bold", TEXT_START)}>
            {t("home.guestTitle")}
          </Text>
          <Text className={cn("text-muted-foreground text-base leading-6", TEXT_START)}>{t("home.guestBody")}</Text>
        </View>
        <PaperPlane width={GUEST_ART_WIDTH} id="guest-plane" />
      </View>
      <Button size="lg" onPress={onTry}>
        <Icon as={MessageCircle} className="text-primary-foreground size-5" />
        <Text>{t("assets.tryChat")}</Text>
      </Button>
      <Button variant="secondary" onPress={onBuy}>
        <Text>{t("assets.buyApplePay")}</Text>
      </Button>
      <View className="flex-row gap-2">{children}</View>
    </TexturedCard>
  );
}

/** Where a guest's assets would be: real markets on Arc with no account (R13), each opening its token page. */
function MarketsPreview() {
  const fx = useFx();
  const { t } = useT();
  const { locale } = useLocale();
  const router = useRouter();
  const colors = useThemeColors();
  const { market, loading } = useMarket("trending", "mainnet");
  const rows = (market?.rows ?? []).filter((row) => row.token.status !== "impersonator").slice(0, PREVIEW_ROWS);
  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between">
        <Eyebrow className="px-1">{t("assets.trendingPreview")}</Eyebrow>
        <Button variant="ghost" size="sm" onPress={() => router.navigate("/markets")}>
          <Text className="text-muted-foreground">{t("assets.seeMarkets")}</Text>
        </Button>
      </View>
      {loading && rows.length === 0 ? (
        <Skeleton className="rounded-2xl" style={{ height: PREVIEW_SKELETON_HEIGHT * PREVIEW_ROWS }} />
      ) : (
        <ListGroup>
          {rows.map((row) => {
            const chip = tokenChip(row.token, t);
            const changeLabel = change(row.change24hPct, locale);
            return (
              <AssetRow
                key={row.token.address}
                token={row.token}
                amount={row.token.symbol}
                value={price(row.priceUsd, fx, locale)}
                change24hPct={row.change24hPct}
                {...(changeLabel ? { changeLabel } : {})}
                {...(chip ? { chip } : {})}
                {...(row.spark ? { spark: { values: row.spark, colors: { up: colors.success, down: colors.destructive } } } : {})}
                onPress={() => router.push(`/token/${row.token.chainId}/${row.token.address}`)}
              />
            );
          })}
        </ListGroup>
      )}
    </View>
  );
}
