// The way into the share card from where people already are (Home's balance, Activity's header, a token, a position):
// a quiet pill with the share glyph. It opens /share with what to draw.
import { useRouter } from "expo-router";
import { Share2 } from "lucide-react-native";
import { Pressable, StyleSheet, Text } from "react-native";

import { WEB_HOVER_MUTED } from "@kawase/ui-native/lib/wide";

import { Icon } from "@/components/kit/icons";
import { SPACE, TYPE, useTheme } from "@/components/kit/theme";
import { fire } from "@/feedback/fire";
import { useT } from "@/i18n";

const PILL_H = 32;
const GLYPH = 14;

export type ShareTarget = { period?: "7d" | "30d" | "all"; token?: { chainId: number; address: string }; position?: string };

export function shareHref(target: ShareTarget) {
  const params: Record<string, string> = {};
  if (target.period) params.period = target.period;
  if (target.token) params.token = `${target.token.chainId}:${target.token.address}`;
  if (target.position) params.position = target.position;
  return { pathname: "/share" as const, params };
}

export function ShareCardChip({ target = {}, label }: { target?: ShareTarget; label?: string }) {
  const { t } = useT();
  const router = useRouter();
  const { color } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("shareCard.openLabel")}
      hitSlop={SPACE.sm}
      className={WEB_HOVER_MUTED}
      onPress={() => {
        fire("tick");
        router.push(shareHref(target));
      }}
      style={({ pressed }) => [styles.pill, { backgroundColor: pressed ? color.rowPressed : color.raised2 }]}
    >
      <Icon icon={Share2} size={GLYPH} tint={color.ink} />
      <Text numberOfLines={1} style={[TYPE.chipLabel, { color: color.ink }]}>
        {label ?? t("shareCard.open")}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: "row", alignItems: "center", gap: SPACE.xs, height: PILL_H, borderRadius: PILL_H, paddingHorizontal: SPACE.md },
});
