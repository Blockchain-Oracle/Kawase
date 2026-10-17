// Voice end to end, without a phone (Stage 10 spikes 2 and 5, in miniature): a guest asks the api for a voice session,
// joins the LiveKit room with that token — which dispatches Kawase's worker — waits for the greeting, then *speaks* a
// question (ElevenLabs speech, published as the microphone). The worker hears it, asks Kawase's agent through the api,
// and speaks the answer back: we measure the time from the end of our speech to the first sound of the answer, and
// read the same thread over the api to see the spoken turn in the transcript. Needs the local api (PORT 3023) and the
// worker (`pnpm --filter @kawase/voice-agent dev`) running. Run: pnpm --filter @kawase/voice-agent e2e
import { config } from "dotenv";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AudioFrame, AudioSource, AudioStream, LocalAudioTrack, Room, RoomEvent, TrackKind, TrackPublishOptions, TrackSource } from "@livekit/rtc-node";

import { VOICE_TRACE_TOPIC, type VoiceTraceMarker } from "../src/trace";

config({ path: new URL("../../../.env", import.meta.url).pathname, quiet: true });

const API = process.env.KAWASE_API_URL ?? "http://localhost:3023";
const QUESTION = process.argv[2] ?? "What can you do for me on Arc?";
const FOLLOWUP = process.env.KAWASE_E2E_FOLLOWUP?.trim();
const SAMPLE_RATE = 16_000;
const FRAME_SAMPLES = 160;
const LOUD = 600;
const AUDIO_GAP_MS = 350;
// A cold worker process plus the GPT-Live connection can take ~20 s before the greeting: wait for it.
const GREETING_WAIT_MS = 40_000;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const json = (body: unknown, token?: string) => ({ method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });

const guest = (await (await fetch(`${API}/auth/guest`, json({ device: { platform: "web", installationId: `voice-e2e-${Date.now()}` }, locale: "en" }))).json()) as { token: string };
// KAWASE_E2E_VOICE=cinder (any GPT-Live voice) saves Settings → Voice first, to check the worker uses it.
if (process.env.KAWASE_E2E_VOICE)
  await fetch(`${API}/me`, { ...json({ voicePrefs: { voice: process.env.KAWASE_E2E_VOICE } }, guest.token), method: "PATCH" });
const session = (await (await fetch(`${API}/voice/session`, json({}, guest.token))).json()) as { url: string; token: string; room: string; threadId: string };
if (!session.token) throw new Error(`no voice session: ${JSON.stringify(session)}`);
console.log("room", session.room, "thread", session.threadId);

