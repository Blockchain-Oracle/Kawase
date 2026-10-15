// Settings → Voice (plan §1.4): Kawase's voice (GPT-Live's voices), the speaking pace and whether it greets first.
// Saved to the account (PATCH /me) and read by the voice worker when the next conversation starts; every change saves
// at once and is undone on screen if the save fails. Each voice can be heard: its speaker chooses it and Kawase says
// hello in it right here, live, with no overlay and no microphone (Abu, 10-16: "it just talks"; five of the six voices
// exist only in GPT-Live, so there is no recording to play, and a real hello is the truest preview).
import { useRouter } from "expo-router";
import { ChevronLeft, Volume2 } from "lucide-react-native";
import * as React from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { toast } from "sonner-native";

import type { VoicePrefs } from "@kawase/api-client";
import { DEFAULT_VOICE_PREFS, GPT_LIVE_VOICES, VOICE_SPEEDS, type GptLiveVoice, type VoiceSpeed } from "@kawase/config";
import { ListGroup, ListRow } from "@kawase/ui-native/components/list-row";
import { SegmentedControl } from "@kawase/ui-native/components/segmented-control";
import { Button } from "@kawase/ui-native/components/ui/button";
import { Icon } from "@kawase/ui-native/components/ui/icon";
import { Switch } from "@kawase/ui-native/components/ui/switch";
import { Text } from "@kawase/ui-native/components/ui/text";
import { cn, TEXT_START } from "@kawase/ui-native/lib/utils";

import { useT } from "@/i18n";
import { useSession } from "@/session/session-provider";
import { useThemeColors } from "@/theme/use-theme-colors";
import { forgetVoiceSession } from "@/voice/prefetch";
import { useVoice, voiceStore } from "@/voice/voice-store";


const EDGE_INSET = 12;
const SPEED_LABEL: Record<VoiceSpeed, string> = {
  relaxed: "voiceSettings.speedRelaxed",
  normal: "voiceSettings.speedNormal",
  brisk: "voiceSettings.speedBrisk",
};
/** GPT-Live's voices are names, shown as names in every language. */
export const voiceName = (voice: string) => voice.charAt(0).toUpperCase() + voice.slice(1);

export function VoiceSettingsScreen() {
  const { t } = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, update } = useSession();
  const colors = useThemeColors();
  const stored = user?.voicePrefs ?? DEFAULT_VOICE_PREFS;
  const [prefs, setPrefs] = React.useState<VoicePrefs>(stored);
  React.useEffect(() => setPrefs(user?.voicePrefs ?? DEFAULT_VOICE_PREFS), [user?.voicePrefs]);

  const save = async (change: Partial<VoicePrefs>) => {
    const before = prefs;
    setPrefs({ ...prefs, ...change });
    try {
      await update({ voicePrefs: change });
      forgetVoiceSession();
      return true;
    } catch {
      setPrefs(before);
      toast.error(t("voiceSettings.saveFailed"));
      return false;
    }
  };

  const previewing = useVoice((state) => state.previewing);
  const hear = async (voice: GptLiveVoice) => {
    if (previewing) return;
    if (prefs.voice !== voice && !(await save({ voice }))) return;
    voiceStore.set({ previewing: voice });
  };

  return (
    <View className="bg-background flex-1">
      <View className="flex-row items-center gap-3 px-5" style={{ paddingTop: insets.top + EDGE_INSET }}>
        <Button
          variant="secondary"
          size="icon"
          accessibilityLabel={t("common.back")}
          className="size-11"
          onPress={() => router.back()}
        >
          <Icon as={ChevronLeft} className="size-5 rtl:-scale-x-100" />
        </Button>
        <Text accessibilityRole="header" className="font-display text-foreground text-2xl font-bold">
          {t("voiceSettings.title")}
        </Text>
      </View>
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-6 px-5 pt-5"
        contentContainerStyle={{ paddingBottom: insets.bottom + EDGE_INSET }}
      >
        <Text className={cn("text-muted-foreground text-base leading-6", TEXT_START)}>
          {t("voiceSettings.subtitle")}
        </Text>

        <View className="gap-2">
          <Text accessibilityRole="header" className={cn("text-foreground text-lg font-semibold", TEXT_START)}>
            {t("voiceSettings.voiceTitle")}
          </Text>
          <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{t("voiceSettings.hearHint")}</Text>
          <ListGroup>
            {GPT_LIVE_VOICES.map((voice) => (
              <ListRow
                key={voice}
                title={voiceName(voice)}
                selected={prefs.voice === voice}
                accessibilityRole="radio"
                onPress={() => void save({ voice })}
                trailing={
                  <Button
                    variant="secondary"
                    size="icon"
                    className="size-9 rounded-full"
                    accessibilityLabel={t("voiceSettings.hear", { name: voiceName(voice) })}
                    disabled={previewing !== null && previewing !== voice}
                    onPress={() => void hear(voice)}
                  >
                    {previewing === voice ? <ActivityIndicator size="small" color={colors.foreground} /> : <Icon as={Volume2} className="text-foreground size-4" />}
                  </Button>
                }
              />
            ))}
          </ListGroup>
        </View>

        <View className="gap-2">
          <Text accessibilityRole="header" className={cn("text-foreground text-lg font-semibold", TEXT_START)}>
            {t("voiceSettings.speedTitle")}
          </Text>
          <SegmentedControl
            label={t("voiceSettings.speedTitle")}
            value={prefs.speed}
            options={(Object.keys(VOICE_SPEEDS) as VoiceSpeed[]).map((speed) => ({
              value: speed,
              label: t(SPEED_LABEL[speed]),
            }))}
            onValueChange={(value) => void save({ speed: value as VoiceSpeed })}
          />
        </View>

        <ListGroup>
          <ListRow
            title={t("voiceSettings.autoSpeakTitle")}
            subtitle={t("voiceSettings.autoSpeakBody")}
            trailing={
              <Switch
                checked={prefs.autoSpeak}
                accessibilityLabel={t("voiceSettings.autoSpeakTitle")}
                onCheckedChange={(autoSpeak) => void save({ autoSpeak })}
              />
            }
          />
        </ListGroup>

        <Text className={cn("text-muted-foreground text-sm", TEXT_START)}>{t("voiceSettings.note")}</Text>
      </ScrollView>
    </View>
  );
}
