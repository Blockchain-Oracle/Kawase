// Native twin of the composer built from ui-web's prompt-input (21st.dev ibelick/prompt-input):
// a growing text field with attach, talk and send.
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { cn, INPUT_TEXT_START } from "@kawase/ui-native/lib/utils";
import { ArrowUp, Mic, Paperclip } from "lucide-react-native";
import { TextInput, View } from "react-native";

type ComposerLabels = {
  placeholder: string;
  attach: string;
  talk: string;
  send: string;
};

type ComposerProps = {
  value: string;
  onValueChange: (value: string) => void;
  onSubmit: () => void;
  /** All visible and spoken text, so the caller can translate it. */
  labels: ComposerLabels;
  onAttach?: () => void;
  onTalk?: () => void;
  disabled?: boolean;
  className?: string;
};

function Composer({
  value,
  onValueChange,
  onSubmit,
  labels,
  onAttach,
  onTalk,
  disabled = false,
  className,
}: ComposerProps) {
  const canSend = !disabled && value.trim().length > 0;
  return (
    <View className={cn("border-border bg-card rounded-xl border p-2", className)}>
      <TextInput
        value={value}
        onChangeText={onValueChange}
        placeholder={labels.placeholder}
        placeholderTextColorClassName="accent-muted-foreground"
        editable={!disabled}
        multiline
        className={cn("text-foreground max-h-32 min-h-11 px-2 py-2 font-sans text-base", INPUT_TEXT_START)}
      />
      <View className="flex-row items-center justify-between pt-1">
        {onAttach ? (
          <Button variant="ghost" size="icon" accessibilityLabel={labels.attach} onPress={onAttach} className="size-11">
            <Icon as={Paperclip} className="size-5" />
          </Button>
        ) : (
          <View />
        )}
        <View className="flex-row items-center gap-1.5">
          {onTalk ? (
            <Button
              variant="secondary"
              size="icon"
              accessibilityLabel={labels.talk}
              onPress={onTalk}
              className="size-11"
            >
              <Icon as={Mic} className="size-5" />
            </Button>
          ) : null}
          <Button
            size="icon"
            accessibilityLabel={labels.send}
            disabled={!canSend}
            onPress={onSubmit}
            className="size-11"
          >
            <Icon as={ArrowUp} className="text-primary-foreground size-5" />
          </Button>
        </View>
      </View>
    </View>
  );
}

export { Composer };
export type { ComposerLabels, ComposerProps };
