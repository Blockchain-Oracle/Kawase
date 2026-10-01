// The setup stepper (journey 4, Solflare C08; C44 for errors): the steps a new wallet goes through, each a row
// with its state — waiting (a numbered ring), running (a spinner and the live line), done (a mint check), or
// failed (the reason and a Retry on the row itself, so the person never has to start over).
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";
import { Check } from "lucide-react-native";
import { ActivityIndicator, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

type SetupStepState = "waiting" | "running" | "done" | "failed";

type SetupStep = {
  key: string;
  label: string;
  state: SetupStepState;
  /** The live line while running ("Creating your wallet…"), or the reason when failed. */
  detail?: string;
  onRetry?: () => void;
};

type SetupStepsProps = {
  steps: readonly SetupStep[];
  retryLabel: string;
  /** Spinner colour (the muted-foreground token as hex). */
  spinnerColor: string;
  className?: string;
};

const RING = 28;
const STROKE = 3;

function SetupSteps({ steps, retryLabel, spinnerColor, className }: SetupStepsProps) {
  return (
    <View className={cn("bg-card border-border gap-1 rounded-3xl border p-2", className)}>
      {steps.map((step, i) => (
        <View key={step.key} accessibilityLiveRegion="polite" className="flex-row items-center gap-3 rounded-2xl px-3 py-3">
          <View className="items-center justify-center" style={{ width: RING, height: RING }}>
            {step.state === "done" ? (
              <Animated.View entering={FadeIn} className="bg-success items-center justify-center rounded-full" style={{ width: RING, height: RING }}>
                <Icon as={Check} className="text-background size-4" strokeWidth={STROKE} />
              </Animated.View>
            ) : step.state === "running" ? (
              <ActivityIndicator color={spinnerColor} />
            ) : (
              <View className={cn("items-center justify-center rounded-full border-2", step.state === "failed" ? "border-destructive" : "border-border")} style={{ width: RING, height: RING }}>
                <Text className={cn("text-xs font-bold", step.state === "failed" ? "text-destructive" : "text-muted-foreground")}>{i + 1}</Text>
              </View>
            )}
          </View>
          <View className="min-w-0 flex-1 gap-0.5">
            <Text className={cn("text-base font-semibold", step.state === "waiting" ? "text-muted-foreground" : "text-foreground", TEXT_START)}>{step.label}</Text>
            {step.detail ? <Text className={cn("text-sm", step.state === "failed" ? "text-destructive" : "text-muted-foreground", TEXT_START)}>{step.detail}</Text> : null}
          </View>
          {step.state === "failed" && step.onRetry ? (
            <Button size="sm" variant="secondary" onPress={step.onRetry}>
              <Text>{retryLabel}</Text>
            </Button>
          ) : null}
        </View>
      ))}
    </View>
  );
}

export { SetupSteps };
export type { SetupStep, SetupStepState, SetupStepsProps };
