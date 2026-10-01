// The balance card (Solflare S15 / Fomo F09, on Kawase's textured black material): who the wallet belongs to
// with a copy-address affordance, the network eyebrow (TESTNET or REAL MONEY, never colour alone), the total,
// an optional sub-line and fee-reserve chip (S6), one row per asset with its real mark and chain badge, and the
// action row. Amounts arrive formatted; `total` undefined means loading (skeletons), "0" is the designed zero state.
import { Amount } from "@kawase/ui-native/components/amount";
import { Mark } from "@kawase/ui-native/components/mark";
import { StateLabel } from "@kawase/ui-native/components/state-label";
import { TexturedCard } from "@kawase/ui-native/components/textured-card";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Skeleton } from "@kawase/ui-native/components/ui/skeleton";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn } from "@kawase/ui-native/lib/utils";
import { Copy } from "lucide-react-native";
import type * as React from "react";
import { Pressable, View } from "react-native";

type BalanceRow = {
  key: string;
  /** The token's identity id ("token:eip155:5042:0x3600…"). */
  entity: string;
  /** The chain's identity id, shown as a badge on the mark. */
  chainBadge?: string;
  symbol: string;
  /** Formatted; undefined while loading. */
  amount?: string;
};

type BalanceCardProps = {
  /** The display name or @handle; "Guest" for guests. */
  name: string;
  /** Shortened address; hidden when there is no wallet yet. */
  address?: string;
  copyLabel: string;
  onCopy?: () => void;
  /** "Testnet" / "Real money": the eyebrow text. */
  eyebrow: string;
  eyebrowTone: "testnet" | "real";
  balanceLabel: string;
  /** The formatted total; undefined while loading. */
  total?: string;
  symbol: string;
  subline?: string;
  /** "~40 actions left" (S6); the slot is empty until the fee reserve is known. */
  feeReserve?: string;
  rows: readonly BalanceRow[];
  /** The `texture` token as hex. */
  lineColor: string;
  /** The action row (Fund, Request…). */
  children?: React.ReactNode;
  className?: string;
};

const ROW_MARK = 32;
const ZERO_RE = /^[0.,\s]*$/;

function BalanceCard({
  name,
  address,
  copyLabel,
  onCopy,
  eyebrow,
  eyebrowTone,
  balanceLabel,
  total,
  symbol,
  subline,
  feeReserve,
  rows,
  lineColor,
  children,
  className,
}: BalanceCardProps) {
  const zero = total !== undefined && ZERO_RE.test(total);
  return (
    <TexturedCard lineColor={lineColor} className={cn("gap-5 p-5", className)}>
      <View className="flex-row items-center justify-between gap-3">
        <View className="min-w-0 flex-1 flex-row items-center gap-2">
          <Text numberOfLines={1} className="text-foreground shrink text-base font-semibold">
            {name}
          </Text>
          {address ? (
            <Pressable accessibilityRole="button" accessibilityLabel={copyLabel} onPress={onCopy} className="bg-secondary active:bg-muted flex-row items-center gap-1 rounded-full px-2 py-1">
              <Amount className="text-muted-foreground text-xs">{address}</Amount>
              <Icon as={Copy} className="text-muted-foreground size-3" />
            </Pressable>
          ) : null}
        </View>
        <StateLabel className={eyebrowTone === "testnet" ? "text-network" : "text-muted-foreground"}>{eyebrow}</StateLabel>
      </View>

      <View className="gap-1">
        <Text className="text-muted-foreground text-sm">{balanceLabel}</Text>
        <View className="flex-row items-baseline gap-2">
          {total === undefined ? (
            <Skeleton className="h-12 w-40" />
          ) : (
            <Amount className={cn("font-display text-5xl font-bold", zero ? "text-muted-foreground" : "text-foreground")}>{total}</Amount>
          )}
          <Text className="text-muted-foreground text-xl font-semibold">{symbol}</Text>
        </View>
        {subline || feeReserve ? (
          <View className="flex-row items-center gap-2">
            {subline ? <Text className="text-muted-foreground text-sm">{subline}</Text> : null}
            {feeReserve ? (
              <View className="bg-secondary rounded-full px-2 py-0.5">
                <Text className="text-muted-foreground text-xs font-semibold">{feeReserve}</Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>

      {rows.length ? (
        <View className="gap-3">
          {rows.map((row) => (
            <View key={row.key} className="flex-row items-center gap-3">
              <Mark entity={row.entity} size={ROW_MARK} chainBadge={row.chainBadge} />
              <Text className="text-foreground flex-1 text-base font-medium">{row.symbol}</Text>
              {row.amount === undefined ? <Skeleton className="h-5 w-20" /> : <Amount className="text-foreground text-base">{row.amount}</Amount>}
            </View>
          ))}
        </View>
      ) : null}

      {children ? <View className="flex-row gap-3">{children}</View> : null}
    </TexturedCard>
  );
}

export { BalanceCard };
export type { BalanceCardProps, BalanceRow };
