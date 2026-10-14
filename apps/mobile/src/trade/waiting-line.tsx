// Waiting text (the premium bar's rule, Mitoshi's WaitingText): a short verb ("Pricing"), the seconds once it passes
// three, and "Still waiting · Retry" at about fifteen. Replaced by the Look lane's states kit when it lands.
import * as React from "react";
import { View } from "react-native";

import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { useT } from "@/i18n";

const TICK_MS = 1000;
const SHOW_SECONDS_AFTER = 3;
const STILL_WAITING_AFTER = 15;

export function WaitingLine({ verb, onRetry, className }: { verb: string; onRetry?: () => void; className?: string }) {
  const { t } = useT();
  const [seconds, setSeconds] = React.useState(0);
  React.useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - started) / TICK_MS)), TICK_MS);
    return () => clearInterval(timer);
  }, []);
  const still = seconds >= STILL_WAITING_AFTER;
  return (
    <View accessibilityLiveRegion="polite" className={cn("flex-row items-center gap-2", className)}>
      <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>
        {still ? t("desktop.stillWaiting") : seconds >= SHOW_SECONDS_AFTER ? t("desktop.waitingFor", { verb, seconds }) : verb}
      </Text>
      {still && onRetry ? (
        <Text accessibilityRole="button" onPress={onRetry} className="text-foreground text-sm font-semibold underline">
          {t("common.retry")}
        </Text>
      ) : null}
    </View>
  );
}
