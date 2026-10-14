// "Ask Kawase" on every screen (front door: screens back to the agent). Other lanes place this bar on their screens;
// it opens Home with the request already in the composer, unsent, carrying the screen's context ("Find a better rate
// for 25 USDC → EURC", "Make this a weekly automation"), so the person only presses Send. The owner never has to
// retype what the screen already knows. One quiet glass capsule with the 為替-style spark and the suggestion in words.
//
//   <AskKawaseBar prompt={t("swap.askPrompt", { amount, from, to })} />            a prefilled request
//   <AskKawaseBar prompt={t("token.askPrompt", { symbol })} label={t("token.ask")} />
import { useRouter } from "expo-router";
import { Sparkles } from "lucide-react-native";
import * as React from "react";
import { Pressable, StyleSheet, Text } from "react-native";

import { Icon, SIZE, SPACE, TYPE, useTheme } from "@/components/kit";
import { fire } from "@/feedback/fire";
import { useT } from "@/i18n";

const HALF = 2;

export function AskKawaseBar({ prompt, label }: { prompt: string; label?: string | undefined }) {
  const { t } = useT();
  const { color } = useTheme();
  const router = useRouter();
  const words = label ?? t("feed.ask.label");
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={words}
      accessibilityHint={t("feed.ask.hint", { prompt })}
      onPress={() => {
        fire("tick");
        router.navigate({ pathname: "/", params: { ask: prompt } });
      }}
      style={({ pressed }) => [styles.bar, { backgroundColor: pressed ? color.rowPressed : color.glassOpaque }]}
    >
      <Icon icon={Sparkles} size={SIZE.iconSm} tint={color.ink} />
      <Text numberOfLines={1} style={[TYPE.chipLabel, { color: color.ink }]}>
        {words}
      </Text>
      <Text numberOfLines={1} style={[TYPE.caption, styles.prompt, { color: color.text3 }]}>
        {prompt}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: "row", alignItems: "center", gap: SPACE.sm, minHeight: SIZE.touch, borderRadius: SIZE.touch / HALF, paddingHorizontal: SPACE.lg },
  prompt: { flex: 1 },
});
