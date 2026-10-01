// The @handle field (Phantom P05–P08, Fomo F04/F05): the `@` sits inside the field, a clear button appears once
// there is text, and a fixed-height line under the field carries the state — checking, the rule that is broken
// (red ×), or available (green ✓) — so the layout never jumps while the user types. The handle is always typed
// and shown left-to-right, whatever the app's language.
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn } from "@kawase/ui-native/lib/utils";
import { Check, X } from "lucide-react-native";
import { ActivityIndicator, Pressable, TextInput, View } from "react-native";

type HandleFieldState = "idle" | "checking" | "available" | "problem";

type HandleFieldProps = {
  value: string;
  onChangeText: (value: string) => void;
  state: HandleFieldState;
  /** What the state line says ("Available", "Already taken", "Checking…"); empty for idle. */
  message?: string;
  placeholder: string;
  /** "Clear", for the button's spoken label. */
  clearLabel: string;
  /** The field's spoken label. */
  label: string;
  maxLength: number;
  autoFocus?: boolean;
  onSubmit?: () => void;
  className?: string;
};

const STATE_LINE_HEIGHT = 24;
const ICON_STROKE = 3;

function HandleField({ value, onChangeText, state, message, placeholder, clearLabel, label, maxLength, autoFocus, onSubmit, className }: HandleFieldProps) {
  return (
    <View className={cn("gap-2", className)}>
      <View
        className={cn(
          "bg-muted h-16 flex-row items-center gap-1 rounded-2xl border px-4",
          state === "problem" ? "border-destructive" : state === "available" ? "border-success" : "border-transparent",
        )}
        // The handle reads left-to-right in every language.
        style={{ direction: "ltr" }}
      >
        <Text className="text-muted-foreground font-display text-2xl font-bold">@</Text>
        <TextInput
          accessibilityLabel={label}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColorClassName="accent-muted-foreground"
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          autoComplete="off"
          keyboardType="ascii-capable"
          returnKeyType="done"
          maxLength={maxLength}
          autoFocus={autoFocus}
          onSubmitEditing={onSubmit}
          className="text-foreground font-display h-full flex-1 text-left text-2xl font-bold"
          style={{ writingDirection: "ltr" }}
        />
        {value.length > 0 ? (
          <Pressable accessibilityRole="button" accessibilityLabel={clearLabel} onPress={() => onChangeText("")} hitSlop={12} className="bg-secondary size-7 items-center justify-center rounded-full">
            <Icon as={X} className="text-muted-foreground size-4" />
          </Pressable>
        ) : null}
      </View>
      <View accessibilityLiveRegion="polite" className="flex-row items-center gap-1.5 px-1" style={{ height: STATE_LINE_HEIGHT }}>
        {state === "checking" ? <ActivityIndicator size="small" /> : null}
        {state === "available" ? <Icon as={Check} className="text-success size-4" strokeWidth={ICON_STROKE} /> : null}
        {state === "problem" ? <Icon as={X} className="text-destructive size-4" strokeWidth={ICON_STROKE} /> : null}
        {message ? (
          <Text className={cn("text-sm", state === "available" ? "text-success" : state === "problem" ? "text-destructive" : "text-muted-foreground")}>{message}</Text>
        ) : null}
      </View>
    </View>
  );
}

export { HandleField };
export type { HandleFieldProps, HandleFieldState };
