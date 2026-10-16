// One Aave V4 action as a ticket (earn-borrow.md; surfaces.md "Trade tickets"), on the kit: what it does as the one hero
// (supply, withdraw, borrow with the collateral going in, or repay), the health gauge from now to after, the rate,
// where the collateral would be liquidated and the network fee as key-value rows, the risk line, then the tx kit's CTA:
// the reason it cannot go yet as its one fix, the slide (a borrow is "still a confirm", D38; reset by every new
// version, R5), Signing → Sent → Confirmed, the receipt in place, or a failure card that says whether money moved. The
// same ticket is the chat card and the Borrow screen's review; the api decides money, not this.
import { useRouter } from "expo-router";
import * as React from "react";
import { StyleSheet, Text, View } from "react-native";

import type { PolicyResultView } from "@kawase/api-client";
import { LEND } from "@kawase/config";
import { Mark } from "@kawase/ui-native/components/mark";

import { Button, KeyValue, Panel, SPACE, TYPE, useTheme } from "@/components/kit";
import { useFund } from "@/fund/fund-provider";
import { useT } from "@/i18n";
import { isIntentFinished, isIntentMoving } from "@/intents/use-wallet-intent";
import { useMoney } from "@/send/copy";
import { useSignIn } from "@/sign-in/sign-in-provider";
import { Note, RealMoney } from "@/trade/bits";
import { IntentCta, openExplorer, type CtaBlocker } from "@/trade/intent-cta";
import { useNetworkSwitch } from "@/wallet/use-network-switch";
import { useWalletStatus } from "@/wallet/use-wallet-status";
import { RehearsalBlock, rehearsalBlocker, useRehearsal } from "@/chat/rehearsal";

import { useLendFormat, useLendPolicyText, useLendPrompt } from "./copy";
import { HealthGauge } from "./health-gauge";
import type { LendController } from "./use-lend";

const MARK = 36;
const BPS = 10_000;
const RATE_DIGITS = 2;

