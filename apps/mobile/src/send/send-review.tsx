// What will be sent, exactly, before the person says yes (DESIGN.md: "the confirm card shows the exact amount,
// asset, recipient and network"). Shared by the send screen and the chat card. The amount leads; then who, with how
// the address reached the book (the trust chip); then the warnings as rows (a lookalike address in the error colour,
// the rest as quiet notes with an icon, never colour alone); then network, fee and note; then the allowance meter,
// which says in words whether this send goes without asking or needs Face ID.
import { BadgeCheck, ChevronDown, CircleAlert, FlaskConical, Info, ShieldAlert } from "lucide-react-native";
import { formatUnits } from "viem";
import * as React from "react";
import { Pressable, View } from "react-native";

import type { SendIntent, SendRequest } from "@kawase/api-client";
import { arcIdentity, CHAIN_IDS } from "@kawase/identity";
import { amount as toAmount, formatAmount, formatTokenAmount, type AssetId } from "@kawase/money";
import { TokenMark } from "@kawase/ui-native/components/token-mark";
import { Amount } from "@kawase/ui-native/components/amount";
import { DefaultAvatar } from "@kawase/ui-native/components/default-avatar";
import { Mark } from "@kawase/ui-native/components/mark";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { useT } from "@/i18n";
import { useLocale } from "@/i18n/locale-provider";
import { BrakeNote } from "@/safety/brake-note";

import { recipientName, shortAddress, useMoney, usePolicyText, useTrustLabel } from "./copy";

const AVATAR = 44;
const ASSET_MARK = 36;
const ASSET_MARK_COMPACT = 28;
const ZERO = 0n;
const FEE_DIGITS = 4;
const PERCENT = 100;
const METER_HEIGHT = 6;

/** Warnings shown as rows; the allowance ones are said by the meter instead. */
const TOKEN_DIGITS = 6;
const DEFAULT_TOKEN_DECIMALS = 18;
const ROW_WARNINGS = new Set([
  "LOOKALIKE_ADDRESS",
  "RECIPIENT_CONTRACT",
  "FIRST_TIME_RECIPIENT",
  "UNSAVED_ADDRESS",
  "LEAVES_LITTLE_FOR_FEES",
  // A new address in its cooldown: this one needs the person's own yes (D-cooldown).
  "NEW_RECIPIENT_COOLDOWN",
]);
/** Why a send needs the person's own yes when the allowance would otherwise cover it, said on the meter. */
const HELD = new Set(["AGENT_PAUSED", "NOT_ON_ALLOWLIST", "ABOVE_APPROVAL_THRESHOLD", "OVER_RECIPIENT_WEEKLY"]);
/** USDC and EURC both have six decimals. */
const STABLE_DECIMALS = 6;

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <View className="flex-row items-baseline justify-between gap-4">
      <Text className="text-muted-foreground text-sm">{label}</Text>
      {mono ? (
        <Amount className="text-foreground shrink text-sm">{value}</Amount>
      ) : (
        <Text className="text-foreground shrink text-end text-sm">{value}</Text>
      )}
    </View>
  );
}

/**
 * `budget`: the weekly budget would send this without asking (useBudgetCoversSend): that is what the line says, and the
 * old per-day allowance is not mentioned at all.
 */
export function AllowanceMeter({ intent, compact, budget }: { intent: SendIntent; compact?: boolean; budget?: boolean | undefined }) {
  const { t } = useT();
  const money = useMoney();
  const policyText = usePolicyText();
  const { allowance, route } = intent;
  const stepUp = intent.results.some(
    (entry) => entry.code === "LOOKALIKE_ADDRESS" || entry.code === "FIRST_TIME_RECIPIENT",
  );
  const above = intent.results.some((entry) => entry.code === "ABOVE_ALLOWANCE");
  // Each token has its own allowance (Wallet & limits), so "off" means off for this send's token.
  // Paused, off the allowlist, above the approval threshold or past one person's weekly cap: say why this one needs
  // Face ID (D-pause, M9).
  const held = intent.results.find((entry) => HELD.has(entry.code));
  const line =
    route === "allowance"
      ? t("send.allowanceInside")
      : held
        ? policyText(held, intent.network)
        : !allowance.active
        ? t("send.allowanceOff")
        : above
          ? t("send.allowanceAbove")
          : stepUp
            ? t("send.allowanceStepUp")
            : t("send.allowanceAbove");
  if (budget)
    return (
      <View className="bg-muted flex-row items-start gap-2 rounded-2xl px-4 py-3">
        <Icon as={BadgeCheck} className="text-success mt-0.5 size-4" />
        <Text className={cn("text-foreground flex-1 text-sm leading-5", TEXT_START)}>{t("send.budgetInside")}</Text>
      </View>
    );
  const total = allowance.perPeriod ? BigInt(allowance.perPeriod) : ZERO;
  const left = BigInt(allowance.available);
  const share = total > ZERO ? Number((left * BigInt(PERCENT)) / total) : 0;
  return (
    <View className="bg-muted gap-2 rounded-2xl px-4 py-3">
      <View className="flex-row items-start gap-2">
        <Icon
          as={route === "allowance" ? BadgeCheck : ShieldAlert}
          className={cn("mt-0.5 size-4", route === "allowance" ? "text-success" : "text-foreground")}
        />
        <Text className={cn("text-foreground flex-1 text-sm leading-5", TEXT_START)}>{line}</Text>
      </View>
      {allowance.active && allowance.perPeriod && !compact ? (
        <>
          <View className="bg-background overflow-hidden rounded-full" style={{ height: METER_HEIGHT }}>
            <View className="bg-success h-full rounded-full" style={{ width: `${share}%` }} />
          </View>
          <Text className={cn("text-muted-foreground text-xs", TEXT_START)}>
            {t("send.allowanceLeft", {
              amount: money(intent.draft?.asset ?? "USDC", allowance.available),
              total: money(intent.draft?.asset ?? "USDC", allowance.perPeriod),
            })}
          </Text>
        </>
      ) : null}
    </View>
  );
}

