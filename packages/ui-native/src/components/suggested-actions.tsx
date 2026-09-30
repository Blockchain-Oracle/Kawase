// Native twin of ui-web's suggested-actions (21st.dev elements-/suggested-actions), same props.
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn } from "@kawase/ui-native/lib/utils";
import { Pressable, View } from "react-native";

type Suggestion = {
  label: string;
  prompt: string;
};

type SuggestedActionsProps = {
  suggestions: Suggestion[];
  onSelect?: (prompt: string) => void;
  className?: string;
};

function SuggestedActions({ suggestions, onSelect, className }: SuggestedActionsProps) {
  return (
    <View className={cn("flex-row flex-wrap gap-2", className)}>
      {suggestions.map((suggestion) => (
        <Pressable
          key={suggestion.prompt}
          role="button"
          onPress={() => onSelect?.(suggestion.prompt)}
          className="border-border bg-card active:bg-muted rounded-full border px-3 py-2"
        >
          <Text className="text-xs">{suggestion.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export { SuggestedActions };
export type { SuggestedActionsProps, Suggestion };
