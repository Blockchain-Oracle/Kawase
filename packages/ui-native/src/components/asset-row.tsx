// One asset, the same way everywhere (R1; the Asset Card's facts, 21st.dev 7945 · ravikatiyar162, as a list row):
// the token's mark with its chain badge, name and amount, the value and its 24-hour change, an optional sparkline,
// and a status chip when Kawase does not vouch for the token (unverified, lookalike, blocked). Amounts are mono and
// left-to-right; the change is coloured and signed, never colour alone.
import { Amount } from "@kawase/ui-native/components/amount";
import { Sparkline } from "@kawase/ui-native/components/area-chart";
import { TokenMark, type TokenLike } from "@kawase/ui-native/components/token-mark";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn } from "@kawase/ui-native/lib/utils";
import { WEB_PRESSABLE } from "@kawase/ui-native/lib/wide";
import * as React from "react";
import { Pressable, View } from "react-native";

type AssetRowProps = {
  token: TokenLike & { name: string };
  /** "12.5 ARGUS", already formatted. */
  amount?: string;
  /** "$4.20" in the display currency, already formatted. */
  value?: string;
  /** Percent over 24 hours. */
  change24hPct?: number | null;
  /** "+3.2%" as the person's locale writes it. */
  changeLabel?: string;
  /** A chip after the name: unverified, lookalike, blocked, the chain name… */
  chip?: { label: string; tone: "muted" | "warn" | "danger" };
  chainBadge?: string;
  spark?: { values: readonly number[]; colors: { up: string; down: string } };
  /** Why it cannot be chosen here (R2): shown instead of the value, and the row is dimmed. */
  unavailable?: string;
  /** The live number behind `value` (a price): when a refresh moves it, the value flashes up or down for a moment. */
  tick?: number | null;
  selected?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
  className?: string;
};

const ROW_MIN_HEIGHT = 64;
const SPARK_WIDTH = 56;
const SPARK_HEIGHT = 24;
/** How long a live price keeps the colour of its move. */
const FLASH_MS = 700;

/** "up" or "down" for a moment after the number moves; null at rest and on the first read. */
function useTickFlash(tick: number | null | undefined) {
  const last = React.useRef(tick);
  const [flash, setFlash] = React.useState<"up" | "down" | null>(null);
  React.useEffect(() => {
    const was = last.current;
    last.current = tick;
    if (tick === null || tick === undefined || was === null || was === undefined || tick === was) return undefined;
    setFlash(tick > was ? "up" : "down");
    const timer = setTimeout(() => setFlash(null), FLASH_MS);
    return () => clearTimeout(timer);
  }, [tick]);
  return flash;
}

function AssetRow({ token, amount, value, change24hPct, changeLabel, chip, chainBadge, spark, unavailable, tick, selected, onPress, accessibilityLabel, className }: AssetRowProps) {
  const flash = useTickFlash(tick);
  const changeTone = change24hPct === null || change24hPct === undefined ? "text-muted-foreground" : change24hPct >= 0 ? "text-success" : "text-destructive";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? [token.name, amount, value, changeLabel, chip?.label, unavailable].filter(Boolean).join(", ")}
      accessibilityState={{ disabled: Boolean(unavailable), selected: selected ?? false }}
      onPress={onPress}
      disabled={!onPress}
      className={cn("flex-row items-center gap-3 px-4 py-3", onPress && cn("active:bg-muted", WEB_PRESSABLE), selected && "bg-muted", unavailable && "opacity-60", className)}
      style={{ minHeight: ROW_MIN_HEIGHT }}
    >
      <TokenMark token={token} {...(chainBadge ? { chainBadge } : {})} />
      <View className="min-w-0 flex-1 gap-0.5">
        <View className="flex-row items-center gap-1.5">
          <Text numberOfLines={1} className="text-foreground shrink text-base font-medium">
            {token.name}
          </Text>
          {chip ? (
            <Text
              numberOfLines={1}
              className={cn(
                "rounded-full px-1.5 py-0.5 text-[11px] font-semibold",
                chip.tone === "danger" ? "bg-destructive/15 text-destructive" : chip.tone === "warn" ? "bg-secondary text-foreground" : "bg-secondary text-muted-foreground",
              )}
            >
              {chip.label}
            </Text>
          ) : null}
        </View>
        {amount ? (
          <Amount numberOfLines={1} className="text-muted-foreground text-sm">
            {amount}
          </Amount>
        ) : null}
      </View>
      {spark ? <Sparkline values={spark.values} width={SPARK_WIDTH} height={SPARK_HEIGHT} colors={spark.colors} /> : null}
      <View className="items-end gap-0.5">
        {unavailable ? (
          <Text numberOfLines={2} className="text-muted-foreground max-w-36 text-end text-xs">
            {unavailable}
          </Text>
        ) : (
          <>
            {value ? (
              <Amount className={cn("text-base font-medium", flash === "up" ? "text-success" : flash === "down" ? "text-destructive" : "text-foreground")}>{value}</Amount>
            ) : null}
            {changeLabel ? <Amount className={cn("text-sm", changeTone)}>{changeLabel}</Amount> : null}
          </>
        )}
      </View>
    </Pressable>
  );
}

export { AssetRow };
export type { AssetRowProps };
