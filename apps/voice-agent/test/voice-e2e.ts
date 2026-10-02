// Voice end to end, without a phone (Stage 10 spikes 2 and 5, in miniature): a guest asks the api for a voice session,
// joins the LiveKit room with that token — which dispatches Kawase's worker — waits for the greeting, then *speaks* a
// question (ElevenLabs speech, published as the microphone). The worker hears it, asks Kawase's agent through the api,
// and speaks the answer back: we measure the time from the end of our speech to the first sound of the answer, and
// read the same thread over the api to see the spoken turn in the transcript. Needs the local api (PORT 3023) and the
// worker (`pnpm --filter @kawase/voice-agent dev`) running. Run: pnpm --filter @kawase/voice-agent e2e
import { config } from "dotenv";
import { AudioFrame, AudioSource, AudioStream, LocalAudioTrack, Room, RoomEvent, TrackKind, TrackPublishOptions, TrackSource } from "@livekit/rtc-node";

config({ path: new URL("../../../.env", import.meta.url).pathname, quiet: true });

const API = process.env.KAWASE_API_URL ?? "http://localhost:3023";
const QUESTION = process.argv[2] ?? "What can you do for me on Arc?";
const SAMPLE_RATE = 16_000;
const FRAME_SAMPLES = 160;
const LOUD = 600;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const json = (body: unknown, token?: string) => ({ method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });

const guest = (await (await fetch(`${API}/auth/guest`, json({ device: { platform: "web", installationId: `voice-e2e-${Date.now()}` }, locale: "en" }))).json()) as { token: string };
const session = (await (await fetch(`${API}/voice/session`, json({}, guest.token))).json()) as { url: string; token: string; room: string; threadId: string };
if (!session.token) throw new Error(`no voice session: ${JSON.stringify(session)}`);
console.log("room", session.room, "thread", session.threadId);

const speech = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/bIHbv24MWmeRgasZH58o?output_format=pcm_16000`, {
  method: "POST",
  headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY!, "content-type": "application/json" },
  body: JSON.stringify({ text: QUESTION, model_id: "eleven_flash_v2_5" }),
});
const pcm = new Int16Array(await speech.arrayBuffer());
console.log("question", JSON.stringify(QUESTION), `${(pcm.length / SAMPLE_RATE).toFixed(1)}s of speech`);

const room = new Room();
const startedAt = Date.now();
let lastLoud = 0;
let firstLoudAfter: number | undefined;
let speechEnded = 0;
const cards: unknown[] = [];
room.on(RoomEvent.TrackSubscribed, (track, _publication, participant) => {
  if (track.kind !== TrackKind.KIND_AUDIO) return;
  console.log(`subscribed to ${participant.identity}'s audio after ${Date.now() - startedAt} ms`);
  void (async () => {
    for await (const frame of new AudioStream(track, SAMPLE_RATE, 1)) {
      let peak = 0;
      for (const sample of frame.data) peak = Math.max(peak, Math.abs(sample));
      if (peak > LOUD) {
        lastLoud = Date.now();
        if (speechEnded && firstLoudAfter === undefined && lastLoud > speechEnded) firstLoudAfter = lastLoud;
      }
    }
  })();
});
await room.connect(session.url, session.token, { autoSubscribe: true, dynacast: false });
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
// The greeting: wait for it to start and to finish (1.5 s of quiet).
const joined = Date.now();
while (Date.now() - joined < 20_000 && (lastLoud === 0 || Date.now() - lastLoud < 1500)) await silence(100);
console.log(lastLoud ? `greeting heard ${lastLoud - joined} ms after joining` : "no greeting heard");

type Thread = { messages?: { role: string; parts: { type: string; text?: string }[] }[] };
const readThread = async () => (await (await fetch(`${API}/agent/threads/${session.threadId}`, { headers: { authorization: `Bearer ${guest.token}` } })).json()) as Thread;
const answered = (thread: Thread) => thread.messages?.some((message) => message.role === "assistant" && message.parts.some((part) => part.type === "text" && part.text?.trim()));

for (let i = 0; i + FRAME_SAMPLES <= pcm.length; i += FRAME_SAMPLES) await source.captureFrame(new AudioFrame(pcm.slice(i, i + FRAME_SAMPLES), SAMPLE_RATE, 1, FRAME_SAMPLES));
speechEnded = Date.now();
// GPT-Live may acknowledge at once and then pause while Kawase's turn runs, so the run ends only when the turn's answer
// is in the thread and the room has been quiet for a moment (or after the limit).
let answeredAt: number | undefined;
let lastPoll = 0;
while (Date.now() - speechEnded < 45_000 && (answeredAt === undefined || firstLoudAfter === undefined || Date.now() - lastLoud < 2500)) {
  await silence(100);
  if (answeredAt === undefined && Date.now() - lastPoll > 1000) {
    lastPoll = Date.now();
    if (answered(await readThread())) answeredAt = Date.now();
  }
}
console.log(firstLoudAfter ? `first sound (may be an acknowledgement; useful response unmeasured) ${firstLoudAfter - speechEnded} ms after the question ended` : "no answer heard");
console.log(answeredAt ? `Kawase's answer in the thread ${answeredAt - speechEnded} ms after the question ended` : "no answer in the thread");
console.log("cards", cards.map((card) => (card as { toolName: string }).toolName));

await wait(1500);
const thread = await readThread();
for (const message of thread.messages ?? []) console.log(`  ${message.role}:`, message.parts.filter((part) => part.type === "text").map((part) => part.text).join(" "));
await room.disconnect();
process.exit(firstLoudAfter && answeredAt ? 0 : 1);
