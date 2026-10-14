// The Buy sheet on the Senryo kit (D42; docs pack buy-market; 21st: bankkroll/number-pad #3711 via AmountPad,
// ssychui/swap-ticket #27122's receive line for "You get", cnippet-dev/payment-method-card-checkbox #24917 and
// felipemenezes098/payment-3 #25102 for the method rows, the tx kit for the steps and the receipt). One hero figure per
// step, detail behind the rows, the CTA names its blocker. The provider's card/ID step is the only part not ours, and it
// runs inside our frame (`/buy/:orderId`).
import { CreditCard, Landmark } from "lucide-react-native";
import * as React from "react";
import { Linking, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";

import type { OnrampOrderView } from "@kawase/api-client";
import { arcIdentity } from "@kawase/identity";
import { Mark } from "@kawase/ui-native/components/mark";

import { AmountPad, Button, ErrorState, KeyValue, LoadingState, Panel, Rule, Segmented, Skeleton, Switch, WaitingText } from "@/components/kit";
import { ChevronLeft, Icon, X } from "@/components/kit/icons";
import { RollingFigure } from "@/components/kit/RollingFigure";
import { RADIUS, SIZE, SPACE, TYPE, useTheme } from "@/components/kit/theme";
import { Sheet } from "@/components/sheet/Sheet";
import { SheetHeading } from "@/components/sheet/SheetRoute";
import { SheetRow } from "@/components/sheet/SheetRow";
import { BlockedCta, TxMorph } from "@/components/tx";
import { fire } from "@/feedback/fire";
import { useT } from "@/i18n";
import { useLocale } from "@/i18n/locale-provider";
import { useMoney } from "@/send/copy";
import { api } from "@/session/api";
import { useSession } from "@/session/session-provider";

import { BuyFrame } from "./buy-frame";
import type { BuyFlow, VerifiedContact } from "./buy-provider";
import { BuySteps } from "./buy-steps";
import { engineMark, methodMark, type PayOption } from "./methods";
import { KNOWN_REASONS, RETRYABLE_REASONS } from "./order-events";

// eslint-disable-next-line @typescript-eslint/no-magic-numbers -- the preset dollar amounts
const PRESETS = [25n, 50n, 100n, 250n] as const;
const ZERO = 0n;
const PHONE_PREFIX = "+1";
const CENTS = 100n;
const FIAT_DECIMALS = 2;
const MAX_CENTS = 1_000_000n;
const FRAME_SHARE = 0.74;
const FRAME_MIN = 560;
const CODE_LENGTH = 6;
const US_PHONE = /^\+1\d{10}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const COINBASE_TERMS = "https://www.coinbase.com/legal/guest-checkout/us";
const SANDBOX_REASONS = new Set(["SANDBOX_NO_FUNDS"]);

/** "$1,234.50" in the person's language for a cents value. */
function useFiat(currency: "USD" | "EUR") {
  const { locale } = useLocale();
  return React.useCallback(
    (cents: bigint, whole = false) =>
      new Intl.NumberFormat(locale, { style: "currency", currency, minimumFractionDigits: whole ? 0 : FIAT_DECIMALS, maximumFractionDigits: FIAT_DECIMALS }).format(Number(cents) / Number(CENTS)),
    [currency, locale],
  );
}

export function BuySheet({ flow }: { flow: BuyFlow }) {
  const { t } = useT();
  const busy = flow.starting !== null;
  return (
    <Sheet onClose={flow.close} closeLabel={t("buy.closeNamed")} dismissible={!busy} maxHeight={0.94}>
      {flow.step === "amount" ? <AmountStep flow={flow} /> : null}
      {flow.step === "method" ? <MethodStep flow={flow} /> : null}
      {flow.step === "contact" ? <ContactStep flow={flow} /> : null}
      {flow.step === "pay" ? <PayStep flow={flow} /> : null}
      {flow.step === "arriving" ? <ArrivingStep flow={flow} /> : null}
    </Sheet>
  );
}

/** A small back affordance at the sheet's leading edge (the sheet's own handle and scrim still close it). */
function BackRow({ label, onPress, title }: { label: string; onPress: () => void; title: string }) {
  const { color } = useTheme();
  return (
    <View style={styles.backRow}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        hitSlop={SPACE.sm}
        onPress={() => {
          fire("tick");
          onPress();
        }}
        style={({ pressed }) => [styles.backButton, { backgroundColor: pressed ? color.rowPressed : color.raised2 }]}
      >
        <Icon icon={ChevronLeft} size={SIZE.iconSm} tint={color.ink} />
      </Pressable>
      <Text accessibilityRole="header" numberOfLines={1} style={[TYPE.sheetHeading, styles.grow, { color: color.ink }]}>
        {title}
      </Text>
      <View style={styles.backButton} />
    </View>
  );
}

// ── 1. Amount ────────────────────────────────────────────────────────────────────────────────────────────────────

function AmountStep({ flow }: { flow: BuyFlow }) {
  const { t } = useT();
  const fiat = useFiat(flow.currency);
  const toAgent = flow.prefill.destination === "agent_wallet";
  const valid = flow.cents > ZERO && flow.cents <= MAX_CENTS;
  if (flow.availability.state === "failed") {
    return (
      <>
        <SheetHeading title={t("buy.pageTitle", { asset: flow.asset })} />
        <ErrorState diagnosis={{ kind: "server", retryable: true }} stillWorks={t("buy.stillWorks")} retry={() => flow.goTo("amount")} />
      </>
    );
  }
  if (flow.availability.state === "ready" && !flow.availability.value.available) {
    return (
      <>
        <SheetHeading title={t("buy.pageTitle", { asset: flow.asset })} />
        <ErrorState diagnosis={{ kind: "unknown", retryable: false, technical: flow.availability.value.reason ?? "" }} stillWorks={t("buy.notHere")} />
      </>
    );
  }
  return (
    <>
      <SheetHeading title={toAgent ? t("buy.agentTitle") : t("buy.pageTitle", { asset: flow.asset })} />
      {toAgent || flow.prefill.then ? null : (
        <Segmented
          options={[
            { value: "USDC", label: "USDC" },
            { value: "EURC", label: "EURC" },
          ]}
          value={flow.asset}
          onChange={(next) => flow.setAsset(next)}
          label={t("buy.get")}
        />
      )}
      <AmountPad
        value={flow.cents}
        onChange={flow.setCents}
        decimals={FIAT_DECIMALS}
        prefix={flow.currency === "EUR" ? "€" : "$"}
        chips={PRESETS.map((preset) => ({ label: fiat(preset * CENTS, true), value: preset * CENTS }))}
        problem={flow.cents > MAX_CENTS ? t("buy.tooMuch", { max: fiat(MAX_CENTS, true) }) : null}
        label={t("buy.amount")}
      />
      <YouGet flow={flow} />
      {valid ? (
        <Button label={t("buy.continue", { amount: fiat(flow.cents) })} onPress={() => flow.goTo("method")} />
      ) : (
        <BlockedCta blocker={{ label: t("buy.enterAmount") }} />
      )}
    </>
  );
}

/** "You get": Coinbase's live quote where it is offered; otherwise the amount as Circle prices it, before its fee. */
function YouGet({ flow }: { flow: BuyFlow }) {
  const { t } = useT();
  const { color } = useTheme();
  const { user } = useSession();
  const ids = arcIdentity(user?.activeNetwork ?? "testnet");
  const quoted = flow.quote.state === "ready" ? flow.quote.value : null;
  const figure = quoted ? Number(quoted.receive) : Number(flow.cents) / Number(CENTS);
  const text = `${figure.toLocaleString(undefined, { minimumFractionDigits: FIAT_DECIMALS, maximumFractionDigits: FIAT_DECIMALS })} ${flow.asset}`;
  const units = BigInt(Math.round(figure * Number(CENTS)));
  const caption = quoted ? t("buy.afterFeesCoinbase") : flow.quote.state === "loading" ? t("buy.pricing") : t("buy.beforeFee");
  return (
    <View style={[styles.youGet, { backgroundColor: color.raised2 }]}>
      <Mark entity={flow.asset === "EURC" ? ids.eurc : ids.usdc} size={SIZE.markRow} />
      <View style={styles.grow}>
        <Text style={[TYPE.rowDetail, { color: color.text3 }]}>{flow.then ? t("buy.thenChip", { token: flow.then }) : t("buy.get")}</Text>
        {flow.quote.state === "loading" ? (
          <Skeleton width="60%" height={TYPE.rowAmount.lineHeight ?? SIZE.icon} />
        ) : (
          <RollingFigure text={text} value={units} color={color.ink} height={TYPE.rowAmount.lineHeight ?? SIZE.icon} align="left" accessibilityLabel={`${t("buy.get")} ${text}`} />
        )}
      </View>
      <Text numberOfLines={2} style={[TYPE.meta, styles.youGetCaption, { color: color.text3 }]}>
        {caption}
      </Text>
    </View>
  );
}

// ── 2. Method ────────────────────────────────────────────────────────────────────────────────────────────────────

function MethodStep({ flow }: { flow: BuyFlow }) {
  const { t } = useT();
  const { color } = useTheme();
  const fiat = useFiat(flow.currency);
  const sandbox = flow.availability.state === "ready" ? flow.availability.value.sandbox : true;
  return (
    <>
      <BackRow label={t("buy.back")} title={t("buy.payWith", { amount: fiat(flow.cents) })} onPress={() => flow.goTo("amount")} />
      {flow.availability.state === "loading" ? <LoadingState shape="list" /> : null}
      {flow.availability.state === "ready" && flow.options.length === 0 ? (
        <ErrorState diagnosis={{ kind: "unknown", retryable: false }} stillWorks={t("buy.noMethods")} />
      ) : null}
      {flow.options.map((option, index) => (
        <MethodRow key={option.key} option={option} index={index} flow={flow} />
      ))}
      <Text style={[TYPE.meta, styles.center, { color: color.text3 }]}>{sandbox ? t("buy.sandbox") : t("buy.realMoneyShort")}</Text>
    </>
  );
}

function MethodRow({ option, index, flow }: { option: PayOption; index: number; flow: BuyFlow }) {
  const { t } = useT();
  const { color } = useTheme();
  const over = option.weeklyLimitUsd !== null && flow.cents > BigInt(option.weeklyLimitUsd) * CENTS;
  const failed = flow.startError?.key === option.key ? flow.startError : null;
  const mark = methodMark(option.method);
  const detail = over
    ? t("buy.overWeekly", { limit: option.weeklyLimitUsd })
    : failed
      ? failed.message
      : [option.engine === "coinbase" ? t("buy.viaCoinbase") : t("buy.viaCircle"), option.method === "bank" ? t("buy.bankWhere") : null].filter(Boolean).join(" · ");
  const quoted = option.engine === "coinbase" && flow.quote.state === "ready" ? `${Number(flow.quote.value.receive).toFixed(FIAT_DECIMALS)} ${flow.asset}` : null;
  return (
    <SheetRow
      index={index}
      title={t(`buy.method_${option.method}`)}
      detail={detail}
      disabled={flow.starting !== null && flow.starting !== option.key}
      leading={
        <View style={[styles.methodMark, { backgroundColor: color.card }]}>
          {mark ? <Mark entity={mark} size={SIZE.markToken} /> : <Icon icon={option.method === "bank" ? Landmark : CreditCard} size={SIZE.icon} tint={color.ink} />}
        </View>
      }
      badge={<Mark entity={engineMark(option.engine)} size={SIZE.markChip} />}
      trailing={
        flow.starting === option.key ? (
          <WaitingText>{t("buy.opening")}</WaitingText>
        ) : quoted ? (
          <Text style={[TYPE.rowAmount, { color: color.ink }]}>{quoted}</Text>
        ) : undefined
      }
      onPress={() => {
        if (over && option.weeklyLimitUsd !== null) {
          // The fix the row names: the most this provider takes this week.
          flow.setCents(BigInt(option.weeklyLimitUsd) * CENTS);
          return;
        }
        if (failed?.limit) {
          flow.goTo("amount");
          return;
        }
        flow.choose(option);
      }}
    />
  );
}

// ── 3. Contact (Coinbase) ────────────────────────────────────────────────────────────────────────────────────────

function Field({ label, value, onChange, keyboard, autoComplete, maxLength, problem }: { label: string; value: string; onChange: (next: string) => void; keyboard: "phone-pad" | "email-address" | "number-pad"; autoComplete: "tel" | "email" | "one-time-code"; maxLength?: number; problem?: string | null }) {
  const { color } = useTheme();
  return (
    <View style={styles.field}>
      <Text style={[TYPE.rowDetail, { color: color.text2 }]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        keyboardType={keyboard}
        autoComplete={autoComplete}
        textContentType={autoComplete === "tel" ? "telephoneNumber" : autoComplete === "email" ? "emailAddress" : "oneTimeCode"}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={maxLength}
        placeholderTextColor={color.text3}
        style={[TYPE.field, styles.input, { backgroundColor: color.raised2, color: color.ink }]}
      />
      {problem ? <Text style={[TYPE.meta, { color: color.down }]}>{problem}</Text> : null}
    </View>
  );
}

function ContactStep({ flow }: { flow: BuyFlow }) {
  const { t } = useT();
  const { color } = useTheme();
  const { user } = useSession();
  const [phone, setPhone] = React.useState(PHONE_PREFIX);
  const [email, setEmail] = React.useState(user?.email ?? "");
  const [terms, setTerms] = React.useState(false);
  const [ids, setIds] = React.useState<{ sms: string; email: string } | null>(null);
  const [smsCode, setSmsCode] = React.useState("");
  const [emailCode, setEmailCode] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(null);
  const cleanPhone = phone.replace(/[^\d+]/g, "");
  const phoneOk = US_PHONE.test(cleanPhone);
  const emailOk = EMAIL.test(email.trim());

  const send = async () => {
    setBusy(true);
    setProblem(null);
    try {
      const [sms, mail] = await Promise.all([api.onramp.verify("sms", cleanPhone), api.onramp.verify("email", email.trim())]);
      setIds({ sms: sms.verificationId, email: mail.verificationId });
      fire("confirm");
    } catch {
      setProblem(t("buy.sendFailed"));
      fire("fail");
    } finally {
      setBusy(false);
    }
  };
  const confirm = async () => {
    if (!ids) return;
    setBusy(true);
    setProblem(null);
    try {
      await Promise.all([api.onramp.verifySubmit(ids.sms, smsCode, "sms"), api.onramp.verifySubmit(ids.email, emailCode, "email")]);
      const verified: VerifiedContact = { phone: cleanPhone, email: email.trim(), smsVerificationId: ids.sms, emailVerificationId: ids.email };
      flow.confirmContact(verified);
    } catch {
      setProblem(t("buy.codeWrong"));
      fire("fail");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <BackRow label={t("buy.back")} title={t("buy.contactTitle")} onPress={() => flow.goTo("method")} />
      <View style={styles.contactHead}>
        <Mark entity="provider:coinbase" size={SIZE.markRow} />
        <Text style={[TYPE.body, styles.grow, { color: color.text2 }]}>{t("buy.contactWhy")}</Text>
      </View>
      {ids ? (
        <>
          <Field label={t("buy.smsCode", { phone: cleanPhone })} value={smsCode} onChange={(next) => setSmsCode(next.replace(/\D/g, ""))} keyboard="number-pad" autoComplete="one-time-code" maxLength={CODE_LENGTH} />
          <Field label={t("buy.emailCode", { email: email.trim() })} value={emailCode} onChange={(next) => setEmailCode(next.replace(/\D/g, ""))} keyboard="number-pad" autoComplete="one-time-code" maxLength={CODE_LENGTH} problem={problem} />
          {smsCode.length === CODE_LENGTH && emailCode.length === CODE_LENGTH ? (
            <Button label={t("buy.confirmAndPay")} loading={busy || flow.starting !== null} onPress={() => void confirm()} />
          ) : (
            <BlockedCta blocker={{ label: t("buy.enterCodes") }} />
          )}
          <Button label={t("buy.sendAgain")} variant="ghost" disabled={busy} onPress={() => void send()} />
        </>
      ) : (
        <>
          <Field label={t("buy.phone")} value={phone} onChange={setPhone} keyboard="phone-pad" autoComplete="tel" problem={phone.length > PHONE_PREFIX.length && !phoneOk ? t("buy.phoneInvalid") : null} />
          <Field label={t("buy.email")} value={email} onChange={setEmail} keyboard="email-address" autoComplete="email" problem={problem} />
          <View style={styles.termsRow}>
            <Switch value={terms} onValueChange={setTerms} accessibilityLabel={t("buy.terms")} />
            <Text style={[TYPE.rowDetail, styles.grow, { color: color.ink }]}>{t("buy.terms")}</Text>
          </View>
          <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(COINBASE_TERMS)}>
            <Text style={[TYPE.meta, { color: color.link }]}>{t("buy.termsLink")}</Text>
          </Pressable>
          {phoneOk && emailOk && terms ? (
            <Button label={t("buy.sendCodes")} loading={busy} onPress={() => void send()} />
          ) : (
            <BlockedCta blocker={{ label: !phoneOk ? t("buy.phoneInvalid") : !emailOk ? t("buy.emailInvalid") : t("buy.acceptTerms") }} />
          )}
        </>
      )}
    </>
  );
}

// ── 4. Pay (the provider's step, inside our frame) ───────────────────────────────────────────────────────────────

function PayStep({ flow }: { flow: BuyFlow }) {
  const { t } = useT();
  const { color } = useTheme();
  const { height } = useWindowDimensions();
  const fiat = useFiat(flow.currency);
  if (!flow.source || !flow.order) return <LoadingState shape="detail" />;
  return (
    <>
      <View style={styles.backRow}>
        <View style={styles.backButton} />
        <Text accessibilityRole="header" numberOfLines={1} style={[TYPE.sheetHeading, styles.grow, styles.center, { color: color.ink }]}>
          {t("buy.payTitle", { amount: fiat(flow.cents) })}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("buy.close")}
          hitSlop={SPACE.sm}
          onPress={() => flow.onFrameClose()}
          style={({ pressed }) => [styles.backButton, { backgroundColor: pressed ? color.rowPressed : color.raised2 }]}
        >
          <Icon icon={X} size={SIZE.iconSm} tint={color.ink} />
        </Pressable>
      </View>
      <BuySteps order={flow.order} />
      <View style={[styles.frame, { height: Math.max(FRAME_MIN, height * FRAME_SHARE), backgroundColor: color.card }]}>
        <BuyFrame orderId={flow.order.id} source={flow.source} onEvent={flow.onFrameEvent} onSettled={() => flow.reloadOrder()} onClose={flow.onFrameClose} embedded />
      </View>
    </>
  );
}

// ── 5. Arriving, then the receipt (or what went wrong, and whether money moved) ──────────────────────────────────

function ArrivingStep({ flow }: { flow: BuyFlow }) {
  const { t } = useT();
  const { color } = useTheme();
  const order = flow.order;
  const startedAt = React.useRef(Date.now()).current;
  if (!order) return <LoadingState shape="detail" />;
  const failed = order.status === "not_completed" || order.status === "expired";
  if (failed) return <BuyFailure order={order} flow={flow} />;
  const settled = order.status === "settled";
  const waitingKey = order.stage === "on_base" || order.stage === "bridging" ? `buy.wait_${order.stage}` : order.status === "submitted" ? "buy.wait_buying" : "buy.wait_paying";
  return (
    <TxMorph morphed={settled} receipt={<BuyReceipt order={order} flow={flow} />}>
      <View style={styles.stack}>
        <SheetHeading title={t(waitingKey, { asset: order.asset })} />
        <BuySteps order={order} />
        <WaitingText startedAtMs={startedAt} onRetry={flow.reloadOrder}>
          {order.stage === "bridging" || order.stage === "on_base" ? t("buy.verbMoving") : order.status === "submitted" ? t("buy.verbBuying") : t("buy.verbPaying")}
        </WaitingText>
        {flow.orderStale ? <Text style={[TYPE.meta, styles.center, { color: color.text3 }]}>{t("buy.stale")}</Text> : null}
        <Text style={[TYPE.body, styles.center, { color: color.text2 }]}>{order.network === "testnet" ? t("buy.sandboxArrival") : t("buy.safeToLeave")}</Text>
        <Button label={t("buy.done")} variant="secondary" onPress={flow.close} />
      </View>
    </TxMorph>
  );
}

function BuyReceipt({ order, flow }: { order: OnrampOrderView; flow: BuyFlow }) {
  const { t } = useT();
  const { color } = useTheme();
  const money = useMoney();
  const { locale } = useLocale();
  const received = BigInt(order.received ?? "0");
  const [shown, setShown] = React.useState(ZERO);
  // The figure rolls in from zero once the receipt is up.
  React.useEffect(() => {
    const timer = setTimeout(() => setShown(received), 0);
    return () => clearTimeout(timer);
  }, [received]);
  const paid = order.fiatAmount && order.fiatCurrency ? new Intl.NumberFormat(locale, { style: "currency", currency: order.fiatCurrency }).format(Number(order.fiatAmount)) : null;
  return (
    <View style={styles.stack}>
      <SheetHeading title={t("buy.funded")} />
      <View style={styles.centerRow}>
        <RollingFigure text={money(order.asset, shown.toString())} value={shown} color={color.ink} height={TYPE.displayBalance.lineHeight ?? SIZE.avatarLg} align="left" sensitive />
      </View>
      <Panel style={styles.receiptPanel}>
        {paid ? <KeyValue label={t("buy.paid")} value={paid} /> : null}
        <KeyValue label={t("buy.receivedOn")} value={order.network === "mainnet" ? t("buy.onArc") : t("buy.onArcTestnet")} />
        {order.engine ? <KeyValue label={t("buy.provider")} value={order.engine === "coinbase" ? "Coinbase" : "Circle"} /> : null}
        {order.tx ? (
          <>
            <Rule />
            <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(order.tx!.explorerUrl)}>
              <Text style={[TYPE.rowDetail, { color: color.link }]}>{t("buy.viewTx")}</Text>
            </Pressable>
          </>
        ) : null}
      </Panel>
      {order.thenToken ? <Button label={t("buy.thenAction", { token: order.thenToken })} onPress={flow.thenAction} /> : null}
      <Button label={t("buy.done")} variant={order.thenToken ? "ghost" : "primary"} onPress={flow.close} />
    </View>
  );
}

