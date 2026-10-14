// The move ticket (plan F; Senryo grammar): what arrives where is the hero (the chosen bridge's amount, in the asset
// that arrives, with the two chains' real marks), then every bridge asked for this version on the one RouteList —
// Circle CCTP, Across, Relay, LI.FI, deBridge, Socket, Gas.zip, each with its logo, what it delivers, how far below
// the best and how long, its trust model behind the chevron; a tap picks it (a new version priced by that bridge). The
// quote's age drains and refreshes on its own. Slide to confirm (accent) → the wallet's yes → the kit's plate with the
// move's four steps under it (Signed → Sent from Arc → Filling on Base → Delivered), then it morphs into the receipt.
// A refund or failure says what happened to the money and offers "Try again" when nothing moved. Used by the Move
// screen (and its desktop columns, `hideRoutes`) and the chat's move card.
import { useRouter } from "expo-router";
import * as React from "react";
import { formatUnits } from "viem";
import { StyleSheet, Text, View } from "react-native";
import Animated, { FadeOut, useReducedMotion } from "react-native-reanimated";

import { SWAP_QUOTE_TTL_S } from "@kawase/config";
import { chainKey } from "@kawase/identity";
import { Mark } from "@kawase/ui-native/components/mark";
import { TokenMark } from "@kawase/ui-native/components/token-mark";

import { type BlockerFix, Button, DisclosureRow, Icon, KeyValue, SIZE, SPACE, TIMING, TYPE, useTheme } from "@/components/kit";
import { ChevronRight } from "@/components/kit/icons";
import type { Blocker } from "@/components/tx";
import { useFund } from "@/fund/fund-provider";
import { useT } from "@/i18n";
import { useLocale } from "@/i18n/locale-provider";
import { moveRace, venueName } from "@/routes/from-draft";
import { useOutcomeFeedback } from "@/routes/intent-tx";
import { QuoteAge } from "@/routes/quote-age";
import { RouteList } from "@/routes/route-list";
import { TicketCta } from "@/routes/ticket-cta";
import { useMoney } from "@/send/copy";
import { useSignIn } from "@/sign-in/sign-in-provider";

import { useAssetMoney, useMovePolicyText } from "./move-copy";
import { MoveReceipt } from "./move-receipt";
import { MoveSteps } from "./move-steps";
import { moveTx } from "./move-tx";
import type { CrossChainController } from "./use-crosschain";

const ADDRESS_HEAD = 6;
const ADDRESS_TAIL = 4;
const NATIVE_DECIMALS = 18;
const OPEN = new Set(["submitted", "working", "input_required", "auth_required", "ready_for_approval"]);
const STABLES = new Set(["USDC", "EURC", "USDT"]);
const USDC_DECIMALS = 6;
const CENTS = 2;
const TOKEN_PLACES = 6;

const short = (address: string) => `${address.slice(0, ADDRESS_HEAD)}…${address.slice(-ADDRESS_TAIL)}`;

function fixOf(code: string | undefined): BlockerFix | null {
  switch (code) {
    case "SIGN_IN_REQUIRED":
      return { kind: "sign-in" };
    case "INSUFFICIENT_BALANCE":
    case "INSUFFICIENT_GAS":
      return { kind: "add-money" };
    case "WALLET_NOT_READY":
    case "WALLET_NOT_SET_UP":
      return { kind: "setup-wallet" };
    case "QUOTE_UNAVAILABLE":
      return { kind: "retry" };
    default:
      return null;
  }
}

