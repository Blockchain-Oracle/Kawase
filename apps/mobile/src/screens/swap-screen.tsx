// The swap ticket for any pair, on the Senryo kit (plan F; 21st ssychui "Swap Ticket" #27122 as the visual spec).
// Amount: what you pay and what you get as two token plates with the flip between them, then the kit's AmountPad (the
// figure large, 1/4 1/2 3/4 All of the balance, the keypad); the CTA names its blocker and its fix ("Enter an amount",
// "Add money"). Review: the hero is what comes back, then every venue asked on the one RouteList (real logos, what each
// delivers, how far below the best, the fee behind the chevron, tap to pick — SwapRequest.venue, honoured by the api);
// the quote's age drains and a fresh price is fetched on its own; the price impact is a chip (amber, or the error tone
// when the rule refuses it). Slide to confirm (accent rail) → the wallet's yes → the kit's lifecycle: Signing · Sent ·
// Confirmed on the plate, then it morphs into the receipt (what actually arrived); a failure says whether money moved.
// The intent is journalled before the yes, so a kill mid-flight reopens on the same swap and never sends it again.
// Desktop (a window ≥ 1024): two columns, the ticket on the left and the live race on the right — the venues light up
// as the person types, and a pick there is the venue the review starts from.
// Entry: Home's Swap, the fan, a token page's Buy/Sell (`/swap?buy=0x…` / `?sell=0x…`), chat cards and links
// (`/swap?from=USDC&amount=10`).
import { useRouter } from "expo-router";
import * as React from "react";
import { ArrowLeftRight } from "lucide-react-native";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import Animated, { FadeIn, FadeOut, useReducedMotion } from "react-native-reanimated";
import { formatUnits, parseUnits } from "viem";

import type { PolicyResultView, SwapRequest } from "@kawase/api-client";
import { arcIdentity, CHAIN_IDS, getEntity } from "@kawase/identity";
import { useWide } from "@kawase/ui-native/lib/wide";

import { AmountPad, type BlockerFix, Button, Icon, Panel, SectionLabel, SIZE, SPACE, TIMING, useTheme } from "@/components/kit";
import { type Blocker, BlockedCta } from "@/components/tx";
import { MainnetConsentSheet } from "@/components/network-pill";
import { fire } from "@/feedback/fire";
import { useFund } from "@/fund/fund-provider";
import { useLocale } from "@/i18n/locale-provider";
import { useT } from "@/i18n";
import { AssetPickerSheet, type AssetChoice } from "@/portfolio/asset-picker-sheet";
import { tokenAmount } from "@/portfolio/format";
import { usePortfolio } from "@/portfolio/use-portfolio";
import { swapRace } from "@/routes/from-draft";
import { intentEnded, intentTx, useOutcomeFeedback, useTicketJournal } from "@/routes/intent-tx";
import { LiveRace } from "@/routes/live-race";
import { RouteList } from "@/routes/route-list";
import { TicketCta } from "@/routes/ticket-cta";
import { TicketHeader } from "@/routes/ticket-header";
import { BrakeNote } from "@/safety/brake-note";
import { api } from "@/session/api";
import { useSession } from "@/session/session-provider";
import { useSignIn } from "@/sign-in/sign-in-provider";
import { useSwapPolicyText, useSwapPrompt } from "@/swap/copy";
import { SwapReceipt } from "@/swap/swap-receipt";
import { SwapReview } from "@/swap/swap-review";
import { type TicketToken, TokenButton } from "@/swap/token-button";
import { TradeSwitch } from "@/swap/trade-switch";
import { isSwapOpen, useSwap } from "@/swap/use-swap";
import { useNetworkSwitch } from "@/wallet/use-network-switch";

const ZERO = 0n;
/** The pad types at most this many decimals (a token with 18 still shows a sane figure). */
const MAX_FRACTION = 6;
/** USDC and EURC, the sides a link can prefill. */
const STABLE_DECIMALS = 6;
const FLIP = SIZE.touch;
const HALF = 2;
/** The desktop's ticket column; the live race takes the rest. */
const TICKET_COLUMN = 440;
/** Below this the two token pills can't hold "You pay" and a symbol side by side. */
const TICKET_MIN = 360;
/** The race column's least width, and the page width that holds both columns side by side. */
const RACE_MIN = 340;
const BOTH_SIDES = 2;
const TWO_COLUMNS_MIN = TICKET_MIN + RACE_MIN + SPACE.lg + SPACE.inset * BOTH_SIDES;