const synthesize = async (text: string) => {
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/bIHbv24MWmeRgasZH58o?output_format=pcm_16000`, {
    method: "POST",
    headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY!, "content-type": "application/json" },
    body: JSON.stringify({ text, model_id: "eleven_flash_v2_5" }),
  });
  if (!response.ok) throw new Error(`test speech synthesis failed: ${response.status}`);
  return new Int16Array(await response.arrayBuffer());
};
const pcm = await synthesize(QUESTION);
const followupPcm = FOLLOWUP ? await synthesize(FOLLOWUP) : undefined;
console.log("question", JSON.stringify(QUESTION), `${(pcm.length / SAMPLE_RATE).toFixed(1)}s of speech`);
if (FOLLOWUP) console.log("follow-up", JSON.stringify(FOLLOWUP));

const room = new Room();
const startedAt = performance.now();
let lastLoud = 0;
let firstLoudAfter: number | undefined;
let firstPostCompletionAudio: number | undefined;
let firstProgressAudio: number | undefined;
let secondAudioOnset: number | undefined;
let speechEnded = 0;
let followupSpeechStarted: number | undefined;
let followupFirstVoicedFrame: number | undefined;
let followupSpeechEnded: number | undefined;
let lastAssistantAudioDuringFollowup: number | undefined;
const cards: unknown[] = [];
const audioChunks: Buffer[] = [];
const transcriptions: { speaker: string; receivedAtMs: number; text: string }[] = [];
const markers: (VoiceTraceMarker & { receivedAtMs: number })[] = [];
let responseCompleteReceivedAt: number | undefined;
let progressReceivedAt: number | undefined;
room.on(RoomEvent.DataReceived, (payload, _participant, _kind, topic) => {
  if (topic !== VOICE_TRACE_TOPIC) return;
  const marker = JSON.parse(new TextDecoder().decode(payload)) as VoiceTraceMarker;
  if (marker.sessionId !== session.room) return;
  const receivedAtMs = performance.now();
  markers.push({ ...marker, receivedAtMs });
  if (marker.event === "agent_response_complete") responseCompleteReceivedAt = receivedAtMs;
  if (marker.event === "progress_commentary_sent") progressReceivedAt = receivedAtMs;
});
room.on(RoomEvent.TrackSubscribed, (track, _publication, participant) => {
  if (track.kind !== TrackKind.KIND_AUDIO) return;
  console.log(`subscribed to ${participant.identity}'s audio after ${Math.round(performance.now() - startedAt)} ms`);
  void (async () => {
    for await (const frame of new AudioStream(track, SAMPLE_RATE, 1)) {
      audioChunks.push(Buffer.from(new Uint8Array(frame.data.buffer, frame.data.byteOffset, frame.data.byteLength)));
      let peak = 0;
      for (const sample of frame.data) peak = Math.max(peak, Math.abs(sample));
      if (peak > LOUD) {
        const heardAt = performance.now();
        if (followupSpeechStarted !== undefined && followupSpeechEnded === undefined)
          lastAssistantAudioDuringFollowup = heardAt;
        if (speechEnded && firstLoudAfter === undefined && heardAt > speechEnded) firstLoudAfter = heardAt;
        if (responseCompleteReceivedAt !== undefined && firstPostCompletionAudio === undefined && heardAt > responseCompleteReceivedAt && heardAt - lastLoud > AUDIO_GAP_MS)
          firstPostCompletionAudio = heardAt;
        if (progressReceivedAt !== undefined && firstProgressAudio === undefined && heardAt > progressReceivedAt && heardAt - lastLoud > AUDIO_GAP_MS)
          firstProgressAudio = heardAt;
        if (followupSpeechEnded !== undefined && secondAudioOnset === undefined && heardAt > followupSpeechEnded && heardAt - lastLoud > AUDIO_GAP_MS)
          secondAudioOnset = heardAt;
        lastLoud = heardAt;
      }
    }
  })();
});
await room.connect(session.url, session.token, { autoSubscribe: true, dynacast: false });
room.registerTextStreamHandler("lk.transcription", (reader, participant) => {
  const receivedAt = performance.now();
  void reader.readAll().then((text) => {
    if (text.trim()) transcriptions.push({ speaker: participant.identity, receivedAtMs: receivedAt, text });
  });
});
room.localParticipant!.registerRpcMethod("kawase.card", async (data) => {
  cards.push(JSON.parse(data.payload));
  return "ok";
});
const source = new AudioSource(SAMPLE_RATE, 1);
const track = LocalAudioTrack.createAudioTrack("microphone", source);
const options = new TrackPublishOptions();
options.source = TrackSource.SOURCE_MICROPHONE;
await room.localParticipant!.publishTrack(track, options);

const silence = async (ms: number) => {
  for (let t = 0; t < ms; t += 10) await source.captureFrame(new AudioFrame(new Int16Array(FRAME_SAMPLES), SAMPLE_RATE, 1, FRAME_SAMPLES));
};
// The greeting: wait for it to start and to finish (1.5 s of quiet). The skip option
// remains useful for test sessions that explicitly disable automatic greetings.
const joined = performance.now();
if (process.env.KAWASE_E2E_SKIP_GREETING === "1") {
  while (performance.now() - joined < GREETING_WAIT_MS && room.remoteParticipants.size === 0) await silence(100);
  if (room.remoteParticipants.size === 0) throw new Error("voice worker did not join");
  await silence(1500);
  console.log("voice worker joined without an automatic greeting");
} else {
  while (performance.now() - joined < GREETING_WAIT_MS && (lastLoud === 0 || performance.now() - lastLoud < 1500)) await silence(100);
  console.log(lastLoud ? `greeting heard ${Math.round(lastLoud - joined)} ms after joining` : "no greeting heard");
  console.log("greeting transcript", JSON.stringify(transcriptions.filter((item) => item.speaker.startsWith("agent-"))));
}
await source.waitForPlayout();

type Thread = { messages?: { role: string; parts: { type: string; text?: string }[] }[] };
const readThread = async () => (await (await fetch(`${API}/agent/threads/${session.threadId}`, { headers: { authorization: `Bearer ${guest.token}` } })).json()) as Thread;
const answerCount = (thread: Thread) => thread.messages?.filter((message) => message.role === "assistant" && message.parts.some((part) => part.type === "text" && part.text?.trim())).length ?? 0;

