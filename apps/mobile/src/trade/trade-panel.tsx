// The ticket for a long or a short on Kawase Margin (Aave V4 on Arc mainnet), one component in two places: the right
// column of the desktop terminal and a bottom sheet on the phone. Visual spec: 21st.dev ssychui "Swap Ticket" (id
// 27122: a caption row with what's available, a big tabular amount, presets, a CTA whose label is the state), with
// Senryo's rules: Long / Short as one segmented choice, the amount with ¼ ½ ¾ All of the USDC you can spend,
// leverage opt-in ("No leverage" until switched on, D-344), one hero figure ("You put in $20 → $40 exposure"),
// take-profit / stop-loss as steps, the liquidation price, health, rates and fees behind one disclosure, and a CTA
// that names the fix when it can't go (switch network, sign in, add money, set up, not borrowable). The numbers are
// the api's draft, priced again as the ring drains; the slide approves that exact version. After it: the trace
// (Checking → Signed → Submitted → Final), then the receipt, which says plainly whether money moved.
import { useRouter } from "expo-router";
import { ChevronDown, ExternalLink } from "lucide-react-native";
import * as React from "react";
import { Linking, Pressable, TextInput, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { formatUnits } from "viem";

import type { MarginSide, PolicyResultView } from "@kawase/api-client";
import { MARGIN } from "@kawase/config";
import { Eyebrow } from "@kawase/ui-native/components/eyebrow";
import { LeverageRuler } from "@kawase/ui-native/components/leverage-ruler";
import { SheetInput } from "@kawase/ui-native/components/sheet";
import { Skeleton } from "@kawase/ui-native/components/ui/skeleton";
import { SlideToConfirm } from "@kawase/ui-native/components/slide-to-confirm";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Switch } from "@kawase/ui-native/components/ui/switch";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, INPUT_TEXT_START, TEXT_START } from "@kawase/ui-native/lib/utils";
import { WEB_HOVER_MUTED } from "@kawase/ui-native/lib/wide";

import { confirmedFeedback } from "@/feedback/feedback";
import { useFund } from "@/fund/fund-provider";
import { useLocale } from "@/i18n/locale-provider";
import { useT } from "@/i18n";
import { PRICE_DECIMALS, useMarginFormat, useMarginPolicyText, useMarginPrompt } from "@/margin/copy";
import { rulerHaptic, slideHaptic } from "@/margin/haptics";
import { MarginTrace } from "@/margin/margin-ticket";
import { isMarginFinished, isMarginMoving } from "@/margin/use-margin";
import { BrakeNote } from "@/safety/brake-note";
import { useSession } from "@/session/session-provider";
import { useSignIn } from "@/sign-in/sign-in-provider";
import { useTheme } from "@/theme/theme-provider";
import { useNetworkSwitch } from "@/wallet/use-network-switch";

import { DrainRing } from "./drain-ring";
import { RollingNumber } from "./rolling-number";
import { QUOTE_FRESH_MS, targetPrice, targetSteps, type Trade, type TradeTargets } from "./use-trade";
import { WaitingLine } from "./waiting-line";

const HERO_SIZE = 34;
const HERO_SIZE_COMPACT = 28;
const AMOUNT_SIZE = 30;
const HEALTH_DIGITS = 2;
const RATE_DIGITS = 2;
const HEALTH_CAUTION = 1.5;
const SKELETON_LINE = 1.2;
const SKELETON_WIDTH = "70%";
const USDC_DECIMALS = 6;
const FEE_DIGITS = 4;
const SHARES = MARGIN.closeShares;
const SHARE_KEYS = ["share25", "share50", "share75", "shareAll"] as const;
const usdOf = (eightDecimals: string | null) => (eightDecimals ? Number(formatUnits(BigInt(eightDecimals), PRICE_DECIMALS)) : null);

