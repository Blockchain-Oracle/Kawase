// The list row (F10 / F12 / F22 and the method-list grammar P02 / S07 / F20): a leading mark, icon or avatar; a title
// with an optional muted sub-line; a trailing value, badge, check or chevron. Rows sit in a `ListGroup` (a card
// with hairlines between rows) or stand alone as full-width rounded rows. The chevron mirrors in right-to-left.
import { Eyebrow } from "@kawase/ui-native/components/eyebrow";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Separator } from "@kawase/ui-native/components/ui/separator";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn } from "@kawase/ui-native/lib/utils";
import { Check, ChevronRight } from "lucide-react-native";
import * as React from "react";
import { Pressable, View } from "react-native";

type ListRowProps = {
  leading?: React.ReactNode;
  title: string;
  subtitle?: string;
  /** A value, badge or mark at the trailing end. */
  trailing?: React.ReactNode;
  /** A chevron: the row pushes a page or opens a sheet. */
  chevron?: boolean;
  /** A check mark: the row is the current choice. */
  selected?: boolean;
  onPress?: () => void;
  disabled?: boolean;
  /** Overrides the spoken label (defaults to the title and sub-line). */
  accessibilityLabel?: string;
  /** "button" by default; "radio" inside a chooser. */
  accessibilityRole?: "button" | "radio";
  /** A row on its own, outside a group. */
  standalone?: boolean;
  className?: string;
};

const ROW_MIN_HEIGHT = 56;

function ListRow({
  leading,
  title,
  subtitle,
  trailing,
  chevron = false,
  selected,
  onPress,
  disabled = false,
  accessibilityLabel,
  accessibilityRole = "button",
  standalone = false,
  className,
}: ListRowProps) {
  const state = selected === undefined ? { disabled } : { disabled, checked: selected };
  return (
    <Pressable
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel ?? (subtitle ? `${title}, ${subtitle}` : title)}
      accessibilityState={state}
      onPress={onPress}
      disabled={disabled || !onPress}
      className={cn(
        "flex-row items-center gap-3 px-4 py-3",
        onPress && "active:bg-muted",
        standalone && "bg-card border-border rounded-2xl border",
        disabled && "opacity-50",
        className,
      )}
      style={{ minHeight: ROW_MIN_HEIGHT }}
    >
      {leading ? <View className="items-center justify-center">{leading}</View> : null}
      <View className="min-w-0 flex-1 gap-0.5">
        <Text numberOfLines={1} className="text-foreground text-base font-medium">
          {title}
        </Text>
        {subtitle ? (
          <Text numberOfLines={2} className="text-muted-foreground text-sm">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing}
      {selected ? <Icon as={Check} className="text-accent size-5" strokeWidth={2.6} /> : null}
      {chevron ? <Icon as={ChevronRight} className="text-muted-foreground size-5 rtl:-scale-x-100" /> : null}
    </Pressable>
  );
}

type ListGroupProps = {
  /** An eyebrow above the group. */
  label?: string;
  children: React.ReactNode;
  className?: string;
};

/** A card of rows with hairlines between them. */
function ListGroup({ label, children, className }: ListGroupProps) {
  const rows = React.Children.toArray(children).filter(Boolean);
  return (
    <View className={cn("gap-2", className)}>
      {label ? <Eyebrow className="px-1">{label}</Eyebrow> : null}
      <View className="bg-card border-border overflow-hidden rounded-2xl border">
        {rows.map((row, index) => (
          <React.Fragment key={index}>
            {row}
            {index < rows.length - 1 ? <Separator className="ms-4" /> : null}
          </React.Fragment>
        ))}
      </View>
    </View>
  );
}

export { ListGroup, ListRow };
export type { ListGroupProps, ListRowProps };
