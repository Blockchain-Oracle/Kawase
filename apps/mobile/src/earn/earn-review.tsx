// What a deposit or withdrawal will do, exactly, before the person says yes: the vault (its real mark, curator,
// yield now), what goes in or comes out (exact, and the least that comes back for a withdrawal), the position after,
// about what that earns in a year at today's rate — said as an estimate, never a promise — the vault's warnings in
// words, and the network fee.
import { CircleAlert, Info } from "lucide-react-native";
import * as React from "react";
import { View } from "react-native";

import type { EarnIntent } from "@kawase/api-client";
import { arcIdentity } from "@kawase/identity";
import { amount as toAmount, formatAmount } from "@kawase/money";
import { Amount } from "@kawase/ui-native/components/amount";
import { Mark } from "@kawase/ui-native/components/mark";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { useLocale } from "@/i18n/locale-provider";
import { useT } from "@/i18n";
import { useMoney } from "@/send/copy";

import { useEarnPolicyText, usePercent } from "./copy";
import { VaultRow } from "./vault-row";

const MARK = 36;
const MARK_COMPACT = 28;
const FEE_DIGITS = 4;

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-baseline justify-between gap-4">
      <Text className="text-muted-foreground text-sm">{label}</Text>
      <Text className="text-foreground shrink text-end text-sm">{value}</Text>
    </View>
  );
}

export function EarnReview({ intent, compact }: { intent: EarnIntent; compact?: boolean }) {
  const { t } = useT();
  const { locale } = useLocale();
  const money = useMoney();
  const percent = usePercent();
  const policyText = useEarnPolicyText();
  const draft = intent.draft;
  if (!draft) return null;
  const ids = arcIdentity(intent.network);
  const deposit = draft.action === "deposit";
  const warnings = intent.results.filter((entry) => entry.kind === "warning");
  const fee = (baseUnits: string) => formatAmount(toAmount("USDC", BigInt(baseUnits)), locale, { fractionDigits: FEE_DIGITS });

  return (
    <View className="gap-4">
      <View className="bg-muted gap-3 rounded-3xl p-4">
        <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{deposit ? t("earn.youPutIn") : t("earn.youTakeOut")}</Text>
        <View className="flex-row items-center gap-3">
          <Mark entity={ids.usdc} chainBadge={ids.chain} size={compact ? MARK_COMPACT : MARK} />
          <Amount numberOfLines={1} adjustsFontSizeToFit className={cn("font-display text-foreground shrink font-bold", compact ? "text-2xl" : "text-3xl")}>
            {money("USDC", draft.amount)}
          </Amount>
        </View>
        {!deposit ? <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{t("earn.atLeastBack", { amount: money("USDC", draft.minReceived) })}</Text> : null}
      </View>

      <View className="border-border overflow-hidden rounded-2xl border">
        <Text className={cn("text-muted-foreground px-4 pt-3 text-xs", TEXT_START)}>{deposit ? t("earn.into") : t("earn.from")}</Text>
        <VaultRow vault={draft.vault} />
      </View>

      {warnings.map((warning) => (
        <View key={warning.code} className="flex-row items-start gap-2">
          <Icon as={CircleAlert} className="text-foreground mt-0.5 size-4" />
          <Text className={cn("text-foreground flex-1 text-sm", TEXT_START)}>{policyText(warning, intent.network)}</Text>
        </View>
      ))}

      <View className="gap-2">
        <DetailRow label={t("earn.worthAfter")} value={money("USDC", draft.positionAfter)} />
        <DetailRow label={percent(draft.vault.apy)} value={t("earn.yearly", { amount: money("USDC", draft.yearlyEarnings) })} />
        {draft.networkFee ? <DetailRow label={t("swap.networkFee")} value={t("swap.networkFeeValue", { amount: fee(draft.networkFee) })} /> : null}
      </View>

      <View className="flex-row items-start gap-2">
        <Icon as={Info} className="text-muted-foreground mt-0.5 size-4" />
        <Text className={cn("text-muted-foreground flex-1 text-xs", TEXT_START)}>
          {t("earn.yieldsChange")}
          {intent.network === "testnet" ? ` ${t("earn.testnetVaults")}` : ""}
        </Text>
      </View>
    </View>
  );
}
