// Spike 08 screen (temporary route). Theme and direction come from the URL so screenshots need no taps:
//   /spike-ui?theme=light|dark|testnet|testnet-dark&dir=rtl
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView as RNSafeAreaView } from 'react-native-safe-area-context';
import { Uniwind, useUniwind, withUniwind } from 'uniwind';

import { Text } from '@/components/ui/text';
import { DEMO_SPEC, DEMO_SPEC_AR } from '@/spike/card-spec';
import { TransferCard } from '@/spike/transfer-card';

// Third-party components ignore className until they are wrapped once with withUniwind.
const SafeAreaView = withUniwind(RNSafeAreaView);

const THEMES = ['light', 'dark', 'testnet', 'testnet-dark'] as const;
type ThemeName = (typeof THEMES)[number];

export default function SpikeUi() {
  const params = useLocalSearchParams<{ theme?: string; dir?: string }>();
  const { theme } = useUniwind();
  const [pressed, setPressed] = useState<string | null>(null);
  const rtl = params.dir === 'rtl';

  useEffect(() => {
    if (params.theme && (THEMES as readonly string[]).includes(params.theme)) {
      Uniwind.setTheme(params.theme as ThemeName);
    }
  }, [params.theme]);

  return (
    <SafeAreaView className="bg-background flex-1">
      <ScrollView contentContainerClassName="items-center gap-6 p-6">
        <Text className="text-muted-foreground text-xs">
          spike08 · {Platform.OS} · theme={theme} · dir={rtl ? 'rtl' : 'ltr'} · pressed={pressed ?? '-'}
        </Text>
        <View className="flex-row flex-wrap justify-center gap-2">
          {THEMES.map((name) => (
            <Pressable
              key={name}
              onPress={() => Uniwind.setTheme(name)}
              className="border-border bg-secondary rounded-md border px-3 py-1.5">
              <Text className="text-secondary-foreground text-xs">{name}</Text>
            </Pressable>
          ))}
        </View>
        <View className="w-full items-center" style={{ direction: rtl ? 'rtl' : 'ltr' }} {...(Platform.OS === 'web' ? { dir: rtl ? 'rtl' : 'ltr' } : {})}>
          <TransferCard spec={rtl ? DEMO_SPEC_AR : DEMO_SPEC} onAction={setPressed} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
