// Voice on the web (Stage 10, next): the browser joins the same LiveKit room with livekit-client. Until that is
// built, the overlay stays honest — voice is on its way here, and typing works.
import { Keyboard } from "lucide-react-native";
import * as React from "react";
import { View } from "react-native";
import { type SharedValue } from "react-native-reanimated";

import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Text } from "@kawase/ui-native/components/ui/text";

import { useT } from "@/i18n";

export type VoiceSessionProps = { level: SharedValue<number>; onTypeInstead: (threadId: string | undefined) => void };

export function VoiceSession({ onTypeInstead }: VoiceSessionProps) {
  const { t } = useT();
  return (
    <View className="items-center gap-4">
      <Text className="font-display text-foreground text-center text-2xl font-bold">{t("voice.soon")}</Text>
      <Text className="text-muted-foreground text-center text-base">{t("voice.soonBody")}</Text>
      <Button variant="secondary" onPress={() => onTypeInstead(undefined)}>
        <Icon as={Keyboard} className="size-5" />
        <Text>{t("home.typeInstead")}</Text>
      </Button>
    </View>
  );
}
