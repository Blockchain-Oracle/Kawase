// The desktop sidebar (Stage 13), ported from wensity's "Sidebar" on 21st.dev (id 31454,
// https://21st.dev/r/wensity/sidebar): a full-height column with a header, labelled sections of icon + label rows
// with an optional count, a pill behind the current row, a hover surface for mouse users, a focus ring for the
// keyboard, and a footer with the person. Kawase's material: Lime on Ink tokens, the active row's icon in the accent.
// The rows are tabs (selected or not) or, with `action`, buttons (the orb's "Talk", the money actions).
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";
import type { LucideIcon } from "lucide-react-native";
import * as React from "react";
import { Platform, Pressable, ScrollView, View } from "react-native";

type SidebarRow = {
  key: string;
  label: string;
  icon?: LucideIcon;
  /** A custom mark in place of the icon (the orb). */
  render?: () => React.ReactNode;
  badge?: number;
  /** Not available yet: the row says so ("Soon") and is disabled, as the phone's fan does. */
  soon?: string;
  /** Does something rather than going somewhere: a button, never the selected row. */
  action?: boolean;
  /** The row's own view (the voice overlay rises from it and gives focus back to it). */
  slotRef?: React.Ref<View>;
};

type SidebarSection = { key: string; label?: string; rows: readonly SidebarRow[] };

type AppSidebarProps = {
  sections: readonly SidebarSection[];
  activeKey: string;
  onPress: (key: string) => void;
  header?: React.ReactNode;
  footer?: React.ReactNode;
  /** The navigation's name for assistive tech. */
  label: string;
  width?: number;
  className?: string;
};

const WIDTH = 264;
const ICON_BOX = 20;
const BADGE_MAX = 99;
const ICON_STROKE_ACTIVE = 2.4;
const ICON_STROKE = 2;

const ROW_WEB = Platform.select({ web: "cursor-pointer outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring", default: "" });

function AppSidebar({ sections, activeKey, onPress, header, footer, label, width = WIDTH, className }: AppSidebarProps) {
  return (
    <View accessibilityRole="tablist" accessibilityLabel={label} className={cn("bg-background border-border h-full border-e", className)} style={{ width }}>
      {header ? <View className="gap-3 px-4 pb-3 pt-5">{header}</View> : null}
      <ScrollView className="flex-1" contentContainerClassName="gap-4 px-2 py-2">
        {sections.map((section) => (
          <View key={section.key} className="gap-0.5">
            {section.label ? (
              <Text className={cn("text-muted-foreground px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider", TEXT_START)}>{section.label}</Text>
            ) : null}
            {section.rows.map((row) => {
              const active = !row.action && row.key === activeKey;
              return (
                <Pressable
                  key={row.key}
                  ref={row.slotRef}
                  accessibilityRole={row.action ? "button" : "tab"}
                  accessibilityLabel={row.label}
                  accessibilityState={row.action ? { disabled: Boolean(row.soon) } : { selected: active }}
                  disabled={Boolean(row.soon)}
                  onPress={() => onPress(row.key)}
                  className={cn("flex-row items-center gap-3 rounded-xl px-3 py-2.5", active ? "bg-secondary" : "active:bg-muted", row.soon ? "opacity-60" : ROW_WEB)}
                >
                  <View className="items-center justify-center" style={{ width: ICON_BOX, height: ICON_BOX }}>
                    {row.render ? (
                      row.render()
                    ) : row.icon ? (
                      <Icon as={row.icon} className={cn("size-5", active ? "text-accent" : "text-muted-foreground")} strokeWidth={active ? ICON_STROKE_ACTIVE : ICON_STROKE} />
                    ) : null}
                  </View>
                  <Text numberOfLines={1} className={cn("flex-1 text-[15px] font-medium", active ? "text-foreground" : "text-muted-foreground", TEXT_START)}>
                    {row.label}
                  </Text>
                  {row.soon ? (
                    <View className="bg-muted rounded-full px-2 py-0.5">
                      <Text className="text-muted-foreground text-[11px] font-semibold">{row.soon}</Text>
                    </View>
                  ) : null}
                  {row.badge ? (
                    <View className="bg-accent min-w-5 items-center rounded-full px-1.5">
                      <Text className="text-accent-foreground text-[11px] font-bold">{row.badge > BADGE_MAX ? `${BADGE_MAX}+` : row.badge}</Text>
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        ))}
      </ScrollView>
      {footer ? <View className="border-border gap-2 border-t px-3 py-3">{footer}</View> : null}
    </View>
  );
}

export { AppSidebar };
export type { AppSidebarProps, SidebarRow, SidebarSection };
