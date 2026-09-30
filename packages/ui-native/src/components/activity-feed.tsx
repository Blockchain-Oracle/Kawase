// Native twin of ui-web's item-19 activity feed (21st.dev felipemenezes098/item-19), same props.
import { Amount } from "@kawase/ui-native/components/amount";
import { Separator } from "@kawase/ui-native/components/ui/separator";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn } from "@kawase/ui-native/lib/utils";
import type * as React from "react";
import { View } from "react-native";

type ActivityEvent = {
  id: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  time: string;
  amount?: string;
  tone?: "in" | "out" | "neutral";
};

type ActivityFeedProps = {
  events: ActivityEvent[];
  dense?: boolean;
  className?: string;
};

function ActivityFeed({ events, dense = false, className }: ActivityFeedProps) {
  return (
    <View role="list" className={cn("w-full", className)}>
      {events.map((event, index) => (
        <View key={event.id} role="listitem">
          <View className={cn("flex-row items-center", dense ? "gap-2.5 py-3" : "gap-4 p-4")}>
            <View className="border-border bg-muted size-8 items-center justify-center rounded-sm border">
              {event.icon}
            </View>
            <View className="min-w-0 flex-1 gap-1">
              <Text numberOfLines={1} className="text-sm font-medium leading-snug">
                {event.title}
              </Text>
              <Text numberOfLines={2} className="text-muted-foreground text-sm leading-normal">
                {event.description}
              </Text>
            </View>
            <View className="items-end gap-0.5">
              {event.amount ? (
                <Amount className={cn("text-sm", event.tone === "in" ? "text-success" : "text-foreground")}>
                  {event.amount}
                </Amount>
              ) : null}
              <Text className="text-muted-foreground text-xs">{event.time}</Text>
            </View>
          </View>
          {index < events.length - 1 ? <Separator /> : null}
        </View>
      ))}
    </View>
  );
}

export { ActivityFeed };
export type { ActivityEvent, ActivityFeedProps };
