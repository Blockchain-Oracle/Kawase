// "Continue with Apple / Google" (Solflare S08, Phantom P01; Apple HIG and Google's sign-in branding): a full-width
// pill with the provider's real mark at the start. On the dark theme the button is white with the black Apple
// logo and Google's four-colour G; on the light theme Apple's button is black with the white logo and Google's
// stays white with a hairline, as both guidelines allow. While the provider's flow runs the button shows a spinner
// and the others are disabled by the caller.
import { Mark } from "@kawase/ui-native/components/mark";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn } from "@kawase/ui-native/lib/utils";
import { ActivityIndicator, Pressable, View } from "react-native";

type Provider = "apple" | "google";

type ProviderButtonProps = {
  provider: Provider;
  label: string;
  onPress: () => void;
  /** The app's colour scheme: the button picks the provider-approved style for it. */
  scheme: "light" | "dark";
  pending?: boolean;
  disabled?: boolean;
  className?: string;
};

const MARK_SIZE = 20;
const WHITE = "#FFFFFF";
const BLACK = "#000000";
const SPINNER_ON_WHITE = "#5F6368";

function ProviderButton({ provider, label, onPress, scheme, pending, disabled, className }: ProviderButtonProps) {
  const blackButton = provider === "apple" && scheme === "light";
  const background = blackButton ? BLACK : WHITE;
  const foreground = blackButton ? WHITE : BLACK;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || pending, busy: pending }}
      disabled={disabled || pending}
      onPress={onPress}
      className={cn("h-14 flex-row items-center justify-center gap-3 rounded-full px-6 active:opacity-80", !blackButton && scheme === "light" && "border-border border", (disabled || pending) && "opacity-60", className)}
      style={{ backgroundColor: background }}
    >
      {pending ? (
        <ActivityIndicator color={blackButton ? WHITE : SPINNER_ON_WHITE} />
      ) : (
        <View style={{ width: MARK_SIZE, height: MARK_SIZE }}>
          <Mark entity={`provider:${provider}`} size={MARK_SIZE} variant={provider === "apple" ? "mono" : "color"} tint={foreground} disc={false} />
        </View>
      )}
      <Text className="text-base font-semibold" style={{ color: foreground }}>
        {label}
      </Text>
    </Pressable>
  );
}

export { ProviderButton };
export type { Provider, ProviderButtonProps };
