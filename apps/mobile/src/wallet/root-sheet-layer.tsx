// The web's root-level sheets (the approval confirm, the Google/Apple return) sit outside every screen's sheet layer, so
// the kit Sheet renders them in place: this layer lays them over the whole window. Without it the sheet would take a
// flex share of the root column (half the screen, with the scrim cut off).
import type * as React from "react";
import { StyleSheet, View } from "react-native";

export function RootSheetLayer({ children }: { children: React.ReactNode }) {
  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {children}
    </View>
  );
}
