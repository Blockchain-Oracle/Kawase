// One Aave V4 action as a ticket (earn-borrow.md; surfaces.md "Trade tickets"): what it does as the hero (supply,
// withdraw, borrow, with the collateral going in, or repay), the health gauge from now to after, the rate, where the
// collateral would be liquidated, the network fee, the reason it cannot go yet with its one fix, then slide to
// confirm, which resets on every new version (R5). After the slide: Face ID, the trace, the ending with the Borrow
// page. The same ticket is the chat card and the Borrow screen's review; the api decides money, not this.
import { useRouter } from "expo-router";
import { ExternalLink } from "lucide-react-native";
import * as React from "react";
import { Linking, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

import type { PolicyResultView } from "@kawase/api-client";
import { LEND } from "@kawase/config";
import { Amount } from "@kawase/ui-native/components/amount";
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
import { MarginTrace } from "@/margin/margin-ticket";
import { slideHaptic } from "@/margin/haptics";
import { isIntentFinished, isIntentMoving } from "@/intents/use-wallet-intent";
import { useMoney } from "@/send/copy";
import { useSignIn } from "@/sign-in/sign-in-provider";
import { useNetworkSwitch } from "@/wallet/use-network-switch";

import { useLendFormat, useLendPolicyText, useLendPrompt } from "./copy";
import { HealthGauge } from "./health-gauge";
import type { LendController } from "./use-lend";

const MARK = 36;
const HERO = 40;
const HERO_COMPACT = 28;
const BPS = 10_000;
const RATE_DIGITS = 2;

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View className="flex-row items-center justify-between gap-3">
      <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{label}</Text>
      <Amount className={cn("text-sm", strong ? "text-foreground font-semibold" : "text-foreground")}>{value}</Amount>
    </View>
  );
}

export function LendTicket({ controller, compact = false, onEdit, onDone }: { controller: LendController; compact?: boolean; onEdit?: () => void; onDone?: () => void }) {
  const { t } = useT();
  const { rtl } = useLocale();
  const router = useRouter();
  const fund = useFund();
  const signIn = useSignIn();
  const networkSwitch = useNetworkSwitch();
  const format = useLendFormat();
  const money = useMoney();
  const policyText = useLendPolicyText();
  const prompt = useLendPrompt();
  const intent = controller.intent;
  const completedId = intent?.state === "completed" ? intent.id : undefined;
  React.useEffect(() => {
    if (completedId) void confirmedFeedback(`lend:${completedId}`);
  }, [completedId]);
  if (!intent) return null;

  const draft = intent.draft;
  const action = draft?.action ?? intent.request.action;
  const asset = draft?.asset ?? intent.request.asset ?? "";
  const moving = isIntentMoving(intent);
  const finished = isIntentFinished(intent);
  const blocking = intent.blocking;
  const ready = !blocking && Boolean(draft) && intent.state === "ready_for_approval";
  const debtMoves = action === "borrow" || action === "repay" || (draft?.healthBefore ?? null) !== null;

  const fixFor = (result: PolicyResultView) => {
    switch (result.code) {
      case "SIGN_IN_REQUIRED":
        return { label: t("policy.fixSignIn"), onPress: () => signIn.open() };
      case "ON_OTHER_NETWORK":
        return { label: t("lendPolicy.fixSwitch"), onPress: () => void networkSwitch.switchNetwork("mainnet") };
      case "INSUFFICIENT_BALANCE":
      case "INSUFFICIENT_GAS":
        return { label: t("policy.fixAddMoney"), onPress: fund.open };
      case "WALLET_NOT_READY":
      case "WALLET_NOT_SET_UP":
        return { label: t("policy.fixSetUp"), onPress: () => router.push("/wallet") };
      case "HEALTH_TOO_LOW":
      case "AMOUNT_MISSING":
      case "AMOUNT_INVALID":
      case "OVER_POSITION":
        return onEdit ? { label: t("policy.fixEditAmount"), onPress: onEdit } : { label: t("lend.openBorrow"), onPress: () => router.push("/borrow") };
      default:
        return undefined;
    }
  };
  const fix = blocking ? fixFor(blocking) : undefined;
  const resetKey = `${intent.id}:${intent.version}:${intent.state}`;
  const title = t(`lend.title_${action}`, { asset });

  return (
    <View className="gap-4">
      <View className="flex-row items-center gap-3">
        <Mark entity="provider:aave" size={MARK} />
        <View className="flex-1">
          <Text className={cn("font-display text-foreground text-lg font-bold", TEXT_START)}>{title}</Text>
          <Text className={cn("text-muted-foreground text-xs", TEXT_START)}>{t("lend.venue")}</Text>
        </View>
      </View>

      {draft ? (
        <View className="gap-1">
          <Amount className={cn("font-display text-foreground font-bold", TEXT_START)} style={{ fontSize: compact ? HERO_COMPACT : HERO }}>
            {draft.all ? t("lend.allOf", { amount: format.of(draft) }) : format.of(draft)}
          </Amount>
          {draft.collateral ? <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{t("lend.withCollateral", { amount: format.of(draft.collateral) })}</Text> : null}
        </View>
      ) : null}

      {draft && debtMoves && !finished ? (
        <HealthGauge before={draft.healthBefore} after={draft.healthAfter} min={LEND.minBorrowHealthBps / BPS} warn={LEND.warnHealthBps / BPS} compact={compact} />
      ) : null}

      {draft ? (
        <View className="border-border gap-2 rounded-2xl border px-4 py-3">
          <Row
            label={action === "borrow" || action === "repay" ? t("lend.borrowRate") : t("lend.earns")}
            value={t("lend.rateValue", { rate: format.percent(draft.rate, RATE_DIGITS) })}
          />
          {draft.liquidation ? <Row label={t("lend.liquidation")} value={t("lend.liquidationValue", { asset: draft.liquidation.asset, price: format.price(draft.liquidation.price) })} strong /> : null}
          <Row label={t("margin.networkFee")} value={money("USDC", draft.networkFee)} />
        </View>
      ) : null}

      {draft && action === "borrow" && !moving && !finished ? <Text className={cn("text-muted-foreground text-xs", TEXT_START)}>{t("lend.risk")}</Text> : null}

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
            {intent.state === "completed" ? t(`lend.done_${action}`) : intent.outcome === "checking" ? t("margin.checking") : t("lend.failed")}
          </Text>
          <View className="flex-row gap-2">
            {intent.state === "completed" ? (
              <Button className="flex-1" onPress={onDone ?? (() => router.push("/borrow"))}>
                <Text>{t("lend.viewAccount")}</Text>
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
            tone="primary"
            rtl={rtl}
            disabled={!ready || controller.busy}
            resetKey={resetKey}
            pendingLabel={t(`lend.pending_${action}`)}
            done={undefined}
            onHaptic={slideHaptic}
            onConfirm={() => void controller.approve(prompt(draft))}
          >
            {t(`lend.slide_${action}`)}
          </SlideToConfirm>
          <Button variant="ghost" disabled={controller.busy} onPress={() => void controller.cancel()}>
            <Text className="text-muted-foreground">{t("lend.cancel")}</Text>
          </Button>
        </View>
      ) : (
        <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{t(`lend.pending_${action}`)}</Text>
      )}
    </View>
  );
}
