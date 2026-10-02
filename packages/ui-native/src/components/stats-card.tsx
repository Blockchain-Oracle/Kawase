// A stats card (21st.dev 8412 · ravikatiyar162 "Stats Card", stats-card-2, as a native twin on Lime on Ink): a muted
// label over one hero figure in mono with its signed change, a split bar with a legend (the dominance strip, here any
// shares: money in against money out), then rows of label · value · sub-line under a hairline. The caller formats
// every figure (locale and currency live there). No sparkline: Kawase's charts are their own component.
import { Amount } from "@kawase/ui-native/components/amount";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";
import type * as React from "react";
import { View } from "react-native";

type StatsShare = { label: string; value: number; tone: "success" | "foreground" | "primary" | "muted" };
type StatsRow = { label: string; value: string; sub?: string | undefined; leading?: React.ReactNode };

type StatsCardProps = {
  label: string;
  hero: string;
  /** A short signed change or note beside the hero ("+12.40 USDC"). */
  change?: { text: string; positive: boolean } | undefined;
  shares?: StatsShare[] | undefined;
  rows?: StatsRow[] | undefined;
  footnote?: string | undefined;
  className?: string;
};

const TONE_BG: Record<StatsShare["tone"], string> = { success: "bg-success", foreground: "bg-foreground", primary: "bg-primary", muted: "bg-muted-foreground" };

function StatsCard({ label, hero, change, shares, rows, footnote, className }: StatsCardProps) {
  const total = (shares ?? []).reduce((sum, share) => sum + share.value, 0);
  return (
    <View className={cn("bg-card border-border gap-4 rounded-3xl border p-4", className)}>
      <View className="gap-1">
        <Text className={cn("text-muted-foreground text-sm font-medium", TEXT_START)}>{label}</Text>
        <View className="flex-row flex-wrap items-baseline gap-2">
          <Amount className="text-foreground text-3xl font-bold">{hero}</Amount>
          {change ? <Amount className={cn("text-sm font-semibold", change.positive ? "text-success" : "text-destructive")}>{change.text}</Amount> : null}
        </View>
      </View>
      {shares && total > 0 ? (
        <View className="gap-2">
          <View className="flex-row flex-wrap gap-x-4 gap-y-1">
            {shares.map((share) => (
              <View key={share.label} className="flex-row items-center gap-1.5">
                <View className={cn("size-2 rounded-full", TONE_BG[share.tone])} />
                <Text className="text-muted-foreground text-xs">{share.label}</Text>
              </View>
            ))}
          </View>
          <View className="bg-muted h-2 flex-row overflow-hidden rounded-full">
            {shares.map((share) => (
              <View key={share.label} className={cn("h-full", TONE_BG[share.tone])} style={{ flexGrow: share.value / total, flexBasis: 0 }} />
            ))}
          </View>
        </View>
      ) : null}
      {rows && rows.length > 0 ? (
        <View className="border-border gap-3 border-t pt-3">
          {rows.map((row) => (
            <View key={row.label} className="flex-row items-center gap-3">
              {row.leading}
              <View className="min-w-0 flex-1">
                <Text className={cn("text-foreground text-sm font-semibold", TEXT_START)}>{row.label}</Text>
                {row.sub ? <Text className={cn("text-muted-foreground text-xs", TEXT_START)}>{row.sub}</Text> : null}
              </View>
              <Amount className="text-foreground text-sm font-semibold">{row.value}</Amount>
            </View>
          ))}
        </View>
      ) : null}
      {footnote ? <Text className={cn("text-muted-foreground text-xs", TEXT_START)}>{footnote}</Text> : null}
    </View>
  );
}

export { StatsCard };
export type { StatsCardProps, StatsRow, StatsShare };