type Step = "amount" | "review";

export type SwapPrefill = { from?: string | undefined; amount?: string | undefined; buy?: string | undefined; sell?: string | undefined };

/** Arc's USDC or EURC on this network, from the identity registry (the default side of a buy or a sale). */
function stable(network: "mainnet" | "testnet", symbol: "USDC" | "EURC"): TicketToken {
  const ids = arcIdentity(network);
  const entity = getEntity(symbol === "USDC" ? ids.usdc : ids.eurc)!;
  return { chainId: network === "mainnet" ? CHAIN_IDS.arc : CHAIN_IDS.arcTestnet, address: entity.address!, symbol, name: entity.name, decimals: entity.decimals!, logoUrl: null };
}

const toUnits = (value: string, decimals: number): bigint => {
  try {
    return value ? parseUnits(value, decimals) : ZERO;
  } catch {
    return ZERO;
  }
};

/** The api's decimal amount for base units ("12.5"). */
const decimalOf = (units: bigint, decimals: number) => formatUnits(units, decimals);

/** The one fix a swap's blocking reason offers (the kit's fix vocabulary), if any. */
function fixOf(code: string): BlockerFix | null {
  switch (code) {
    case "INSUFFICIENT_BALANCE":
    case "INSUFFICIENT_GAS":
      return { kind: "add-money" };
    case "WALLET_NOT_READY":
    case "WALLET_NOT_SET_UP":
      return { kind: "setup-wallet" };
    case "SIGN_IN_REQUIRED":
      return { kind: "sign-in" };
    case "QUOTE_UNAVAILABLE":
      return { kind: "retry" };
    default:
      return null;
  }
}

/** A blocking reason the person fixes by changing the amount or the pair (back to the ticket). */
const EDIT_CODES = new Set(["AMOUNT_MISSING", "AMOUNT_INVALID", "PRICE_IMPACT_HIGH", "TOKEN_RULE_TRADE", "TOKEN_RULE_DAY"]);

/**
 * `embedded`: the ticket inside another page (a token page on a desktop window): no header, one column, and "Done" or
 * "Cancel" start a fresh ticket instead of leaving the page (`onFinished` lets the page refresh what the trade changed).
 */
