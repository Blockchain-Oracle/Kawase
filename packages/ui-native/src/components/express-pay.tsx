// Express wallets (21st.dev 25102 · felipemenezes098 "Express Wallets", payment-3, as a native twin on Lime on Ink):
// the platform's wallet button first — Apple Pay as a black pill with the Apple mark on iOS and the web, Google Pay as
// a white pill with its four-colour mark on Android and the web — then a hairline "or pay with card" divider and a
// secondary card button. Every button opens the same checkout (Circle's Onramp shows the methods the device has); the
// caller says which one was tapped.
import { Mark } from "@kawase/ui-native/components/mark";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn } from "@kawase/ui-native/lib/utils";
import { CreditCard } from "lucide-react-native";
import { Platform, Pressable, View } from "react-native";

type ExpressMethod = "apple_pay" | "google_pay" | "card";

type ExpressPayProps = {
  /** "Pay" on the wallet buttons, as the platforms word it. */
  payLabel: string;
  orCardLabel: string;
  cardLabel: string;
  onPay: (method: ExpressMethod) => void;
  disabled?: boolean;
  className?: string;
};

const MARK = 20;
const WHITE = "#FFFFFF";

function ExpressPay({ payLabel, orCardLabel, cardLabel, onPay, disabled, className }: ExpressPayProps) {
  const apple = Platform.OS === "ios" || Platform.OS === "web";
  const google = Platform.OS === "android" || Platform.OS === "web";
  return (
    <View className={cn("gap-3", className)}>
      {apple ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Apple Pay ${payLabel}`}
          disabled={disabled}
          onPress={() => onPay("apple_pay")}
          className={cn("h-12 flex-row items-center justify-center gap-1.5 rounded-full bg-black active:opacity-90", disabled && "opacity-50")}
        >
          <Mark entity="provider:apple" size={MARK} variant="mono" tint={WHITE} />
          <Text className="text-base font-semibold text-white">{payLabel}</Text>
        </Pressable>
      ) : null}
      {google ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Google Pay ${payLabel}`}
          disabled={disabled}
          onPress={() => onPay("google_pay")}
          className={cn("border-border h-12 flex-row items-center justify-center gap-1.5 rounded-full border bg-white active:opacity-90", disabled && "opacity-50")}
        >
          <Mark entity="provider:google" size={MARK} />
          <Text className="text-base font-semibold text-neutral-900">{payLabel}</Text>
        </Pressable>
      ) : null}
      <View className="flex-row items-center gap-3 py-1">
        <View className="bg-border h-px flex-1" />
        <Text className="text-muted-foreground text-xs">{orCardLabel}</Text>
        <View className="bg-border h-px flex-1" />
      </View>
      <Button variant="secondary" disabled={disabled} onPress={() => onPay("card")}>
        <Icon as={CreditCard} className="size-4" />
        <Text>{cardLabel}</Text>
      </Button>
    </View>
  );
}

export { ExpressPay };
export type { ExpressMethod, ExpressPayProps };
