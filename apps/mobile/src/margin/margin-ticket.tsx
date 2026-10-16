// The perp ticket for a drafted order (surfaces.md "Trade tickets", ported from Senryo's ticket onto the kit): the
// market with its real mark and the side, margin as the one hero figure with the leveraged size under it, presets and
// the LeverageRuler (an open), or what comes back (a close), the liquidation price, health, rate, fee and route as
// key-value rows, the risk line, the brake, and the tx kit's CTA: the fix when blocked, the slide (in the side's tone,
// reset by any new version, R5), Signing → Sent → Confirmed, then the receipt in place, or the failure card saying
// whether money moved. The same ticket is the chat card and the position page's close; the api decides money.
import { useRouter } from "expo-router";
import * as React from "react";
import { StyleSheet, Text, View } from "react-native";

import type { MarginMarketView, MarginRequest, PolicyResultView } from "@kawase/api-client";
import { GAS_FLOAT_USDC_BASE_UNITS, MARGIN } from "@kawase/config";
import { LeverageRuler } from "@kawase/ui-native/components/leverage-ruler";
import { Mark } from "@kawase/ui-native/components/mark";

import { Button, KeyValue, Panel, SPACE, TYPE, useTheme } from "@/components/kit";
import { useFund } from "@/fund/fund-provider";
import { useLocale } from "@/i18n/locale-provider";
import { useT } from "@/i18n";
import { BrakeNote } from "@/safety/brake-note";
import { useMoney } from "@/send/copy";
import { useSignIn } from "@/sign-in/sign-in-provider";
import { useTheme as useAppTheme } from "@/theme/theme-provider";
import { ChoiceChips, LiveNumber, Note, RealMoney, SideTag } from "@/trade/bits";
import { IntentCta, openExplorer, type CtaBlocker } from "@/trade/intent-cta";
import { useNetworkSwitch } from "@/wallet/use-network-switch";
import { useWalletStatus } from "@/wallet/use-wallet-status";
import { RehearsalBlock, rehearsalBlocker, useRehearsal } from "@/chat/rehearsal";

import { marketEntity, useMarginFormat, useMarginPolicyText, useMarginPrompt } from "./copy";
import { rulerHaptic } from "./haptics";
import { isMarginFinished, isMarginMoving, type MarginController } from "./use-margin";

const MARK = 36;
const HERO_H = 44;
const HERO_H_COMPACT = 32;
const CENT_DIGITS = 2;
const ZERO = 0n;
const USDC_UNIT = 1_000_000;

