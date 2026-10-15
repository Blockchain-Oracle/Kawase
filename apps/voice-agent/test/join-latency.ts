// How long "Talk to Kawase" takes to answer, measured the way the app joins: a guest asks the api for a voice session,
// joins the room with a (silent) microphone published at once, and we time the api call, the room connect, the worker
// joining and the first audible sound of its greeting. Then it leaves. One greeting's worth of model time per run.
// Run: KAWASE_API_URL=https://api.getkawase.xyz pnpm --filter @kawase/voice-agent exec tsx test/join-latency.ts
import { AudioFrame, AudioSource, AudioStream, LocalAudioTrack, Room, RoomEvent, TrackKind, TrackPublishOptions, TrackSource } from "@livekit/rtc-node";

const API = process.env.KAWASE_API_URL ?? "http://localhost:3023";
const SAMPLE_RATE = 16_000;
const FRAME_SAMPLES = 160;
const FRAME_MS = 10;
const LOUD = 600;
const GIVE_UP_MS = 45_000;
const json = (body: unknown, token?: string) => ({ method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });

const t0 = Date.now();
const mark = (label: string) => console.log(`${String(Date.now() - t0).padStart(6)} ms  ${label}`);

const guest = (await (await fetch(`${API}/auth/guest`, json({ device: { platform: "web", installationId: `join-latency-${Date.now()}` }, locale: "en" }))).json()) as { token: string };
mark("guest session");
const session = (await (await fetch(`${API}/voice/session`, json({}, guest.token))).json()) as { url: string; token: string; room: string };
if (!session.token) throw new Error(`no voice session: ${JSON.stringify(session)}`);
mark(`voice session (${session.room})`);

const room = new Room();
let heard = false;
const done = new Promise<void>((resolve) => {
  room.on(RoomEvent.ParticipantConnected, (participant) => mark(`participant joined: ${participant.identity}`));
  room.on(RoomEvent.TrackSubscribed, (track, _publication, participant) => {
    if (track.kind !== TrackKind.KIND_AUDIO) return;
    mark(`audio track from ${participant.identity}`);
    void (async () => {
      for await (const frame of new AudioStream(track, SAMPLE_RATE, 1)) {
        if (heard) break;
        let peak = 0;
        for (const sample of frame.data) peak = Math.max(peak, Math.abs(sample));
        if (peak > LOUD) {
          heard = true;
          mark("first audible greeting");
          resolve();
        }
      }
    })();
  });
});
await room.connect(session.url, session.token, { autoSubscribe: true, dynacast: false });
mark("room connected");
// The app publishes its microphone as soon as it joins; silence is enough for the worker to see one.
const source = new AudioSource(SAMPLE_RATE, 1);
const track = LocalAudioTrack.createAudioTrack("microphone", source);
const options = new TrackPublishOptions();
options.source = TrackSource.SOURCE_MICROPHONE;
await room.localParticipant!.publishTrack(track, options);
mark("microphone published");
const silence = new Int16Array(FRAME_SAMPLES);
const pump = setInterval(() => void source.captureFrame(new AudioFrame(silence, SAMPLE_RATE, 1, FRAME_SAMPLES)), FRAME_MS);

await Promise.race([done, new Promise((resolve) => setTimeout(resolve, GIVE_UP_MS))]);
if (!heard) mark("no greeting heard");
clearInterval(pump);
await room.disconnect();
process.exit(0);
