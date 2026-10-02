# Voice evaluation — 2026-10-02

No production voice has been selected. The current Flash pipeline remains the baseline. This folder holds synthetic listening samples; no user recording was used to generate them.

## Component measurements

Run `pnpm --filter @kawase/voice-agent exec tsx test/voice-samples.ts /tmp/kawase-voice-samples` to regenerate. The complete ten-language matrix is in `../review-evidence/2026-10-02/voice-synthesis.json`. All 30 WAV files decoded as nonempty mono PCM audio. English, French, and Spanish samples are retained here for listening.

| Configuration | Languages synthesized | Median request → first decoded audio |
|---|---:|---:|
| Current baseline (Flash; OpenAI for Bengali/Urdu) | 10 | 595 ms |
| Kawase wording → Eleven v4 Turbo | 10 | 1,377 ms |
| Kawase wording → OpenAI mini TTS, Marin | 10 | 3,265 ms |

These are synthesis-component measurements, including connection startup. They do not measure end of user speech to useful response, warm conversation latency, or phone playback. The installed OpenAI plugin buffers the synthesis response before emitting frames. Naturalness, audible financial fidelity, barge-in, network resilience, and session cost are unmeasured.

| Language | Baseline | Eleven v4 Turbo | OpenAI Marin |
|---|---|---|---|
| English | [Listen](en-baseline.wav) | [Listen](en-eleven-v4-turbo.wav) | [Listen](en-openai-tts.wav) |
| French | [Listen](fr-baseline.wav) | [Listen](fr-eleven-v4-turbo.wav) | [Listen](fr-openai-tts.wav) |
| Spanish | [Listen](es-baseline.wav) | [Listen](es-eleven-v4-turbo.wav) | [Listen](es-openai-tts.wav) |

The sentence names ten USDC, Amina, Arc Testnet, review by card, and nothing sent. Synthesis success does not prove that listeners hear each fact accurately. The samples need multilingual listening review. The first standalone harness runs failed because SDK logger initialization and explicit API-key arguments were missing; those were harness defects, not provider availability results.

## Integration findings

The installed LiveKit ElevenLabs 1.9.1 plugin uses the older TTS streaming endpoint. v4 requires the separate dialogue protocol; the isolated `src/evaluation/eleven-dialogue.ts` adapter exercises that protocol without changing production. It still needs a production plugin lifecycle, connection reuse, interruption, and reconnect evaluation. See [ElevenLabs dialogue WebSocket guidance](https://elevenlabs.io/docs/eleven-api/guides/how-to/websockets/realtime-tdd).

GPT-Live client delegation is available in the installed OpenAI plugin. The isolated `test/gpt-live-delegation.ts` harness exercised four English synthetic fixtures, with no wallet account or money tools. It delegates to a controlled fixture, not Kawase's actual backend. First sound may include filler and cannot establish useful-response latency. See [OpenAI delegation guidance](https://developers.openai.com/api/docs/guides/live-delegation) and [LiveKit integration](https://docs.livekit.io/agents/models/realtime/plugins/gpt-live/).

| Fixture | First sound after synthetic speech | Listening sample |
|---|---:|---|
| Draft | 1,501 ms | [Listen](en-gpt-live-draft.wav) |
| Pending | 1,204 ms | [Listen](en-gpt-live-pending.wav) |
| Failed before submission | 2,135 ms | [Listen](en-gpt-live-failed.wav) |
| Balance | 1,485 ms | [Listen](en-gpt-live-balance.wav) |

Canonical and generated transcripts are in the matching `gpt-live-*.json` files. The pending fixture softened “Do not send it again” into “I wouldn’t send it again.” It also omitted the separate explicit sentence that the outcome was not confirmed, while retaining awaiting confirmation. This is a financial-wording concern requiring strict review. The failed and balance samples contain filler. These results do not pass the financial fidelity or useful-latency gates. No production recommendation is justified yet.

The deployed worker 63629f2 completed a synthetic greeting/capability-card/history smoke test. First sound after the synthetic question was approximately 6.8 seconds. The harness includes filler, so that does not establish useful-response latency or the 1.5-second acceptance target.

## Privacy dependency

LiveKit recording/upload is explicitly disabled. This does not establish provider zero retention: ElevenLabs documents retention by default and enterprise eligibility for zero-retention mode. Its realtime endpoint can warn that a request for zero retention was not applied and continue logging. The account subscription check returned Starter on 2026-10-02. Provider raw-audio retention therefore remains an open dependency, requiring verified entitlement or a passing alternative. See [provider retention policy](https://elevenlabs.io/docs/eleven-api/resources/zero-retention-mode) and [realtime warning contract](https://elevenlabs.io/docs/api-reference/speech-to-text/v-1-speech-to-text-realtime).

## Next acceptance work

Compare all four candidates on an actual phone over Wi-Fi and mobile data. Measure useful speech separately from filler, interruption-to-silence, tool completion, startup, and total session cost. Exercise corrections, balances, payment drafts, failures, reconnects, headphones, and Bluetooth. Reject changed amounts, recipients, assets, networks, approval rules, or outcomes. Keep the backend authoritative and card approval mandatory for voice payments. Only candidates passing those gates can receive a production recommendation.
