// The "or" divider before the social sign-in options (Solflare S08, method-list grammar): a hairline either side of
// a short muted word.
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn } from "@kawase/ui-native/lib/utils";
import { View } from "react-native";

function OrDivider({ label, className }: { label: string; className?: string }) {
  return (
    <View className={cn("flex-row items-center gap-3 py-1", className)} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View className="bg-border h-px flex-1" />
      <Text className="text-muted-foreground text-xs font-semibold uppercase">{label}</Text>
      <View className="bg-border h-px flex-1" />
    </View>
  );
}

export { OrDivider };
