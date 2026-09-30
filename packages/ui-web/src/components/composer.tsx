// Kawase composition of ui/prompt-input (21st.dev ibelick/prompt-input): a growing text field with attach,
// talk and send. Same props as the native twin in ui-native.
import { ArrowUp, Mic, Paperclip } from "lucide-react";

import { Button } from "@kawase/ui-web/components/ui/button";
import { PromptInput, PromptInputAction, PromptInputActions, PromptInputTextarea } from "@kawase/ui-web/components/ui/prompt-input";
import { cn } from "@kawase/ui-web/lib/utils";

export interface ComposerLabels {
  placeholder: string;
  attach: string;
  talk: string;
  send: string;
}

export interface ComposerProps {
  value: string;
  onValueChange: (value: string) => void;
  onSubmit: () => void;
  /** All visible and spoken text, so the caller can translate it. */
  labels: ComposerLabels;
  onAttach?: () => void;
  onTalk?: () => void;
  disabled?: boolean;
  className?: string;
}

export function Composer({ value, onValueChange, onSubmit, labels, onAttach, onTalk, disabled = false, className }: ComposerProps) {
  const canSend = !disabled && value.trim().length > 0;
  return (
    <PromptInput value={value} onValueChange={onValueChange} onSubmit={onSubmit} className={cn("rounded-xl border border-border bg-card p-2", className)}>
      <PromptInputTextarea placeholder={labels.placeholder} disabled={disabled} className="min-h-[44px] text-foreground" />
      <PromptInputActions className="justify-between pt-1">
        {onAttach ? (
          <PromptInputAction tooltip={labels.attach}>
            <Button variant="ghost" size="icon" className="size-11" aria-label={labels.attach} onClick={onAttach}>
              <Paperclip className="size-5" />
            </Button>
          </PromptInputAction>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-1.5">
          {onTalk ? (
            <PromptInputAction tooltip={labels.talk}>
              <Button variant="secondary" size="icon" className="size-11" aria-label={labels.talk} onClick={onTalk}>
                <Mic className="size-5" />
              </Button>
            </PromptInputAction>
          ) : null}
          <PromptInputAction tooltip={labels.send}>
            <Button size="icon" className="size-11" aria-label={labels.send} disabled={!canSend} onClick={onSubmit}>
              <ArrowUp className="size-5" />
            </Button>
          </PromptInputAction>
        </div>
      </PromptInputActions>
    </PromptInput>
  );
}
