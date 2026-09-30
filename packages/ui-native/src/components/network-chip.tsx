// The network is always named in words, never by colour alone (DESIGN.md).
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn } from "@kawase/ui-native/lib/utils";
import { Waypoints } from "lucide-react-native";
import { View, type StyleProp, type ViewStyle } from "react-native";

type NetworkChipProps = {
  /** For example "Arc" or "Arc Testnet". */
  label: string;
  className?: string;
};

function NetworkChip({ label, className }: NetworkChipProps) {
  return (
    <View className={cn("bg-network-surface flex-row items-center gap-1.5 rounded-full px-2.5 py-1", className)}>
      <Icon as={Waypoints} className="text-network size-3.5" />
      <Text className="text-network text-xs font-semibold">{label}</Text>
    </View>
  );
}

type TestnetStripProps = {
  /** For example "Testnet · no real money". */
  label: string;
  className?: string;
  /** For the top safe-area padding. */
  style?: StyleProp<ViewStyle>;
};

function TestnetStrip({ label, className, style }: TestnetStripProps) {
  return (
    <View
      accessibilityRole="header"
      style={style}
      className={cn("bg-network-surface items-center px-4 py-1.5", className)}
    >
      <Text className="text-network text-xs font-semibold">{label}</Text>
    </View>
  );
}

export { NetworkChip, TestnetStrip };
export type { NetworkChipProps, TestnetStripProps };
