// The ticket for a long or a short on Kawase Margin (Aave V4 on Arc mainnet), one component in two places: the right
// column of the desktop terminal and a sheet on the phone. Visual spec: 21st.dev ssychui "Swap Ticket" (27122), built
// from the Senryo kit: Long / Short as the kit's Segmented (23552) in the direction tones, the amount as AmountPad
// (3711; a typed figure on a desktop window) with ¼ ½ ¾ All of what can be spent, leverage opt-in ("No leverage" until
// switched on, D-344) on the LeverageRuler, ONE hero figure (the exposure, rolling digits) with the quote's freshness
// as the kit's CountdownRing, take-profit / stop-loss as chips, the liquidation price, health, rates and fees behind
// one disclosure, and the CTA from the tx kit: a blocker that names its fix, the slide (29304) in the side's tone,
// Signing → Sent → Confirmed, then the receipt morphing in place, or a failure card that says whether money moved.
// The "Real money" marker stays on the ticket whenever the order is on mainnet.
import { useRouter } from "expo-router";
import * as React from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { formatUnits } from "viem";

import type { MarginSide, PolicyResultView } from "@kawase/api-client";
import { MARGIN } from "@kawase/config";
import { LeverageRuler } from "@kawase/ui-native/components/leverage-ruler";

import { Button, CountdownRing, DisclosureRow, KeyValue, Panel, Segmented, SPACE, Switch, TYPE, useTheme } from "@/components/kit";
import { useFund } from "@/fund/fund-provider";
import { useLocale } from "@/i18n/locale-provider";
import { useT } from "@/i18n";
import { PRICE_DECIMALS, useMarginFormat, useMarginPolicyText, useMarginPrompt } from "@/margin/copy";
import { rulerHaptic } from "@/margin/haptics";
import { isMarginFinished, isMarginMoving } from "@/margin/use-margin";
import { BrakeNote } from "@/safety/brake-note";
import { useSession } from "@/session/session-provider";
import { useSignIn } from "@/sign-in/sign-in-provider";
import { useTheme as useAppTheme } from "@/theme/theme-provider";
import { useNetworkSwitch } from "@/wallet/use-network-switch";
import { useWalletStatus } from "@/wallet/use-wallet-status";

import { ChoiceChips, LiveNumber, Note, RealMoney } from "./bits";
import { IntentCta, openExplorer, type CtaBlocker } from "./intent-cta";
import { TicketAmount } from "./ticket-amount";
import { QUOTE_FRESH_MS, targetPrice, targetSteps, type Trade, type TradeTargets } from "./use-trade";

const HERO_H = 44;
const HERO_H_COMPACT = 36;
const RING = 22;
const HEALTH_DIGITS = 2;
const RATE_DIGITS = 2;
const HEALTH_CAUTION = 1.5;
const USDC_DECIMALS = 6;
const FEE_DIGITS = 4;
const MS = 1000;
/** The take-profit / stop-loss label column, so both chip rows start at the same edge. */
const TARGET_LABEL_W = 96;
const usdOf = (eightDecimals: string | null) => (eightDecimals ? Number(formatUnits(BigInt(eightDecimals), PRICE_DECIMALS)) : null);

