// Native twin of 21st.dev shadcnui-blocks/timeline-05 "Process Timeline" (plan §C, 28381): a vertical rail of steps,
// a check in a filled disc for each finished one and its number for each to come. Kawase adds the live states a
// money tracker needs — the step running now (a spinner in the disc), one that failed (a cross, in the error colour)
// — and a trailing slot per step (an explorer link, an amount). Used by Withdraw's tracker and any multi-step move.
import { Check, X } from "lucide-react-native";
import * as React from "react";
import { ActivityIndicator, View } from "react-native";

import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

export type TimelineStepState = "done" | "active" | "pending" | "failed";

export type TimelineStep = {
  id: string;
  title: string;
  description?: string | undefined;
  state: TimelineStepState;
  trailing?: React.ReactNode;
};

const DISC = 32;

type ProcessTimelineProps = {
  steps: TimelineStep[];
  /** The spinner's colour (the theme's foreground). */
  spinnerColor: string;
  className?: string;
};

export function ProcessTimeline({ steps, spinnerColor, className }: ProcessTimelineProps) {
  return (
    <View className={cn("gap-0", className)} accessibilityRole="list">
      {steps.map((step, index) => {
        const last = index === steps.length - 1;
        return (
          <View key={step.id} className="flex-row gap-3" accessibilityRole="text" accessibilityLabel={`${index + 1}. ${step.title}${step.description ? `. ${step.description}` : ""}`}>
            <View className="items-center" style={{ width: DISC }}>
              <View
                className={cn(
                  "items-center justify-center rounded-full border",
                  step.state === "done" && "border-primary bg-primary",
                  step.state === "failed" && "border-destructive bg-destructive",
                  step.state === "active" && "border-foreground bg-secondary",
                  step.state === "pending" && "border-muted-foreground/40 bg-muted",
                )}
                style={{ width: DISC, height: DISC }}
              >
                {step.state === "done" ? (
                  <Icon as={Check} className="text-primary-foreground size-4" />
                ) : step.state === "failed" ? (
                  <Icon as={X} className="text-primary-foreground size-4" />
                ) : step.state === "active" ? (
                  <ActivityIndicator size="small" color={spinnerColor} />
                ) : (
                  <Text className="text-muted-foreground text-sm font-semibold">{index + 1}</Text>
                )}
              </View>
              {last ? null : <View className={cn("my-1 w-px flex-1", step.state === "done" ? "bg-primary" : "bg-border")} />}
            </View>
            <View className={cn("min-w-0 flex-1 flex-row items-start gap-2", last ? "pb-0" : "pb-5")}>
              <View className="min-w-0 flex-1 gap-0.5 pt-1">
                <Text className={cn("text-base font-semibold", step.state === "pending" ? "text-muted-foreground" : step.state === "failed" ? "text-destructive" : "text-foreground", TEXT_START)}>
                  {step.title}
                </Text>
                {step.description ? <Text className={cn("text-muted-foreground text-sm leading-5", TEXT_START)}>{step.description}</Text> : null}
              </View>
              {step.trailing ? <View className="pt-1">{step.trailing}</View> : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}
