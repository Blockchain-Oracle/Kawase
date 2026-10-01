// The empty state (C44's "empty instruction", P22's illustrated "No recent sends"): a piece of Kawase artwork,
// a short title, one line of what will appear here or what to do, and the next action. Never a spinner, never a
// grey placeholder: an empty list is a designed state.
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn } from "@kawase/ui-native/lib/utils";
import type * as React from "react";
import { View } from "react-native";

type EmptyStateProps = {
  /** An art object (koban, paper plane, coin stack…) or a mark. */
  art?: React.ReactNode;
  title: string;
  body?: string;
  /** The next action, usually one Button. */
  action?: React.ReactNode;
  /** "page" centres it in the available space; "section" keeps it compact inside a card. */
  layout?: "page" | "section";
  className?: string;
};

function EmptyState({ art, title, body, action, layout = "page", className }: EmptyStateProps) {
  const page = layout === "page";
  return (
    <View className={cn("items-center", page ? "flex-1 justify-center gap-4 px-8" : "gap-3 px-4 py-6", className)}>
      {art ? <View className={cn("items-center justify-center", page ? "mb-2" : "")}>{art}</View> : null}
      <View className="items-center gap-1.5">
        <Text className={cn("font-display text-foreground text-center font-bold", page ? "text-2xl" : "text-lg")}>{title}</Text>
        {body ? <Text className="text-muted-foreground text-center text-base leading-6">{body}</Text> : null}
      </View>
      {action ? <View className="items-center pt-1">{action}</View> : null}
    </View>
  );
}

export { EmptyState };
export type { EmptyStateProps };
