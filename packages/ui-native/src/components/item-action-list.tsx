// A list of items with an action each (21st.dev 28284 · sean0205 "Item Action List", as a native twin on Lime on Ink):
// outlined rows pairing a media slot (an icon or a mark), a title and a description, and one action button at the end
// (secondary, or primary/destructive when it is the thing to do). Used for devices to sign out, and option lists.
import { Button } from "@kawase/ui-native/components/ui/button";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";
import type * as React from "react";
import { View } from "react-native";

type ItemAction = {
  key: string;
  media?: React.ReactNode;
  title: string;
  description?: string | undefined;
  action?: { label: string; onPress: () => void; variant?: "secondary" | "default" | "destructive"; disabled?: boolean } | undefined;
};

type ItemActionListProps = { items: ItemAction[]; className?: string };

function ItemActionList({ items, className }: ItemActionListProps) {
  return (
    <View className={cn("gap-2", className)}>
      {items.map((item) => (
        <View key={item.key} className="border-border bg-card flex-row items-center gap-3 rounded-2xl border px-3.5 py-3">
          {item.media ? <View className="bg-muted size-9 items-center justify-center rounded-xl">{item.media}</View> : null}
          <View className="min-w-0 flex-1 gap-0.5">
            <Text numberOfLines={1} className={cn("text-foreground text-sm font-semibold", TEXT_START)}>
              {item.title}
            </Text>
            {item.description ? (
              <Text numberOfLines={2} className={cn("text-muted-foreground text-xs", TEXT_START)}>
                {item.description}
              </Text>
            ) : null}
          </View>
          {item.action ? (
            <Button size="sm" variant={item.action.variant ?? "secondary"} disabled={item.action.disabled} onPress={item.action.onPress}>
              <Text>{item.action.label}</Text>
            </Button>
          ) : null}
        </View>
      ))}
    </View>
  );
}

export { ItemActionList };
export type { ItemAction, ItemActionListProps };
