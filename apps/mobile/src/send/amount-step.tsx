// How much (revamp journey 10, the amount ticket), on the Senryo kit: who it goes to at the top (tap to change), the
// asset (any token the person holds, from the universal picker, R1) with its real mark, the amount as the kit's
// AmountPad on a phone (the figure in the money face, ¼ ½ ¾ All of what is available, the keypad) or a typed figure
// on a desktop window, an optional private note and on-chain reference, and one CTA that carries the validation in
// words: "Enter an amount", "Add money" when there is not enough (and it does it), else "Review". Balances come from
// the wallet status; the policy checks everything again at review.
import { ChevronDown } from "lucide-react-native";
import * as React from "react";
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import type { NetworkId } from "@kawase/api-client";
import { AmountParseError, decimalsOf, parseAmount, type AssetId } from "@kawase/money";
import { DefaultAvatar } from "@kawase/ui-native/components/default-avatar";
import { TokenMark } from "@kawase/ui-native/components/token-mark";

import { Button, Icon, RADIUS, SIZE, SPACE, TYPE, useTheme } from "@/components/kit";
import { BlockedCta } from "@/components/tx";
import { fire } from "@/feedback/fire";
import { useT } from "@/i18n";
import { unitsFromCanonical, type TicketToken } from "@/portfolio/ticket-token";
import { TicketAmount } from "@/trade/ticket-amount";

import { useMoney } from "./copy";
import type { RecipientChoice } from "./recipient-step";

const AVATAR = 32;
const CHIP_MARK = 24;
const NOTE_MAX = 140;
const REFERENCE_MAX = 64;
const TEN = 10n;
const ZERO = 0n;
/** A dollar amount takes cents; a volatile token up to this many decimals on the pad. */
const STABLE_FRACTION = 2;
const TOKEN_FRACTION = 6;

/** Base units → the canonical decimal the keypad builds ("12.5"). */
export function canonicalFromBase(baseUnits: bigint, asset: AssetId): string {
  const divisor = TEN ** BigInt(decimalsOf(asset));
  const whole = baseUnits / divisor;
  const fraction = (baseUnits % divisor).toString().padStart(decimalsOf(asset), "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

/** The canonical decimal → base units; undefined while it is empty or not a number yet. */
export function baseFromCanonical(value: string, asset: AssetId): bigint | undefined {
  if (!value || value.endsWith(".")) return value.endsWith(".") ? baseFromCanonical(value.slice(0, -1), asset) : undefined;
  try {
    return parseAmount(value, asset, "en").baseUnits;
  } catch (error) {
    if (error instanceof AmountParseError) return undefined;
    throw error;
  }
}

export type AmountStepProps = {
  network: NetworkId;
  recipient: RecipientChoice;
  onChangeRecipient: () => void;
  /** The token being sent (any held asset). */
  token: TicketToken;
  /** Opens the universal asset picker. */
  onPickAsset: () => void;
  value: string;
  onValue: (value: string) => void;
  note: string;
  onNote: (note: string) => void;
  /** A public reference written on chain with the payment (Arc Memo): an invoice or order number. */
  reference: string;
  onReference: (reference: string) => void;
  /** The reference came with a scanned code (it shows; it can be removed, not edited). */
  referenceFromCode: boolean;
  /** The token's balance in base units; undefined while loading. */
  balance: bigint | undefined;
  /** USDC kept for network fees when this is USDC ("All" leaves it, plan §A.4 12); typing more still works. */
  reserve?: bigint | undefined;
  onReview: () => void;
  /** Opens Add money (the fix when there is not enough). */
  onAddMoney?: () => void;
  busy: boolean;
};

function Chip({ children, label, onPress }: { children: React.ReactNode; label: string; onPress: () => void }) {
  const { color } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        fire("tick");
        onPress();
      }}
      style={({ pressed }) => [styles.chip, { backgroundColor: pressed ? color.rowPressed : color.raised2 }]}
    >
      {children}
      <Icon icon={ChevronDown} size={SIZE.iconSm} tint={color.text2} />
    </Pressable>
  );
}

function Field({ value, onChange, placeholder, maxLength, upper }: { value: string; onChange: (text: string) => void; placeholder: string; maxLength: number; upper?: boolean }) {
  const { color } = useTheme();
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={color.text3}
      accessibilityLabel={placeholder}
      maxLength={maxLength}
      autoCapitalize={upper ? "characters" : "sentences"}
      returnKeyType="done"
      style={[TYPE.body, styles.field, { color: color.ink, backgroundColor: color.input }, Platform.OS === "web" ? WEB_FIELD : null]}
    />
  );
}

/** No browser focus box: the field's own plate carries focus. */
const WEB_FIELD = { outlineStyle: "none" } as unknown as object;