export function MarginTicket({ controller, market, compact = false }: { controller: MarginController; market?: MarginMarketView | undefined; compact?: boolean }) {
  const { t } = useT();
  const { rtl } = useLocale();
  const { themeName } = useAppTheme();
  const { color } = useTheme();
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
  // Simulated before the confirm, like every move of money (a revert stops it here, in the chain's own words).
  const rehearsable = Boolean(intent && !intent.blocking && intent.draft && intent.state === "ready_for_approval");
  const rehearsal = useRehearsal("margin", intent ?? { id: "", version: 0 }, rehearsable);
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

  if (!intent) return null;
  const usdc = wallet?.networks[intent.network]?.usdcBalance;
  const spendable = usdc ? BigInt(usdc) - GAS_FLOAT_USDC_BASE_UNITS : undefined;
  const moving = isMarginMoving(intent);
  const finished = isMarginFinished(intent);
  const editing = !moving && !finished;
  const blocking = intent.blocking;
  const revise = (patch: MarginRequest) => void controller.revise(patch);

  const fixFor = (result: PolicyResultView): CtaBlocker => {
    const reason = policyText(result, intent.network);
    switch (result.code) {
      case "SIGN_IN_REQUIRED":
        return { label: t("policy.fixSignIn"), reason, onFix: () => signIn.open() };
      case "ON_OTHER_NETWORK":
        return { label: t("marginPolicy.fixSwitch"), reason, onFix: () => void networkSwitch.switchNetwork("mainnet") };
      case "INSUFFICIENT_BALANCE":
      case "INSUFFICIENT_GAS":
        return { label: t("policy.fixAddMoney"), reason, onFix: fund.open };
      case "WALLET_NOT_READY":
      case "WALLET_NOT_SET_UP":
        return { label: t("policy.fixSetUp"), reason, onFix: () => router.push("/wallet") };
      case "QUOTE_UNAVAILABLE":
        return { label: t("marginPolicy.fixTryAgain"), reason, onFix: () => revise({}) };
      case "LEVERAGE_TOO_HIGH":
        return { label: format.leverage(maxLeverage), reason, onFix: () => revise({ leverage: maxLeverage }) };
      default:
        return { label: reason };
    }
  };
  const blocker: CtaBlocker | null = editing ? (blocking ? fixFor(blocking) : !draft ? { label: t("desktop.pricing"), busy: true } : null) : null;
  const presets = [
    ...MARGIN.presets.map((value) => ({ label: format.usd(value, 0), value: String(value) })),
    ...(spendable && spendable > ZERO ? [{ label: t("margin.max"), value: (Number(spendable) / USDC_UNIT).toFixed(CENT_DIGITS) }] : []),
  ];

  const receipt = (
    <Panel style={styles.receipt}>
      <Text style={[TYPE.sectionTitle, { color: color.ink }]}>{t(closing ? "margin.closed" : "margin.opened")}</Text>
      {draft && closing ? <KeyValue label={t("margin.youGetBack")} value={money("USDC", draft.returnedMin)} /> : null}
      {draft && !closing ? <KeyValue label={t("margin.size")} value={format.usd(draft.notionalUsd)} /> : null}
      {intent.positionId && !closing ? <Button label={intent.network === "mainnet" ? t("protect.title") : t("margin.viewPosition")} onPress={() => router.push(`/position/${intent.positionId}`)} /> : null}
      {intent.tx ? <Button label={t("desktop.explorer")} variant="ghost" onPress={() => openExplorer(intent.tx?.explorerUrl)} /> : null}
    </Panel>
  );

  return (
    <View style={styles.ticket}>
      {intent.network === "mainnet" && editing ? <RealMoney label={t("margin.title")} /> : null}
      <View style={styles.row}>
        {draft ? <Mark entity={marketEntity(draft.asset)} size={MARK} /> : null}
        <View style={styles.grow}>
          <Text style={[TYPE.rowTitle, { color: color.ink }]}>{draft?.market ?? request?.market ?? t("margin.title")}</Text>
          {draft ? <Text style={[TYPE.rowDetail, { color: color.text3 }]}>{`${t("margin.mark")} ${format.price(draft.markPrice)}`}</Text> : null}
        </View>
        <SideTag side={side} />
      </View>

      {draft && !closing ? (
        <View style={styles.hero}>
          <Text style={[TYPE.rowDetail, { color: color.text3 }]}>{t("margin.margin")}</Text>
          <LiveNumber text={money("USDC", draft.margin)} value={Number(draft.margin) / USDC_UNIT} height={compact ? HERO_H_COMPACT : HERO_H} />
          <Text style={[TYPE.rowDetail, { color: color.text2 }]}>{t("margin.leveragedSize", { amount: format.usd(draft.notionalUsd) })}</Text>
        </View>
      ) : null}
      {draft && closing ? (
        <View style={styles.hero}>
          <Text style={[TYPE.rowDetail, { color: color.text3 }]}>{t("margin.youGetBack")}</Text>
          <LiveNumber text={money("USDC", draft.returnedMin)} value={Number(draft.returnedMin) / USDC_UNIT} height={compact ? HERO_H_COMPACT : HERO_H} />
        </View>
      ) : null}

      {editing && !closing ? (
        <>
          <ChoiceChips label={t("margin.margin")} options={presets.map((preset) => ({ value: preset.value, label: preset.label, disabled: controller.busy }))} value={request?.margin ?? null} onChange={(value) => revise({ margin: value })} />
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

      {draft && editing ? (
        <Panel style={styles.facts}>
          {draft.liquidationPrice ? (
            <KeyValue
              label={t("margin.liquidation")}
              value={`${format.price(draft.liquidationPrice)}${draft.liquidationDistance !== null ? ` · ${t("margin.liquidationAway", { percent: format.percent(draft.liquidationDistance) })}` : ""}`}
            />
          ) : null}
          {draft.healthAfter !== null ? <KeyValue label={t("margin.health")} value={draft.healthAfter.toFixed(CENT_DIGITS)} /> : null}
          <KeyValue label={t("margin.borrowRate")} value={t("margin.borrowRateValue", { rate: format.percent(draft.borrowApr, CENT_DIGITS) })} />
          <KeyValue label={t("margin.networkFee")} value={money("USDC", draft.fees.network)} />
          <KeyValue label={t("margin.route")} value={t("margin.routeValue", { venues: draft.venues.join(", ") || "Aave V4", loops: draft.loops + 1 })} />
        </Panel>
      ) : null}

      {draft && closing && draft.protectionOff && !finished ? <Note tone="quiet">{t("margin.closeEndsProtection")}</Note> : null}
      {draft && !closing && draft.liquidationPrice && editing ? <Note tone="quiet">{t("margin.risk", { price: format.price(draft.liquidationPrice) })}</Note> : null}
      {editing && !blocking ? <BrakeNote results={intent.results} text={(entry) => policyText(entry, intent.network)} /> : null}

      {rehearsable && intent ? <RehearsalBlock control={rehearsal} network={intent.network} /> : null}
      <IntentCta
        intent={intent}
        busy={controller.busy}
        connectionLost={controller.connectionLost}
        blocker={blocker ?? rehearsalBlocker(rehearsal, { running: t("feed.run.rehearsing"), stopped: t("feed.run.rehearsedStopped") })}
        confirm={{ kind: "slide", label: closing ? t("margin.slideClose") : side === "long" ? t("margin.slideLong") : t("margin.slideShort"), tone: closing ? "primary" : side === "long" ? "up" : "down" }}
        onConfirm={() => void controller.approve(prompt(draft))}
        receipt={receipt}
        journal={{ what: prompt(draft), kind: "trade", network: intent.network, owner: wallet?.address }}
      />
      {editing ? <Button label={t("margin.cancel")} variant="ghost" disabled={controller.busy} onPress={() => void controller.cancel()} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  ticket: { gap: SPACE.lg },
  row: { flexDirection: "row", alignItems: "center", gap: SPACE.md },
  grow: { flex: 1, minWidth: 0 },
  hero: { gap: SPACE.xxs },
  facts: { gap: SPACE.xs, padding: SPACE.lg },
  receipt: { gap: SPACE.md, padding: SPACE.lg },
});
