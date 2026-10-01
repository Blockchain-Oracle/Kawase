// Swap (Stage 6; C-trading): how much and which way → review → swapping → the ending. One header; the steps
// cross-fade in place. The amount step is a ticket in two halves (what you give, what you get) joined by the flip
// button, with the balance and Max on the side being spent, the amount large in the display face, and the keypad.
// Review shows the fresh quote next to Circle's market rate (SwapReview), the one fix when something stops it, and
// one lime button named after the device's real check ("Swap with Face ID"): a swap is always the owner's own yes,
// because the everyday allowance only covers transfers. Going back to change the amount or the direction makes a
// new version of the same swap.
import { useRouter } from "expo-router";
import { ArrowUpDown, ChevronLeft, ScanFace } from "lucide-react-native";
import * as React from "react";
import { Pressable, ScrollView, View } from "react-native";
import Animated, { FadeIn, FadeOut, useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { toast } from "sonner-native";

import type { PolicyResultView, SwapRequest } from "@kawase/api-client";
import { MOTION } from "@kawase/config";
import { arcIdentity } from "@kawase/identity";
import { decimalsOf, type AssetId } from "@kawase/money";
import { Amount } from "@kawase/ui-native/components/amount";
import { CoinStack } from "@kawase/ui-native/components/art/coin-stack";
import { EmptyState } from "@kawase/ui-native/components/empty-state";
import { Eyebrow } from "@kawase/ui-native/components/eyebrow";
import { Mark } from "@kawase/ui-native/components/mark";
import { TestnetStrip } from "@kawase/ui-native/components/network-chip";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { useFund } from "@/fund/fund-provider";
import { useLocale } from "@/i18n/locale-provider";
import { useT } from "@/i18n";
import { api } from "@/session/api";
import { useSession } from "@/session/session-provider";
import { useSignIn } from "@/sign-in/sign-in-provider";
import { useWalletStatus } from "@/wallet/use-wallet-status";

import { baseFromCanonical, canonicalFromBase } from "@/send/amount-step";
import { useMoney } from "@/send/copy";
import { applyKey, decimalSeparator, displayAmount, Keypad } from "@/send/keypad";
import { useSwapApproveLabel, useSwapPolicyText, useSwapPrompt } from "@/swap/copy";
import { SwapReview } from "@/swap/swap-review";
import { SwapStatus } from "@/swap/swap-status";
import { isSwapFinished, isSwapMoving, isSwapOpen, useSwap } from "@/swap/use-swap";

const STRIP_INSET = 6;
const EDGE_INSET = 12;
const FOOTER_GAP = 12;
const ART_WIDTH = 150;
const MARK = 32;
const FLIP = 44;
const ZERO = 0n;
const TICKET_SIZE = 56;
const TICKET_LINE_HEIGHT = 66;
const TICKET_MIN_SCALE = 0.5;

type Step = "amount" | "review";

export type SwapPrefill = { from?: AssetId | undefined; amount?: string | undefined };

const other = (asset: AssetId): AssetId => (asset === "USDC" ? "EURC" : "USDC");

export function SwapScreen({ prefill }: { prefill: SwapPrefill }) {
  const { t } = useT();
  const { locale } = useLocale();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const { status, user } = useSession();
  const signIn = useSignIn();
  const fund = useFund();
  const { wallet } = useWalletStatus();
  const controller = useSwap();
  const money = useMoney();
  const policyText = useSwapPolicyText();
  const approveLabel = useSwapApproveLabel();
  const prompt = useSwapPrompt();
  const network = user?.activeNetwork ?? "testnet";
  const testnet = network === "testnet";
  const ids = arcIdentity(network);

  const state = wallet?.networks[network];
  const balances = state ? { USDC: BigInt(state.usdcBalance), EURC: BigInt(state.eurcBalance ?? "0") } : undefined;
  // Until the person picks, swap from what they hold most of (USDC when they hold neither).
  const [from, setFrom] = React.useState<AssetId | undefined>(prefill.from);
  const tokenIn: AssetId = from ?? (balances && balances.EURC > balances.USDC ? "EURC" : "USDC");
  const tokenOut = other(tokenIn);
  const [step, setStep] = React.useState<Step>("amount");
  const [value, setValue] = React.useState(prefill.amount ?? "");
  const [creating, setCreating] = React.useState(false);

  const intent = controller.intent;
  const settled = intent && (isSwapMoving(intent) || isSwapFinished(intent));
  const leave = () => (router.canGoBack() ? router.back() : router.replace("/"));
  const back = () => {
    if (settled || step === "amount") leave();
    else setStep("amount");
  };

  const review = async () => {
    const request: SwapRequest = { tokenIn, tokenOut, amount: value };
    setCreating(true);
    try {
      if (intent && isSwapOpen(intent)) {
        const next = await controller.revise(request);
        if (next) setStep("review");
      } else {
        const { intent: fresh } = await api.swaps.create(request);
        controller.set(fresh);
        setStep("review");
      }
    } catch {
      toast(t("send.failed"));
    } finally {
      setCreating(false);
    }
  };

  const header = (
    <>
      {testnet ? <TestnetStrip label={t("network.testnetStrip")} style={{ paddingTop: insets.top + STRIP_INSET }} /> : null}
      <View className="flex-row items-center gap-3 px-5" style={{ paddingTop: testnet ? EDGE_INSET : insets.top + EDGE_INSET }}>
        <Button variant="secondary" size="icon" accessibilityLabel={t("common.back")} className="size-11" onPress={back}>
          <Icon as={ChevronLeft} className="size-5 rtl:-scale-x-100" />
        </Button>
        <Text accessibilityRole="header" className="font-display text-foreground text-2xl font-bold">
          {t("swap.title")}
        </Text>
      </View>
    </>
  );

  const blockedPage =
    status !== "account"
      ? { title: t("swapPolicy.SIGN_IN_REQUIRED"), action: t("policy.fixSignIn"), onPress: () => signIn.open() }
      : wallet && !wallet.address
        ? { title: t("swapPolicy.WALLET_NOT_READY"), action: t("policy.fixSetUp"), onPress: () => router.push("/wallet") }
        : undefined;
  if (blockedPage) {
    return (
      <View className="bg-background flex-1">
        {header}
        <View className="flex-1" style={{ paddingBottom: insets.bottom + FOOTER_GAP }}>
          <EmptyState
            art={<CoinStack width={ART_WIDTH} id="swap-blocked-stack" />}
            title={blockedPage.title}
            action={
              <Button onPress={blockedPage.onPress}>
                <Text>{blockedPage.action}</Text>
              </Button>
            }
          />
        </View>
      </View>
    );
  }

  /** The one fix a blocking reason offers, if any. */
  const fixFor = (blocking: PolicyResultView): { label: string; onPress: () => void } | undefined => {
    switch (blocking.code) {
      case "SIGN_IN_REQUIRED":
        return { label: t("policy.fixSignIn"), onPress: () => signIn.open() };
      case "INSUFFICIENT_BALANCE":
      case "INSUFFICIENT_GAS":
        return { label: t("policy.fixAddMoney"), onPress: fund.open };
      case "WALLET_NOT_READY":
      case "WALLET_NOT_SET_UP":
        return { label: t("policy.fixSetUp"), onPress: () => router.push("/wallet") };
      case "QUOTE_UNAVAILABLE":
        return { label: t("swapPolicy.fixTryAgain"), onPress: () => void controller.revise({}) };
      case "AMOUNT_MISSING":
      case "AMOUNT_INVALID":
      case "PRICE_IMPACT_HIGH":
        return { label: t("policy.fixEditAmount"), onPress: () => setStep("amount") };
      default:
        return undefined;
    }
  };

  const enter = reduced ? undefined : FadeIn.duration(MOTION.sheetMs);
  const exit = reduced ? undefined : FadeOut.duration(MOTION.sheetMs);
  const visible: Step | "status" = settled ? "status" : step;

  let body: React.ReactNode;
  if (visible === "status" && intent) {
    body = (
      <ScrollView className="flex-1" contentContainerClassName="flex-grow justify-center px-5" contentContainerStyle={{ paddingBottom: insets.bottom + FOOTER_GAP }}>
        <SwapStatus
          intent={intent}
          connectionLost={controller.connectionLost}
          actions={
            isSwapFinished(intent) ? (
              <Button size="lg" onPress={leave}>
                <Text>{t("send.done")}</Text>
              </Button>
            ) : null
          }
        />
      </ScrollView>
    );
  } else if (visible === "review" && intent) {
    const blocking = intent.blocking;
    const fix = blocking ? fixFor(blocking) : undefined;
    body = (
      <View className="flex-1">
        <ScrollView className="flex-1" contentContainerClassName="gap-4 px-5 pt-4 pb-4">
          {!testnet ? <Eyebrow className="text-foreground">{t("network.realMoney")}</Eyebrow> : null}
          <SwapReview intent={intent} onRefresh={() => void controller.revise({})} refreshing={controller.busy} />
          {blocking ? (
            <View className="bg-muted gap-3 rounded-2xl px-4 py-3">
              <Text className={cn("text-foreground text-base", TEXT_START)}>{policyText(blocking, intent.network)}</Text>
              {fix ? (
                <Button variant="secondary" onPress={fix.onPress}>
                  <Text>{fix.label}</Text>
                </Button>
              ) : null}
            </View>
          ) : null}
        </ScrollView>
        <View className="gap-2 px-5" style={{ paddingBottom: insets.bottom + FOOTER_GAP }}>
          <Button size="lg" disabled={Boolean(blocking) || !intent.draft || controller.busy} onPress={() => void controller.approve(prompt(intent.draft))}>
            {blocking ? null : <Icon as={ScanFace} className="text-primary-foreground size-5" />}
            <Text numberOfLines={2} className="text-center">
              {blocking ? policyText(blocking, intent.network) : controller.busy ? t("swap.swapping") : approveLabel}
            </Text>
          </Button>
          <Button
            variant="ghost"
            disabled={controller.busy}
            onPress={() => {
              void controller.cancel();
              leave();
            }}
          >
            <Text className="text-muted-foreground">{t("swap.cancel")}</Text>
          </Button>
        </View>
      </View>
    );
  } else {
    const balanceIn = balances?.[tokenIn];
    const balanceOut = balances?.[tokenOut];
    const base = baseFromCanonical(value, tokenIn);
    const cta =
      base === undefined || base === ZERO
        ? { label: t("send.enterAmount"), enabled: false }
        : balanceIn !== undefined && base > balanceIn
          ? { label: t("send.notEnough", { asset: tokenIn }), enabled: false }
          : { label: t("swap.review"), enabled: true };
    const flip = () => {
      setFrom(tokenOut);
      if (baseFromCanonical(value, tokenOut) === undefined && value) setValue("");
    };
    body = (
      <View className="flex-1">
        <View className="flex-1 gap-4 px-5 pt-4">
          <View className="bg-card border-border gap-3 rounded-3xl border p-4">
            <View className="flex-row items-center justify-between gap-3">
              <Text className="text-muted-foreground text-sm">{t("swap.youPay")}</Text>
              <View className="flex-row items-center gap-2">
                <Text className="text-muted-foreground text-xs">{balanceIn !== undefined ? t("send.available", { amount: money(tokenIn, balanceIn.toString()) }) : " "}</Text>
                {balanceIn !== undefined && balanceIn > ZERO ? (
                  <Pressable accessibilityRole="button" onPress={() => setValue(canonicalFromBase(balanceIn, tokenIn))} className="bg-muted active:bg-secondary rounded-full px-3 py-1">
                    <Text className="text-foreground text-xs font-semibold">{t("send.max")}</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
            <View className="flex-row items-center gap-3" style={{ direction: "ltr" }}>
              <Mark entity={tokenIn === "USDC" ? ids.usdc : ids.eurc} chainBadge={ids.chain} size={MARK} />
              <Text
                accessibilityLiveRegion="polite"
                accessibilityLabel={`${value || "0"} ${tokenIn}`}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={TICKET_MIN_SCALE}
                className={cn("font-display flex-1 font-bold", value ? "text-foreground" : "text-muted-foreground")}
                style={{ fontSize: TICKET_SIZE, lineHeight: TICKET_LINE_HEIGHT, fontVariant: ["tabular-nums"] }}
              >
                {displayAmount(value, locale)}
              </Text>
              <Text className="font-display text-muted-foreground text-xl font-semibold">{tokenIn}</Text>
            </View>
            <View className="flex-row items-center gap-3">
              <View className="bg-border h-px flex-1" />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("swap.flip")}
                onPress={flip}
                className="bg-secondary active:bg-muted border-border items-center justify-center rounded-full border"
                style={{ width: FLIP, height: FLIP }}
              >
                <Icon as={ArrowUpDown} className="text-foreground size-5" />
              </Pressable>
              <View className="bg-border h-px flex-1" />
            </View>
            <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{t("swap.youGet")}</Text>
            <View className="flex-row items-center justify-between gap-3">
              <View className="flex-row items-center gap-3">
                <Mark entity={tokenOut === "USDC" ? ids.usdc : ids.eurc} chainBadge={ids.chain} size={MARK} />
                <Text className="font-display text-foreground text-xl font-semibold">{tokenOut}</Text>
              </View>
              {balanceOut !== undefined ? <Amount className="text-muted-foreground text-xs">{t("send.available", { amount: money(tokenOut, balanceOut.toString()) })}</Amount> : null}
            </View>
          </View>
        </View>
        <View className="gap-3 px-5" style={{ paddingBottom: insets.bottom + FOOTER_GAP }}>
          <Keypad decimal={decimalSeparator(locale)} backspaceLabel={t("send.deleteDigit")} onKey={(key) => setValue(applyKey(value, key, decimalsOf(tokenIn)))} />
          <Button size="lg" disabled={!cta.enabled || creating || controller.busy} onPress={() => void review()}>
            <Text>{creating || controller.busy ? t("common.loading") : cta.label}</Text>
          </Button>
        </View>
      </View>
    );
  }

  return (
    <View className="bg-background flex-1">
      {header}
      <Animated.View key={visible} entering={enter} exiting={exit} className="flex-1">
        {body}
      </Animated.View>
    </View>
  );
}
