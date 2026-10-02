// Home (surfaces.md "Home"; R1, R13; journey 5), designed by state rather than one dashboard with different zeros
// (Codex review R09). One state is derived from the session, the wallet and the history:
//   guest      → "Try Kawase" with Try in chat and Buy with Apple Pay (signs in, then resumes), and a live markets
//                preview (real data, no account). Every money action opens the sign-in sheet in place.
//   unknown    → the wallet is loading or cannot be read (offline): skeletons or last known, nothing "not done".
//   setup / fund / firstSend → the checklist carries the next required step.
//   ready      → the portfolio.
// Signed in, top to bottom: the header (avatar → profile, network pill, inbox); the balance hero — the total of every
// asset, chain and position with the Balance Chart, tap for the breakdown; the action row Add money · Send · Swap ·
// Withdraw (one lime primary); first steps; the optional allowance; Your assets (every token, real marks), On other
// chains, Hidden (N), Explore; Positions; Recent activity. After test money is sent the balance is watched until it
// lands, and the first credit plays "You're funded" once (S2: the koban drops onto the card).
import * as Clipboard from "expo-clipboard";
import { useFocusEffect, useRouter } from "expo-router";
import { ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, MessageCircle, ScanFace, Send, Wallet } from "lucide-react-native";
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

import { ActivityRow, ActivityRowSkeleton } from "@/activity/activity-row";
import { ReceiptSheet } from "@/activity/receipt-sheet";
import { HeaderAvatar } from "@/components/header-avatar";
import { LanguagePill, LanguageSheet } from "@/components/language-sheet";
import { NetworkPill } from "@/components/network-pill";
import { useDockClearance } from "@/dock/use-dock-clearance";
import { confirmedFeedback } from "@/feedback/feedback";
import { useFund } from "@/fund/fund-provider";
import { BreakdownSheet } from "@/home/breakdown-sheet";
import { PortfolioHero } from "@/home/portfolio-hero";
import { YourAssets } from "@/home/your-assets";
import { useT } from "@/i18n";
import { useLocale } from "@/i18n/locale-provider";
import { InboxBell } from "@/inbox/inbox-bell";
import { useMarket } from "@/markets/use-markets";
import { change, money, price, shortAddress, USD_FX } from "@/portfolio/format";
import { tokenChip } from "@/portfolio/token-chip";
import { usePortfolio } from "@/portfolio/use-portfolio";
import { StaleBanner } from "@/session/stale-banner";
import { useSession } from "@/session/session-provider";
import { useSignIn } from "@/sign-in/sign-in-provider";
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

type HomePhase = "guest" | "unknown" | "setup" | "fund" | "firstSend" | "ready";