export function TradePanel({ trade, compact = false }: { trade: Trade; compact?: boolean }) {
  const { t } = useT();
  const { rtl } = useLocale();
  const { themeName } = useAppTheme();
  const { color } = useTheme();
  const router = useRouter();
  const fund = useFund();
  const signIn = useSignIn();
  const networkSwitch = useNetworkSwitch();
  const format = useMarginFormat();
  const policyText = useMarginPolicyText();
  const prompt = useMarginPrompt();
  const { user } = useSession();
  const { wallet } = useWalletStatus();
  const { controller, draft } = trade;
  const intent = controller.intent;
  const moving = intent ? isMarginMoving(intent) : false;
  const finished = intent ? isMarginFinished(intent) && intent.request.action === "open" : false;
  const editing = !moving && !finished;

  const mark = usdOf(draft?.markPrice ?? trade.view?.price ?? null);
  const liquidation = usdOf(draft?.liquidationPrice ?? null);
  // The hero is the api draft's figure; until one arrives for these inputs it is the plain product, muted.
  const exposure = draft ? draft.notionalUsd : trade.marginValue * trade.leverage;
  // Kawase Margin moves real money (Aave V4 on Arc mainnet): said on the ticket itself, as on every money surface.
  const realMoney = (intent?.network ?? user?.activeNetwork) === "mainnet";

  const fixFor = (result: PolicyResultView): CtaBlocker | null => {
    const reason = policyText(result, intent?.network ?? "mainnet");
    switch (result.code) {
      case "SIGN_IN_REQUIRED":
        return { label: t("policy.fixSignIn"), reason, onFix: () => signIn.open() };
      case "ON_OTHER_NETWORK":
        return { label: t("desktop.switchToMainnet"), reason, onFix: () => void networkSwitch.switchNetwork("mainnet") };
      case "INSUFFICIENT_BALANCE":
      case "INSUFFICIENT_GAS":
        return { label: t("policy.fixAddMoney"), reason, onFix: fund.open };
      case "WALLET_NOT_READY":
      case "WALLET_NOT_SET_UP":
        return { label: t("policy.fixSetUp"), reason, onFix: () => router.push("/wallet") };
      case "QUOTE_UNAVAILABLE":
        return { label: t("marginPolicy.fixTryAgain"), reason, onFix: trade.requote };
      case "LEVERAGE_TOO_HIGH":
        return { label: t("desktop.useLeverage", { leverage: format.leverage(trade.maxLeverage) }), reason, onFix: () => trade.setLeverage(trade.maxLeverage) };
      default:
        return { label: reason };
    }
  };

  // What stops the slide, as the one fix (or the named wait) on the CTA's plate.
  let blocker: CtaBlocker | null = null;
  if (editing) {
    if (!trade.sideView?.available) blocker = { label: t(`margin.unavailable_${trade.sideView?.reason ?? "not_borrowable"}`) };
    else if (!trade.signedIn) blocker = { label: t("desktop.signInToTrade"), onFix: () => signIn.open() };
    else if (trade.marginValue <= 0) blocker = { label: t("desktop.enterAmount") };
    else if (trade.available !== undefined && trade.marginValue > trade.available && (!intent?.blocking || intent.blocking.code === "INSUFFICIENT_BALANCE"))
      blocker = { label: t("policy.fixAddMoney"), reason: t("desktop.available", { amount: format.usd(trade.available) }), onFix: fund.open };
    else if (!draft) blocker = trade.draftFailed ? { label: t("marginPolicy.fixTryAgain"), reason: t("desktop.quoteFailed"), onFix: trade.requote } : { label: t("desktop.pricing"), busy: true };
    else if (intent?.blocking) blocker = fixFor(intent.blocking);
    else if (trade.drafting) blocker = { label: t("desktop.pricing"), busy: true };
  }

  const heroH = compact ? HERO_H_COMPACT : HERO_H;
  const quotedAt = draft ? trade.quoteFrom : undefined;
  const sideOptions = (["long", "short"] as const).map((side) => ({ value: side, label: t(`margin.${side}`) }));
  const closedSide = (["long", "short"] as const).find((side) => trade.view && !trade.view[side].available);

  const receipt = intent && finished ? <TradeReceipt trade={trade} /> : undefined;

  return (
    <View style={styles.panel}>
      {realMoney ? <RealMoney label={t("margin.title")} /> : null}

      {editing ? (
        <>
          <Segmented<MarginSide>
            label={t("desktop.side")}
            options={sideOptions}
            value={trade.side}
            tone={(side) => (side === "long" ? color.up : color.down)}
            onChange={(side) => {
              if (trade.view?.[side].available) trade.setSide(side);
            }}
          />
          {closedSide && trade.view ? <Note tone="quiet">{`${t(`margin.${closedSide}`)} · ${t(`margin.unavailable_${trade.view[closedSide].reason ?? "not_borrowable"}`)}`}</Note> : null}

          <TicketAmount
            label={t("desktop.amount")}
            value={trade.amount}
            onChange={trade.setAmount}
            decimals={USDC_DECIMALS}
            balance={trade.spendable}
            note={trade.available !== undefined ? t("desktop.available", { amount: format.usd(trade.available) }) : undefined}
          />

          {trade.leverageAvailable ? (
            <View style={styles.group}>
              <View style={styles.row}>
                <View style={styles.grow}>
                  <Text style={[TYPE.rowStrong, { color: color.ink }]}>{t("margin.leverage")}</Text>
                  <Text style={[TYPE.rowDetail, { color: color.text3 }]}>{trade.leverageOn ? format.leverage(trade.leverage) : t("desktop.noLeverage")}</Text>
                </View>
                <Switch accessibilityLabel={t("margin.leverage")} value={trade.leverageOn} onValueChange={trade.setLeverageOn} />
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

          <View accessible accessibilityLabel={t("desktop.heroLabel", { margin: format.usd(trade.marginValue), exposure: format.usd(exposure) })} style={styles.hero}>
            <View style={styles.row}>
              <Text style={[TYPE.rowDetail, styles.grow, { color: color.text3 }]}>{t("desktop.youPutIn", { amount: format.usd(trade.marginValue) })}</Text>
              {quotedAt !== undefined && intent && !trade.drafting && trade.foreground ? (
                <CountdownRing key={quotedAt} fromSec={quotedAt / MS} toSec={(quotedAt + QUOTE_FRESH_MS) / MS} size={RING} />
              ) : null}
            </View>
            <View style={styles.figureRow}>
              <LiveNumber text={format.usd(exposure)} value={exposure} height={heroH} color={draft ? color.ink : color.text3} />
              <Text style={[TYPE.body, { color: color.text3 }]}>{t("desktop.exposure")}</Text>
            </View>
          </View>

          {mark !== null ? (
            <View style={styles.group}>
              {(["takeProfit", "stopLoss"] as const).map((target: keyof TradeTargets) => {
                const steps = targetSteps(target, trade.side, mark, liquidation);
                return (
                  <View key={target} style={styles.targetRow}>
                    <Text style={[TYPE.rowDetail, styles.targetLabel, { color: color.text2 }]}>{t(`protect.${target}`)}</Text>
                    <View style={styles.grow}>
                      <ChoiceChips<number>
                        label={t(`protect.${target}`)}
                        value={trade.targets[target] ?? -1}
                        onChange={(step) => trade.setTarget(target, step < 0 ? null : step)}
                        options={[{ value: -1, label: t("protect.off") }, ...steps.map((step) => ({ value: step, label: format.percent((target === "takeProfit") === (trade.side === "long") ? step : -step, 0) }))]}
                      />
                    </View>
                  </View>
                );
              })}
            </View>
          ) : null}

          {draft ? (
            <DisclosureRow title={t("desktop.details")} value={liquidation !== null ? t("desktop.liqShort", { price: format.price(draft.liquidationPrice) }) : t("desktop.noLiquidation")}>
              <KeyValue
                label={t("margin.liquidation")}
                value={
                  draft.liquidationPrice
                    ? `${format.price(draft.liquidationPrice)}${draft.liquidationDistance !== null ? ` · ${t("margin.liquidationAway", { percent: format.percent(draft.liquidationDistance) })}` : ""}`
                    : t("desktop.noLiquidation")
                }
              />
              {draft.healthAfter !== null ? <KeyValue label={t("margin.health")} value={draft.healthAfter.toFixed(HEALTH_DIGITS)} valueColor={draft.healthAfter < HEALTH_CAUTION ? color.warn : undefined} /> : null}
              {draft.leverage > 1 ? <KeyValue label={t("margin.borrowRate")} value={t("margin.borrowRateValue", { rate: format.percent(draft.borrowApr, RATE_DIGITS) })} /> : null}
              <KeyValue label={t("margin.entry")} value={format.price(draft.markPrice)} />
              <KeyValue label={t("margin.networkFee")} value={format.usd(Number(formatUnits(BigInt(draft.fees.network), USDC_DECIMALS)), FEE_DIGITS)} />
              <KeyValue label={t("margin.route")} value={draft.venues.length > 0 ? t("desktop.routeValue", { venues: draft.venues.join(", "), steps: draft.loops + 1 }) : t("desktop.routeSteps", { steps: draft.loops + 1 })} />
            </DisclosureRow>
          ) : null}

          {controller.connectionLost ? <Note>{t("desktop.stale")}</Note> : null}
          {intent && !intent.blocking ? <BrakeNote results={intent.results} text={(entry) => policyText(entry, intent.network)} /> : null}
        </>
      ) : null}

      {!editing && intent?.draft ? (
        <View style={styles.hero}>
          <Text style={[TYPE.rowDetail, { color: color.text3 }]}>
            {t("margin.signOpen", { leverage: intent.draft.leverage, side: t(`margin.${intent.draft.side}`), market: intent.draft.market, margin: format.usd(Number(formatUnits(BigInt(intent.draft.margin), USDC_DECIMALS))) })}
          </Text>
          <LiveNumber text={format.usd(intent.draft.notionalUsd)} value={intent.draft.notionalUsd} height={heroH} />
        </View>
      ) : null}

      <IntentCta
        intent={intent}
        busy={controller.busy}
        connectionLost={controller.connectionLost}
        blocker={blocker}
        confirm={{ kind: "slide", label: trade.side === "long" ? t("margin.slideLong") : t("margin.slideShort"), tone: trade.side === "long" ? "up" : "down" }}
        onConfirm={() => void controller.approve(prompt(draft))}
        onRetry={trade.again}
        receipt={receipt}
        journal={{ what: prompt(intent?.draft ?? null), kind: "trade", network: intent?.network ?? "mainnet", owner: wallet?.address }}
      />
    </View>
  );
}

/** The ticket's receipt: what opened, its targets, and the way on (the position, another trade, the explorer). */
function TradeReceipt({ trade }: { trade: Trade }) {
  const { t } = useT();
  const { color } = useTheme();
  const router = useRouter();
  const format = useMarginFormat();
  const intent = trade.controller.intent!;
  const draft = intent.draft;
  const wanted = trade.targets.takeProfit !== null || trade.targets.stopLoss !== null;
  const mark = usdOf(draft?.markPrice ?? null);
  const turnOn = wanted && (trade.targetsSaved === "failed" || (trade.targetsSaved && trade.targetsSaved.needsGrant));
  return (
    <Panel style={styles.receipt}>
      <Text style={[TYPE.sectionTitle, { color: color.ink }]}>{t("margin.opened")}</Text>
      {draft ? <KeyValue label={t("margin.size")} value={format.usd(draft.notionalUsd)} /> : null}
      {draft ? <KeyValue label={t("margin.entry")} value={format.price(draft.markPrice)} /> : null}
      {draft?.liquidationPrice ? <KeyValue label={t("margin.liquidation")} value={format.price(draft.liquidationPrice)} /> : null}
      {wanted && mark !== null && draft ? (
        <Text style={[TYPE.rowDetail, { color: color.text2 }]}>
          {[
            trade.targets.takeProfit !== null ? `${t("protect.takeProfit")} ${format.usd(targetPrice(mark, draft.side, "takeProfit", trade.targets.takeProfit))}` : null,
            trade.targets.stopLoss !== null ? `${t("protect.stopLoss")} ${format.usd(targetPrice(mark, draft.side, "stopLoss", trade.targets.stopLoss))}` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </Text>
      ) : null}
      {intent.positionId ? <Button label={turnOn ? t("protect.turnOn") : t("margin.viewPosition")} onPress={() => router.push(`/position/${intent.positionId}`)} /> : null}
      <View style={styles.row}>
        <View style={styles.grow}>
          <Button label={t("desktop.tradeAgain")} variant="secondary" onPress={trade.again} />
        </View>
        {intent.tx ? (
          <View style={styles.grow}>
            <Button label={t("desktop.explorer")} variant="ghost" onPress={() => openExplorer(intent.tx?.explorerUrl)} />
          </View>
        ) : null}
      </View>
    </Panel>
  );
}

const styles = StyleSheet.create({
  panel: { gap: SPACE.lg },
  group: { gap: SPACE.md },
  row: { flexDirection: "row", alignItems: "center", gap: SPACE.md },
  grow: { flex: 1, minWidth: 0 },
  hero: { gap: SPACE.xs },
  figureRow: { flexDirection: "row", alignItems: "flex-end", gap: SPACE.sm },
  targetRow: { flexDirection: "row", alignItems: "center", gap: SPACE.sm },
  targetLabel: { width: TARGET_LABEL_W },
  receipt: { gap: SPACE.md, padding: SPACE.lg },
});
