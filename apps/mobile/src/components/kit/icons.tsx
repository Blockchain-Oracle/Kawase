// The kit's icons: Lucide (already in the app), one stroke, one size scale. Real brand, token and chain marks come from
// @kawase/identity, never from here; these are utility glyphs only (chevrons, search, delete, check).
import {
  Activity,
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Clock,
  CloudOff,
  Delete,
  Home,
  Inbox,
  LineChart,
  MessageCircle,
  Plus,
  RotateCw,
  Search,
  Settings,
  TriangleAlert,
  X,
  type LucideIcon,
} from "lucide-react-native";
import type * as React from "react";

import { SIZE, useTheme } from "./theme";

export {
  Activity,
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Clock,
  CloudOff,
  Delete,
  Home,
  Inbox,
  LineChart,
  MessageCircle,
  Plus,
  RotateCw,
  Search,
  Settings,
  TriangleAlert,
  X,
};
export type SymbolIcon = LucideIcon;
export type SymbolProps = React.ComponentProps<LucideIcon>;

/** A decorative utility glyph in the theme's ink (or the colour given). Never a stand-in for a real mark. */
export function Icon({
  icon: Glyph,
  size = SIZE.icon,
  tint,
  strokeWidth = SIZE.iconStroke,
}: {
  icon: SymbolIcon;
  size?: number;
  tint?: string;
  strokeWidth?: number;
}) {
  const { color } = useTheme();
  return <Glyph size={size} strokeWidth={strokeWidth} color={tint ?? color.ink} aria-hidden />;
}
