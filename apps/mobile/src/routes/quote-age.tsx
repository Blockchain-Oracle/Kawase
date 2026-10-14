// How old the price is, and the fresh one it fetches on its own (premium bar: quote age + auto-requote): a small
// draining ring (the kit's CountdownRing, 21st.dev #1737) beside "Price from 12 s ago". When the ring empties the
// ticket asks every venue again (`onExpire`), once per quote; while that runs the line says "Getting a fresh price".
// A tap asks again at once. Paused (a slide in progress, the approval running, the app in the background) it holds still.
import * as React from "react";
import { AppState, Pressable, StyleSheet, Text, View } from "react-native";

import { CountdownRing, SIZE, SPACE, TYPE, useTheme } from "@/components/kit";
import { useT } from "@/i18n";

const MS = 1_000;
const RING = SIZE.markInline;
const RING_STROKE = 2;
const TICK_MS = 1_000;

export function QuoteAge({ quotedAt, ttlSeconds, refreshing, paused = false, onExpire }: { quotedAt: string; ttlSeconds: number; refreshing: boolean; paused?: boolean; onExpire: () => void }) {
  const { t } = useT();
  const { color } = useTheme();
  const quotedMs = Date.parse(quotedAt);
  const [now, setNow] = React.useState(() => Date.now());
  const [foreground, setForeground] = React.useState(AppState.currentState === "active");
  const asked = React.useRef<string | null>(null);
  const expire = React.useRef(onExpire);
  expire.current = onExpire;

  React.useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => setForeground(next === "active"));
    return () => subscription.remove();
  }, []);
  React.useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  const age = Math.max(0, Math.floor((now - quotedMs) / MS));
  const due = age >= ttlSeconds;
  React.useEffect(() => {
    if (!due || paused || refreshing || !foreground || asked.current === quotedAt) return;
    asked.current = quotedAt;
    expire.current();
  }, [due, paused, refreshing, foreground, quotedAt]);

  const from = quotedMs / MS;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={refreshing ? t("routes.refreshing") : t("routes.quoteAge", { seconds: age })}
      accessibilityHint={t("routes.refreshHint")}
      disabled={refreshing || paused}
      onPress={() => {
        asked.current = quotedAt;
        onExpire();
      }}
      style={styles.row}
    >
      <View style={styles.ring}>
        <CountdownRing fromSec={from} toSec={from + ttlSeconds} size={RING} stroke={RING_STROKE} />
      </View>
      <Text style={[TYPE.meta, { color: color.text2 }]}>{refreshing ? t("routes.refreshing") : t("routes.quoteAge", { seconds: age })}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: SPACE.xs, minHeight: SIZE.touch },
  ring: { width: RING, height: RING },
});