const speak = async (samples: Int16Array, onFirstVoicedFrame?: (at: number) => void) => {
  let firstVoicedFrameSeen = false;
  for (let i = 0; i + FRAME_SAMPLES <= samples.length; i += FRAME_SAMPLES) {
    const frame = samples.slice(i, i + FRAME_SAMPLES);
    if (onFirstVoicedFrame && !firstVoicedFrameSeen) {
      for (const sample of frame) {
        if (Math.abs(sample) <= LOUD) continue;
        firstVoicedFrameSeen = true;
        onFirstVoicedFrame(performance.now());
        break;
      }
    }
    await source.captureFrame(new AudioFrame(frame, SAMPLE_RATE, 1, FRAME_SAMPLES));
  }
};
await speak(pcm);
console.log("queued question audio after capture", Math.round(source.queuedDuration), "ms");
await source.waitForPlayout();
speechEnded = performance.now();
// GPT-Live may acknowledge at once and then pause while Kawase's turn runs, so the run ends only when the turn's answer
// is in the thread and the room has been quiet for a moment (or after the limit).
let answeredAt: number | undefined;
let secondAnsweredAt: number | undefined;
let lastPoll = 0;
const deadline = speechEnded + (FOLLOWUP ? 75_000 : 45_000);
while (performance.now() < deadline) {
  await silence(100);
  if (followupPcm && firstPostCompletionAudio !== undefined && followupSpeechEnded === undefined && performance.now() - firstPostCompletionAudio > 250) {
    console.log("interrupting the first answer with the follow-up");
    await source.waitForPlayout();
    followupSpeechStarted = performance.now();
    await speak(followupPcm, (at) => { followupFirstVoicedFrame = at; });
    console.log("queued follow-up audio after capture", Math.round(source.queuedDuration), "ms");
    await source.waitForPlayout();
    followupSpeechEnded = performance.now();
  }
  if (performance.now() - lastPoll > 1000) {
    lastPoll = performance.now();
    const count = answerCount(await readThread());
    if (count >= 1 && answeredAt === undefined) answeredAt = performance.now();
    if (count >= 2 && secondAnsweredAt === undefined) secondAnsweredAt = performance.now();
  }
  const firstDone = answeredAt !== undefined && firstLoudAfter !== undefined && firstPostCompletionAudio !== undefined && markers.some((marker) => marker.event === "agent_response_complete");
  const secondRequest = markers.find((marker) => marker.event === "agent_request_started" && followupSpeechEnded !== undefined && marker.receivedAtMs >= followupSpeechEnded);
  const directSecondAnswer = followupSpeechEnded !== undefined && transcriptions.some((item) => item.speaker.startsWith("agent-") && item.receivedAtMs >= followupSpeechEnded);
  const secondDone = followupSpeechEnded !== undefined && (secondAnsweredAt !== undefined && markers.some((marker) => marker.turnId === secondRequest?.turnId && marker.event === "agent_response_complete") || directSecondAnswer) && secondAudioOnset !== undefined;
  if (firstDone && (!FOLLOWUP || secondDone) && performance.now() - lastLoud > 2500) break;
}
const request = markers.find((marker) => marker.event === "agent_request_started" && marker.receivedAtMs >= speechEnded);
const turnMarkers = markers.filter((marker) => marker.turnId === request?.turnId).sort((a, b) => a.sequence - b.sequence);
console.log("voice trace", JSON.stringify({
  sessionId: session.room,
  turnId: request?.turnId,
  events: [
    { event: "user_speech_ended", clientElapsedMs: 0 },
    ...turnMarkers.map(({ event, toolName, sequence, workerElapsedMs, receivedAtMs }) => ({ event, ...(toolName ? { toolName } : {}), sequence, clientElapsedMs: Math.round(receivedAtMs - speechEnded), workerElapsedMs })),
    ...(firstLoudAfter === undefined ? [] : [{ event: "first_audible_frame_received", clientElapsedMs: Math.round(firstLoudAfter - speechEnded) }]),
    ...(firstPostCompletionAudio === undefined ? [] : [{ event: "first_post_completion_audio_onset", clientElapsedMs: Math.round(firstPostCompletionAudio - speechEnded) }]),
    ...(firstProgressAudio === undefined ? [] : [{ event: "first_progress_audio_onset", clientElapsedMs: Math.round(firstProgressAudio - speechEnded) }]),
    ...(followupSpeechStarted === undefined ? [] : [{ event: "followup_audio_publication_started", clientElapsedMs: Math.round(followupSpeechStarted - speechEnded) }]),
    ...(followupFirstVoicedFrame === undefined ? [] : [{ event: "followup_first_voiced_frame_published", clientElapsedMs: Math.round(followupFirstVoicedFrame - speechEnded) }]),
    ...(followupSpeechEnded === undefined ? [] : [{ event: "followup_speech_ended", clientElapsedMs: Math.round(followupSpeechEnded - speechEnded) }]),
    ...(lastAssistantAudioDuringFollowup === undefined ? [] : [{ event: "last_audio_during_followup", clientElapsedMs: Math.round(lastAssistantAudioDuringFollowup - speechEnded) }]),
    ...(secondAudioOnset === undefined ? [] : [{ event: "followup_audio_onset", clientElapsedMs: Math.round(secondAudioOnset - speechEnded) }]),
  ],
}));
console.log(firstLoudAfter ? `first audible frame received ${Math.round(firstLoudAfter - speechEnded)} ms after the question ended (may be an acknowledgement)` : "no answer audio received");
console.log(firstPostCompletionAudio ? `first audio onset after the completed-answer marker ${Math.round(firstPostCompletionAudio - speechEnded)} ms after the question ended (useful-answer proxy)` : "no post-completion answer audio received");
if (progressReceivedAt !== undefined) console.log(firstProgressAudio ? `first audio onset after the progress marker ${Math.round(firstProgressAudio - speechEnded)} ms after the question ended (progress-audio proxy)` : "no progress audio onset detected");
console.log(answeredAt ? `Kawase's answer in the thread ${Math.round(answeredAt - speechEnded)} ms after the question ended` : "no answer in the thread");
console.log("cards", cards.map((card) => (card as { toolName: string }).toolName));
if (FOLLOWUP) {
  const secondRequest = markers.find((marker) => marker.event === "agent_request_started" && followupSpeechEnded !== undefined && marker.receivedAtMs >= followupSpeechEnded);
  console.log("follow-up markers", JSON.stringify(markers.filter((marker) => marker.turnId === secondRequest?.turnId).map((marker) => ({ event: marker.event, clientElapsedMs: Math.round(marker.receivedAtMs - speechEnded) }))));
  console.log("mic and transcript markers", JSON.stringify(markers.filter((marker) => marker.event === "mic_voiced_frame_received" || marker.event === "input_transcript_started" || marker.event === "input_transcript_stopped").map((marker) => ({ event: marker.event, clientElapsedMs: Math.round(marker.receivedAtMs - speechEnded) }))));
  console.log(lastAssistantAudioDuringFollowup === undefined ? "no assistant audio observed during the follow-up" : `assistant audio persisted for about ${Math.round(lastAssistantAudioDuringFollowup - (followupFirstVoicedFrame ?? followupSpeechStarted!))} ms after the first voiced follow-up frame was published`);
}
console.log("spoken transcript", JSON.stringify(transcriptions
  .filter((item) => item.receivedAtMs >= speechEnded)
  .map(({ speaker, receivedAtMs, text }) => ({ speaker, clientElapsedMs: Math.round(receivedAtMs - speechEnded), text }))));

