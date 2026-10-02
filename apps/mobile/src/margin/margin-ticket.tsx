// The perp ticket (surfaces.md "Trade tickets", ported from Senryo's ticket): the market header, margin as the hero
// with the leveraged size under it, presets, the LeverageRuler capped by what the market's collateral factor allows,
// the liquidation price with how far away it is, health, borrow rate, network fee and route, the risk line, and
// slide to confirm, which resets on any change of market, side, margin, leverage or quote (R5). After the slide:
// Face ID, then the execution trace (Checking → Signed → Submitted → Final) and the receipt with View position.
// The same ticket renders on the Long/Short screen and as the chat card; nothing here decides money, the api does.
import { useRouter } from "expo-router";
import { Check, Circle, ExternalLink, X } from "lucide-react-native";
import * as React from "react";
import { Linking, Pressable, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

import type { MarginIntent, MarginMarketView, MarginRequest, PolicyResultView } from "@kawase/api-client";
import { GAS_FLOAT_USDC_BASE_UNITS, MARGIN } from "@kawase/config";
import { Amount } from "@kawase/ui-native/components/amount";
import { LeverageRuler } from "@kawase/ui-native/components/leverage-ruler";
import { Mark } from "@kawase/ui-native/components/mark";
import { SlideToConfirm } from "@kawase/ui-native/components/slide-to-confirm";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { confirmedFeedback } from "@/feedback/feedback";
import { useFund } from "@/fund/fund-provider";
import { useLocale } from "@/i18n/locale-provider";
import { useT } from "@/i18n";
import { useMoney } from "@/send/copy";
import { useSignIn } from "@/sign-in/sign-in-provider";
import { useTheme } from "@/theme/theme-provider";
import { useNetworkSwitch } from "@/wallet/use-network-switch";
import { useWalletStatus } from "@/wallet/use-wallet-status";

import { marketEntity, useMarginFormat, useMarginPolicyText, useMarginPrompt } from "./copy";
import { rulerHaptic, slideHaptic } from "./haptics";
import { isMarginFinished, isMarginMoving, type MarginController } from "./use-margin";

const MARK = 36;
const HERO = 44;
const HERO_COMPACT = 30;
const CENT_DIGITS = 2;
const ZERO = 0n;
const USDC_UNIT = 1_000_000;
const TRACE_STEPS = ["traceChecking", "traceSigned", "traceSubmitted", "traceFinal"] as const;
const SIGNED_STEP = 1;
const SUBMITTED_STEP = 2;
const FINAL_STEP = 3;

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View className="flex-row items-center justify-between gap-3">
      <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{label}</Text>
      <Amount className={cn("text-sm", strong ? "text-foreground font-semibold" : "text-foreground")}>{value}</Amount>
    </View>
  );
}

/** Checking → Signed → Submitted → Final, from the intent's state while the slide's yes runs (any wallet intent). */
export function MarginTrace({ intent, busy }: { intent: Pick<MarginIntent, "state">; busy: boolean }) {
  const { t } = useT();
  const failed = intent.state === "failed" || intent.state === "rejected" || intent.state === "expired" || intent.state === "canceled";
  const reached =
    intent.state === "completed" ? FINAL_STEP : intent.state === "executing" || intent.state === "unknown_outcome" ? SUBMITTED_STEP : intent.state === "approved" ? SIGNED_STEP : busy ? 0 : -1;
  if (reached < 0 && !failed) return null;
  return (
    <View className="flex-row items-center justify-between gap-2">
      {TRACE_STEPS.map((step, index) => {
        const done = index < reached || (index === FINAL_STEP && intent.state === "completed");
        const now = index === reached && !done;
        return (
          <View key={step} className="flex-1 items-center gap-1">
            <Icon as={done ? Check : failed && index === Math.max(reached, 0) ? X : Circle} className={cn("size-4", done ? "text-success" : failed && index === Math.max(reached, 0) ? "text-destructive" : now ? "text-foreground" : "text-muted-foreground")} />
            <Text className={cn("text-center text-xs", done || now ? "text-foreground" : "text-muted-foreground")}>{t(`margin.${step}`)}</Text>
          </View>
        );
      })}
    </View>
  );
}

