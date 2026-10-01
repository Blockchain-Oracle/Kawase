// Home (journey 5): the header with the language pill (guests), the network pill that is the toggle, the inbox
// and settings; the textured balance card on the live wallet status with real marks; the first-steps checklist
// derived from the account's state; starter chips; recent activity (an honest empty state until Stage 5/12
// data exists). The glass dock, the plus and the overlays belong to the (tabs) layout. Once the card scrolls
// away the header shows the balance in its compact form. Fund opens the fund hub; after test money is sent the
// balance is watched until it lands, and the first credit plays "You're funded" once (S2: the koban drops onto
// the card).
import * as Clipboard from "expo-clipboard";
import { useFocusEffect, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { ArrowDownToLine, Bell, HandCoins, ScanFace, Settings2, Wallet } from "lucide-react-native";
import * as React from "react";
import { Platform, View } from "react-native";
import Animated, { FadeOut, useAnimatedScrollHandler, useSharedValue, ZoomIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { toast } from "sonner-native";

import { arcIdentity } from "@kawase/identity";
import { amount, formatAmount, type AssetId } from "@kawase/money";
import { Amount } from "@kawase/ui-native/components/amount";
import { Koban } from "@kawase/ui-native/components/art/koban";
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

import { LanguagePill, LanguageSheet } from "@/components/language-sheet";
import { NetworkPill } from "@/components/network-pill";
import { ActivityRow, ActivityRowSkeleton } from "@/activity/activity-row";
import { ReceiptSheet } from "@/activity/receipt-sheet";
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

const shortAddress = (address: string) => `${address.slice(0, ADDRESS_HEAD)}…${address.slice(-ADDRESS_TAIL)}`;

export function HomeScreen() {
  const { t } = useT();
  const { locale } = useLocale();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const clearance = useDockClearance();
  const { status, user } = useSession();
  const { wallet, loading, refresh } = useWalletStatus();
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
  const format = (asset: AssetId, baseUnits: string) => formatAmount(amount(asset, BigInt(baseUnits)), locale, { withSymbol: false });
  const zero = format("USDC", "0");

  // Guests see the zero state; an account without a wallet yet sees it too; otherwise the live balance.
  const pending = account && (loading || !wallet) && !state;
  const usdc = state ? format("USDC", state.usdcBalance) : pending ? undefined : zero;
  // `eurcBalance` is missing from an api deployed before it was added; the row then shows zero rather than failing.
  const eurc = state ? format("EURC", state.eurcBalance ?? "0") : pending ? undefined : format("EURC", "0");
  const rows: BalanceRow[] = [
    { key: "usdc", entity: ids.usdc, chainBadge: ids.chain, symbol: "USDC", amount: usdc },
    { key: "eurc", entity: ids.eurc, chainBadge: ids.chain, symbol: "EURC", amount: eurc },
  ];
  const name = !account ? t("common.guest") : user?.handle ? `@${user.handle}` : (user?.email?.split("@")[0] ?? t("common.guest"));

  const copyAddress = async () => {
    if (!wallet?.address) return;
    await Clipboard.setStringAsync(wallet.address);
    toast(t("home.addressCopied"));
  };

  const hasMoney = Boolean(state && (BigInt(state.usdcBalance) > ZERO || BigInt(state.eurcBalance ?? "0") > ZERO));
  const steps: FirstStep[] = [
    { key: "account", label: t("home.stepCreateAccount"), done: account, action: { label: t("signIn.title"), onPress: signIn.open } },
    { key: "wallet", label: t("home.stepSetUpWallet"), done: Boolean(state?.setUp), action: { label: t("wallet.setUp"), icon: Wallet, onPress: () => router.push("/wallet") } },
    { key: "allowance", label: t("home.stepApproveAllowance"), done: Boolean(state?.allowance), action: { label: t("wallet.allowanceAccept"), icon: ScanFace, onPress: () => router.push("/wallet") } },
    { key: "funded", label: t("home.stepGetFunded"), done: hasMoney, action: { label: t("home.fund"), icon: ArrowDownToLine, onPress: fund.open } },
  ];

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

  // Chips ask the agent in chat; test money is an action of its own, so it opens the fund hub.
  const chips = [
    { label: t("home.chipWhatCanYouDo"), prompt: t("home.chipWhatCanYouDo") },
    { label: t("home.chipSendExample"), prompt: t("home.chipSendExample") },
    ...(testnet ? [{ label: t("home.chipTestUsdc"), prompt: FUND_CHIP }] : []),
  ];

  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
  });

  return (
    <View className="bg-background flex-1">
      {testnet ? <TestnetStrip label={t("network.testnetStrip")} style={{ paddingTop: insets.top + STRIP_INSET }} /> : null}
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
              <Button variant="secondary" size="icon" accessibilityLabel={t("home.inbox")} className="size-11" onPress={() => router.push("/inbox")}>
                <Icon as={Bell} className="size-5" />
              </Button>
              <Button variant="secondary" size="icon" accessibilityLabel={t("settings.title")} className="size-11" onPress={() => router.navigate("/settings")}>
                <Icon as={Settings2} className="size-5" />
              </Button>
            </>
          }
        />
      </View>

      <Animated.ScrollView className="flex-1" onScroll={onScroll} scrollEventThrottle={16} contentContainerClassName="gap-6 px-5 pt-4" contentContainerStyle={{ paddingBottom: clearance.scroll }}>
        <BalanceCard
          name={name}
          address={wallet?.address ? shortAddress(wallet.address) : undefined}
          copyLabel={t("home.copyAddress")}
          onCopy={() => void copyAddress()}
          eyebrow={testnet ? t("network.testnet") : t("network.realMoney")}
          eyebrowTone={testnet ? "testnet" : "real"}
          balanceLabel={t("home.balance")}
          total={usdc}
          symbol="USDC"
          rows={rows}
          lineColor={colors.texture}
        >
          <Button className="flex-1" onPress={fund.open}>
            <Icon as={ArrowDownToLine} className="text-primary-foreground size-5" />
            <Text>{t("home.fund")}</Text>
          </Button>
          <Button variant="secondary" className="flex-1" onPress={() => toast(t("coming.request"))}>
            <Icon as={HandCoins} className="size-5" />
            <Text>{t("home.request")}</Text>
          </Button>
        </BalanceCard>
        {funded ? (
          <Animated.View pointerEvents="none" entering={ZoomIn.springify()} exiting={FadeOut} className="absolute items-center" style={{ top: 0, start: 0, end: 0 }}>
            <Koban width={FUNDED_KOBAN_WIDTH} id="funded-koban" metal="gold" />
          </Animated.View>
        ) : null}

        <FirstSteps label={t("home.firstSteps")} steps={steps} />

        <SuggestedActions suggestions={chips} onSelect={(prompt) => (prompt === FUND_CHIP ? fund.open() : router.navigate({ pathname: "/chat", params: { prompt } }))} />

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
      </Animated.ScrollView>

      <LanguageSheet open={languageOpen} onClose={() => setLanguageOpen(false)} />
      <ReceiptSheet item={receipt} onClose={() => setReceipt(undefined)} onContactSaved={() => void activity.refresh()} />
    </View>
  );
}