const pcmOut = Buffer.concat(audioChunks);
const wav = Buffer.alloc(44 + pcmOut.length);
wav.write("RIFF", 0);
wav.writeUInt32LE(wav.length - 8, 4);
wav.write("WAVEfmt ", 8);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(SAMPLE_RATE, 24);
wav.writeUInt32LE(SAMPLE_RATE * 2, 28);
wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34);
wav.write("data", 36);
wav.writeUInt32LE(pcmOut.length, 40);
pcmOut.copy(wav, 44);
const recordingPath = join(tmpdir(), `kawase-voice-e2e-${Date.now()}.wav`);
await writeFile(recordingPath, wav);
console.log("audio recording", recordingPath);

await wait(1500);
const thread = await readThread();
for (const message of thread.messages ?? []) console.log(`  ${message.role}:`, message.parts.filter((part) => part.type === "text").map((part) => part.text).join(" "));
await room.disconnect();
const directSecondAnswer = followupSpeechEnded !== undefined && transcriptions.some((item) => item.speaker.startsWith("agent-") && item.receivedAtMs >= followupSpeechEnded);
process.exit(firstLoudAfter && firstPostCompletionAudio && answeredAt && turnMarkers.some((marker) => marker.event === "agent_response_complete") && (!FOLLOWUP || (followupSpeechEnded && secondAudioOnset && (secondAnsweredAt || directSecondAnswer))) ? 0 : 1);
