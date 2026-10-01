// Native twin of the composer built from ui-web's prompt-input (21st.dev ibelick/prompt-input):
// a growing text field with attach, talk and send.
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { cn, INPUT_TEXT_START } from "@kawase/ui-native/lib/utils";
import { ArrowUp, Mic, Paperclip } from "lucide-react-native";

const WEB_NO_RESIZE = { resize: "none" } as object;
import * as React from "react";
import { Platform, TextInput, View } from "react-native";

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

/** How long after a send a returning whole message counts as iOS's autocorrect echo. */
const AUTOCORRECT_ECHO_MS = 400;
/** An autocorrection can shorten a word or two. */
const ECHO_SLACK_CHARS = 4;

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
  // iOS commits a pending autocorrection after the field was cleared on send, which would put the sent message
  // back ("arbitrum" returning as "Arboretum"). A change that brings back a whole message right after a send is
  // that echo, not typing, and is ignored.
  const sent = React.useRef<{ at: number; text: string } | undefined>(undefined);
  const submit = () => {
    sent.current = { at: Date.now(), text: value };
    onSubmit();
  };
  const change = (next: string) => {
    const last = sent.current;
    if (last && Date.now() - last.at < AUTOCORRECT_ECHO_MS && next.length >= last.text.trim().length - ECHO_SLACK_CHARS) return;
    onValueChange(next);
  };
  return (
    <View className={cn("border-border bg-card rounded-xl border p-2", className)}>
      <TextInput
        value={value}
        onChangeText={change}
        placeholder={labels.placeholder}
        placeholderTextColorClassName="accent-muted-foreground"
        editable={!disabled}
        multiline
        // A browser draws a resize handle on a textarea; the composer grows by itself instead.
        style={Platform.OS === "web" ? WEB_NO_RESIZE : undefined}
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
            onPress={submit}
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
