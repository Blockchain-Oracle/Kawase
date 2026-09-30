// Spike #7 device screen (canonical copy; temporarily placed at apps/mobile/src/app/spike-chat.tsx to run).
// useChat + DefaultChatTransport(expo/fetch) → spike server. Scenario, driven automatically so the run
// needs no taps:
//   1. a longer answer, counting incremental text updates (true streaming vs a buffered body);
//   2. "Send 5 USDC to Alex" → approval-requested → addToolApprovalResponse(approved) →
//      sendAutomaticallyWhen resumes → tool output + final text.
// Every transition is logged with the `[spike07]` prefix (visible in the Metro terminal).
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, isToolUIPart, lastAssistantMessageIsCompleteWithApprovalResponses } from 'ai';
import { fetch as expoFetch } from 'expo/fetch';
import { useEffect, useRef } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const API = 'http://localhost:8787/api/chat';
const LONG_PROMPT = 'In four short sentences, explain what USDC is. Do not call tools.';
const PAY_PROMPT = 'Send 5 USDC to Alex';
// Coolify/Traefik probe (HTTPS, gzip on): 12 SSE events 250 ms apart. Streaming = evenly spaced arrivals.
const PROBE_URL = 'https://f0gf53daqe2gqiuiz30g3hmi.84.46.247.92.sslip.io/sse';
const t0 = Date.now();
const log = (...args: unknown[]) => console.log('[spike07]', `+${Date.now() - t0}ms`, ...args);

// Module-level (outside the React Compiler's component scope): time SSE arrivals through Traefik.
async function runTraefikProbe() {
  const start = Date.now();
  log('traefik probe: fetching');
  const res = await expoFetch(PROBE_URL);
  log('traefik probe: headers', res.status, res.headers.get('content-encoding'));
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  const arrivals: number[] = [];
  let buf = '';
  let done = false;
  while (!done) {
    const chunk = await reader.read();
    done = chunk.done;
    if (chunk.value) buf += decoder.decode(chunk.value, { stream: true });
    let idx = buf.indexOf('\n\n');
    while (idx >= 0) {
      buf = buf.slice(idx + 2);
      arrivals.push(Date.now() - start);
      idx = buf.indexOf('\n\n');
    }
  }
  const gaps = arrivals.slice(1).map((t, k) => t - arrivals[k]);
  log('traefik probe', JSON.stringify({ status: res.status, encoding: res.headers.get('content-encoding'), events: arrivals.length, firstMs: arrivals[0], lastMs: arrivals.at(-1), gaps }));
}

export default function SpikeChat() {
  const { messages, sendMessage, addToolApprovalResponse, status, error } = useChat({
    transport: new DefaultChatTransport({ api: API, fetch: expoFetch as unknown as typeof globalThis.fetch }),
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
    onError: (e) => log('onError', e.message),
    onFinish: ({ message }) =>
      log('onFinish', JSON.stringify(message.parts.map((p) => ('state' in p ? `${p.type}:${p.state}` : p.type)))),
  });
  const step = useRef(0);
  const approved = useRef(new Set<string>());
  const textUpdates = useRef(0);
  const lastLen = useRef(0);

  useEffect(() => {
    log('globals', JSON.stringify({
      structuredClone: typeof globalThis.structuredClone,
      TextDecoderStream: typeof (globalThis as { TextDecoderStream?: unknown }).TextDecoderStream,
      TextEncoderStream: typeof (globalThis as { TextEncoderStream?: unknown }).TextEncoderStream,
      ReadableStream: typeof globalThis.ReadableStream,
    }));
    runTraefikProbe().catch((e) => log('traefik probe error', String(e)));
    step.current = 1;
    log('send 1 (long answer)');
    void sendMessage({ text: LONG_PROMPT });
  }, [sendMessage]);

  useEffect(() => log('status', status), [status]);


  useEffect(() => {
    const last = messages.at(-1);
    if (last?.role === 'assistant') {
      const len = last.parts.filter((p) => p.type === 'text').reduce((n, p) => n + p.text.length, 0);
      if (len !== lastLen.current) {
        textUpdates.current += 1;
        lastLen.current = len;
      }
    }
    for (const m of messages) {
      for (const p of m.parts) {
        if (isToolUIPart(p) && p.state === 'approval-requested' && !approved.current.has(p.approval.id)) {
          approved.current.add(p.approval.id);
          log('approval-requested', JSON.stringify(p.input), '→ approving');
          void addToolApprovalResponse({ id: p.approval.id, approved: true });
        }
        if (isToolUIPart(p) && p.state === 'output-available' && p.type === 'tool-propose_send') {
          log('tool output', JSON.stringify(p.output));
        }
      }
    }
  }, [messages, addToolApprovalResponse]);

  useEffect(() => {
    if (status !== 'ready') return;
    if (step.current === 1 && messages.length >= 2) {
      log('step 1 done: text updates while streaming =', textUpdates.current, 'final length =', lastLen.current);
      step.current = 2;
      textUpdates.current = 0;
      lastLen.current = 0;
      log('send 2 (payment)');
      void sendMessage({ text: PAY_PROMPT });
    } else if (step.current === 2 && approved.current.size > 0 && messages.at(-1)?.parts.some((p) => p.type === 'text')) {
      step.current = 3;
      log('DONE: approval round trip complete');
    }
  }, [status, messages, sendMessage]);

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <Text style={{ padding: 8, fontWeight: '700' }}>spike 07 · status: {status}{error ? ` · ${error.message}` : ''}</Text>
      <ScrollView style={{ flex: 1, paddingHorizontal: 8 }}>
        {messages.map((m) => (
          <View key={m.id} style={{ marginVertical: 6 }}>
            <Text style={{ fontWeight: '700' }}>{m.role}</Text>
            {m.parts.map((p, i) =>
              p.type === 'text' ? (
                <Text key={i}>{p.text}</Text>
              ) : isToolUIPart(p) ? (
                <Text key={i} style={{ color: '#888' }}>{`${p.type} · ${p.state}`}</Text>
              ) : null,
            )}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
