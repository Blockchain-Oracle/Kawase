// Bridge (Stage 6b): where and how much → review → crossing → arrived. The amount step is a ticket: the chain
// chips with their real marks (the testnet chains on testnet), the USDC amount large with what is available and
// Max, and the keypad. Review shows the least that arrives, the fee cap and the routes compared (BridgeReview);
// one lime button named after the device's real check. While it crosses, three steps say where the money is.
// The Swap | Bridge switch sits under the header (the fan's Swap opens either).
import { useRouter } from "expo-router";
import { ChevronLeft, ScanFace } from "lucide-react-native";
import * as React from "react";
import { Pressable, ScrollView, View } from "react-native";
import Animated, { FadeIn, FadeOut, useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { toast } from "sonner-native";

import type { BridgeDestinationId, BridgeDestinationView, BridgeRequest, PolicyResultView } from "@kawase/api-client";
import { MOTION } from "@kawase/config";
import { arcIdentity, chainKey } from "@kawase/identity";
import { decimalsOf } from "@kawase/money";
import { CoinStack } from "@kawase/ui-native/components/art/coin-stack";
import { EmptyState } from "@kawase/ui-native/components/empty-state";
import { Eyebrow } from "@kawase/ui-native/components/eyebrow";
import { Mark } from "@kawase/ui-native/components/mark";
import { TestnetStrip } from "@kawase/ui-native/components/network-chip";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { BridgeReview } from "@/bridge/bridge-review";
import { BridgeStatus } from "@/bridge/bridge-status";
import { useBridgeApproveLabel, useBridgePolicyText, useBridgePrompt } from "@/bridge/copy";
import { useBridge } from "@/bridge/use-bridge";
import { useFund } from "@/fund/fund-provider";
import { useLocale } from "@/i18n/locale-provider";
import { useT } from "@/i18n";
import { isIntentFinished, isIntentMoving, isIntentOpen } from "@/intents/use-wallet-intent";
import { baseFromCanonical, canonicalFromBase } from "@/send/amount-step";
import { useMoney } from "@/send/copy";
import { applyKey, decimalSeparator, displayAmount, Keypad } from "@/send/keypad";
import { api } from "@/session/api";
import { useSession } from "@/session/session-provider";
import { useSignIn } from "@/sign-in/sign-in-provider";
import { TradeSwitch } from "@/swap/trade-switch";
import { useWalletStatus } from "@/wallet/use-wallet-status";

const STRIP_INSET = 6;
const EDGE_INSET = 12;
const FOOTER_GAP = 12;
const ART_WIDTH = 150;
const CHIP_MARK = 22;
const MARK = 32;
const ZERO = 0n;
const TICKET_SIZE = 56;
const TICKET_LINE_HEIGHT = 66;
const TICKET_MIN_SCALE = 0.5;

type Step = "amount" | "review";

export type BridgePrefill = { destination?: BridgeDestinationId | undefined; amount?: string | undefined };

export function BridgeScreen({ prefill }: { prefill: BridgePrefill }) {
  const { t } = useT();
  const { locale } = useLocale();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const { status, user } = useSession();
  const signIn = useSignIn();
  const fund = useFund();
  const { wallet } = useWalletStatus();
  const controller = useBridge();
  const money = useMoney();
  const policyText = useBridgePolicyText();
  const approveLabel = useBridgeApproveLabel();
  const prompt = useBridgePrompt();
  const network = user?.activeNetwork ?? "testnet";
  const testnet = network === "testnet";
  const ids = arcIdentity(network);

  const [destinations, setDestinations] = React.useState<BridgeDestinationView[]>();
  const [destination, setDestination] = React.useState<BridgeDestinationId | undefined>(prefill.destination);
  const [step, setStep] = React.useState<Step>("amount");
  const [value, setValue] = React.useState(prefill.amount ?? "");
  const [creating, setCreating] = React.useState(false);
  React.useEffect(() => {
    if (status !== "account") return;
    void api.bridges
      .destinations()
      .then(({ destinations: list }) => setDestinations(list))
      .catch(() => setDestinations([]));
  }, [status, network]);

  const usdc = wallet?.networks[network] ? BigInt(wallet.networks[network]!.usdcBalance) : undefined;
  const intent = controller.intent;
  const settled = intent && (isIntentMoving(intent) || isIntentFinished(intent));
  const leave = () => (router.canGoBack() ? router.back() : router.replace("/"));
  const back = () => {
    if (settled || step === "amount") leave();
    else setStep("amount");
  };

  const review = async () => {
    const request: BridgeRequest = { destination: destination ?? null, amount: value };
    setCreating(true);
    try {
      if (intent && isIntentOpen(intent)) {
        const next = await controller.revise(request);
        if (next) setStep("review");
      } else {
        const { intent: fresh } = await api.bridges.create(request);
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
          {t("bridge.title")}
        </Text>
      </View>
      {!settled && step === "amount" ? (
        <View className="px-5 pt-3">
          <TradeSwitch current="bridge" />
        </View>
      ) : null}
    </>
  );

  const blockedPage =
    status !== "account"
      ? { title: t("bridgePolicy.SIGN_IN_REQUIRED"), action: t("policy.fixSignIn"), onPress: () => signIn.open() }
      : wallet && !wallet.address
        ? { title: t("bridgePolicy.WALLET_NOT_READY"), action: t("policy.fixSetUp"), onPress: () => router.push("/wallet") }
        : undefined;
  if (blockedPage) {
    return (
      <View className="bg-background flex-1">
        {header}
        <View className="flex-1" style={{ paddingBottom: insets.bottom + FOOTER_GAP }}>
          <EmptyState
            art={<CoinStack width={ART_WIDTH} id="bridge-blocked-stack" />}
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
      case "AMOUNT_BELOW_FEE":
      case "DESTINATION_MISSING":
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
        <BridgeStatus
          intent={intent}
          connectionLost={controller.connectionLost}
          actions={
            isIntentFinished(intent) ? (
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
          <BridgeReview intent={intent} />
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
              {blocking ? policyText(blocking, intent.network) : controller.busy ? t("bridge.bridging") : approveLabel}
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
            <Text className="text-muted-foreground">{t("bridge.cancel")}</Text>
          </Button>
        </View>
      </View>
    );
  } else {
    const base = baseFromCanonical(value, "USDC");
    const cta = !destination
      ? { label: t("bridge.chooseChain"), enabled: false }
      : base === undefined || base === ZERO
        ? { label: t("send.enterAmount"), enabled: false }
        : usdc !== undefined && base > usdc
          ? { label: t("send.notEnough", { asset: "USDC" }), enabled: false }
          : { label: t("bridge.review"), enabled: true };
    body = (
      <View className="flex-1">
        <View className="flex-1 gap-4 px-5 pt-4">
          <View className="gap-2">
            <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{t("bridge.to")}</Text>
            <View accessibilityRole="radiogroup" className="flex-row flex-wrap gap-2">
              {(destinations ?? []).map((option) => {
                const selected = option.id === destination;
                return (
                  <Pressable
                    key={option.id}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    accessibilityLabel={option.name}
                    onPress={() => setDestination(option.id)}
                    className={cn(
                      "min-h-11 flex-row items-center gap-2 rounded-full border py-2 pe-4 ps-2",
                      selected ? "border-foreground bg-secondary" : "border-border bg-muted active:bg-secondary",
                    )}
                  >
                    <Mark entity={chainKey(option.chainId)} size={CHIP_MARK} />
                    <Text className="text-foreground text-sm font-semibold">{option.name}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          <View className="bg-card border-border gap-2 rounded-3xl border p-4">
            <View className="flex-row items-center justify-between gap-3">
              <Text className="text-muted-foreground text-sm">{t("bridge.youSend")}</Text>
              <View className="flex-row items-center gap-2">
                <Text className="text-muted-foreground text-xs">{usdc !== undefined ? t("send.available", { amount: money("USDC", usdc.toString()) }) : " "}</Text>
                {usdc !== undefined && usdc > ZERO ? (
                  <Pressable accessibilityRole="button" onPress={() => setValue(canonicalFromBase(usdc, "USDC"))} className="bg-muted active:bg-secondary rounded-full px-3 py-1">
                    <Text className="text-foreground text-xs font-semibold">{t("send.max")}</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
            <View className="flex-row items-center gap-3" style={{ direction: "ltr" }}>
              <Mark entity={ids.usdc} chainBadge={ids.chain} size={MARK} />
              <Text
                accessibilityLiveRegion="polite"
                accessibilityLabel={`${value || "0"} USDC`}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={TICKET_MIN_SCALE}
                className={cn("font-display flex-1 font-bold", value ? "text-foreground" : "text-muted-foreground")}
                style={{ fontSize: TICKET_SIZE, lineHeight: TICKET_LINE_HEIGHT, fontVariant: ["tabular-nums"] }}
              >
                {displayAmount(value, locale)}
              </Text>
              <Text className="font-display text-muted-foreground text-xl font-semibold">USDC</Text>
            </View>
          </View>
        </View>
        <View className="gap-3 px-5" style={{ paddingBottom: insets.bottom + FOOTER_GAP }}>
          <Keypad decimal={decimalSeparator(locale)} backspaceLabel={t("send.deleteDigit")} onKey={(key) => setValue(applyKey(value, key, decimalsOf("USDC")))} />
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
