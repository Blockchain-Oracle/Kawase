// What will be sent, exactly, before the person says yes (DESIGN.md: "the confirm card shows the exact amount,
// asset, recipient and network"). Shared by the send screen and the chat card. The amount leads; then who, with how
// the address reached the book (the trust chip); then the warnings as rows (a lookalike address in the error colour,
// the rest as quiet notes with an icon, never colour alone); then network, fee and note; then the allowance meter,
// which says in words whether this send goes without asking or needs Face ID.
import { BadgeCheck, CircleAlert, Info, ShieldAlert } from "lucide-react-native";
import * as React from "react";
import { View } from "react-native";

import type { SendIntent } from "@kawase/api-client";
import { arcIdentity } from "@kawase/identity";
import { amount as toAmount, formatAmount, type AssetId } from "@kawase/money";
import { Amount } from "@kawase/ui-native/components/amount";
import { DefaultAvatar } from "@kawase/ui-native/components/default-avatar";
import { Mark } from "@kawase/ui-native/components/mark";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { useT } from "@/i18n";
import { useLocale } from "@/i18n/locale-provider";

import { recipientName, shortAddress, useMoney, usePolicyText, useTrustLabel } from "./copy";

const AVATAR = 44;
const ASSET_MARK = 36;
const ASSET_MARK_COMPACT = 28;
const ZERO = 0n;
const FEE_DIGITS = 4;
const PERCENT = 100;
const METER_HEIGHT = 6;

/** Warnings shown as rows; the allowance ones are said by the meter instead. */
const ROW_WARNINGS = new Set(["LOOKALIKE_ADDRESS", "FIRST_TIME_RECIPIENT", "UNSAVED_ADDRESS", "LEAVES_LITTLE_FOR_FEES"]);

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

export function AllowanceMeter({ intent, compact }: { intent: SendIntent; compact?: boolean }) {
  const { t } = useT();
  const money = useMoney();
  const { allowance, route } = intent;
  const stepUp = intent.results.some((entry) => entry.code === "LOOKALIKE_ADDRESS" || entry.code === "FIRST_TIME_RECIPIENT");
  const above = intent.results.some((entry) => entry.code === "ABOVE_ALLOWANCE");
  const usdc = intent.draft?.asset !== "EURC";
  const line =
    route === "allowance"
      ? t("send.allowanceInside")
      : !usdc
        ? t("send.allowanceUsdcOnly")
        : !allowance.active
        ? t("send.allowanceOff")
        : above
          ? t("send.allowanceAbove")
          : stepUp
            ? t("send.allowanceStepUp")
            : t("send.allowanceAbove");
  const total = allowance.perPeriod ? BigInt(allowance.perPeriod) : ZERO;
  const left = BigInt(allowance.available);
  const share = total > ZERO ? Number((left * BigInt(PERCENT)) / total) : 0;
  return (
    <View className="bg-muted gap-2 rounded-2xl px-4 py-3">
      <View className="flex-row items-start gap-2">
        <Icon as={route === "allowance" ? BadgeCheck : ShieldAlert} className={cn("mt-0.5 size-4", route === "allowance" ? "text-success" : "text-foreground")} />
        <Text className={cn("text-foreground flex-1 text-sm leading-5", TEXT_START)}>{line}</Text>
      </View>
      {usdc && allowance.active && allowance.perPeriod && !compact ? (
        <>
          <View className="bg-background overflow-hidden rounded-full" style={{ height: METER_HEIGHT }}>
            <View className="bg-success h-full rounded-full" style={{ width: `${share}%` }} />
          </View>
          <Text className={cn("text-muted-foreground text-xs", TEXT_START)}>
            {t("send.allowanceLeft", { amount: money("USDC", allowance.available), total: money("USDC", allowance.perPeriod) })}
          </Text>
        </>
      ) : null}
    </View>
  );
}

