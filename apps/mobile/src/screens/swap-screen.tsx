// The swap ticket for any pair (surfaces.md "Trade tickets"; Swap Ticket 21st.dev 27122; R1, R3, R5). "You pay": any
// held asset from the universal picker, the amount large in the display face, 25/50/Max; the flip; "You get": any
// token on Arc, from search. Review: the recommended venue's quote with the others under "N routes", the least that
// arrives, the price impact against the token rules, then **slide to confirm** — the slide resets on any change of
// pair, amount or quote, and the quote refreshes every SWAP_QUOTE_TTL_S while the ticket is open. After the slide the
// wallet approves (Face ID; an email code on the web) one transaction (approve + swap), the marks trade places while
// it runs, and the receipt says what actually arrived. Entry: Home's Swap, the fan, a token page's Buy/Sell
// (`/swap?buy=0x…` / `?sell=0x…`), chat cards and links (`/swap?from=USDC&amount=10`).
import { useRouter } from "expo-router";
import { ArrowUpDown, ChevronDown, ChevronLeft } from "lucide-react-native";
import * as React from "react";
import { AppState, Pressable, ScrollView, View } from "react-native";
import Animated, { FadeIn, FadeOut, useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { toast } from "sonner-native";

import type { PolicyResultView, SwapRequest, TokenView } from "@kawase/api-client";
import { MOTION, MS_PER_SECOND, SWAP_QUOTE_TTL_S } from "@kawase/config";
import { arcIdentity, CHAIN_IDS, getEntity } from "@kawase/identity";
import { CoinStack } from "@kawase/ui-native/components/art/coin-stack";
import { EmptyState } from "@kawase/ui-native/components/empty-state";
import { Eyebrow } from "@kawase/ui-native/components/eyebrow";
import { TestnetStrip } from "@kawase/ui-native/components/network-chip";
import { SlideToConfirm } from "@kawase/ui-native/components/slide-to-confirm";
import { TokenMark } from "@kawase/ui-native/components/token-mark";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";
import { WEB_HOVER_MUTED, WEB_HOVER_SECONDARY } from "@kawase/ui-native/lib/wide";

import { tapFeedback } from "@/feedback/feedback";
import { useFund } from "@/fund/fund-provider";
import { useBuy } from "@/onramp/buy-provider";
import { useLocale } from "@/i18n/locale-provider";
import { useT } from "@/i18n";
import { BrakeNote } from "@/safety/brake-note";
import { AssetPickerSheet, type AssetChoice } from "@/portfolio/asset-picker-sheet";
import { tokenAmount } from "@/portfolio/format";
import { usePortfolio } from "@/portfolio/use-portfolio";
import { api } from "@/session/api";
import { useSession } from "@/session/session-provider";
import { useSignIn } from "@/sign-in/sign-in-provider";
import { applyKey, decimalSeparator, displayAmount, Keypad } from "@/send/keypad";
import { useSwapPolicyText, useSwapPrompt } from "@/swap/copy";
import { SwapReview } from "@/swap/swap-review";
import { SwapStatus } from "@/swap/swap-status";
import { TradeSwitch } from "@/swap/trade-switch";
import { isSwapFinished, isSwapMoving, isSwapOpen, useSwap } from "@/swap/use-swap";

const STRIP_INSET = 6;
const EDGE_INSET = 12;
const FOOTER_GAP = 12;
const ART_WIDTH = 150;
const MARK = 32;
const FLIP = 44;
const ZERO = 0n;
const TICKET_SIZE = 52;
const TICKET_LINE_HEIGHT = 62;
const TICKET_MIN_SCALE = 0.5;
const QUARTER = 4n;
const HALF = 2n;
const DECIMAL = /^\d+(\.\d+)?$/;

type Step = "amount" | "review";
type TicketToken = Pick<TokenView, "chainId" | "address" | "symbol" | "name" | "decimals" | "logoUrl">;

export type SwapPrefill = { from?: string | undefined; amount?: string | undefined; buy?: string | undefined; sell?: string | undefined };

/** Arc's USDC or EURC on this network, from the identity registry (the default side of a buy or a sale). */
function stable(network: "mainnet" | "testnet", symbol: "USDC" | "EURC"): TicketToken {
  const ids = arcIdentity(network);
  const entity = getEntity(symbol === "USDC" ? ids.usdc : ids.eurc)!;
  return { chainId: network === "mainnet" ? CHAIN_IDS.arc : CHAIN_IDS.arcTestnet, address: entity.address!, symbol, name: entity.name, decimals: entity.decimals!, logoUrl: null };
}

/** Base units → the canonical decimal string the keypad edits ("12.5"). */
function canonical(units: bigint, decimals: number) {
  const text = units.toString().padStart(decimals + 1, "0");
  const whole = text.slice(0, text.length - decimals) || "0";
  const fraction = text.slice(text.length - decimals).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}

function baseUnits(value: string, decimals: number): bigint | undefined {
  if (!DECIMAL.test(value) || (value.split(".")[1]?.length ?? 0) > decimals) return undefined;
  const [whole = "0", fraction = ""] = value.split(".");
  return BigInt(whole + fraction.padEnd(decimals, "0"));
}

/**
 * `embedded`: the ticket inside another page (a token page on a desktop window, Stage 13): no header of its own, no
 * safe-area padding, the amount step scrolls when the page is short, and "Done" or "Cancel" start a fresh ticket
 * instead of leaving the page (`onFinished` lets the page refresh what the trade changed).
 */
export function SwapScreen({ prefill, embedded = false, onFinished }: { prefill: SwapPrefill; embedded?: boolean; onFinished?: () => void }) {
  const { t } = useT();
  const { locale, rtl } = useLocale();
  const router = useRouter();
  const safeInsets = useSafeAreaInsets();
  const insets = embedded ? { top: 0, bottom: 0, left: 0, right: 0 } : safeInsets;
  const reduced = useReducedMotion();
  const { status, user } = useSession();
  const signIn = useSignIn();
  const fund = useFund();
  const buy = useBuy();
  const { portfolio } = usePortfolio();
  const controller = useSwap();
  const policyText = useSwapPolicyText();
  const prompt = useSwapPrompt();
  const network = user?.activeNetwork ?? "testnet";
  const testnet = network === "testnet";

  const [tokenIn, setTokenIn] = React.useState<TicketToken>(() =>
    prefill.from === "EURC" ? stable(network, "EURC") : stable(network, "USDC"),
  );
  const [tokenOut, setTokenOut] = React.useState<TicketToken>(() => (prefill.from === "EURC" ? stable(network, "USDC") : stable(network, "EURC")));
  const [picker, setPicker] = React.useState<"in" | "out">();
  const [step, setStep] = React.useState<Step>("amount");
  const [value, setValue] = React.useState(prefill.amount ?? "");
  const [creating, setCreating] = React.useState(false);
  const [foreground, setForeground] = React.useState(0);

  // A token page's Buy or Sell: the token on its side, dollars on the other.
  React.useEffect(() => {
    const address = prefill.buy ?? prefill.sell;
    if (!address) return undefined;
    let live = true;
    const chainId = network === "mainnet" ? CHAIN_IDS.arc : CHAIN_IDS.arcTestnet;
    api.tokens
      .get(chainId, address)
      .then(({ token }) => {
        if (!live) return;
        // Dollars on the other side; for USDC itself, euros.
        const usdc = stable(network, "USDC");
        const other = token.token.address.toLowerCase() === usdc.address.toLowerCase() ? stable(network, "EURC") : usdc;
        if (prefill.buy) {
          setTokenOut(token.token);
          setTokenIn(other);
        } else {
          setTokenIn(token.token);
          setTokenOut(other);
        }
      })
      .catch(() => toast(t("tokenPage.notFound")));
    return () => {
      live = false;
    };
  }, [prefill.buy, prefill.sell, network, t]);

  // Coming back from the background is a change of quote freshness: the slide starts over (R5).
  React.useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") setForeground((count) => count + 1);
    });
    return () => subscription.remove();
  }, []);

  const intent = controller.intent;
  const settled = intent && (isSwapMoving(intent) || isSwapFinished(intent));
  const leave = () => {
    if (embedded) {
      // Inline: the same ticket again, ready for the next trade.
      controller.reset();
      setValue("");
      setStep("amount");
      onFinished?.();
      return;
    }
    if (router.canGoBack()) router.back();
    else router.replace("/");
  };
  const back = () => {
    if (settled || step === "amount") leave();
    else setStep("amount");
  };

  // The quote stays fresh while the ticket is open on review: a new version every SWAP_QUOTE_TTL_S.
  const revise = controller.revise;
  React.useEffect(() => {
    if (step !== "review" || !intent || !isSwapOpen(intent) || controller.busy) return undefined;
    const timer = setInterval(() => void revise({}), SWAP_QUOTE_TTL_S * MS_PER_SECOND);
    return () => clearInterval(timer);
  }, [step, intent, controller.busy, revise]);

  const holding = portfolio?.assets.find((entry) => entry.token.address.toLowerCase() === tokenIn.address.toLowerCase());
  const balanceIn = holding ? BigInt(holding.balance) : portfolio ? ZERO : undefined;
  const title = prefill.buy ? t("ticket.buyTitle", { symbol: tokenOut.symbol }) : prefill.sell ? t("ticket.sellTitle", { symbol: tokenIn.symbol }) : t("ticket.title");

  const review = async () => {
    const request: SwapRequest = { tokenIn: tokenIn.address, tokenOut: tokenOut.address, amount: value };
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

  const choose = (side: "in" | "out") => (choice: AssetChoice) => {
    const token = choice.token;
    if (side === "in") {
      if (token.address.toLowerCase() === tokenOut.address.toLowerCase()) setTokenOut(tokenIn);
      setTokenIn(token);
      if (value && baseUnits(value, token.decimals) === undefined) setValue("");
    } else {
      if (token.address.toLowerCase() === tokenIn.address.toLowerCase()) setTokenIn(tokenOut);
      setTokenOut(token);
    }
    tapFeedback("selection");
  };

  const header = embedded ? null : (
    <>
      {testnet ? <TestnetStrip label={t("network.testnetStrip")} style={{ paddingTop: insets.top + STRIP_INSET }} /> : null}
      <View className="flex-row items-center gap-3 px-5" style={{ paddingTop: testnet ? EDGE_INSET : insets.top + EDGE_INSET }}>
        <Button variant="secondary" size="icon" accessibilityLabel={t("common.back")} className="size-11" onPress={back}>
          <Icon as={ChevronLeft} className="size-5 rtl:-scale-x-100" />
        </Button>
        <Text accessibilityRole="header" numberOfLines={1} className="font-display text-foreground shrink text-2xl font-bold">
          {title}
        </Text>
      </View>
      {!settled && step === "amount" && !prefill.buy && !prefill.sell ? (
        <View className="px-5 pt-3">
          <TradeSwitch current="swap" />
        </View>
      ) : null}
    </>
  );

  if (status !== "account") {
    return (
      <View className="bg-background flex-1">
        {header}
        <View className="flex-1" style={{ paddingBottom: insets.bottom + FOOTER_GAP }}>
          <EmptyState
            art={<CoinStack width={ART_WIDTH} id="swap-blocked-stack" />}
            title={t("swapPolicy.SIGN_IN_REQUIRED")}
            action={
              <Button onPress={() => signIn.open()}>
                <Text>{t("policy.fixSignIn")}</Text>
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
      case "TOKEN_RULE_TRADE":
      case "TOKEN_RULE_DAY":
        return { label: t("policy.fixEditAmount"), onPress: () => setStep("amount") };
      case "TOKEN_RULE_ACCESS":
        return { label: t("tokenRules.change"), onPress: () => router.push("/token-rules") };
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
              <>
                <Button size="lg" onPress={leave}>
                  <Text>{t("send.done")}</Text>
                </Button>
                {intent.outcome === "sent" && !embedded ? (
                  <Button variant="ghost" onPress={() => router.replace(`/token/${tokenOut.chainId}/${tokenOut.address}`)}>
                    <Text className="text-foreground">{t("ticket.viewToken", { symbol: tokenOut.symbol })}</Text>
                  </Button>
                ) : null}
              </>
            ) : null
          }
        />
      </ScrollView>
    );
  } else if (visible === "review" && intent) {
    const blocking = intent.blocking;
    const fix = blocking ? fixFor(blocking) : undefined;
    const ready = !blocking && Boolean(intent.draft) && intent.state === "ready_for_approval";
    const resetKey = `${intent.version}:${tokenIn.address}:${tokenOut.address}:${value}:${foreground}`;
    const slideLabel = prefill.buy ? t("ticket.slideBuy") : prefill.sell ? t("ticket.slideSell") : t("ticket.slide");
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
          ) : (
            <BrakeNote results={intent.results} text={(entry) => policyText(entry, intent.network)} />
          )}
        </ScrollView>
        <View className="gap-2 px-5" style={{ paddingBottom: insets.bottom + FOOTER_GAP }}>
          <SlideToConfirm
            onConfirm={() => void controller.approve(prompt(intent.draft, intent.network))}
            pendingLabel={t("ticket.confirming")}
            resetKey={resetKey}
            disabled={!ready || controller.busy}
            hint={intent.draft ? prompt(intent.draft, intent.network) : undefined}
            tone={prefill.sell ? "short" : prefill.buy ? "long" : "primary"}
            rtl={rtl}
            onHaptic={(kind) => tapFeedback(kind === "arm" ? "selection" : "light")}
          >
            {blocking ? policyText(blocking, intent.network) : controller.busy ? t("ticket.refreshing") : slideLabel}
          </SlideToConfirm>
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
    const base = baseUnits(value, tokenIn.decimals);
    const short = base !== undefined && base !== ZERO && balanceIn !== undefined && base > balanceIn;
    const cta =
      base === undefined || base === ZERO
        ? { label: t("ticket.needAmount"), enabled: false }
        : short
          ? { label: t("ticket.notEnough", { symbol: tokenIn.symbol }), enabled: false }
          : { label: t("swap.review"), enabled: true };
    // Short of dollars (or euros): Buy with Apple Pay / card for the amount, then this same swap (money-in.md entry).
    const payStable = tokenIn.symbol === "USDC" || tokenIn.symbol === "EURC";
    const outStable = tokenOut.symbol === "USDC" || tokenOut.symbol === "EURC";
    const buyWithCard = short && payStable ? () => buy.open({ asset: tokenIn.symbol, amount: String(Math.ceil(Number(value))), ...(outStable ? {} : { then: tokenOut.address }) }) : undefined;
    const flip = () => {
      setTokenIn(tokenOut);
      setTokenOut(tokenIn);
      if (value && baseUnits(value, tokenOut.decimals) === undefined) setValue("");
      tapFeedback("selection");
    };
    const share = (divisor: bigint) => balanceIn !== undefined && setValue(canonical(balanceIn / divisor, tokenIn.decimals));
    const tokenButton = (token: TicketToken, side: "in" | "out") => (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${side === "in" ? t("ticket.pay") : t("ticket.get")}: ${token.symbol}`}
        onPress={() => setPicker(side)}
        className={cn("bg-secondary active:bg-muted flex-row items-center gap-2 rounded-full py-1.5 ps-1.5 pe-3", WEB_HOVER_SECONDARY)}
      >
        <TokenMark token={token} size={MARK} />
        <Text className="text-foreground text-base font-semibold">{token.symbol}</Text>
        <Icon as={ChevronDown} className="text-muted-foreground size-4" />
      </Pressable>
    );
    const ticket = (
      <View className="bg-card border-border gap-3 rounded-3xl border p-4">
        <View className="flex-row items-center justify-between gap-3">
          <Text className="text-muted-foreground text-sm">{t("ticket.pay")}</Text>
          <Text className="text-muted-foreground text-xs">{balanceIn !== undefined ? t("ticket.balance", { amount: tokenAmount(balanceIn.toString(), tokenIn.decimals, tokenIn.symbol, locale) }) : " "}</Text>
        </View>
        <View className="flex-row items-center gap-3" style={{ direction: "ltr" }}>
          {tokenButton(tokenIn, "in")}
          <Text
            accessibilityLiveRegion="polite"
            accessibilityLabel={`${value || "0"} ${tokenIn.symbol}`}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={TICKET_MIN_SCALE}
            className={cn("font-display flex-1 text-right font-bold", value ? "text-foreground" : "text-muted-foreground")}
            style={{ fontSize: TICKET_SIZE, lineHeight: TICKET_LINE_HEIGHT, fontVariant: ["tabular-nums"] }}
          >
            {displayAmount(value, locale)}
          </Text>
        </View>
        {balanceIn !== undefined && balanceIn > ZERO ? (
          <View className="flex-row justify-end gap-2">
            {[
              { label: t("ticket.quarter"), divisor: QUARTER },
              { label: t("ticket.half"), divisor: HALF },
              { label: t("ticket.max"), divisor: 1n },
            ].map((chip) => (
              <Pressable key={chip.label} accessibilityRole="button" onPress={() => share(chip.divisor)} className={cn("bg-muted active:bg-secondary rounded-full px-3 py-1", WEB_HOVER_MUTED)}>
                <Text className="text-foreground text-xs font-semibold">{chip.label}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        <View className="flex-row items-center gap-3">
          <View className="bg-border h-px flex-1" />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("swap.flip")}
            onPress={flip}
            className={cn("bg-secondary active:bg-muted border-border items-center justify-center rounded-full border", WEB_HOVER_SECONDARY)}
            style={{ width: FLIP, height: FLIP }}
          >
            <Icon as={ArrowUpDown} className="text-foreground size-5" />
          </Pressable>
          <View className="bg-border h-px flex-1" />
        </View>
        <View className="flex-row items-center justify-between gap-3">
          <Text className="text-muted-foreground text-sm">{t("ticket.get")}</Text>
          {tokenButton(tokenOut, "out")}
        </View>
      </View>
    );
    const entry = (
      <View className="gap-3 px-5" style={{ paddingBottom: insets.bottom + FOOTER_GAP }}>
        <Keypad decimal={decimalSeparator(locale)} backspaceLabel={t("send.deleteDigit")} onKey={(key) => setValue(applyKey(value, key, tokenIn.decimals))} />
        <Button size="lg" disabled={!cta.enabled || creating || controller.busy} onPress={() => void review()}>
          <Text>{creating || controller.busy ? t("ticket.quoting") : cta.label}</Text>
        </Button>
        {buyWithCard ? (
          <Button variant="ghost" onPress={buyWithCard}>
            <Text className="text-foreground">{t("buy.rowTitle")}</Text>
          </Button>
        ) : null}
      </View>
    );
    body = embedded ? (
      // Inline in a page: one scroll, so a short window still reaches the keypad and the button.
      <ScrollView className="flex-1" contentContainerClassName="flex-grow justify-between gap-4 pt-4" keyboardShouldPersistTaps="handled">
        <View className="px-5">{ticket}</View>
        {entry}
      </ScrollView>
    ) : (
      <View className="flex-1">
        <View className="flex-1 gap-4 px-5 pt-4">{ticket}</View>
        {entry}
      </View>
    );
  }

  return (
    <View className={embedded ? "flex-1" : "bg-background flex-1"}>
      {header}
      <Animated.View key={visible} entering={enter} exiting={exit} className="flex-1">
        {body}
      </Animated.View>
      <AssetPickerSheet
        open={picker === "in"}
        onClose={() => setPicker(undefined)}
        title={t("assets.pickerPay")}
        mode="held"
        selected={tokenIn.address.toLowerCase()}
        onSelect={choose("in")}
        unavailable={(token) => (token.status === "impersonator" ? t("tokenPage.n_blocked") : undefined)}
        onAddMoney={fund.open}
      />
      <AssetPickerSheet
        open={picker === "out"}
        onClose={() => setPicker(undefined)}
        title={t("assets.pickerGet")}
        mode="any"
        selected={tokenOut.address.toLowerCase()}
        onSelect={choose("out")}
        unavailable={(token) => (token.status === "impersonator" ? t("tokenPage.n_blocked") : testnet && token.kind !== "dollar" && token.kind !== "fiat" ? t("tokenPage.n_mainnet_only") : undefined)}
      />
    </View>
  );
}
