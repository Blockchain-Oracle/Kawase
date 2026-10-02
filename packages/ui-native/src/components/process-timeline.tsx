// A vertical process timeline (21st.dev 28381 · shadcnui-blocks "Process Timeline", timeline-05, as a native twin on
// Lime on Ink): a hairline down the left, one circle per step — a check when the step is done, its number while it
// waits, the lime ring on the step in progress, red for a step that failed — and the step's title, a muted line and a
// small meta (a time). Used for "why this happened" and multi-step trackers. Right-to-left mirrors with the layout.
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";
import { Check, X } from "lucide-react-native";
import { View } from "react-native";

import { Icon } from "@kawase/ui-native/components/ui/icon";

type StepState = "done" | "current" | "pending" | "failed";

type ProcessStep = {
  title: string;
  description?: string | undefined;
  meta?: string | undefined;
  state: StepState;
};

type ProcessTimelineProps = { steps: ProcessStep[]; className?: string };

const CIRCLE = 28;

function ProcessTimeline({ steps, className }: ProcessTimelineProps) {
  return (
    <View className={cn("gap-0", className)} accessibilityRole="list">
      {steps.map((step, index) => {
        const last = index === steps.length - 1;
        return (
          <View key={`${index}-${step.title}`} className="flex-row gap-3" accessibilityRole="text" accessibilityLabel={[step.title, step.description, step.meta].filter(Boolean).join(", ")}>
            <View className="items-center">
              <View
                className={cn(
                  "items-center justify-center rounded-full border",
                  step.state === "done" && "bg-primary border-primary",
                  step.state === "current" && "bg-card border-primary",
                  step.state === "pending" && "bg-muted border-border",
                  step.state === "failed" && "bg-destructive border-destructive",
                )}
                style={{ width: CIRCLE, height: CIRCLE }}
              >
                {step.state === "done" ? (
                  <Icon as={Check} className="text-primary-foreground size-4" />
                ) : step.state === "failed" ? (
                  <Icon as={X} className="text-background size-4" />
                ) : (
                  <Text className={cn("text-xs font-semibold", step.state === "current" ? "text-primary" : "text-muted-foreground")}>{index + 1}</Text>
                )}
              </View>
              {!last ? <View className="bg-border w-px flex-1" /> : null}
            </View>
            <View className={cn("min-w-0 flex-1 gap-0.5 pt-0.5", !last && "pb-5")}>
              <Text className={cn("text-foreground text-base font-semibold", TEXT_START)}>{step.title}</Text>
              {step.description ? <Text className={cn("text-muted-foreground text-sm leading-5", TEXT_START)}>{step.description}</Text> : null}
              {step.meta ? <Text className={cn("text-muted-foreground text-xs", TEXT_START)}>{step.meta}</Text> : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

export { ProcessTimeline };
export type { ProcessStep, ProcessTimelineProps, StepState };