function BuyFailure({ order, flow }: { order: OnrampOrderView; flow: BuyFlow }) {
  const { t } = useT();
  const { color } = useTheme();
  const reason = order.reason && KNOWN_REASONS.has(order.reason) ? order.reason : "other";
  const retry = order.status === "expired" || !order.reason || RETRYABLE_REASONS.has(order.reason) || SANDBOX_REASONS.has(order.reason);
  const pending = reason === "CUSTOMER_PENDING_REVIEW";
  React.useEffect(() => {
    fire("fail", { sound: "error", identity: `onramp-failed:${order.id}` });
  }, [order.id]);
  return (
    <View style={styles.stack}>
      <BuySteps order={order} />
      <View style={[styles.failure, { backgroundColor: color.destructiveSurface }]} accessibilityRole="alert">
        <Text style={[TYPE.rowTitle, { color: color.ink }]}>{t("buy.notCompleted")}</Text>
        <Text style={[TYPE.body, { color: color.text2 }]}>{order.status === "expired" ? t("buy.expired") : t(`buy.reason_${reason}`)}</Text>
        <Text style={[TYPE.rowStrong, { color: color.ink }]}>{pending ? t("buy.moneyPending") : t("buy.moneyNone")}</Text>
      </View>
      {retry ? <Button label={t("buy.tryAgain")} onPress={flow.retry} /> : null}
      <Button label={t("buy.done")} variant={retry ? "ghost" : "primary"} onPress={flow.close} />
    </View>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  center: { textAlign: "center" },
  stack: { gap: SPACE.lg },
  centerRow: { alignItems: "center" },
  backRow: { flexDirection: "row", alignItems: "center", gap: SPACE.md },
  backButton: { width: SIZE.touch - SPACE.sm, height: SIZE.touch - SPACE.sm, borderRadius: RADIUS.pill, alignItems: "center", justifyContent: "center" },
  youGet: { flexDirection: "row", alignItems: "center", gap: SPACE.md, padding: SPACE.lg, borderRadius: RADIUS.md },
  youGetCaption: { maxWidth: SIZE.avatarXl + SIZE.avatarLg, textAlign: "right" },
  methodMark: { width: SIZE.avatarMd, height: SIZE.avatarMd, borderRadius: RADIUS.sm, alignItems: "center", justifyContent: "center" },
  field: { gap: SPACE.xs },
  input: { minHeight: SIZE.inputHeight, borderRadius: RADIUS.md, paddingHorizontal: SPACE.lg },
  termsRow: { flexDirection: "row", alignItems: "center", gap: SPACE.md },
  contactHead: { flexDirection: "row", alignItems: "center", gap: SPACE.md },
  frame: { borderRadius: RADIUS.lg, overflow: "hidden" },
  receiptPanel: { padding: SPACE.lg, gap: SPACE.sm },
  failure: { padding: SPACE.lg, gap: SPACE.sm, borderRadius: RADIUS.md },
});