/**
 * `onRevise`: change the amount here (the "send a test amount first?" offer on a first payment). Without it the offer
 * is said but not offered as a button.
 */
export function SendReview({
  intent,
  compact,
  onRevise,
  budget,
}: {
  intent: SendIntent;
  compact?: boolean;
  onRevise?: ((patch: SendRequest) => void) | undefined;
  /** The weekly budget would send it without asking. */
  budget?: boolean | undefined;
}) {
  const { t } = useT();
  const { locale } = useLocale();
  const policyText = usePolicyText();
  const trustLabel = useTrustLabel();
  const [expanded, setExpanded] = React.useState(false);
  const draft = intent.draft;
  // Network fees on Arc are fractions of a cent, so they get four places instead of two.
  const fee = (baseUnits: string) =>
    formatAmount(toAmount("USDC", BigInt(baseUnits)), locale, { fractionDigits: FEE_DIGITS });
  if (!draft) return null;
  const ids = arcIdentity(intent.network);
  const recipient = draft.recipient;
  // Paid before, or checked by the person (Verify on the contact): the chip is green.
  const trusted = recipient.paidBefore || Boolean(recipient.verifiedMethod);
  const name = recipientName(recipient, intent.request.recipient);
  const secondary = recipient.name && recipient.handle ? `@${recipient.handle}` : shortAddress(recipient.address);
  const test = intent.results.find((entry) => entry.code === "TEST_AMOUNT_SUGGESTED");
  // A new address is said once: the trust chip says it isn't saved, and the test-amount offer (when there is one) says
  // it is the first payment — so those two rows don't repeat what is already on screen.
  const warnings = intent.results.filter(
    (entry) => ROW_WARNINGS.has(entry.code) && entry.code !== "UNSAVED_ADDRESS" && !(entry.code === "FIRST_TIME_RECIPIENT" && test?.params?.test),
  );
  // Any token (R1): its own decimals and mark; drafts from before any-asset sends are USDC/EURC.
  const decimals = draft.token?.decimals ?? (draft.asset === "USDC" || draft.asset === "EURC" ? undefined : DEFAULT_TOKEN_DECIMALS);
  const figures =
    decimals === undefined
      ? formatAmount(toAmount(draft.asset as AssetId, BigInt(draft.amount)), locale, { withSymbol: false })
      : formatTokenAmount(BigInt(draft.amount), decimals, draft.asset, locale, { withSymbol: false, fractionDigits: TOKEN_DIGITS, trimZeros: true });
  const chainId = intent.network === "mainnet" ? CHAIN_IDS.arc : CHAIN_IDS.arcTestnet;

  return (
    <View className="gap-4">
      <View className={cn("items-center gap-2", compact ? "py-1" : "py-3")}>
        <Text className="text-muted-foreground text-sm">{t("send.youSend")}</Text>
        <View className="flex-row items-center gap-3">
          {draft.token ? (
            <TokenMark token={{ chainId, address: draft.token.address, symbol: draft.token.symbol }} chainBadge={ids.chain} size={compact ? ASSET_MARK_COMPACT : ASSET_MARK} />
          ) : (
            <Mark entity={draft.asset === "USDC" ? ids.usdc : ids.eurc} chainBadge={ids.chain} size={compact ? ASSET_MARK_COMPACT : ASSET_MARK} />
          )}
          <Text
            accessibilityLabel={`${figures} ${draft.asset}`}
            className={cn("font-display text-foreground font-bold", compact ? "text-[32px]" : "text-5xl")}
            style={{ fontVariant: ["tabular-nums"] }}
          >
            {figures}
          </Text>
          <Text className="text-muted-foreground font-display text-xl font-semibold">{draft.asset}</Text>
        </View>
      </View>

      <Text className={cn("text-muted-foreground -mb-2 px-1 text-sm", TEXT_START)}>{t("send.to")}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${t("send.to")} ${name}`}
        accessibilityState={{ expanded }}
        accessibilityHint={t("send.showFullAddress")}
        onPress={() => setExpanded((open) => !open)}
        className="bg-card border-border active:bg-muted gap-3 rounded-2xl border p-3"
      >
        <View className="flex-row items-center gap-3">
          <DefaultAvatar seed={recipient.address.toLowerCase()} size={AVATAR} label={name} />
          <View className="min-w-0 flex-1 gap-1">
            <Text numberOfLines={1} className={cn("text-foreground text-base font-semibold", TEXT_START)}>
              {name}
            </Text>
            <View className="flex-row flex-wrap items-center gap-x-2 gap-y-1">
              <Amount numberOfLines={1} className="text-muted-foreground text-sm">
                {secondary}
              </Amount>
              <View className={cn("flex-row items-center gap-1 rounded-full px-2 py-0.5", trusted ? "bg-success/15" : "bg-muted")}>
                <Icon as={trusted ? BadgeCheck : Info} className={cn("size-3", trusted ? "text-success" : "text-muted-foreground")} />
                <Text numberOfLines={1} className={cn("text-xs font-semibold", trusted ? "text-success" : "text-muted-foreground")}>
                  {trustLabel(recipient)}
                </Text>
              </View>
            </View>
          </View>
          <Icon as={ChevronDown} className={cn("text-muted-foreground size-4", expanded ? "rotate-180" : "")} />
        </View>
        {expanded ? (
          <View className="bg-muted gap-1 rounded-xl px-3 py-2">
            {/* The whole address, selectable and left-to-right in every language, for checking character by character. */}
            <Text
              selectable
              className="text-foreground font-mono text-sm leading-5"
              style={{ writingDirection: "ltr", textAlign: "left" }}
            >
              {recipient.address}
            </Text>
            {intent.request.recipient && intent.request.recipient !== recipient.address ? (
              <Text className={cn("text-muted-foreground text-xs", TEXT_START)}>
                {t("send.youWrote", { words: intent.request.recipient })}
              </Text>
            ) : null}
          </View>
        ) : null}
      </Pressable>

      <BrakeNote results={intent.results} text={(entry) => policyText(entry, intent.network)} />

      {test?.params?.test ? (
        <View className="bg-muted flex-row items-center gap-3 rounded-2xl px-4 py-3">
          <Icon as={FlaskConical} className="text-muted-foreground size-4" />
          <Text className={cn("text-foreground flex-1 text-sm leading-5", TEXT_START)}>{policyText(test, intent.network)}</Text>
          {onRevise ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => onRevise({ amount: formatUnits(BigInt(test.params!.test!), STABLE_DECIMALS) })}
              className="bg-background active:bg-card rounded-full px-3 py-1.5"
            >
              <Text className="text-foreground text-xs font-semibold">{t("safety.sendTestFirst")}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {warnings.length ? (
        <View className="gap-2">
          {warnings.map((warning) => {
            const danger = warning.code === "LOOKALIKE_ADDRESS";
            return (
              <View
                key={warning.code}
                accessibilityRole={danger ? "alert" : "text"}
                className={cn(
                  "flex-row items-start gap-2 rounded-2xl px-4 py-3",
                  danger ? "bg-destructive/15" : "bg-muted",
                )}
              >
                <Icon
                  as={danger ? CircleAlert : Info}
                  className={cn("mt-0.5 size-4", danger ? "text-destructive" : "text-muted-foreground")}
                />
                <Text
                  className={cn(
                    "flex-1 text-sm leading-5",
                    danger ? "text-destructive font-semibold" : "text-foreground",
                    TEXT_START,
                  )}
                >
                  {policyText(warning, intent.network)}
                </Text>
              </View>
            );
          })}
        </View>
      ) : null}

      <View className="gap-2 px-1">
        <DetailRow
          label={t("send.network")}
          value={intent.network === "testnet" ? t("network.arcTestnet") : t("network.arc")}
        />
        <DetailRow
          label={t("send.fee")}
          value={
            draft.fee.payer === "kawase"
              ? t("send.feeKawase")
              : draft.fee.payer === "relayer"
                ? t("send.feeRelayed", { amount: draft.fee.estimate ? fee(draft.fee.estimate) : "" })
                : draft.fee.estimate
                ? t("send.feeWallet", { amount: fee(draft.fee.estimate) })
                : "—"
          }
        />
        {draft.note ? <DetailRow label={t("send.note")} value={draft.note} /> : null}
        {draft.memo ? <DetailRow label={t("send.referenceLabel")} value={draft.memo.memoData || shortAddress(draft.memo.memoId)} /> : null}
      </View>

      <AllowanceMeter intent={intent} compact={compact ?? false} budget={budget} />
    </View>
  );
}
