// Home (journey 5), designed by state rather than one dashboard with different zeros (Codex review R09). One state is
// derived from the session, the wallet and the history, and each state has one main (lime) action:
//   guest      → what Kawase is, "Try it in chat"; sign-in stays quiet. No empty balance card.
//   unknown    → the wallet is loading or cannot be read (offline): balances as skeletons or last known, nothing
//                presented as "not done" (R01).
//   setup      → the next required step (set up the wallet) in the checklist, with progress.
//   fund       → small balance + "Get test USDC" (testnet) / "Add money" as the checklist's action.
//   firstSend  → funded, no payment sent yet: "Send" as the checklist's action.
//   ready      → balances, the allowance cue, recent activity, and Send as the card's main action.
// The allowance is optional and offered on its own card, never as a required step; the big number is labelled as
// USDC with its real mark and EURC has its own row, so nothing reads as a converted total. Chips only ask for what
// works. The header keeps the language pill (guests), the network toggle, the inbox and settings; the glass dock, the
// plus and the overlays belong to the (tabs) layout. After test money is sent the balance is watched until it lands,
// and the first credit plays "You're funded" once (S2: the koban drops onto the card).
import * as Clipboard from "expo-clipboard";
import { useFocusEffect, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { ArrowDownToLine, MessageCircle, QrCode, ScanFace, Send, Settings2, Wallet } from "lucide-react-native";
import * as React from "react";
import { Platform, View } from "react-native";
import Animated, { FadeOut, useAnimatedScrollHandler, useSharedValue, ZoomIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { toast } from "sonner-native";

import { arcIdentity } from "@kawase/identity";
import { amount, formatAmount, type AssetId } from "@kawase/money";
import { Amount } from "@kawase/ui-native/components/amount";
import { Koban } from "@kawase/ui-native/components/art/koban";
import { PaperPlane } from "@kawase/ui-native/components/art/paper-plane";
import { BalanceCard, type BalanceRow } from "@kawase/ui-native/components/balance-card";
import { CollapsingHeader } from "@kawase/ui-native/components/collapsing-header";
import type { ActivityItem } from "@kawase/api-client";
import { EmptyState } from "@kawase/ui-native/components/empty-state";
import { ListGroup } from "@kawase/ui-native/components/list-row";
import { Eyebrow } from "@kawase/ui-native/components/eyebrow";
import { FirstSteps, type FirstStep } from "@kawase/ui-native/components/first-steps";
import { Mark } from "@kawase/ui-native/components/mark";
import { TestnetStrip } from "@kawase/ui-native/components/network-chip";
import { SuggestedActions } from "@kawase/ui-native/components/suggested-actions";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { LanguagePill, LanguageSheet } from "@/components/language-sheet";
import { NetworkPill } from "@/components/network-pill";
import { ActivityRow, ActivityRowSkeleton } from "@/activity/activity-row";
import { ReceiptSheet } from "@/activity/receipt-sheet";
import { InboxBell } from "@/inbox/inbox-bell";
import { StaleBanner } from "@/session/stale-banner";
import { useDockClearance } from "@/dock/use-dock-clearance";
import { useFund } from "@/fund/fund-provider";
import { useLocale } from "@/i18n/locale-provider";
import { useT } from "@/i18n";
import { useSession } from "@/session/session-provider";
import { useSignIn } from "@/sign-in/sign-in-provider";
import { useThemeColors } from "@/theme/use-theme-colors";
import { useActivity } from "@/wallet/use-activity";
import { useWalletStatus } from "@/wallet/use-wallet-status";

const STRIP_INSET = 6;
const EDGE_INSET = 12;
const ADDRESS_HEAD = 6;
const ADDRESS_TAIL = 4;
/** Roughly where the card's big number leaves the screen; the compact balance fades in there. */
const COLLAPSE_AT = 180;
const COMPACT_MARK = 18;
const ZERO = 0n;
/** After test money is sent: when to look at the balance again (Circle's drip lands within seconds). */
const FIRST_CHECK_MS = 3_000;
const SECOND_CHECK_MS = 7_000;
const THIRD_CHECK_MS = 12_000;
const LAST_CHECK_MS = 20_000;
const CREDIT_CHECKS_MS = [FIRST_CHECK_MS, SECOND_CHECK_MS, THIRD_CHECK_MS, LAST_CHECK_MS];
const FUNDED_MOMENT_MS = 2_600;
const FUNDED_KOBAN_WIDTH = 120;
const RECENT_ROWS = 5;
const RECENT_SKELETONS = 2;

/** The chip that opens the fund hub instead of the chat. */
const FUND_CHIP = "kawase:fund";
const GUEST_ART_WIDTH = 88;

type HomePhase = "guest" | "unknown" | "setup" | "fund" | "firstSend" | "ready";

const shortAddress = (address: string) => `${address.slice(0, ADDRESS_HEAD)}…${address.slice(-ADDRESS_TAIL)}`;

export function HomeScreen() {
  const { t } = useT();
  const { locale } = useLocale();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const clearance = useDockClearance();
  const { status, user } = useSession();
  const { wallet, loading, error: walletError, refresh } = useWalletStatus();
  const fund = useFund();
  const signIn = useSignIn();
  const [languageOpen, setLanguageOpen] = React.useState(false);
  const [funded, setFunded] = React.useState(false);
  const [receipt, setReceipt] = React.useState<ActivityItem>();

  const network = user?.activeNetwork ?? "testnet";
  const testnet = network === "testnet";
  const ids = arcIdentity(network);
  const state = wallet?.networks[network];
  const activity = useActivity(network);
  const refreshActivity = activity.refresh;

  // Fresh balances and history every time home comes back into view (after setup, the allowance, a switch).
  useFocusEffect(
    React.useCallback(() => {
      void refresh();
      void refreshActivity();
    }, [refresh, refreshActivity]),
  );
  const account = status === "account";
  // The card names each asset beside its number, so the numbers go without the symbol.
  const format = (asset: AssetId, baseUnits: string) =>
    formatAmount(amount(asset, BigInt(baseUnits)), locale, { withSymbol: false });
  const zero = format("USDC", "0");

  // Guests see the zero state; an account without a wallet yet sees it too; otherwise the live balance.
  const pending = account && (loading || !wallet) && !state;
  const usdc = state ? format("USDC", state.usdcBalance) : pending ? undefined : zero;
  // `eurcBalance` is missing from an api deployed before it was added; the row then shows zero rather than failing.
  const eurc = state ? format("EURC", state.eurcBalance ?? "0") : pending ? undefined : format("EURC", "0");
  // The big number is USDC (with its mark); EURC has its own row. Nothing is shown as a converted total (R09).
  const rows: BalanceRow[] = [{ key: "eurc", entity: ids.eurc, chainBadge: ids.chain, symbol: "EURC", amount: eurc }];
  const name = !account
    ? t("common.guest")
    : user?.handle
      ? `@${user.handle}`
      : (user?.email?.split("@")[0] ?? t("common.guest"));

  const copyAddress = async () => {
    if (!wallet?.address) return;
    await Clipboard.setStringAsync(wallet.address);
    toast(t("home.addressCopied"));
  };

  const hasMoney = Boolean(state && (BigInt(state.usdcBalance) > ZERO || BigInt(state.eurcBalance ?? "0") > ZERO));
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

  const fundAction = testnet
    ? { label: t("home.chipTestUsdc"), icon: ArrowDownToLine, onPress: fund.open }
    : { label: t("fund.title"), icon: ArrowDownToLine, onPress: fund.open };
  // Required setup and the first useful actions; the optional allowance is not a step (R09).
  const steps: FirstStep[] = [
    {
      key: "account",
      label: t("home.stepCreateAccount"),
      done: account,
      action: { label: t("signIn.title"), onPress: signIn.open },
    },
    {
      key: "wallet",
      label: t("home.stepSetUpWallet"),
      done: Boolean(state?.setUp),
      action: { label: t("wallet.setUp"), icon: Wallet, onPress: () => router.push("/wallet") },
    },
    { key: "funded", label: t("home.stepGetFunded"), done: hasMoney, action: fundAction },
    {
      key: "send",
      label: t("home.stepSendFirst"),
      done: sentOnce !== false,
      action: { label: t("home.send"), icon: Send, onPress: () => router.push("/send") },
    },
  ];
  const currentStep = steps.findIndex((step) => !step.done);
  const showSteps = phase === "setup" || phase === "fund" || phase === "firstSend";
  const offerAllowance = account && walletKnown && Boolean(state?.setUp) && !state?.allowance;
  const allowancePerDay = state?.allowance?.receipt.amountPerPeriod;
  const allowanceCue = allowancePerDay
    ? t("home.allowanceCue", {
        amount: formatAmount(amount("USDC", BigInt(allowancePerDay)), locale, { fractionDigits: 0 }),
      })
    : undefined;

  // After the fund hub sent test money, look again until the credit shows.
  React.useEffect(() => {
    if (!fund.fundedAt) return undefined;
    const timers = CREDIT_CHECKS_MS.map((delay) =>
      setTimeout(() => {
        void refresh();
        void activity.refresh();
      }, delay),
    );
    return () => timers.forEach(clearTimeout);
  }, [fund.fundedAt, refresh, activity.refresh]);

  // "You're funded": the first time this wallet goes from empty to holding money while the app is open.
  const hadMoney = React.useRef<boolean | undefined>(undefined);
  React.useEffect(() => {
    if (!state) return undefined;
    const before = hadMoney.current;
    hadMoney.current = hasMoney;
    if (before !== false || !hasMoney) return undefined;
    setFunded(true);
    toast(t("home.funded"));
    if (Platform.OS !== "web") void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const timer = setTimeout(() => setFunded(false), FUNDED_MOMENT_MS);
    return () => clearTimeout(timer);
  }, [state, hasMoney, t]);

  // Chips ask the agent in chat about things that work today; test money is an action of its own (the fund hub),
  // offered as a chip only when it is not already the main action.
  const chips = [
    { label: t("home.chipWhatCanYouDo"), prompt: t("home.chipWhatCanYouDo") },
    ...(phase === "guest" ? [{ label: t("home.chipHowSending"), prompt: t("home.chipHowSending") }] : []),
    ...(phase === "ready" || phase === "firstSend"
      ? [{ label: t("home.chipSendExample"), prompt: t("home.chipSendExample") }]
      : []),
    ...(testnet && account && phase !== "fund" && phase !== "setup"
      ? [{ label: t("home.chipTestUsdc"), prompt: FUND_CHIP }]
      : []),
  ];

  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
  });

  return (
    <View className="bg-background flex-1">
      {testnet ? (
        <TestnetStrip label={t("network.testnetStrip")} style={{ paddingTop: insets.top + STRIP_INSET }} />
      ) : null}
      <View className="px-5" style={{ paddingTop: testnet ? EDGE_INSET : insets.top + EDGE_INSET }}>
        <CollapsingHeader
          scrollY={scrollY}
          collapseAt={COLLAPSE_AT}
          leading={
            <>
              {!account ? <LanguagePill onPress={() => setLanguageOpen(true)} /> : null}
              <NetworkPill />
            </>
          }
          compact={
            usdc !== undefined ? (
              <View className="flex-row items-center gap-1.5">
                <Mark entity={ids.usdc} size={COMPACT_MARK} />
                <Amount className="text-foreground text-sm font-semibold">{usdc}</Amount>
              </View>
            ) : undefined
          }
          trailing={
            <>
              <InboxBell />
              <Button
                variant="secondary"
                size="icon"
                accessibilityLabel={t("settings.title")}
                className="size-11"
                onPress={() => router.navigate("/settings")}
              >
                <Icon as={Settings2} className="size-5" />
              </Button>
            </>
          }
        />
      </View>

      <Animated.ScrollView
        className="flex-1"
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerClassName="gap-6 px-5 pt-4"
        contentContainerStyle={{ paddingBottom: clearance.scroll }}
      >
        <StaleBanner />
        {phase === "guest" ? (
          <View className="bg-card border-border gap-4 overflow-hidden rounded-3xl border p-5">
            <View className="flex-row items-start gap-3">
              <View className="flex-1 gap-2">
                <Text
                  accessibilityRole="header"
                  className={cn("font-display text-foreground text-2xl font-bold", TEXT_START)}
                >
                  {t("home.guestTitle")}
                </Text>
                <Text className={cn("text-muted-foreground text-base leading-6", TEXT_START)}>
                  {t("home.guestBody")}
                </Text>
              </View>
              <PaperPlane width={GUEST_ART_WIDTH} id="guest-plane" />
            </View>
            <Button
              size="lg"
              onPress={() => router.navigate({ pathname: "/chat", params: { prompt: t("home.chipWhatCanYouDo") } })}
            >
              <Icon as={MessageCircle} className="text-primary-foreground size-5" />
              <Text>{t("home.guestTry")}</Text>
            </Button>
            <Button variant="ghost" onPress={signIn.open}>
              <Text className="text-foreground">{t("signIn.title")}</Text>
            </Button>
          </View>
        ) : (
          <BalanceCard
            name={name}
            address={wallet?.address ? shortAddress(wallet.address) : undefined}
            copyLabel={t("home.copyAddress")}
            onCopy={() => void copyAddress()}
            eyebrow={testnet ? t("network.testnet") : t("network.realMoney")}
            eyebrowTone={testnet ? "testnet" : "real"}
            balanceLabel={t("home.usdcBalance")}
            total={usdc}
            symbol="USDC"
            totalEntity={ids.usdc}
            totalChainBadge={ids.chain}
            {...(phase === "ready" && allowanceCue ? { subline: allowanceCue } : {})}
            rows={rows}
            lineColor={colors.texture}
          >
            {phase === "ready" ? (
              <>
                <Button className="flex-1" onPress={() => router.push("/send")}>
                  <Icon as={Send} className="text-primary-foreground size-5" />
                  <Text>{t("home.send")}</Text>
                </Button>
                <Button variant="secondary" className="flex-1" onPress={fund.open}>
                  <Icon as={ArrowDownToLine} className="size-5" />
                  <Text>{t("home.fund")}</Text>
                </Button>
              </>
            ) : phase === "fund" || phase === "firstSend" ? (
              // The checklist carries the main action; the card keeps quiet ways to receive and add money.
              <>
                <Button variant="secondary" className="flex-1" onPress={() => router.push("/wallet/receive")}>
                  <Icon as={QrCode} className="size-5" />
                  <Text>{t("home.receive")}</Text>
                </Button>
                {phase === "firstSend" ? (
                  <Button variant="secondary" className="flex-1" onPress={fund.open}>
                    <Icon as={ArrowDownToLine} className="size-5" />
                    <Text>{t("home.fund")}</Text>
                  </Button>
                ) : null}
              </>
            ) : null}
          </BalanceCard>
        )}
        {funded ? (
          <Animated.View
            pointerEvents="none"
            entering={ZoomIn.springify()}
            exiting={FadeOut}
            className="absolute items-center"
            style={{ top: 0, start: 0, end: 0 }}
          >
            <Koban width={FUNDED_KOBAN_WIDTH} id="funded-koban" metal="gold" />
          </Animated.View>
        ) : null}

        {/* Steps only from a known state: offline or unloaded is never "not done" (R01/R09). */}
        {showSteps && currentStep !== -1 ? (
          <FirstSteps
            label={t("home.firstSteps")}
            progressLabel={t("home.stepsProgress", { n: currentStep + 1, total: steps.length })}
            steps={steps}
          />
        ) : null}

        {offerAllowance && phase !== "setup" ? (
          <View className="bg-card border-border gap-3 rounded-2xl border p-5">
            <View className="flex-row items-start gap-3">
              <Icon as={ScanFace} className="text-muted-foreground mt-0.5 size-5" />
              <View className="flex-1 gap-1">
                <Text className={cn("text-foreground text-base font-semibold", TEXT_START)}>
                  {t("home.allowanceOffTitle")}
                </Text>
                <Text className={cn("text-muted-foreground text-sm leading-5", TEXT_START)}>
                  {t("home.allowanceOffBody")}
                </Text>
              </View>
            </View>
            <Button variant="secondary" onPress={() => router.push("/wallet")}>
              <Text>{t("home.allowanceOffAction")}</Text>
            </Button>
          </View>
        ) : null}

        <SuggestedActions
          suggestions={chips}
          onSelect={(prompt) =>
            prompt === FUND_CHIP ? fund.open() : router.navigate({ pathname: "/chat", params: { prompt } })
          }
        />

        {phase !== "guest" ? (
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
              <>
                {activity.stale ? (
                  <View className="bg-muted flex-row items-center gap-3 rounded-2xl px-4 py-2.5">
                    <Text accessibilityLiveRegion="polite" className="text-muted-foreground flex-1 text-sm">
                      {t("activity.stale")}
                    </Text>
                    <Button size="sm" variant="ghost" onPress={() => void activity.refresh()}>
                      <Text className="text-foreground">{t("common.retry")}</Text>
                    </Button>
                  </View>
                ) : null}
                <ListGroup>
                  {activity.items.slice(0, RECENT_ROWS).map((item) => (
                    <ActivityRow key={item.id} item={item} onPress={() => setReceipt(item)} />
                  ))}
                </ListGroup>
              </>
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
      <ReceiptSheet
        item={receipt}
        onClose={() => setReceipt(undefined)}
        onContactSaved={() => void activity.refresh()}
      />
    </View>
  );
}