export function SendReview({ intent, compact }: { intent: SendIntent; compact?: boolean }) {
  const { t } = useT();
  const { locale } = useLocale();
  const policyText = usePolicyText();
  const trustLabel = useTrustLabel();
  const draft = intent.draft;
  // Network fees on Arc are fractions of a cent, so they get four places instead of two.
  const fee = (baseUnits: string) => formatAmount(toAmount("USDC", BigInt(baseUnits)), locale, { fractionDigits: FEE_DIGITS });
  if (!draft) return null;
  const ids = arcIdentity(intent.network);
  const recipient = draft.recipient;
  const name = recipientName(recipient, intent.request.recipient);
  const secondary = recipient.name && recipient.handle ? `@${recipient.handle}` : shortAddress(recipient.address);
  const warnings = intent.results.filter((entry) => ROW_WARNINGS.has(entry.code));
  const figures = formatAmount(toAmount(draft.asset as AssetId, BigInt(draft.amount)), locale, { withSymbol: false });

  return (
    <View className="gap-4">
      <View className={cn("items-center gap-2", compact ? "py-1" : "py-3")}>
        <Text className="text-muted-foreground text-sm">{t("send.youSend")}</Text>
        <View className="flex-row items-center gap-3">
          <Mark entity={draft.asset === "USDC" ? ids.usdc : ids.eurc} chainBadge={ids.chain} size={compact ? ASSET_MARK_COMPACT : ASSET_MARK} />
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

      <View className="bg-card border-border flex-row items-center gap-3 rounded-2xl border p-3">
        <DefaultAvatar seed={recipient.address.toLowerCase()} size={AVATAR} label={name} />
        <View className="min-w-0 flex-1 gap-0.5">
          <Text numberOfLines={1} className={cn("text-foreground text-base font-semibold", TEXT_START)}>
            {t("send.to")} {name}
          </Text>
          <Amount numberOfLines={1} className="text-muted-foreground text-sm">
            {secondary}
          </Amount>
        </View>
        <View className={cn("flex-row items-center gap-1 rounded-full px-2.5 py-1", recipient.paidBefore ? "bg-success/15" : "bg-muted")}>
          <Icon as={recipient.paidBefore ? BadgeCheck : Info} className={cn("size-3.5", recipient.paidBefore ? "text-success" : "text-muted-foreground")} />
          <Text className={cn("text-xs font-semibold", recipient.paidBefore ? "text-success" : "text-muted-foreground")}>{trustLabel(recipient)}</Text>
        </View>
      </View>

      {warnings.length ? (
        <View className="gap-2">
          {warnings.map((warning) => {
            const danger = warning.code === "LOOKALIKE_ADDRESS";
            return (
              <View
                key={warning.code}
                accessibilityRole={danger ? "alert" : "text"}
                className={cn("flex-row items-start gap-2 rounded-2xl px-4 py-3", danger ? "bg-destructive/15" : "bg-muted")}
              >
                <Icon as={danger ? CircleAlert : Info} className={cn("mt-0.5 size-4", danger ? "text-destructive" : "text-muted-foreground")} />
                <Text className={cn("flex-1 text-sm leading-5", danger ? "text-destructive font-semibold" : "text-foreground", TEXT_START)}>
                  {policyText(warning, intent.network)}
                </Text>
              </View>
            );
          })}
        </View>
      ) : null}

      <View className="gap-2 px-1">
        <DetailRow label={t("send.network")} value={intent.network === "testnet" ? t("network.arcTestnet") : t("network.arc")} />
        <DetailRow
          label={t("send.fee")}
          value={draft.fee.payer === "kawase" ? t("send.feeKawase") : draft.fee.estimate ? t("send.feeWallet", { amount: fee(draft.fee.estimate) }) : "—"}
        />
        {draft.note ? <DetailRow label={t("send.note")} value={draft.note} /> : null}
      </View>

      <AllowanceMeter intent={intent} compact={compact ?? false} />
    </View>
  );
}
