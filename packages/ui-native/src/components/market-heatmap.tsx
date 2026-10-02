// The Market Heatmap's native twin (21st.dev 30551 · ssychui): a squarified treemap where each tile's area is the
// market's weight (volume or cap) and its colour the day's move on a diverging scale — the hue says the direction,
// its strength how big. Tiles are views, so each one is a button with its own spoken summary; tapping opens the
// market. Same input, same map.
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn } from "@kawase/ui-native/lib/utils";
import * as React from "react";
import { Pressable, View, type LayoutChangeEvent } from "react-native";

type HeatTile = { key: string; label: string; weight: number; change: number | null; changeLabel?: string; accessibilityLabel: string; onPress?: () => void };

type MarketHeatmapProps = {
  tiles: readonly HeatTile[];
  height?: number;
  colors: { up: string; down: string; flat: string; text: string };
  className?: string;
};

type Placed = { x: number; y: number; w: number; h: number; tile: HeatTile };

const DEFAULT_HEIGHT = 220;
/** The change (percent) at which a tile's colour is at full strength. */
const FULL_STRENGTH_PCT = 10;
const MIN_ALPHA = 0.25;
const MAX_ALPHA = 0.9;
const GAP = 2;
const LABEL_MIN_WIDTH = 44;
const LABEL_MIN_HEIGHT = 28;
const CHANGE_MIN_HEIGHT = 44;
const HEX_ALPHA_MAX = 255;
const HEX = 16;
const HEX_PAIR = 2;
/** "#RRGGBB": the colour without any alpha. */
const RGB_LENGTH = 7;
const HALF_GAP = GAP / HEX_PAIR;

/** The squarify heuristic: the worst aspect ratio of a row laid along `side`. */
function worst(row: readonly number[], side: number, area: number) {
  const max = Math.max(...row);
  const min = Math.min(...row);
  const s2 = area * area;
  const l2 = side * side;
  return Math.max((l2 * max) / s2, s2 / (l2 * min));
}

function squarify(tiles: readonly HeatTile[], width: number, height: number): Placed[] {
  const sorted = [...tiles].filter((tile) => tile.weight > 0).sort((a, b) => b.weight - a.weight);
  const total = sorted.reduce((sum, tile) => sum + tile.weight, 0);
  if (total === 0) return [];
  const items = sorted.map((tile) => ({ area: (tile.weight / total) * width * height, tile }));
  const out: Placed[] = [];
  let rx = 0;
  let ry = 0;
  let rw = width;
  let rh = height;
  let index = 0;
  while (index < items.length) {
    const side = Math.min(rw, rh);
    const row = [items[index]!];
    let rowArea = items[index]!.area;
    let next = index + 1;
    while (next < items.length) {
      const grown = rowArea + items[next]!.area;
      if (worst([...row.map((item) => item.area), items[next]!.area], side, grown) > worst(row.map((item) => item.area), side, rowArea)) break;
      row.push(items[next]!);
      rowArea = grown;
      next++;
    }
    if (rw >= rh) {
      const columnWidth = rowArea / rh;
      let cy = ry;
      for (const item of row) {
        const tileHeight = item.area / columnWidth;
        out.push({ x: rx, y: cy, w: columnWidth, h: tileHeight, tile: item.tile });
        cy += tileHeight;
      }
      rx += columnWidth;
      rw -= columnWidth;
    } else {
      const rowHeight = rowArea / rw;
      let cx = rx;
      for (const item of row) {
        const tileWidth = item.area / rowHeight;
        out.push({ x: cx, y: ry, w: tileWidth, h: rowHeight, tile: item.tile });
        cx += tileWidth;
      }
      ry += rowHeight;
      rh -= rowHeight;
    }
    index = next;
  }
  return out;
}

/** `#RRGGBB` + an alpha for the strength of the move. */
function tint(hex: string, change: number | null) {
  if (change === null) return hex;
  const strength = Math.min(1, Math.abs(change) / FULL_STRENGTH_PCT);
  const alpha = Math.round((MIN_ALPHA + (MAX_ALPHA - MIN_ALPHA) * strength) * HEX_ALPHA_MAX);
  return `${hex.slice(0, RGB_LENGTH)}${alpha.toString(HEX).padStart(HEX_PAIR, "0")}`;
}

function MarketHeatmap({ tiles, height = DEFAULT_HEIGHT, colors, className }: MarketHeatmapProps) {
  const [width, setWidth] = React.useState(0);
  const placed = React.useMemo(() => (width > 0 ? squarify(tiles, width, height) : []), [tiles, width, height]);
  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);
  return (
    <View onLayout={onLayout} className={cn("relative overflow-hidden rounded-2xl", className)} style={{ height }}>
      {placed.map(({ x, y, w, h, tile }) => {
        const base = tile.change === null ? colors.flat : tile.change >= 0 ? colors.up : colors.down;
        return (
          <Pressable
            key={tile.key}
            accessibilityRole="button"
            accessibilityLabel={tile.accessibilityLabel}
            onPress={tile.onPress}
            className="absolute items-center justify-center overflow-hidden rounded-md active:opacity-80"
            style={{ left: x + HALF_GAP, top: y + HALF_GAP, width: Math.max(0, w - GAP), height: Math.max(0, h - GAP), backgroundColor: tint(base, tile.change) }}
          >
            {w >= LABEL_MIN_WIDTH && h >= LABEL_MIN_HEIGHT ? (
              <Text numberOfLines={1} className="text-xs font-semibold" style={{ color: colors.text }}>
                {tile.label}
              </Text>
            ) : null}
            {tile.changeLabel && w >= LABEL_MIN_WIDTH && h >= CHANGE_MIN_HEIGHT ? (
              <Text numberOfLines={1} className="font-mono text-[11px]" style={{ color: colors.text }}>
                {tile.changeLabel}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

export { MarketHeatmap };
export type { HeatTile, MarketHeatmapProps };