export function HomeScreen() {
  const { t } = useT();
  const { locale } = useLocale();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const clearance = useDockClearance();
  const { status, user } = useSession();
  const { wallet, error: walletError, refresh } = useWalletStatus();
  const portfolio = usePortfolio();
  const fund = useFund();
  const signIn = useSignIn();
  const [languageOpen, setLanguageOpen] = React.useState(false);
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
            : "ready";

  const fundAction = testnet ? { label: t("home.chipTestUsdc"), icon: ArrowDownToLine, onPress: fund.open } : { label: t("fund.title"), icon: ArrowDownToLine, onPress: fund.open };
  // Required setup and the first useful actions; the optional allowance is not a step (R09).
  const steps: FirstStep[] = [
    { key: "account", label: t("home.stepCreateAccount"), done: account, action: { label: t("signIn.title"), onPress: signIn.open } },
    { key: "wallet", label: t("home.stepSetUpWallet"), done: Boolean(state?.setUp), action: { label: t("wallet.setUp"), icon: Wallet, onPress: () => router.push("/wallet") } },
    { key: "funded", label: t("home.stepGetFunded"), done: hasMoney, action: fundAction },
    { key: "send", label: t("home.stepSendFirst"), done: sentOnce !== false, action: { label: t("home.send"), icon: Send, onPress: () => router.push("/send") } },
  ];
  const currentStep = steps.findIndex((step) => !step.done);
  const showSteps = phase === "setup" || phase === "fund" || phase === "firstSend";
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

  // Money actions: one lime primary — Add money while empty, Send once there is money.
  const actions = [
    { key: "add", label: t("assets.addMoney"), icon: ArrowDownToLine, primary: !hasMoney, onPress: fund.open },
    { key: "send", label: t("assets.send"), icon: Send, primary: hasMoney, onPress: () => router.push("/send") },
    { key: "swap", label: t("assets.swap"), icon: ArrowLeftRight, primary: false, onPress: () => router.push("/swap") },
    { key: "withdraw", label: t("assets.withdraw"), icon: ArrowUpFromLine, primary: false, onPress: () => router.push("/withdraw") },
  ];

  return (
    <View className="bg-background flex-1">
      {testnet ? <TestnetStrip label={t("network.testnetStrip")} style={{ paddingTop: insets.top + STRIP_INSET }} /> : null}
      <View className="px-5" style={{ paddingTop: testnet ? EDGE_INSET : insets.top + EDGE_INSET }}>
        <CollapsingHeader
          scrollY={scrollY}
          collapseAt={COLLAPSE_AT}
          leading={
            <>
              <HeaderAvatar />
              {!account ? <LanguagePill onPress={() => setLanguageOpen(true)} /> : null}
              <NetworkPill />
            </>
          }
          compact={view ? <Amount className="text-foreground text-sm font-semibold">{money(view.totalUsd, view.fx, locale)}</Amount> : undefined}
          trailing={
            account ? (
              <InboxBell />
            ) : (
              <Button size="sm" variant="secondary" onPress={signIn.open}>
                <Text>{t("signIn.title")}</Text>
              </Button>
            )
          }
        />
      </View>

      <Animated.ScrollView className="flex-1" onScroll={onScroll} scrollEventThrottle={16} contentContainerClassName="gap-6 px-5 pt-4" contentContainerStyle={{ paddingBottom: clearance.scroll }}>
        <StaleBanner />
        {phase === "guest" ? (
          <GuestHome onTry={() => router.navigate({ pathname: "/chat", params: { prompt: t("home.chipWhatCanYouDo") } })} onBuy={signIn.open} />
        ) : (
          <PortfolioHero
            portfolio={view}
            name={name}
            address={wallet?.address ? shortAddress(wallet.address) : undefined}
            onCopy={() => void copyAddress()}
            onOpenBreakdown={() => setBreakdownOpen(true)}
          >
            {actions.map((action) => (
              <Button key={action.key} variant={action.primary ? "default" : "secondary"} className="flex-1 flex-col gap-1 px-1 py-2" style={{ height: undefined }} onPress={action.onPress} accessibilityLabel={action.label}>
                <Icon as={action.icon} className={cn("size-5", action.primary && "text-primary-foreground")} />
                <Text numberOfLines={1} className="text-xs">
                  {action.label}
                </Text>
              </Button>
            ))}
          </PortfolioHero>
        )}
        {funded ? (
          <Animated.View pointerEvents="none" entering={ZoomIn.springify()} exiting={FadeOut} className="absolute items-center" style={{ top: 0, start: 0, end: 0 }}>
            <Koban width={FUNDED_KOBAN_WIDTH} id="funded-koban" metal="gold" />
          </Animated.View>
        ) : null}

        {/* Steps only from a known state: offline or unloaded is never "not done" (R01/R09). */}
        {showSteps && currentStep !== -1 ? <FirstSteps label={t("home.firstSteps")} progressLabel={t("home.stepsProgress", { n: currentStep + 1, total: steps.length })} steps={steps} /> : null}

        {offerAllowance && phase !== "setup" ? (
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
        ) : null}

        {account ? (
          <YourAssets portfolio={view} loading={portfolio.loading} error={portfolio.error} onRetry={() => void portfolio.refresh()} onAddMoney={fund.open} onVisibility={portfolio.setVisibility} />
        ) : null}

        {account ? (
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
        ) : null}
      </Animated.ScrollView>

      <LanguageSheet open={languageOpen} onClose={() => setLanguageOpen(false)} />
      <BreakdownSheet open={breakdownOpen} onClose={() => setBreakdownOpen(false)} portfolio={view} />
      <ReceiptSheet item={receipt} onClose={() => setReceipt(undefined)} onContactSaved={() => void activity.refresh()} />
    </View>
  );
}

/** Guest Home: what Kawase is, the two ways in, and real markets with no account (R13). */
function GuestHome({ onTry, onBuy }: { onTry: () => void; onBuy: () => void }) {
  const { t } = useT();
  const { locale } = useLocale();
  const router = useRouter();
  const { market, loading } = useMarket("trending", "mainnet");
  const rows = (market?.rows ?? []).filter((row) => row.token.status !== "impersonator").slice(0, PREVIEW_ROWS);
  return (
    <>
      <View className="bg-card border-border gap-4 overflow-hidden rounded-3xl border p-5">
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
      </View>
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
                  value={price(row.priceUsd, USD_FX, locale)}
                  change24hPct={row.change24hPct}
                  {...(changeLabel ? { changeLabel } : {})}
                  {...(chip ? { chip } : {})}
                  onPress={() => router.push(`/token/${row.token.chainId}/${row.token.address}`)}
                />
              );
            })}
          </ListGroup>
        )}
      </View>
    </>
  );
}
