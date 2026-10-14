/**
 * The sheets' layer: one host above every stack screen (the tab shell and its floating dock, pushed screens' headers),
 * where every `Sheet` renders, so its scrim covers the whole screen and nothing draws over its panel. While any sheet
 * is up the page beneath steps back to 0.96 (depth, not blur) and the dock stays hidden (`Sheet` holds it). A sheet
 * that lives in a native modal (a `(sheets)/` route, or an RN `Modal`) renders in place, since UIKit presents those above
 * this layer: `SheetInPlace` marks them (`SheetRoute` does it for the route sheets).
 */
import { createContext, type ReactNode, useContext, useLayoutEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { interpolate, type SharedValue, useAnimatedStyle, useSharedValue } from "react-native-reanimated";

import { RADIUS, SHEET_PARENT_SCALE } from "@/components/kit/theme";

interface Portal {
  set: (id: string, node: ReactNode) => void;
  remove: (id: string) => void;
  /** 0 with no sheet up, 1 with one fully open: the page under it steps back with this. */
  depth: SharedValue<number>;
  /** How many sheets are mounted (the depth follows the sheet that is moving only when it is the only one). */
  count: SharedValue<number>;
}

const PortalContext = createContext<Portal | null>(null);
const InPlaceContext = createContext(false);

/** Wraps the stack; the layer renders right after it, under the toasts and the other root hosts. */
export function SheetPortalProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<readonly { id: string; node: ReactNode }[]>([]);
  const depth = useSharedValue(0);
  const count = useSharedValue(0);
  const portal = useMemo<Portal>(
    () => ({
      depth,
      count,
      set: (id, node) =>
        setEntries((prev) => {
          const at = prev.findIndex((e) => e.id === id);
          if (at < 0) return [...prev, { id, node }];
          const next = [...prev];
          next[at] = { id, node };
          return next;
        }),
      remove: (id) => setEntries((prev) => prev.filter((e) => e.id !== id)),
    }),
    [depth, count],
  );
  useLayoutEffect(() => {
    count.set(entries.length);
    if (entries.length === 0) depth.set(0);
  }, [entries.length, count, depth]);
  const page = useAnimatedStyle(() => {
    const d = depth.get();
    return {
      transform: [{ scale: interpolate(d, [0, 1], [1, SHEET_PARENT_SCALE]) }],
      borderRadius: interpolate(d, [0, 1], [0, RADIUS.lg]),
      overflow: d > 0 ? "hidden" : "visible",
    };
  });
  return (
    <PortalContext.Provider value={portal}>
      <Animated.View style={[styles.fill, page]}>{children}</Animated.View>
      <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
        {entries.map((e) => (
          <View key={e.id} pointerEvents="box-none" style={StyleSheet.absoluteFill}>
            {e.node}
          </View>
        ))}
      </View>
    </PortalContext.Provider>
  );
}

/** Sheets under this render where they are (inside an RN `Modal` or a native modal route). */
export function SheetInPlace({ children }: { children: ReactNode }) {
  return <InPlaceContext.Provider value>{children}</InPlaceContext.Provider>;
}

export function useSheetInPlace(): boolean {
  return useContext(InPlaceContext);
}

/** The shared depth of the sheet layer, for a sheet to drive while it opens and closes; null outside a host. */
export function useSheetDepth(): { depth: SharedValue<number>; count: SharedValue<number> } | null {
  const portal = useContext(PortalContext);
  return portal ? { depth: portal.depth, count: portal.count } : null;
}

/** Renders `node` in the root layer while mounted (re-sent on every render, so it stays current). */
export function SheetPortal({ id, children }: { id: string; children: ReactNode }) {
  const portal = useContext(PortalContext);
  useLayoutEffect(() => {
    portal?.set(id, children);
  });
  useLayoutEffect(() => () => portal?.remove(id), [portal, id]);
  return portal ? null : children;
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
