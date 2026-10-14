// The fade under Home's bottom controls (Grok's and ChatGPT's input bars sit on the page's own colour): the feed
// fades into the background behind the composer, the + and the dock, so rows never read through them. Native draws
// it with Skia; the web twin is a CSS gradient.
import { Canvas, LinearGradient, Rect, vec } from "@shopify/react-native-skia";
import * as React from "react";
import { StyleSheet, View } from "react-native";

import { withAlpha } from "@/components/kit";

/** Where the fade reaches the full page colour (a share of its height). */
const SOLID_FROM = 0.55;

export function BottomFade({ height, color }: { height: number; color: string }) {
  const [width, setWidth] = React.useState(0);
  return (
    <View
      pointerEvents="none"
      style={[styles.fade, { height }]}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    >
      {width > 0 ? (
        <Canvas style={StyleSheet.absoluteFill}>
          <Rect x={0} y={0} width={width} height={height}>
            <LinearGradient
              start={vec(0, 0)}
              end={vec(0, height)}
              colors={[withAlpha(color, 0), color, color]}
              positions={[0, SOLID_FROM, 1]}
            />
          </Rect>
        </Canvas>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({ fade: { position: "absolute", start: 0, end: 0, bottom: 0 } });
