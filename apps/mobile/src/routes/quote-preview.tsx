// What the amount gets you, before anything else is asked (Abu's 10-15 review: "connect at the end" — Mitoshi's
// ticket prices the bet signed out and only its button asks for sign-in). Under the amount on a phone: while the
// venues are asked, their marks and a live verb; once they answer, "You get ≈ 0.852 EURC" with the winner's mark, how
// many it beat and how fast, and a tap opens every venue (the same RouteList as the desktop column). The same
// streamed race as the desktop's LiveRace (POST /routes/race works on a guest session too), debounced per pause.
import type { RouteRaceRequest } from "@kawase/api-client";
import { Mark } from "@kawase/ui-native/components/mark";
import * as React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, useReducedMotion } from "react-native-reanimated";
import { formatUnits } from "viem";

import { Icon, ShimmerText, SIZE, SPACE, TIMING, TYPE, useTheme } from "@/components/kit";
import { ChevronDown } from "@/components/kit/icons";
import { fire } from "@/feedback/fire";
import { MarkStack } from "@/fund/sheet-parts";
import { useT } from "@/i18n";
import { useLocale } from "@/i18n/locale-provider";

import { liveRace } from "./race-source";
import { RouteList } from "./route-list";
import { useRouteRace } from "./use-route-race";

/** One race per pause in typing, as the desktop column (the venues' keyless budgets are shared). */
const DEBOUNCE_MS = 900;
const AMOUNT_DIGITS = 6;

function useDebounced<T>(value: T, ms: number): T {
  const [settled, setSettled] = React.useState(value);
  React.useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

export function QuotePreview({
  request,
  selected,
  onSelect,
}: {
  request: RouteRaceRequest | null;
  selected?: string | null;
  onSelect?: (venue: string) => void;
}) {
  const { t } = useT();
  const { locale } = useLocale();
  const { color } = useTheme();
  const reduced = useReducedMotion();
  const [open, setOpen] = React.useState(false);
  const key = request ? JSON.stringify(request) : null;
  const settled = useDebounced(key, DEBOUNCE_MS);
  const source = React.useMemo(() => (settled ? liveRace(JSON.parse(settled) as RouteRaceRequest) : null), [settled]);
  const { race, state, retry } = useRouteRace(source);
  if (!request) return null;
  const current = key === settled ? race : null;
  const best = current?.rows.find((row) => row.venue === (selected ?? current.best)) ?? null;
  const quoted = current?.rows.filter((row) => row.status === "quoted").length ?? 0;
  const total = current?.rows.length ?? 0;
  const amount = best?.receive
    ? `${new Intl.NumberFormat(locale, { maximumFractionDigits: AMOUNT_DIGITS }).format(Number(formatUnits(BigInt(best.receive.amount), best.receive.decimals)))} ${best.receive.symbol}`
    : null;

  return (
    <Animated.View
      entering={reduced ? undefined : FadeIn.duration(TIMING.selection)}
      style={[styles.plate, { backgroundColor: color.raised2 }]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        disabled={!current}
        onPress={() => {
          fire("tick");
          setOpen((value) => !value);
        }}
        style={styles.head}
      >
        {best ? (
          <Mark entity={best.mark} size={SIZE.markToken} />
        ) : (
          <MarkStack entities={current?.rows.map((row) => row.mark) ?? []} size={SIZE.markChip} />
        )}
        <View style={styles.grow}>
          {amount ? (
            <>
              <Text style={[TYPE.rowDetail, { color: color.text2 }]}>{t("routes.youGet")}</Text>
              <Text numberOfLines={1} style={[TYPE.rowAmount, { color: color.ink }]}>
                ≈ {amount}
              </Text>
              <Text numberOfLines={1} style={[TYPE.meta, { color: color.text3 }]}>
                {/* "Best of" counts the prices it beat; a lone quote says so (testnet: one venue of six has a pool). */}
                {quoted > 1 ? t("routes.bestOf", { venue: best!.label, count: quoted }) : t("routes.onlyQuote", { venue: best!.label, count: total })}
              </Text>
            </>
          ) : state === "error" && !current ? (
            <Pressable accessibilityRole="button" onPress={retry}>
              <Text style={[TYPE.rowDetail, { color: color.text2 }]}>{t("routes.errorTitle")}</Text>
            </Pressable>
          ) : (
            <ShimmerText style={[TYPE.rowDetail, { color: color.text2 }]}>
              {total > 0 ? t("routes.asking", { answered: quoted, total }) : t("routes.askingStart")}
            </ShimmerText>
          )}
        </View>
        {current ? (
          <View style={open ? styles.flip : undefined}>
            <Icon icon={ChevronDown} size={SIZE.iconSm} tint={color.text2} />
          </View>
        ) : null}
      </Pressable>
      {open && current ? (
        <Animated.View entering={reduced ? undefined : FadeIn.duration(TIMING.selection)}>
          <RouteList
            race={current}
            state={state}
            selected={selected ?? null}
            {...(onSelect ? { onSelect } : {})}
            onRetry={retry}
          />
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  plate: { borderRadius: SPACE.lg, padding: SPACE.md, gap: SPACE.md },
  head: { flexDirection: "row", alignItems: "center", gap: SPACE.md },
  grow: { flex: 1, minWidth: 0, gap: SPACE.xxs },
  flip: { transform: [{ rotate: "180deg" }] },
});
