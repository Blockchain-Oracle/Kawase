// Spike 1 device screen (temporary): Circle's React Native SDK on the Expo dev build.
// Each button asks the spike server for a challenge, then hands it to the native PIN sheet.
// Every SDK callback is shown here and posted to the server, so the exact shapes are recorded.
import { WalletSdk } from '@circle-fin/w3s-pw-react-native-sdk';
import { fetch as expoFetch } from 'expo/fetch';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const API = 'http://localhost:3021';
const STEPS = [
  { id: 'new-user', title: '1 · Set a PIN and create a wallet', note: 'New test user. Pick any 6-digit PIN without repeats or runs (e.g. 135792), then two security questions.' },
  { id: 'sign', title: '2 · Sign a settings change', note: 'Enter the PIN you just chose.' },
  { id: 'transfer', title: '3 · Send 0.005 USDC', note: 'Uses the wallet from earlier today. Enter the PIN you set this morning in the browser.' },
] as const;

async function post(path: string, body?: unknown) {
  const res = await expoFetch(API + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  return res.json();
}

export function CircleScreen() {
  const [ready, setReady] = useState<string>('starting…');
  const [lines, setLines] = useState<string[]>([]);
  const log = (line: string) => setLines((prev) => [...prev, `${new Date().toLocaleTimeString()}  ${line}`]);

  useEffect(() => {
    (async () => {
      try {
        const config = await (await expoFetch(`${API}/config`)).json();
        await WalletSdk.init({ endpoint: config.endpoint, appId: config.appId, settingsManagement: { enableBiometricsPin: false } });
        const version = JSON.stringify(WalletSdk.sdkVersion);
        setReady(`SDK ready ${version}`);
        await post('/callback', { step: 'init', sdkVersion: WalletSdk.sdkVersion });
      } catch (error) {
        setReady(`init failed: ${String(error)}`);
        await post('/callback', { step: 'init', error: String(error) }).catch(() => undefined);
      }
    })();
  }, []);

  const run = async (step: string) => {
    try {
      const challenge = await post(`/${step}`);
      if (challenge.error) {
        log(`${step}: server error ${challenge.error}`);
        return;
      }
      log(`${step}: opening the PIN sheet`);
      await post('/callback', { step, challengeId: challenge.challengeId, started: true });
      WalletSdk.execute(
        challenge.userToken,
        challenge.encryptionKey,
        [challenge.challengeId],
        (success) => {
          log(`${step}: SUCCESS ${JSON.stringify(success.result)}`);
          post('/callback', { step, challengeId: challenge.challengeId, success })
            .then((r) => r.verified !== null && log(`${step}: server verified the signature = ${String(r.verified)}`))
            .catch(() => undefined);
        },
        (error) => {
          log(`${step}: ERROR ${error.code ?? ''} ${error.message}`);
          post('/callback', { step, challengeId: challenge.challengeId, error }).catch(() => undefined);
        }
      );
    } catch (error) {
      log(`${step}: ${String(error)}`);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <Text style={{ fontSize: 18, fontWeight: '700' }}>Spike 1 · Circle wallet SDK</Text>
        <Text style={{ color: '#555' }}>{ready}</Text>
        {STEPS.map((step) => (
          <View key={step.id} style={{ gap: 4 }}>
            <Pressable
              onPress={() => run(step.id)}
              style={({ pressed }) => ({ backgroundColor: pressed ? '#333' : '#111', borderRadius: 12, padding: 14 })}>
              <Text style={{ color: '#fff', fontWeight: '600', fontSize: 16 }}>{step.title}</Text>
            </Pressable>
            <Text style={{ color: '#555', fontSize: 13 }}>{step.note}</Text>
          </View>
        ))}
        <Text style={{ fontFamily: 'Menlo', fontSize: 11 }}>{lines.join('\n')}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}
