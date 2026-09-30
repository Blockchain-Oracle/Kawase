// Spike 10 device screen (temporary route). Runs on mount, needs no taps, reports to the spike server.
//   /spike-auth?phase=1  guest → data → email OTP upgrade (data kept)
//   /spike-auth?phase=2  after an app restart: the session is restored from SecureStore, nothing is typed
import { expoClient } from '@better-auth/expo/client';
import { anonymousClient, emailOTPClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';
import { useLocalSearchParams } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { fetch as expoFetch } from 'expo/fetch';
import { useEffect, useRef, useState } from 'react';
import { Platform, ScrollView, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const API = 'http://localhost:3010';

const authClient = createAuthClient({
  baseURL: API,
  plugins: [
    expoClient({ scheme: 'kawase', storagePrefix: 'kawase', storage: SecureStore }),
    anonymousClient(),
    emailOTPClient(),
  ],
});

// App requests outside Better Auth carry the session as a Cookie header (Better Auth's Expo guide).
async function api(path: string, body?: unknown) {
  const cookie = await authClient.getCookie();
  const res = await expoFetch(API + path, {
    method: body ? 'POST' : 'GET',
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'omit',
  });
  return res.json();
}

async function run(phase: string) {
  const out: Record<string, unknown> = { file: 'device', phase, platform: Platform.OS, at: new Date().toISOString() };
  if (phase === '2') {
    const restored = await authClient.getSession();
    out.restoredSession = restored.data ? { id: restored.data.user.id, isAnonymous: restored.data.user.isAnonymous ?? false } : null;
    out.contacts = await api('/contacts');
    return out;
  }
  await authClient.signOut().catch(() => undefined);
  const guest = await authClient.signIn.anonymous();
  out.guest = guest.error ? { error: guest.error } : { id: guest.data?.user.id };
  const s1 = await authClient.getSession();
  out.guestSession = { isAnonymous: s1.data?.user.isAnonymous };
  out.cookieStored = Boolean(await authClient.getCookie());
  await api('/contacts', { name: 'Device-guest-contact' });
  out.guestContacts = await api('/contacts');

  const email = `device+${Date.now()}@example.com`;
  const sent = await authClient.emailOtp.sendVerificationOtp({ email, type: 'sign-in' });
  out.otpSent = !sent.error;
  const { otp } = await api(`/__test/otp?email=${encodeURIComponent(email)}`);
  const upgraded = await authClient.signIn.emailOtp({ email, otp });
  out.upgrade = upgraded.error ? { error: upgraded.error } : { id: upgraded.data?.user.id };
  const s2 = await authClient.getSession();
  out.accountSession = { id: s2.data?.user.id, isAnonymous: s2.data?.user.isAnonymous ?? false, email: s2.data?.user.email };
  out.accountContacts = await api('/contacts');
  return out;
}

export default function SpikeAuth() {
  // The param can arrive one render after mount, so nothing runs until it is present.
  const { phase } = useLocalSearchParams<{ phase?: string }>();
  const session = authClient.useSession();
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const ran = useRef(new Set<string>());

  useEffect(() => {
    if (!phase || ran.current.has(phase)) return;
    ran.current.add(phase);
    run(phase)
      .catch((error) => ({ file: 'device', phase, error: String(error) }))
      .then(async (out) => {
        console.log('[spike10]', JSON.stringify(out));
        setResult(out);
        await expoFetch(`${API}/__test/report`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(out),
        }).catch(() => undefined);
      });
  }, [phase]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 8 }}>
        <Text style={{ fontWeight: '700' }}>spike10 · phase {phase ?? '(waiting for ?phase=)'}</Text>
        <Text>useSession: {session.data ? `${session.data.user.email} (anonymous=${String(session.data.user.isAnonymous ?? false)})` : 'none'}</Text>
        <Text style={{ fontFamily: 'Menlo', fontSize: 11 }}>{result ? JSON.stringify(result, null, 2) : 'running…'}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}
