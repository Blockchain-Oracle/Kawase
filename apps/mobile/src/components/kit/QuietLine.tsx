import type { ReactNode } from "react";
import { StyleSheet, Text } from "react-native";
import { SPACE, TYPE, useTheme } from "./theme";

/**
 * The quiet empty state (Fomo F16 "No positions yet", F31 "No recent searches"; build brief §2): one centred line in
 * tertiary ink with air around it — no box, no illustration.
 */
export function QuietLine({ children }: { children: ReactNode }) {
  const { color } = useTheme();
  return <Text style={[TYPE.body, styles.line, { color: color.text3 }]}>{children}</Text>;
}

const styles = StyleSheet.create({
  line: { textAlign: "center", paddingVertical: SPACE.xxl },
});