export function LendTicket({ controller, compact = false, onEdit, onDone }: { controller: LendController; compact?: boolean; onEdit?: () => void; onDone?: () => void }) {
  const { t } = useT();
  const { color } = useTheme();
  const router = useRouter();
  const fund = useFund();
  const signIn = useSignIn();
  const networkSwitch = useNetworkSwitch();
  const format = useLendFormat();
  const money = useMoney();
  const policyText = useLendPolicyText();
  const prompt = useLendPrompt();
  const { wallet } = useWalletStatus();
  const intent = controller.intent;
  // Simulated before the confirm, like every move of money (a revert stops it here, in the chain's own words).
  const rehearsable = Boolean(intent && !intent.blocking && intent.draft && intent.state === "ready_for_approval");
  const rehearsal = useRehearsal("lend", intent ?? { id: "", version: 0 }, rehearsable);
  if (!intent) return null;

  const draft = intent.draft;
  const action = draft?.action ?? intent.request.action;
  const asset = draft?.asset ?? intent.request.asset ?? "";
  const moving = isIntentMoving(intent);
  const finished = isIntentFinished(intent);
  const editing = !moving && !finished;
  const debtMoves = action === "borrow" || action === "repay" || (draft?.healthBefore ?? null) !== null;

  const fixFor = (result: PolicyResultView): CtaBlocker => {
    const reason = policyText(result, intent.network);
    switch (result.code) {
      case "SIGN_IN_REQUIRED":
        return { label: t("policy.fixSignIn"), reason, onFix: () => signIn.open() };
      case "ON_OTHER_NETWORK":
        return { label: t("lendPolicy.fixSwitch"), reason, onFix: () => void networkSwitch.switchNetwork("mainnet") };
      case "INSUFFICIENT_BALANCE":
      case "INSUFFICIENT_GAS":
        return { label: t("policy.fixAddMoney"), reason, onFix: fund.open };
      case "WALLET_NOT_READY":
      case "WALLET_NOT_SET_UP":
        return { label: t("policy.fixSetUp"), reason, onFix: () => router.push("/wallet") };
      case "HEALTH_TOO_LOW":
      case "AMOUNT_MISSING":
      case "AMOUNT_INVALID":
      case "OVER_POSITION":
        return onEdit ? { label: t("policy.fixEditAmount"), reason, onFix: onEdit } : { label: t("lend.openBorrow"), reason, onFix: () => router.push("/borrow") };
      default:
        return { label: reason };
    }
  };
  const blocker: CtaBlocker | null = editing ? (intent.blocking ? fixFor(intent.blocking) : !draft ? { label: t("desktop.pricing"), busy: true } : null) : null;
  const title = t(`lend.title_${action}`, { asset });

  const receipt = (
    <Panel style={styles.receipt}>
      <Text style={[TYPE.sectionTitle, { color: color.ink }]}>{t(`lend.done_${action}`)}</Text>
      {draft ? <KeyValue label={title} value={draft.all ? t("lend.allOf", { amount: format.of(draft) }) : format.of(draft)} /> : null}
      <Button label={t("lend.viewAccount")} onPress={onDone ?? (() => router.push("/borrow"))} />
      {intent.tx ? <Button label={t("desktop.explorer")} variant="ghost" onPress={() => openExplorer(intent.tx?.explorerUrl)} /> : null}
    </Panel>
  );

  return (
    <View style={styles.ticket}>
      {intent.network === "mainnet" && !finished ? <RealMoney /> : null}
      <View style={styles.row}>
        <Mark entity="provider:aave" size={MARK} />
        <View style={styles.grow}>
          <Text style={[TYPE.rowTitle, { color: color.ink }]}>{title}</Text>
          <Text style={[TYPE.rowDetail, { color: color.text3 }]}>{t("lend.venue")}</Text>
        </View>
      </View>

      {draft ? (
        <View style={styles.hero}>
          <Text style={[compact ? TYPE.numLg : TYPE.displayBalance, { color: color.ink }]}>{draft.all ? t("lend.allOf", { amount: format.of(draft) }) : format.of(draft)}</Text>
          {draft.collateral ? <Text style={[TYPE.rowDetail, { color: color.text2 }]}>{t("lend.withCollateral", { amount: format.of(draft.collateral) })}</Text> : null}
        </View>
      ) : null}

      {draft && debtMoves && !finished ? <HealthGauge before={draft.healthBefore} after={draft.healthAfter} min={LEND.minBorrowHealthBps / BPS} warn={LEND.warnHealthBps / BPS} compact={compact} /> : null}

      {draft && !finished ? (
        <Panel style={styles.facts}>
          <KeyValue label={action === "borrow" || action === "repay" ? t("lend.borrowRate") : t("lend.earns")} value={t("lend.rateValue", { rate: format.percent(draft.rate, RATE_DIGITS) })} />
          {draft.liquidation ? <KeyValue label={t("lend.liquidation")} value={t("lend.liquidationValue", { asset: draft.liquidation.asset, price: format.price(draft.liquidation.price) })} valueColor={color.down} /> : null}
          <KeyValue label={t("margin.networkFee")} value={money("USDC", draft.networkFee)} />
        </Panel>
      ) : null}

      {draft && action === "borrow" && editing ? <Note tone="quiet">{t("lend.risk")}</Note> : null}

      {rehearsable && intent ? <RehearsalBlock control={rehearsal} network={intent.network} /> : null}
      <IntentCta
        intent={intent}
        busy={controller.busy}
        connectionLost={controller.connectionLost}
        blocker={blocker ?? rehearsalBlocker(rehearsal, { running: t("feed.run.rehearsing"), stopped: t("feed.run.rehearsedStopped") })}
        confirm={{ kind: "slide", label: t(`lend.slide_${action}`), tone: "primary" }}
        onConfirm={() => void controller.approve(prompt(draft))}
        receipt={receipt}
        journal={{ what: prompt(draft), kind: "earn", network: intent.network, owner: wallet?.address }}
      />
      {editing ? <Button label={t("lend.cancel")} variant="ghost" disabled={controller.busy} onPress={() => void controller.cancel()} /> : null}
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