export function MoveTicket({
  controller,
  onRetry,
  hideRoutes = false,
  onMark,
  onDone,
}: {
  controller: CrossChainController;
  /** Start the same move again (after a refund, or a failure where nothing moved). */
  onRetry?: () => void;
  /** The routes are drawn elsewhere (the desktop's right column). */
  hideRoutes?: boolean;
  /** Journal the intent before the yes (the screen's intent journal). */
  onMark?: (id: string, what: string) => void;
  onDone?: () => void;
}) {
  const { t } = useT();
  const { color } = useTheme();
  const router = useRouter();
  const reduced = useReducedMotion();
  const fund = useFund();
  const signIn = useSignIn();
  const money = useMoney();
  const assetMoney = useAssetMoney();
  const policyText = useMovePolicyText();
  const { locale } = useLocale();
  // The hero's number alone (the symbol sits beside it, smaller): dollars and euros in cents, other tokens to 6 places.
  const heroFigure = (base: string | null | undefined, asset: { symbol: string; decimals: number } | undefined) => {
    if (!base) return "—";
    const decimals = asset?.decimals ?? USDC_DECIMALS;
    const stable = STABLES.has((asset?.symbol ?? "USDC").toUpperCase());
    return new Intl.NumberFormat(locale, { minimumFractionDigits: stable ? CENTS : 0, maximumFractionDigits: stable ? CENTS : TOKEN_PLACES }).format(Number(formatUnits(BigInt(base), decimals)));
  };
  const [signingSince, setSigningSince] = React.useState<number | null>(null);
  const intent = controller.intent;
  const race = React.useMemo(() => (intent?.draft ? moveRace(intent.draft) : null), [intent?.draft]);
  const blocking = intent?.blocking ?? null;
  const tx = moveTx(intent, signingSince, blocking ? policyText(blocking) : null);
  useOutcomeFeedback(intent?.id, tx, "send");
  if (!intent) return null;
  const draft = intent.draft;
  const open = OPEN.has(intent.state);
  const inFlight = tx.kind === "signing" || tx.kind === "submitted" || tx.kind === "unknown";
  const done = tx.kind === "confirmed";
  const prompt = draft ? t("move.signPrompt", { amount: assetMoney(draft.amount, draft.input), chain: draft.destination.name }) : t("move.title");

  const confirm = async () => {
    onMark?.(intent.id, prompt);
    setSigningSince(Date.now());
    try {
      await controller.approve(prompt);
    } finally {
      setSigningSince(null);
    }
  };
  const onFix = (fix: BlockerFix) => {
    if (fix.kind === "sign-in") signIn.open();
    else if (fix.kind === "add-money") fund.open();
    else if (fix.kind === "setup-wallet") router.push("/wallet");
    else void controller.revise({});
  };
  const blocker: Blocker | undefined = blocking ? { label: policyText(blocking), fix: fixOf(blocking.code) } : undefined;
  const chosen = draft?.routes.find((route) => route.provider === draft.chosen);
  const arriving = chosen?.received ?? draft?.minReceived ?? null;
  const who = draft ? (draft.recipient.own ? t("move.you") : (draft.recipient.label ?? short(draft.recipient.address))) : "";
  const quotedMs = draft ? Date.parse(draft.quotedAt) : 0;

  return (
    <View style={styles.wrap}>
      {draft && !done ? (
        <Animated.View exiting={reduced ? undefined : FadeOut.duration(TIMING.selection)} style={styles.wrap}>
          <View style={styles.hero}>
            <View style={styles.chains}>
              <Mark entity={chainKey(draft.source.chainId)} size={SIZE.markInline} />
              <Icon icon={ChevronRight} size={SIZE.iconSm} tint={color.text3} />
              <Mark entity={chainKey(draft.destination.chainId)} size={SIZE.markInline} />
              <Text style={[TYPE.rowDetail, { color: color.text2 }]}>{t("move.arrivesOn", { chain: draft.destination.name })}</Text>
            </View>
            <View style={styles.heroRow} accessible accessibilityLabel={assetMoney(arriving, draft.output)}>
              {draft.output ? <TokenMark token={draft.output} size={SIZE.markToken} /> : null}
              <Text numberOfLines={1} style={[TYPE.displayBalance, styles.figure, { color: color.ink }]}>
                {heroFigure(arriving, draft.output)}
              </Text>
              <Text style={[TYPE.sectionTitle, { color: color.text2 }]}>{draft.output?.symbol ?? "USDC"}</Text>
            </View>
            <Text style={[TYPE.rowDetail, { color: color.text2 }]}>
              {t("move.forWhom", { who, amount: assetMoney(draft.amount, draft.input) })}
            </Text>
          </View>

          {hideRoutes || !race ? (
            <View style={styles.via}>
              <Mark entity={`venue:${draft.chosen}`} size={SIZE.markInline} />
              <Text style={[TYPE.rowDetail, { color: color.text2 }]}>{t("move.byBridge", { bridge: venueName(draft.chosen) })}</Text>
            </View>
          ) : (
            <RouteList race={race} selected={draft.chosen} readOnly={!open || controller.busy} onSelect={(route) => void controller.revise({ route: route as typeof draft.chosen })} onRetry={() => void controller.revise({})} />
          )}

          {open ? (
            <View style={styles.age}>
              <QuoteAge quotedAt={draft.quotedAt} ttlSeconds={SWAP_QUOTE_TTL_S} refreshing={controller.busy && signingSince === null} paused={signingSince !== null || Number.isNaN(quotedMs)} onExpire={() => void controller.revise({})} />
            </View>
          ) : null}

          <DisclosureRow title={t("move.details")} value={assetMoney(draft.minReceived, draft.output)}>
            <KeyValue label={t("move.atLeast")} value={assetMoney(draft.minReceived, draft.output)} />
            <KeyValue
              label={t("move.networkFee")}
              value={draft.networkFee !== "0" ? money("USDC", draft.networkFee) : draft.direction === "in" && draft.chosen === "lifi" ? t("move.gasThere", { chain: draft.source.name }) : t("move.noGas")}
            />
            {chosen?.nativeFee ? <KeyValue label={t("move.flatFee")} value={assetMoney(chosen.nativeFee, { symbol: "USDC", decimals: NATIVE_DECIMALS })} /> : null}
            {draft.output && draft.input && draft.output.symbol !== draft.input.symbol ? <KeyValue label={t("move.arrivesAsLabel")} value={draft.output.symbol} /> : null}
            {!draft.recipient.own ? <KeyValue label={t("move.recipient")} value={short(draft.recipient.address)} /> : null}
          </DisclosureRow>
        </Animated.View>
      ) : null}

      {intent.state === "canceled" || intent.state === "expired" ? (
        <Text style={[TYPE.body, { color: color.text2 }]}>{intent.state === "expired" ? t("move.expired") : t("move.canceled")}</Text>
      ) : (
        <TicketCta
          tx={tx}
          action={prompt}
          slideLabel={draft?.direction === "in" ? t("move.slideBring") : t("move.slideSend")}
          resetKey={`${intent.id}:${intent.version}`}
          onConfirm={() => void confirm()}
          blocker={blocker}
          onFix={onFix}
          busy={controller.busy && !inFlight}
          steps={<MoveSteps intent={intent} signing={signingSince !== null} />}
          explorerUrl={intent.fillTx?.explorerUrl ?? intent.tx?.explorerUrl ?? null}
          {...(onRetry ? { onRetry } : {})}
          receipt={<MoveReceipt intent={intent} {...(onDone ? { actions: <Button label={t("send.done")} onPress={onDone} /> } : {})} />}
        />
      )}
      {open && !inFlight ? <Button label={t("move.cancel")} variant="ghost" size="sm" disabled={controller.busy} onPress={() => void controller.cancel()} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: SPACE.md },
  hero: { gap: SPACE.xs },
  chains: { flexDirection: "row", alignItems: "center", gap: SPACE.xs },
  heroRow: { flexDirection: "row", alignItems: "center", gap: SPACE.sm },
  figure: { flexShrink: 1 },
  via: { flexDirection: "row", alignItems: "center", gap: SPACE.sm },
  age: { flexDirection: "row", justifyContent: "flex-end" },
});