function SideSwitch({ trade }: { trade: Trade }) {
  const { t } = useT();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={t("desktop.side")} className="bg-muted flex-row rounded-2xl p-1">
      {(["long", "short"] as const).map((side: MarginSide) => {
        const view = trade.view?.[side];
        const selected = trade.side === side;
        const open = view?.available ?? false;
        return (
          <Pressable
            key={side}
            accessibilityRole="radio"
            accessibilityState={{ selected, disabled: !open }}
            disabled={!open}
            onPress={() => trade.setSide(side)}
            className={cn("flex-1 items-center rounded-xl py-2.5", selected ? (side === "long" ? "bg-success" : "bg-destructive") : WEB_HOVER_MUTED)}
          >
            <Text className={cn("text-base font-semibold", selected ? "text-background" : open ? "text-foreground" : "text-muted-foreground")}>{t(`margin.${side}`)}</Text>
            {!open && view ? <Text className="text-muted-foreground text-[11px]">{t(`margin.unavailable_${view.reason ?? "not_borrowable"}`)}</Text> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

function Chip({ label, selected, disabled, onPress }: { label: string; selected?: boolean; disabled?: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: Boolean(selected), disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      className={cn("flex-1 items-center rounded-full border py-1.5", selected ? "border-foreground bg-foreground" : "border-border", disabled ? "opacity-40" : WEB_HOVER_MUTED)}
    >
      <Text className={cn("text-sm font-semibold", selected ? "text-background" : "text-foreground")}>{label}</Text>
    </Pressable>
  );
}

function Fact({ label, value, tone }: { label: string; value: string; tone?: "warn" }) {
  return (
    <View className="flex-row items-center justify-between gap-3 py-1">
      <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{label}</Text>
      <Text className={cn("font-mono text-sm tabular-nums", tone === "warn" ? "text-destructive font-semibold" : "text-foreground")}>{value}</Text>
    </View>
  );
}

export function TradePanel({ trade, inSheet = false, compact = false }: { trade: Trade; inSheet?: boolean; compact?: boolean }) {
  const { t } = useT();
  const { rtl } = useLocale();
  const { themeName } = useTheme();
  const router = useRouter();
  const fund = useFund();
  const signIn = useSignIn();
  const networkSwitch = useNetworkSwitch();
  const format = useMarginFormat();
  const policyText = useMarginPolicyText();
  const prompt = useMarginPrompt();
  const { user } = useSession();
  const [details, setDetails] = React.useState(false);
  const { controller, draft } = trade;
  const intent = controller.intent;
  const moving = intent ? isMarginMoving(intent) : false;
  const finished = intent ? isMarginFinished(intent) && intent.request.action === "open" : false;
  const editing = !moving && !finished;

  // The confirmed sound and haptic, once per order, only when the receipt says so.
  const completedId = intent?.state === "completed" ? intent.id : undefined;
  React.useEffect(() => {
    if (completedId) void confirmedFeedback(`margin:${completedId}`);
  }, [completedId]);

  const mark = usdOf(draft?.markPrice ?? trade.view?.price ?? null);
  const liquidation = usdOf(draft?.liquidationPrice ?? null);
  // The hero is the api draft's figure; until one arrives for these inputs it shows the plain product, muted.
  const exposure = draft ? draft.notionalUsd : trade.marginValue * trade.leverage;
  const pricing = !draft && trade.marginValue > 0 && trade.signedIn && Boolean(trade.sideView?.available) && !trade.draftFailed;
  // Kawase Margin moves real money (Aave V4 on Arc mainnet): said on the ticket itself, as on every money surface.
  const realMoney = (intent?.network ?? user?.activeNetwork) === "mainnet";
  const AmountField = inSheet ? SheetInput : TextInput;

  const fixFor = (result: PolicyResultView) => {
    switch (result.code) {
      case "SIGN_IN_REQUIRED":
        return { label: t("policy.fixSignIn"), onPress: () => signIn.open() };
      case "ON_OTHER_NETWORK":
        return { label: t("desktop.switchToMainnet"), onPress: () => void networkSwitch.switchNetwork("mainnet") };
      case "INSUFFICIENT_BALANCE":
      case "INSUFFICIENT_GAS":
        return { label: t("policy.fixAddMoney"), onPress: fund.open };
      case "WALLET_NOT_READY":
      case "WALLET_NOT_SET_UP":
        return { label: t("policy.fixSetUp"), onPress: () => router.push("/wallet") };
      case "QUOTE_UNAVAILABLE":
        return { label: t("marginPolicy.fixTryAgain"), onPress: trade.requote };
      case "LEVERAGE_TOO_HIGH":
        return { label: t("desktop.useLeverage", { leverage: format.leverage(trade.maxLeverage) }), onPress: () => trade.setLeverage(trade.maxLeverage) };
      default:
        return undefined;
    }
  };

  // The CTA: the slide when the draft can go, else one button (or label) that names the fix.
  let cta: React.ReactNode;
  const blocked = (label: string, onPress?: () => void) =>
    onPress ? (
      <Button size="lg" onPress={onPress}>
        <Text>{label}</Text>
      </Button>
    ) : (
      <Button size="lg" variant="secondary" disabled>
        <Text>{label}</Text>
      </Button>
    );
  if (!trade.sideView?.available) cta = blocked(t(`margin.unavailable_${trade.sideView?.reason ?? "not_borrowable"}`));
  else if (!trade.signedIn) cta = blocked(t("desktop.signInToTrade"), () => signIn.open());
  else if (trade.marginValue <= 0) cta = blocked(t("desktop.enterAmount"));
  else if (trade.available !== undefined && trade.marginValue > trade.available && (!intent?.blocking || intent.blocking.code === "INSUFFICIENT_BALANCE")) cta = blocked(t("policy.fixAddMoney"), fund.open);
  else if (!draft) cta = trade.draftFailed ? blocked(t("marginPolicy.fixTryAgain"), trade.requote) : <WaitingLine verb={t("desktop.pricing")} onRetry={trade.requote} className="h-12 justify-center" />;
  else if (intent?.blocking) {
    const fix = fixFor(intent.blocking);
    cta = (
      <View className="gap-2">
        {fix ? blocked(fix.label, fix.onPress) : blocked(policyText(intent.blocking, intent.network))}
        {fix ? <Text className={cn("text-muted-foreground text-xs", TEXT_START)}>{policyText(intent.blocking, intent.network)}</Text> : null}
      </View>
    );
  } else
    cta = (
      <View className="gap-2">
        <BrakeNote results={intent?.results ?? []} text={(entry) => policyText(entry, intent!.network)} />
        <SlideToConfirm
          tone={trade.side}
          rtl={rtl}
          disabled={intent?.state !== "ready_for_approval" || controller.busy || trade.drafting}
          resetKey={`${intent?.id}:${intent?.version}:${intent?.state}`}
          pendingLabel={t("margin.opening")}
          done={undefined}
          onHaptic={slideHaptic}
          onConfirm={() => void controller.approve(prompt(draft))}
        >
          {trade.side === "long" ? t("margin.slideLong") : t("margin.slideShort")}
        </SlideToConfirm>
      </View>
    );

  const quotedAt = draft ? trade.quoteFrom : undefined;
  const heroSize = compact ? HERO_SIZE_COMPACT : HERO_SIZE;

  return (
    <View className="gap-5">
      {realMoney ? <Eyebrow className="text-foreground">{`${t("margin.title")} · ${t("network.realMoney")}`}</Eyebrow> : null}
      {editing ? <SideSwitch trade={trade} /> : null}

      {editing ? (
        <View className="border-border gap-3 rounded-2xl border p-3.5">
          <View className="flex-row items-center justify-between">
            <Text className="text-muted-foreground text-xs">{t("desktop.amount")}</Text>
            {trade.available !== undefined ? <Text className="text-muted-foreground font-mono text-xs tabular-nums">{t("desktop.available", { amount: format.usd(trade.available) })}</Text> : null}
          </View>
          <View className="flex-row items-center gap-2">
            <AmountField
              accessibilityLabel={t("desktop.amount")}
              value={trade.amount}
              onChangeText={trade.setAmount}
              placeholder="0"
              keyboardType="decimal-pad"
              inputMode="decimal"
              className={cn("text-foreground h-12 flex-1 bg-transparent px-0 font-mono tabular-nums", INPUT_TEXT_START)}
              style={{ fontSize: AMOUNT_SIZE }}
            />
            <Text className="text-muted-foreground text-base font-semibold">{t("desktop.usdc")}</Text>
          </View>
          <View className="flex-row gap-2">
            {SHARES.map((share, index) => (
              <Chip key={share} label={t(`desktop.${SHARE_KEYS[index]!}`)} disabled={!trade.available} onPress={() => trade.setShare(share)} />
            ))}
          </View>
        </View>
      ) : null}

      {editing && trade.leverageAvailable ? (
        <View className="gap-3">
          <View className="flex-row items-center justify-between gap-3">
            <View>
              <Text className={cn("text-foreground text-base font-semibold", TEXT_START)}>{t("margin.leverage")}</Text>
              <Text className={cn("text-muted-foreground font-mono text-sm tabular-nums", TEXT_START)}>{trade.leverageOn ? format.leverage(trade.leverage) : t("desktop.noLeverage")}</Text>
            </View>
            <Switch accessibilityLabel={t("margin.leverage")} checked={trade.leverageOn} onCheckedChange={trade.setLeverageOn} />
          </View>
          {trade.leverageOn ? (
            <Animated.View entering={FadeIn} exiting={FadeOut}>
              <LeverageRuler
                value={trade.leverage}
                max={trade.maxLeverage}
                step={MARGIN.leverageStep}
                label={t("margin.leverage")}
                format={format.leverage}
                scheme={themeName}
                rtl={rtl}
                onTick={rulerHaptic}
                onChange={trade.setLeverage}
              />
            </Animated.View>
          ) : null}
        </View>
      ) : null}

      {editing ? (
        <View accessible accessibilityLabel={t("desktop.heroLabel", { margin: format.usd(trade.marginValue), exposure: format.usd(exposure) })} className="gap-1">
          <View className="flex-row items-center justify-between">
            <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{t("desktop.youPutIn", { amount: format.usd(trade.marginValue) })}</Text>
            {quotedAt !== undefined && intent && !trade.drafting && trade.foreground ? <DrainRing from={quotedAt} to={quotedAt + QUOTE_FRESH_MS} accessibilityLabel={t("desktop.quoteFresh")} onDone={trade.requote} /> : null}
          </View>
          {pricing ? (
            <Skeleton className="rounded-xl" style={{ height: heroSize * SKELETON_LINE, width: SKELETON_WIDTH }} />
          ) : (
            <View className="flex-row flex-wrap items-baseline gap-x-2">
              <RollingNumber text={format.usd(exposure)} value={exposure} size={heroSize} className={cn("font-display font-bold", draft ? "text-foreground" : "text-muted-foreground")} />
              <Text className="text-muted-foreground text-base">{t("desktop.exposure")}</Text>
            </View>
          )}
        </View>
      ) : null}

      {editing && mark !== null ? (
        <View className="gap-2">
          {(["takeProfit", "stopLoss"] as const).map((target: keyof TradeTargets) => {
            const steps = targetSteps(target, trade.side, mark, liquidation);
            const chosen = trade.targets[target];
            return (
              <View key={target} className="flex-row items-center gap-2">
                <Text className={cn("text-muted-foreground w-24 text-sm", TEXT_START)}>{t(`protect.${target}`)}</Text>
                <Chip label={t("protect.off")} selected={chosen === null} onPress={() => trade.setTarget(target, null)} />
                {steps.map((step) => (
                  <Chip
                    key={step}
                    label={format.percent((target === "takeProfit") === (trade.side === "long") ? step : -step, 0)}
                    selected={chosen === step}
                    onPress={() => trade.setTarget(target, step)}
                  />
                ))}
              </View>
            );
          })}
        </View>
      ) : null}

      {editing && draft ? (
        <View className="border-border rounded-2xl border">
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: details }}
            onPress={() => setDetails((open) => !open)}
            className={cn("flex-row items-center justify-between px-3.5 py-3", WEB_HOVER_MUTED)}
          >
            <Text className="text-foreground text-sm font-semibold">{t("desktop.details")}</Text>
            <View className="flex-row items-center gap-2">
              {liquidation !== null && !details ? <Text className="text-muted-foreground font-mono text-xs tabular-nums">{t("desktop.liqShort", { price: format.price(draft.liquidationPrice) })}</Text> : null}
              <Icon as={ChevronDown} className={cn("text-muted-foreground size-4", details && "rotate-180")} />
            </View>
          </Pressable>
          {details ? (
            <Animated.View entering={FadeIn} className="border-border border-t px-3.5 py-2">
              <Fact
                label={t("margin.liquidation")}
                value={
                  draft.liquidationPrice
                    ? `${format.price(draft.liquidationPrice)}${draft.liquidationDistance !== null ? ` · ${t("margin.liquidationAway", { percent: format.percent(draft.liquidationDistance) })}` : ""}`
                    : t("desktop.noLiquidation")
                }
              />
              {draft.healthAfter !== null ? <Fact label={t("margin.health")} value={draft.healthAfter.toFixed(HEALTH_DIGITS)} {...(draft.healthAfter < HEALTH_CAUTION ? { tone: "warn" as const } : {})} /> : null}
              {draft.leverage > 1 ? <Fact label={t("margin.borrowRate")} value={t("margin.borrowRateValue", { rate: format.percent(draft.borrowApr, RATE_DIGITS) })} /> : null}
              <Fact label={t("margin.entry")} value={format.price(draft.markPrice)} />
              <Fact label={t("margin.networkFee")} value={format.usd(Number(formatUnits(BigInt(draft.fees.network), USDC_DECIMALS)), FEE_DIGITS)} />
              <Fact label={t("margin.route")} value={draft.venues.length > 0 ? t("desktop.routeValue", { venues: draft.venues.join(", "), steps: draft.loops + 1 }) : t("desktop.routeSteps", { steps: draft.loops + 1 })} />
            </Animated.View>
          ) : null}
        </View>
      ) : null}

      {controller.connectionLost && editing ? (
        <View className="flex-row items-center justify-between gap-2">
          <Text className={cn("text-muted-foreground text-xs", TEXT_START)}>{t("desktop.stale")}</Text>
          <Text accessibilityRole="button" onPress={() => void controller.refresh()} className="text-foreground text-xs font-semibold underline">
            {t("common.retry")}
          </Text>
        </View>
      ) : null}

      {editing ? cta : null}

      {intent && (moving || finished) ? <TradeOutcome trade={trade} /> : null}
    </View>
  );
}

/** After the slide: the trace while it runs, then the receipt (money moved or not, in so many words). */
function TradeOutcome({ trade }: { trade: Trade }) {
  const { t } = useT();
  const router = useRouter();
  const format = useMarginFormat();
  const intent = trade.controller.intent!;
  const moving = isMarginMoving(intent);
  const completed = intent.state === "completed";
  const draft = intent.draft;
  const wanted = trade.targets.takeProfit !== null || trade.targets.stopLoss !== null;
  const mark = usdOf(draft?.markPrice ?? null);
  return (
    <Animated.View entering={FadeIn} className="gap-4">
      {draft ? (
        <View className="gap-1">
          <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{t("margin.signOpen", { leverage: draft.leverage, side: t(`margin.${draft.side}`), market: draft.market, margin: format.usd(Number(formatUnits(BigInt(draft.margin), USDC_DECIMALS))) })}</Text>
          <Text className={cn("font-display text-foreground text-2xl font-bold", TEXT_START)}>
            {moving ? t("margin.opening") : completed ? t("margin.opened") : intent.outcome === "checking" ? t("margin.checking") : t("margin.failed")}
          </Text>
        </View>
      ) : null}
      <MarginTrace intent={intent} busy={trade.controller.busy} />
      {completed && wanted && mark !== null && draft ? (
        <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>
          {[
            trade.targets.takeProfit !== null ? `${t("protect.takeProfit")} ${format.usd(targetPrice(mark, draft.side, "takeProfit", trade.targets.takeProfit))}` : null,
            trade.targets.stopLoss !== null ? `${t("protect.stopLoss")} ${format.usd(targetPrice(mark, draft.side, "stopLoss", trade.targets.stopLoss))}` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </Text>
      ) : null}
      {!moving ? (
        <View className="flex-row gap-2">
          {completed && intent.positionId ? (
            <Button className="flex-1" onPress={() => router.push(`/position/${intent.positionId}`)}>
              <Text>{wanted && (trade.targetsSaved === "failed" || (trade.targetsSaved && trade.targetsSaved.needsGrant)) ? t("protect.turnOn") : t("margin.viewPosition")}</Text>
            </Button>
          ) : null}
          <Button variant="secondary" className={completed && intent.positionId ? undefined : "flex-1"} onPress={trade.again}>
            <Text>{t("desktop.tradeAgain")}</Text>
          </Button>
          {intent.tx ? (
            <Button variant="secondary" size="icon" accessibilityLabel={t("desktop.explorer")} onPress={() => void Linking.openURL(intent.tx!.explorerUrl)}>
              <Icon as={ExternalLink} className="size-4" />
            </Button>
          ) : null}
        </View>
      ) : null}
    </Animated.View>
  );
}