export function MarginTicket({ controller, market, compact = false }: { controller: MarginController; market?: MarginMarketView | undefined; compact?: boolean }) {
  const { t } = useT();
  const { rtl } = useLocale();
  const { themeName } = useTheme();
  const router = useRouter();
  const fund = useFund();
  const signIn = useSignIn();
  const networkSwitch = useNetworkSwitch();
  const money = useMoney();
  const format = useMarginFormat();
  const policyText = useMarginPolicyText();
  const prompt = useMarginPrompt();
  const { wallet } = useWalletStatus();
  const intent = controller.intent;
  const draft = intent?.draft ?? null;
  const request = intent?.request;
  const side = draft?.side ?? request?.side ?? "long";
  const closing = request?.action === "close";
  const sideView = market ? market[side] : undefined;
  const maxLeverage = Math.max(1, Math.floor((sideView?.maxLeverage ?? MARGIN.maxLeverage) / MARGIN.leverageStep) * MARGIN.leverageStep);
  const [leverage, setLeverage] = React.useState(draft?.leverage || request?.leverage || MARGIN.defaultLeverage);
  React.useEffect(() => {
    if (draft?.leverage) setLeverage(draft.leverage);
  }, [draft?.leverage]);
  // The confirmed haptic and sound, once per order, only when the receipt said so.
  const completedId = intent?.state === "completed" ? intent.id : undefined;
  React.useEffect(() => {
    if (completedId) void confirmedFeedback(`margin:${completedId}`);
  }, [completedId]);

  if (!intent) return null;
  const usdc = wallet?.networks[intent.network]?.usdcBalance;
  const spendable = usdc ? BigInt(usdc) - GAS_FLOAT_USDC_BASE_UNITS : undefined;
  const moving = isMarginMoving(intent);
  const finished = isMarginFinished(intent);
  const blocking = intent.blocking;
  const ready = !blocking && Boolean(draft) && intent.state === "ready_for_approval";
  const revise = (patch: MarginRequest) => void controller.revise(patch);

  const fixFor = (result: PolicyResultView) => {
    switch (result.code) {
      case "SIGN_IN_REQUIRED":
        return { label: t("policy.fixSignIn"), onPress: () => signIn.open() };
      case "ON_OTHER_NETWORK":
        return { label: t("marginPolicy.fixSwitch"), onPress: () => void networkSwitch.switchNetwork("mainnet") };
      case "INSUFFICIENT_BALANCE":
      case "INSUFFICIENT_GAS":
        return { label: t("policy.fixAddMoney"), onPress: fund.open };
      case "WALLET_NOT_READY":
      case "WALLET_NOT_SET_UP":
        return { label: t("policy.fixSetUp"), onPress: () => router.push("/wallet") };
      case "QUOTE_UNAVAILABLE":
        return { label: t("marginPolicy.fixTryAgain"), onPress: () => revise({}) };
      case "LEVERAGE_TOO_HIGH":
        return { label: format.leverage(maxLeverage), onPress: () => revise({ leverage: maxLeverage }) };
      default:
        return undefined;
    }
  };
  const fix = blocking ? fixFor(blocking) : undefined;
  const toneOf = side === "long" ? "long" : "short";
  const resetKey = `${intent.id}:${intent.version}:${intent.state}`;

  return (
    <View className="gap-4">
      <View className="flex-row items-center gap-3">
        {draft ? <Mark entity={marketEntity(draft.asset)} size={MARK} /> : null}
        <View className="flex-1">
          <Text className={cn("font-display text-foreground text-lg font-bold", TEXT_START)}>{draft?.market ?? request?.market ?? t("margin.title")}</Text>
          {draft ? <Text className={cn("text-muted-foreground text-xs", TEXT_START)}>{`${t("margin.mark")} ${format.price(draft.markPrice)}`}</Text> : null}
        </View>
        <View className={cn("rounded-full px-3 py-1", side === "long" ? "bg-success/15" : "bg-destructive/15")}>
          <Text className={cn("text-sm font-semibold", side === "long" ? "text-success" : "text-destructive")}>{t(`margin.${side}`)}</Text>
        </View>
      </View>

      {draft && !closing ? (
        <View className="gap-1">
          <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{t("margin.margin")}</Text>
          <Amount className={cn("font-display text-foreground font-bold", TEXT_START)} style={{ fontSize: compact ? HERO_COMPACT : HERO }}>
            {money("USDC", draft.margin)}
          </Amount>
          <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{t("margin.leveragedSize", { amount: format.usd(draft.notionalUsd) })}</Text>
        </View>
      ) : null}

      {!moving && !finished && !closing ? (
        <>
          <View className="flex-row gap-2">
            {[...MARGIN.presets.map((value) => ({ label: format.usd(value, 0), value: String(value) })), ...(spendable && spendable > ZERO ? [{ label: t("margin.max"), value: (Number(spendable) / USDC_UNIT).toFixed(CENT_DIGITS) }] : [])].map((preset) => (
              <Pressable
                key={preset.label}
                accessibilityRole="button"
                disabled={controller.busy}
                onPress={() => revise({ margin: preset.value })}
                className={cn("bg-muted active:bg-secondary flex-1 items-center rounded-full py-2", request?.margin === preset.value && "bg-secondary")}
              >
                <Text className="text-foreground text-sm font-semibold">{preset.label}</Text>
              </Pressable>
            ))}
          </View>
          {sideView?.available !== false ? (
            <LeverageRuler
              value={Math.min(leverage, maxLeverage)}
              max={maxLeverage}
              step={MARGIN.leverageStep}
              label={t("margin.leverage")}
              format={format.leverage}
              scheme={themeName}
              rtl={rtl}
              disabled={controller.busy}
              onTick={rulerHaptic}
              onChange={(next) => {
                setLeverage(next);
                revise({ leverage: next });
              }}
            />
          ) : null}
        </>
      ) : null}

      {draft ? (
        <View className="border-border gap-2 rounded-2xl border px-4 py-3">
          {closing ? <Row label={t("margin.youGetBack")} value={money("USDC", draft.returnedMin)} strong /> : null}
          {draft.liquidationPrice ? (
            <Row
              label={t("margin.liquidation")}
              value={`${format.price(draft.liquidationPrice)}${draft.liquidationDistance !== null ? ` · ${t("margin.liquidationAway", { percent: format.percent(draft.liquidationDistance) })}` : ""}`}
              strong
            />
          ) : null}
          {draft.healthAfter !== null ? <Row label={t("margin.health")} value={draft.healthAfter.toFixed(CENT_DIGITS)} /> : null}
          <Row label={t("margin.borrowRate")} value={t("margin.borrowRateValue", { rate: format.percent(draft.borrowApr, CENT_DIGITS) })} />
          <Row label={t("margin.networkFee")} value={money("USDC", draft.fees.network)} />
          <Row label={t("margin.route")} value={t("margin.routeValue", { venues: draft.venues.join(", ") || "KyberSwap", loops: draft.loops + 1 })} />
        </View>
      ) : null}

      {draft && !closing && draft.liquidationPrice && !moving && !finished ? (
        <Text className={cn("text-muted-foreground text-xs", TEXT_START)}>{t("margin.risk", { price: format.price(draft.liquidationPrice) })}</Text>
      ) : null}

      {blocking && !moving && !finished ? (
        <View className="bg-muted gap-3 rounded-2xl px-4 py-3">
          <Text className={cn("text-foreground text-base", TEXT_START)}>{policyText(blocking, intent.network)}</Text>
          {fix ? (
            <Button variant="secondary" onPress={fix.onPress}>
              <Text>{fix.label}</Text>
            </Button>
          ) : null}
        </View>
      ) : null}

      <MarginTrace intent={intent} busy={controller.busy} />

      {finished ? (
        <Animated.View entering={FadeIn} className="gap-3">
          <Text className={cn("font-display text-foreground text-xl font-bold", TEXT_START)}>
            {intent.state === "completed" ? t(closing ? "margin.closed" : "margin.opened") : intent.outcome === "checking" ? t("margin.checking") : t("margin.failed")}
          </Text>
          <View className="flex-row gap-2">
            {intent.state === "completed" && intent.positionId && !closing ? (
              <Button className="flex-1" onPress={() => router.push(`/position/${intent.positionId}`)}>
                <Text>{t("margin.viewPosition")}</Text>
              </Button>
            ) : null}
            {intent.tx ? (
              <Button variant="secondary" size="icon" accessibilityLabel={intent.tx.hash} onPress={() => void Linking.openURL(intent.tx!.explorerUrl)}>
                <Icon as={ExternalLink} className="size-4" />
              </Button>
            ) : null}
          </View>
        </Animated.View>
      ) : !moving ? (
        <View className="gap-2">
          <SlideToConfirm
            tone={closing ? "primary" : toneOf}
            rtl={rtl}
            disabled={!ready || controller.busy}
            resetKey={resetKey}
            pendingLabel={t(closing ? "margin.closing" : "margin.opening")}
            done={undefined}
            onHaptic={slideHaptic}
            onConfirm={() => void controller.approve(prompt(draft))}
          >
            {closing ? t("margin.slideClose") : side === "long" ? t("margin.slideLong") : t("margin.slideShort")}
          </SlideToConfirm>
          <Button variant="ghost" disabled={controller.busy} onPress={() => void controller.cancel()}>
            <Text className="text-muted-foreground">{t("margin.cancel")}</Text>
          </Button>
        </View>
      ) : (
        <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{t(closing ? "margin.closing" : "margin.opening")}</Text>
      )}
    </View>
  );
}
