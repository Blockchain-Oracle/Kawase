// The fade under Home's bottom controls, web: one CSS gradient (see bottom-fade.tsx).
import { StyleSheet, View } from "react-native";

import { withAlpha } from "@/components/kit";

const SOLID_FROM_PERCENT = 55;

export function BottomFade({ height, color, edge = "bottom" }: { height: number; color: string; edge?: "top" | "bottom" }) {
  const gradient = `linear-gradient(to ${edge === "bottom" ? "bottom" : "top"}, ${withAlpha(color, 0)} 0%, ${color} ${SOLID_FROM_PERCENT}%, ${color} 100%)`;
  return <View pointerEvents="none" style={[styles.fade, edge === "bottom" ? styles.bottom : styles.top, { height, backgroundImage: gradient } as object]} />;
}

const styles = StyleSheet.create({ fade: { position: "absolute", start: 0, end: 0 }, bottom: { bottom: 0 }, top: { top: 0 } });
