// The first-steps checklist (S4, Kawase's own): the handful of things a new account does once — create the
// account, set up the wallet, get funded, send a first payment — as a card on home (the optional allowance is not
// a step: it is offered on its own, review R09). Done steps are ticked and struck through; the first open step
// carries the screen's one main action (a 44 pt target); an optional "Step 2 of 4" sits beside the label; the
// card disappears when everything is done.
import { Eyebrow } from "@kawase/ui-native/components/eyebrow";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn } from "@kawase/ui-native/lib/utils";
import { Check, type LucideIcon } from "lucide-react-native";
import { View } from "react-native";

type FirstStep = {
  key: string;
  label: string;
  done: boolean;
  /** The action shown on the first open step. */
  action?: { label: string; icon?: LucideIcon; onPress: () => void; busy?: boolean };
};

type FirstStepsProps = {
  /** The eyebrow ("First steps"). */
  label: string;
  /** Where the person is ("Step 2 of 4"), beside the eyebrow. */
  progressLabel?: string;
  steps: readonly FirstStep[];
  className?: string;
};

const ICON_STROKE = 3;

function FirstSteps({ label, progressLabel, steps, className }: FirstStepsProps) {
  const current = steps.findIndex((step) => !step.done);
  if (current === -1) return null;
  return (
    <View role="list" className={cn("bg-card border-border gap-3 rounded-2xl border p-5", className)}>
      <View className="flex-row items-center justify-between gap-3">
        <Eyebrow>{label}</Eyebrow>
        {progressLabel ? <Text className="text-muted-foreground text-xs font-semibold">{progressLabel}</Text> : null}
      </View>
      {steps.map((step, index) => {
        const isCurrent = index === current;
        return (
          <View key={step.key} role="listitem" className="flex-row items-center gap-3">
            <View
              className={cn(
                "size-6 items-center justify-center rounded-full",
                step.done ? "bg-success" : isCurrent ? "border-accent border-2" : "border-border border-2",
              )}
            >
              {step.done ? (
                <Icon as={Check} className="text-background size-4" strokeWidth={ICON_STROKE} />
              ) : (
                <Text className={cn("text-xs font-bold", isCurrent ? "text-accent" : "text-muted-foreground")}>{index + 1}</Text>
              )}
            </View>
            <Text className={cn("flex-1 text-base", step.done ? "text-muted-foreground line-through" : isCurrent ? "text-foreground font-medium" : "text-muted-foreground")}>
              {step.label}
            </Text>
            {isCurrent && step.action ? (
              <Button size="sm" className="h-11" onPress={step.action.onPress} disabled={step.action.busy} accessibilityLabel={step.action.label}>
                {step.action.icon ? <Icon as={step.action.icon} className="text-primary-foreground size-4" /> : null}
                <Text>{step.action.label}</Text>
              </Button>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

export { FirstSteps };
export type { FirstStep, FirstStepsProps };
