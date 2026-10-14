// The fade under Home's bottom controls, web: one CSS gradient (see bottom-fade.tsx).
import { StyleSheet, View } from "react-native";

import { withAlpha } from "@/components/kit";

const SOLID_FROM_PERCENT = 55;

export function BottomFade({ height, color }: { height: number; color: string }) {
  const gradient = `linear-gradient(to bottom, ${withAlpha(color, 0)} 0%, ${color} ${SOLID_FROM_PERCENT}%, ${color} 100%)`;
  return <View pointerEvents="none" style={[styles.fade, { height, backgroundImage: gradient } as object]} />;
}

const styles = StyleSheet.create({ fade: { position: "absolute", start: 0, end: 0, bottom: 0 } });
