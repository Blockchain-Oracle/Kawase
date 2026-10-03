// A journal table (21st.dev 27124 · ssychui "Trade Journal Table", as a native twin on Lime on Ink): a card with a
// title and a quiet count, a pill range control (radio group), one muted column head, and rows that read date, what,
// amount and an outcome pill — a check for done, a cross for a miss, a lime dot while open. Rows press through to
// their detail. Used for invoices (open, paid, overdue) and batch payout lines; the caller formats every value.
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";
import { Check, X } from "lucide-react-native";
import { Pressable, View } from "react-native";

import { Icon } from "@kawase/ui-native/components/ui/icon";

type JournalTone = "open" | "good" | "bad" | "muted";
type JournalRow = {
  key: string;
  date: string;
  title: string;
  sub?: string | undefined;
  amount: string;
  amountTone?: "default" | "good" | "bad" | "muted";
  status: { label: string; tone: JournalTone };
  onPress?: (() => void) | undefined;
  accessibilityLabel?: string;
};
type JournalTableProps = {
  title: string;
  count: string;
  head: { date: string; item: string; amount: string; status: string };
  rows: JournalRow[];
  ranges?: { key: string; label: string }[] | undefined;
  range?: string | undefined;
  onRange?: ((key: string) => void) | undefined;
  empty?: string | undefined;
  className?: string;
};

const DATE_WIDTH = 52;
const STATUS_WIDTH = 76;
const DOT = 5;

function StatusPill({ label, tone }: { label: string; tone: JournalTone }) {
  return (
    <View className="flex-row justify-end" style={{ width: STATUS_WIDTH }}>
      <View
        className={cn(
          "flex-row items-center gap-1 rounded-full border px-2 py-0.5",
          tone === "good" && "border-success/25 bg-success/10",
          tone === "bad" && "border-destructive/25 bg-destructive/10",
          tone === "open" && "border-border bg-muted/40",
          tone === "muted" && "border-border bg-transparent",
        )}
      >
        {tone === "open" ? <View className="bg-primary rounded-full" style={{ width: DOT, height: DOT }} /> : null}
        {tone === "good" ? <Icon as={Check} className="text-success size-2.5" /> : null}
        {tone === "bad" ? <Icon as={X} className="text-destructive size-2.5" /> : null}
        <Text numberOfLines={1} className={cn("text-[10.5px] font-medium", tone === "good" ? "text-success" : tone === "bad" ? "text-destructive" : "text-muted-foreground")}>
          {label}
        </Text>
      </View>
    </View>
  );
}

function JournalTable({ title, count, head, rows, ranges, range, onRange, empty, className }: JournalTableProps) {
  return (
    <View className={cn("bg-card border-border overflow-hidden rounded-2xl border", className)}>
      <View className="flex-row items-center justify-between gap-3 px-4 pb-3 pt-4">
        <View className="min-w-0 flex-1 flex-row items-baseline gap-2.5">
          <Text numberOfLines={1} className={cn("text-foreground text-[15px] font-medium", TEXT_START)}>
            {title}
          </Text>
          <Text className="text-muted-foreground text-[11.5px]" style={{ fontVariant: ["tabular-nums"] }}>
            {count}
          </Text>
        </View>
        {ranges && ranges.length > 1 ? (
          <View accessibilityRole="radiogroup" className="bg-muted/40 flex-row items-center gap-0.5 rounded-full p-[3px]">
            {ranges.map((entry) => {
              const on = entry.key === range;
              return (
                <Pressable
                  key={entry.key}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  onPress={() => onRange?.(entry.key)}
                  className={cn("h-6 justify-center rounded-full px-2.5", on && "bg-foreground/10")}
                >
                  <Text className={cn("text-[11px] font-medium", on ? "text-foreground" : "text-muted-foreground")}>{entry.label}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </View>
      <View className="border-border flex-row items-center gap-3 border-b px-4 pb-2">
        <Text className="text-muted-foreground text-[10px]" style={{ width: DATE_WIDTH }}>
          {head.date}
        </Text>
        <Text className={cn("text-muted-foreground flex-1 text-[10px]", TEXT_START)}>{head.item}</Text>
        <Text className="text-muted-foreground text-end text-[10px]">{head.amount}</Text>
        <Text className="text-muted-foreground text-end text-[10px]" style={{ width: STATUS_WIDTH }}>
          {head.status}
        </Text>
      </View>
      {rows.length === 0 && empty ? <Text className={cn("text-muted-foreground px-4 py-4 text-sm", TEXT_START)}>{empty}</Text> : null}
      {rows.map((row, index) => (
        <Pressable
          key={row.key}
          disabled={!row.onPress}
          onPress={row.onPress}
          accessibilityRole={row.onPress ? "button" : undefined}
          accessibilityLabel={row.accessibilityLabel ?? [row.title, row.amount, row.status.label, row.date].join(", ")}
          className={cn("active:bg-muted/40 flex-row items-center gap-3 px-4 py-2.5", index < rows.length - 1 && "border-border/50 border-b")}
        >
          <Text numberOfLines={2} className="text-muted-foreground text-[11px]" style={{ width: DATE_WIDTH, fontVariant: ["tabular-nums"] }}>
            {row.date}
          </Text>
          <View className="min-w-0 flex-1">
            <Text numberOfLines={1} className={cn("text-foreground text-[12.5px] font-semibold", TEXT_START)}>
              {row.title}
            </Text>
            {row.sub ? (
              <Text numberOfLines={1} className={cn("text-muted-foreground text-[11px]", TEXT_START)}>
                {row.sub}
              </Text>
            ) : null}
          </View>
          <Text
            numberOfLines={1}
            className={cn(
              "text-end text-[12px] font-medium",
              row.amountTone === "good" ? "text-success" : row.amountTone === "bad" ? "text-destructive" : row.amountTone === "muted" ? "text-muted-foreground" : "text-foreground",
            )}
            style={{ fontVariant: ["tabular-nums"] }}
          >
            {row.amount}
          </Text>
          <StatusPill label={row.status.label} tone={row.status.tone} />
        </Pressable>
      ))}
    </View>
  );
}

export { JournalTable };
export type { JournalRow, JournalTableProps, JournalTone };