export function AmountStep(props: AmountStepProps) {
  const { recipient, token, value, balance, busy } = props;
  const asset = token.symbol;
  const { t } = useT();
  const { color } = useTheme();
  const money = useMoney();
  const base = unitsFromCanonical(value, token.decimals);
  const stable = asset === "USDC" || asset === "EURC";
  // "All" keeps the fee reserve back on USDC; typing more is still allowed (the policy says if it can't go).
  const spendable = balance !== undefined && props.reserve !== undefined && balance > props.reserve ? balance - props.reserve : balance;

  let cta: React.ReactNode;
  if (base === undefined || base === ZERO) cta = <BlockedCta blocker={{ label: t("send.enterAmount") }} />;
  else if (balance !== undefined && base > balance)
    cta = props.onAddMoney ? (
      <BlockedCta blocker={{ label: t("policy.fixAddMoney"), reason: t("send.notEnough", { asset }), fix: { kind: "add-money" } }} onFix={props.onAddMoney} />
    ) : (
      <BlockedCta blocker={{ label: t("send.notEnough", { asset }) }} />
    );
  else cta = <Button label={busy ? t("common.loading") : t("send.review")} loading={busy} onPress={props.onReview} />;

  return (
    <View style={styles.step}>
      <View style={styles.chips}>
        <Chip label={`${t("send.to")} ${recipient.title}`} onPress={props.onChangeRecipient}>
          <DefaultAvatar seed={recipient.seed} size={AVATAR} />
          <Text numberOfLines={1} style={[TYPE.rowStrong, styles.shrink, { color: color.ink }]}>{`${t("send.to")} ${recipient.title}`}</Text>
        </Chip>
        <Chip label={`${t("assets.pickerTitle")}: ${token.name}`} onPress={props.onPickAsset}>
          <TokenMark token={token} size={CHIP_MARK} />
          <Text style={[TYPE.rowStrong, { color: color.ink }]}>{asset}</Text>
        </Chip>
      </View>

      <TicketAmount
        label={t("send.amountTitle")}
        value={value}
        onChange={props.onValue}
        decimals={token.decimals}
        fraction={Math.min(token.decimals, stable ? STABLE_FRACTION : TOKEN_FRACTION)}
        prefix=""
        suffix={asset}
        balance={spendable}
        note={balance !== undefined ? t("send.available", { amount: money(asset, balance.toString(), token.decimals) }) : undefined}
      />

      <View style={styles.fields}>
        <Field value={props.note} onChange={props.onNote} placeholder={t("send.notePlaceholder")} maxLength={NOTE_MAX} />
        <Text style={[TYPE.caption, { color: color.text3 }]}>{t("send.noteHint")}</Text>
        <ReferenceField value={props.reference} onChange={props.onReference} fromCode={props.referenceFromCode} />
      </View>

      {cta}
    </View>
  );
}

/** The on-chain reference (Arc Memo): public, so only an invoice or order number. Hidden until asked for. */
function ReferenceField({ value, onChange, fromCode }: { value: string; onChange: (value: string) => void; fromCode: boolean }) {
  const { t } = useT();
  const { color } = useTheme();
  const [open, setOpen] = React.useState(Boolean(value));
  if (fromCode && value)
    return (
      <View style={[styles.fromCode, { backgroundColor: color.raised2 }]}>
        <Text style={[TYPE.rowDetail, styles.shrink, { color: color.ink }]}>{t("send.referenceFromCode", { reference: value })}</Text>
        <Button label={t("send.referenceRemove")} variant="ghost" size="sm" block={false} onPress={() => onChange("")} />
      </View>
    );
  if (!open) return <Button label={t("send.referenceAdd")} variant="ghost" size="sm" block={false} onPress={() => setOpen(true)} />;
  return (
    <View style={styles.fields}>
      <Field value={value} onChange={(text) => onChange(text.replace(/[^\x20-\x7E]/g, ""))} placeholder={t("send.referencePlaceholder")} maxLength={REFERENCE_MAX} upper />
      <Text style={[TYPE.caption, { color: color.text3 }]}>{t("send.referenceHint")}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  step: { gap: SPACE.lg },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: SPACE.sm },
  chip: { flexDirection: "row", alignItems: "center", gap: SPACE.sm, borderRadius: RADIUS.pill, paddingVertical: SPACE.xs, paddingStart: SPACE.xs, paddingEnd: SPACE.md, maxWidth: "100%" },
  shrink: { flexShrink: 1, minWidth: 0 },
  fields: { gap: SPACE.xs },
  field: { minHeight: SIZE.inputHeight, borderRadius: RADIUS.md, paddingHorizontal: SPACE.lg },
  fromCode: { flexDirection: "row", alignItems: "center", gap: SPACE.sm, borderRadius: RADIUS.md, paddingStart: SPACE.md },
});