export function SwapScreen({ prefill, embedded = false, onFinished }: { prefill: SwapPrefill; embedded?: boolean; onFinished?: () => void }) {
  const { t } = useT();
  const { locale } = useLocale();
  const { color } = useTheme();
  const router = useRouter();
  const reduced = useReducedMotion();
  const wideWindow = useWide() && !embedded;
  // Two columns only when the page holds both the ticket and the race at their least; a narrower desktop window keeps
  // the one ticket (and its review lists the venues), so the token pills never squeeze.
  const [pageWidth, setPageWidth] = React.useState(0);
  const wide = wideWindow && pageWidth >= TWO_COLUMNS_MIN;
  const { status, user } = useSession();
  const signIn = useSignIn();
  const fund = useFund();
  const networkSwitch = useNetworkSwitch();
  const { portfolio } = usePortfolio();
  const controller = useSwap();
  const policyText = useSwapPolicyText();
  const prompt = useSwapPrompt();
  const network = user?.activeNetwork ?? "testnet";
  const testnet = network === "testnet";
  const journal = useTicketJournal("swap", network, status === "account" ? user?.id : undefined);

  const [tokenIn, setTokenIn] = React.useState<TicketToken>(() => (prefill.from === "EURC" ? stable(network, "EURC") : stable(network, "USDC")));
  const [tokenOut, setTokenOut] = React.useState<TicketToken>(() => (prefill.from === "EURC" ? stable(network, "USDC") : stable(network, "EURC")));
  const [picker, setPicker] = React.useState<"in" | "out">();
  const [step, setStep] = React.useState<Step>("amount");
  const [amount, setAmount] = React.useState<bigint>(() => (prefill.amount ? toUnits(prefill.amount, STABLE_DECIMALS) : ZERO));
  const [creating, setCreating] = React.useState(false);
  const [signingSince, setSigningSince] = React.useState<number | null>(null);
  /** A venue picked in the desktop's live race before review: the review starts from it. */
  const [preferred, setPreferred] = React.useState<string | null>(null);

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
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [prefill.buy, prefill.sell, network]);

  // A swap left in flight (the app was closed after the yes): read it back, never send it again.
  const intent = controller.intent;
  const setIntent = controller.set;
  React.useEffect(() => {
    if (!journal.resumable || intent) return;
    let live = true;
    api.swaps
      .get(journal.resumable)
      .then(({ intent: found }) => {
        if (!live) return;
        setIntent(found);
        setStep("review");
      })
      .catch(() => journal.forget(journal.resumable!));
    return () => {
      live = false;
    };
  }, [journal, intent, setIntent]);

  const blocking = intent?.blocking ?? null;
  const tx = intentTx(intent, signingSince, blocking ? policyText(blocking, intent!.network) : null);
  useOutcomeFeedback(intent?.id, tx);
  React.useEffect(() => {
    if (intent && intentEnded(intent)) journal.forget(intent.id);
  }, [intent, journal]);

  const holding = portfolio?.assets.find((entry) => entry.token.address.toLowerCase() === tokenIn.address.toLowerCase());
  const balanceIn = holding ? BigInt(holding.balance) : portfolio ? ZERO : undefined;
  const title = prefill.buy ? t("ticket.buyTitle", { symbol: tokenOut.symbol }) : prefill.sell ? t("ticket.sellTitle", { symbol: tokenIn.symbol }) : t("ticket.title");
  const inFlight = tx.kind === "signing" || tx.kind === "submitted" || tx.kind === "unknown";
  const finished = tx.kind === "confirmed";

  const fresh = () => {
    controller.reset();
    setAmount(ZERO);
    setStep("amount");
    setPreferred(null);
  };
  const leave = () => {
    if (embedded) {
      fresh();
      onFinished?.();
      return;
    }
    if (router.canGoBack()) router.back();
    else router.replace("/");
  };
  const back = () => {
    if (step === "amount" || finished || inFlight) leave();
    else setStep("amount");
  };

  const review = async (venue: string | null = preferred) => {
    if (status !== "account") {
      signIn.open();
      return;
    }
    const request: SwapRequest = { tokenIn: tokenIn.address, tokenOut: tokenOut.address, amount: decimalOf(amount, tokenIn.decimals), venue };
    setCreating(true);
    try {
      if (intent && isSwapOpen(intent)) {
        const next = await controller.revise(request);
        if (next) setStep("review");
      } else {
        const { intent: created } = await api.swaps.create(request);
        controller.set(created);
        setStep("review");
      }
    } catch {
      fire("fail", { sound: "error" });
    } finally {
      setCreating(false);
    }
  };

  const confirm = async () => {
    if (!intent?.draft) return;
    const what = prompt(intent.draft, intent.network);
    journal.mark(intent.id, what);
    setSigningSince(Date.now());
    try {
      await controller.approve(what);
    } finally {
      setSigningSince(null);
    }
  };

  const onFix = (fix: BlockerFix) => {
    switch (fix.kind) {
      case "add-money":
        fund.open();
        return;
      case "setup-wallet":
        router.push("/wallet");
        return;
      case "sign-in":
        signIn.open();
        return;
      case "switch-network":
        void networkSwitch.switchNetwork(testnet ? "mainnet" : "testnet");
        return;
      default:
        void controller.revise({});
    }
  };

  const choose = (side: "in" | "out") => (choice: AssetChoice) => {
    const token = choice.token;
    if (side === "in") {
      if (token.address.toLowerCase() === tokenOut.address.toLowerCase()) setTokenOut(tokenIn);
      setTokenIn(token);
      setAmount(ZERO);
    } else {
      if (token.address.toLowerCase() === tokenIn.address.toLowerCase()) setTokenIn(tokenOut);
      setTokenOut(token);
    }
    setPreferred(null);
    fire("tick");
  };
  const flip = () => {
    setTokenIn(tokenOut);
    setTokenOut(tokenIn);
    setAmount(ZERO);
    setPreferred(null);
    fire("tick");
  };

  // ── The amount step ────────────────────────────────────────────────────────────────────────────────────────────
  const short = amount > ZERO && balanceIn !== undefined && amount > balanceIn;
  const amountBlocker: Blocker | null =
    amount === ZERO
      ? { label: t("ticket.needAmount") }
      : status !== "account"
        ? { label: t("ticket.needAmount"), fix: { kind: "sign-in" } }
        : short
          ? { label: t("ticket.notEnough", { symbol: tokenIn.symbol }), fix: { kind: "add-money" } }
          : null;
  const raceRequest = amount > ZERO && !short ? ({ kind: "swap", tokenIn: tokenIn.address, tokenOut: tokenOut.address, amount: decimalOf(amount, tokenIn.decimals) } as const) : null;

  const pair = (
    <View style={styles.pair}>
      <TokenButton
        token={tokenIn}
        label={t("ticket.pay")}
        caption={balanceIn !== undefined ? t("ticket.balance", { amount: tokenAmount(balanceIn.toString(), tokenIn.decimals, tokenIn.symbol, locale) }) : undefined}
        onPress={() => setPicker("in")}
      />
      <Pressable accessibilityRole="button" accessibilityLabel={t("swap.flip")} onPress={flip} style={[styles.flip, { backgroundColor: color.raised2 }]}>
        <Icon icon={ArrowLeftRight} size={SIZE.iconSm} />
      </Pressable>
      <TokenButton token={tokenOut} label={t("ticket.get")} onPress={() => setPicker("out")} />
    </View>
  );
  const amountStep = (
    <View style={styles.grow}>
      <ScrollView style={styles.grow} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {pair}
        <AmountPad
          value={amount}
          onChange={(next) => {
            setAmount(next);
            setPreferred(null);
          }}
          decimals={tokenIn.decimals}
          fraction={Math.min(tokenIn.decimals, MAX_FRACTION)}
          prefix=""
          suffix={tokenIn.symbol}
          {...(balanceIn !== undefined && balanceIn > ZERO ? { balance: balanceIn } : {})}
          problem={short ? t("ticket.notEnough", { symbol: tokenIn.symbol }) : null}
          label={t("ticket.pay")}
        />
      </ScrollView>
      <View style={styles.footer}>
        {amountBlocker ? (
          <BlockedCta blocker={amountBlocker} onFix={onFix} />
        ) : (
          <Button label={creating || controller.busy ? t("ticket.quoting") : t("swap.review")} loading={creating || controller.busy} onPress={() => void review()} />
        )}
      </View>
    </View>
  );

  // ── The review step ────────────────────────────────────────────────────────────────────────────────────────────
  const open = intent ? isSwapOpen(intent) : false;
  const code = blocking?.code ?? null;
  const blocker: Blocker | undefined = blocking ? { label: policyText(blocking, intent!.network), fix: code ? fixOf(code) : null } : undefined;
  const slideLabel = prefill.buy ? t("ticket.slideBuy") : prefill.sell ? t("ticket.slideSell") : t("ticket.slide");
  const reviewStep = intent ? (
    <View style={styles.grow}>
      <ScrollView style={styles.grow} contentContainerStyle={styles.scroll}>
        {finished ? null : (
          <Animated.View exiting={reduced ? undefined : FadeOut.duration(TIMING.selection)} style={styles.stack}>
            <SwapReview
              intent={intent}
              onRefresh={() => void controller.revise({})}
              refreshing={controller.busy && !inFlight}
              paused={inFlight}
              hideRoutes={wide}
              {...(open ? { onPick: (venue: string) => void controller.revise({ venue }) } : {})}
            />
            {open && !blocking ? <BrakeNote results={intent.results} text={(entry: PolicyResultView) => policyText(entry, intent.network)} /> : null}
          </Animated.View>
        )}
      </ScrollView>
      <View style={styles.footer}>
        <TicketCta
          tx={tx}
          action={intent.draft ? prompt(intent.draft, intent.network) : t("swap.title")}
          slideLabel={slideLabel}
          resetKey={`${intent.id}:${intent.version}`}
          onConfirm={() => void confirm()}
          blocker={blocker}
          onFix={onFix}
          busy={controller.busy && !inFlight}
          explorerUrl={intent.tx?.explorerUrl ?? null}
          onRetry={() => {
            controller.reset();
            void review(intent.draft?.venue ?? null);
          }}
          receipt={
            <SwapReceipt
              intent={intent}
              actions={
                <>
                  <Button label={t("send.done")} onPress={leave} />
                  {!embedded ? <Button label={t("ticket.viewToken", { symbol: tokenOut.symbol })} variant="ghost" onPress={() => router.replace(`/token/${tokenOut.chainId}/${tokenOut.address}`)} /> : null}
                </>
              }
            />
          }
        />
        {open ? (
          <View style={styles.row}>
            {code && EDIT_CODES.has(code) ? <Button label={t("swap.changeAmount")} variant="ghost" size="sm" onPress={() => setStep("amount")} /> : null}
            <Button
              label={t("swap.cancel")}
              variant="ghost"
              size="sm"
              disabled={controller.busy}
              onPress={() => {
                void controller.cancel();
                leave();
              }}
            />
          </View>
        ) : null}
      </View>
    </View>
  ) : null;

  const visible: Step = intent && step === "review" ? "review" : "amount";
  const ticket = (
    <Animated.View key={visible} entering={reduced ? undefined : FadeIn.duration(TIMING.sheetEnter)} style={styles.grow}>
      {visible === "review" ? reviewStep : amountStep}
    </Animated.View>
  );
  const draftRace = intent && visible === "review" ? swapRace(intent) : null;

  return (
    <View style={[styles.page, { backgroundColor: embedded ? color.transparent : color.ground }]} onLayout={(event) => setPageWidth(event.nativeEvent.layout.width)}>
      <TicketHeader title={title} onBack={back} testnet={testnet} embedded={embedded} />
      {!finished && !inFlight && visible === "amount" && !prefill.buy && !prefill.sell && !embedded ? (
        <View style={styles.switch}>
          <TradeSwitch current="swap" />
        </View>
      ) : null}
      {wide && (draftRace || raceRequest) ? (
        <View style={styles.columns}>
          <View style={styles.ticketColumn}>{ticket}</View>
          <Animated.View entering={reduced ? undefined : FadeIn.duration(TIMING.sheetEnter)} style={styles.grow}>
            <Panel style={styles.raceColumn}>
            <SectionLabel>{t("routes.title")}</SectionLabel>
              <ScrollView contentContainerStyle={styles.raceScroll}>
                {draftRace ? (
                  <RouteList race={draftRace} selected={intent?.draft?.venue ?? draftRace.best} readOnly={!open} {...(open ? { onSelect: (venue: string) => void controller.revise({ venue }) } : {})} />
                ) : (
                  <LiveRace request={raceRequest} selected={preferred} onSelect={setPreferred} idleTitle={t("swap.raceIdleTitle")} idleBody={t("swap.raceIdleBody")} />
                )}
              </ScrollView>
            </Panel>
          </Animated.View>
        </View>
      ) : wideWindow ? (
        // Nothing to race yet: the ticket alone, centred; the venues come in beside it once there is an amount.
        <View style={styles.solo}>{ticket}</View>
      ) : (
        ticket
      )}
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
        // Testnet trades dollars and euros only: a token mainnet's markets list is one switch away (R2's nearest path).
        onUnavailable={(_token, reason) => {
          if (reason !== t("tokenPage.n_mainnet_only")) return;
          setPicker(undefined);
          void networkSwitch.switchNetwork("mainnet");
        }}
      />
      <MainnetConsentSheet open={networkSwitch.consentNeeded} busy={networkSwitch.busy} onAccept={() => void networkSwitch.acceptMainnet()} onClose={networkSwitch.dismissConsent} />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  grow: { flex: 1 },
  scroll: { gap: SPACE.lg, paddingHorizontal: SPACE.inset, paddingTop: SPACE.sm, paddingBottom: SPACE.lg },
  stack: { gap: SPACE.md },
  switch: { paddingHorizontal: SPACE.inset, paddingBottom: SPACE.sm },
  pair: { flexDirection: "row", alignItems: "center", gap: SPACE.xs },
  flip: { width: FLIP, height: FLIP, borderRadius: FLIP / HALF, alignItems: "center", justifyContent: "center" },
  footer: { gap: SPACE.xs, paddingHorizontal: SPACE.inset, paddingBottom: SPACE.xl },
  row: { flexDirection: "row", justifyContent: "center", gap: SPACE.sm },
  columns: { flex: 1, flexDirection: "row", gap: SPACE.lg, paddingHorizontal: SPACE.inset, paddingBottom: SPACE.lg },
  ticketColumn: { width: TICKET_COLUMN, maxWidth: "50%", minWidth: TICKET_MIN },
  solo: { flex: 1, width: "100%", maxWidth: TICKET_COLUMN, alignSelf: "center" },
  raceColumn: { flex: 1, padding: SPACE.lg, gap: SPACE.md },
  raceScroll: { gap: SPACE.md, paddingBottom: SPACE.lg },
});
