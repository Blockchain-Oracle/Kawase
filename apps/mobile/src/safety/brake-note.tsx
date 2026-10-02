// The brake on a card (cards/automate-safety.md "Stay in control"): a risky action — more than half the balance to
// someone new, a price impact over the rule, leverage above 5× — shows this panel above its approve button, in the
// error colour with an icon (never colour alone). The action is not blocked: the person's Face ID on the button is
// their override, and the app sends it with the approval (the api refuses a braked approval without it).
import { OctagonAlert } from "lucide-react-native";
import * as React from "react";
import { View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

import { BRAKE_CODES, type PolicyResultView } from "@kawase/api-client";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { useT } from "@/i18n";

export function BrakeNote({ results, text }: { results: readonly PolicyResultView[]; text: (result: PolicyResultView) => string }) {
  const { t } = useT();
  const brakes = results.filter((entry) => BRAKE_CODES.includes(entry.code));
  if (!brakes.length) return null;
  return (
    <Animated.View entering={FadeIn} accessibilityRole="alert" className="bg-destructive/10 border-destructive/30 gap-1.5 rounded-2xl border px-4 py-3">
      <View className="flex-row items-center gap-2">
        <Icon as={OctagonAlert} className="text-destructive size-4" />
        <Text className={cn("text-destructive flex-1 text-sm font-semibold", TEXT_START)}>{t("safety.brakeTitle")}</Text>
      </View>
      {brakes.map((entry) => (
        <Text key={entry.code} className={cn("text-foreground text-sm leading-5", TEXT_START)}>
          {text(entry)}
        </Text>
      ))}
      <Text className={cn("text-muted-foreground text-xs leading-4", TEXT_START)}>{t("safety.brakeHint")}</Text>
    </Animated.View>
  );
}
