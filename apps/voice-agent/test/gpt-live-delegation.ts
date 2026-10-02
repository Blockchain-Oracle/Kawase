// Isolated, synthetic delegation evaluation. No wallet account, tools, or money execution is attached.
// Uses the installed SDK's session configuration hooks; keep this harness version-coupled to LiveKit 1.9.1.
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { config } from "dotenv";
import { initializeLogger, llm } from "@livekit/agents";
import * as openai from "@livekit/agents-plugin-openai";
import { AudioFrame } from "@livekit/rtc-node";

config({ path: new URL("../../../.env", import.meta.url).pathname, quiet: true });
initializeLogger({ pretty: false, level: "silent" });
const out = resolve(process.argv[2] ?? "/tmp/kawase-gpt-live-delegation-20261002");
await mkdir(out, { recursive: true });
const fixtures = {
  draft: {
    canonical:
      "A payment draft is ready: 10 USDC to Amina on Arc Testnet. Tap the card to review and approve it. Nothing has been sent.",
    question: "Please prepare a payment of ten USDC to Amina on Arc Testnet.",
  },
  pending: {
    canonical:
      "Your payment of 10 USDC to Amina on Arc Testnet was submitted and is awaiting network confirmation. The outcome is not confirmed. Do not send it again. Check Activity for its status.",
    question: "Did my payment go through? Should I send it again?",
  },
  failed: {
    canonical:
      "The payment of 10 USDC to Amina on Arc Testnet failed before submission. Nothing was sent. Review the card before trying again.",
    question: "What happened to my payment?",
  },
  balance: {
    canonical:
      "Your available balance is 12.45 USDC on Arc Testnet. This is test money. You also hold 3 EURC. No balance is available for Arc mainnet in this result.",
    question: "What is my balance?",
  },
} as const;
const scenario = process.argv[3] ?? "draft";
if (!(scenario in fixtures)) throw new Error("Unknown evaluation scenario");
const { canonical, question } = fixtures[scenario as keyof typeof fixtures];
const rate = 24000;
const frameSamples = 240;
const began = performance.now();
let speechEnded: number | undefined;
let firstSound: number | undefined;
let lastSound: number | undefined;
let transcript = "";
let delegationCount = 0;
let providerError = false;
const pcm: Buffer[] = [];
const model = new openai.realtime.GPTLiveModel({
  apiKey: process.env.OPENAI_API_KEY,
  voice: "marin",
  delegation: "client",
  connOptions: { maxRetry: 0, retryIntervalMs: 1000, timeoutMs: 10_000 },
});
const session = model.session();
session.on("error", () => {
  providerError = true;
});
session.on("transcript_delta", ({ text }) => {
  transcript += text;
});
session.on("delegation_created", ({ id }) => {
  delegationCount += 1;
  // This controlled fixture measures paraphrasing. It does not establish integration with Kawase's backend.
  session.appendCommentary(canonical, { delegationId: id });
});
const collect = (async () => {
  for await (const { frame } of session.audioStream) {
    const bytes = Buffer.from(frame.data.buffer, frame.data.byteOffset, frame.data.byteLength);
    pcm.push(Buffer.from(bytes));
    if (speechEnded && frame.data.some((value) => Math.abs(value) > 600)) {
      lastSound = performance.now();
      firstSound ??= lastSound;
    }
  }
})();
let state = "unverified";
try {
  await session._updateSession(
    "You are Kawase. Delegate every wallet request to the client. Only the client knows wallet facts. Preserve all amounts, assets, recipients, networks, approval requirements and outcomes exactly. Speak briefly in English. Never claim a draft was sent.",
    new llm.ChatContext(),
    llm.ToolContext.empty(),
  );
  const response = await fetch(
    "https://api.elevenlabs.io/v1/text-to-speech/bIHbv24MWmeRgasZH58o?output_format=pcm_24000",
    {
      method: "POST",
      headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY!, "content-type": "application/json" },
      body: JSON.stringify({ text: question, model_id: "eleven_flash_v2_5" }),
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!response.ok) throw new Error("Synthetic input unavailable");
  const input = new Int16Array(await response.arrayBuffer());
  for (let offset = 0; offset + frameSamples <= input.length && !providerError; offset += frameSamples) {
    session.pushAudio(new AudioFrame(input.slice(offset, offset + frameSamples), rate, 1, frameSamples));
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  speechEnded = performance.now();
  while (
    !providerError &&
    performance.now() - speechEnded < 25_000 &&
    (!lastSound || performance.now() - lastSound < 2000)
  ) {
    session.pushAudio(new AudioFrame(new Int16Array(frameSamples), rate, 1, frameSamples));
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  state = providerError
    ? "provider-unavailable"
    : delegationCount && firstSound
      ? "synthetic-delegation-checked"
      : "no-complete-delegation";
} catch {
  state = "provider-or-harness-unavailable";
} finally {
  await session.close();
  await collect;
  await model.close();
  if (pcm.length) {
    const data = Buffer.concat(pcm);
    const header = Buffer.alloc(44);
    header.write("RIFF", 0);
    header.writeUInt32LE(36 + data.length, 4);
    header.write("WAVEfmt ", 8);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(1, 22);
    header.writeUInt32LE(rate, 24);
    header.writeUInt32LE(rate * 2, 28);
    header.writeUInt16LE(2, 32);
    header.writeUInt16LE(16, 34);
    header.write("data", 36);
    header.writeUInt32LE(data.length, 40);
    await writeFile(resolve(out, "en-gpt-live.wav"), Buffer.concat([header, data]));
  }
  await writeFile(
    resolve(out, "result.json"),
    JSON.stringify(
      {
        state,
        scenario,
        backendFixture: true,
        realBackendIntegration: false,
        rawUserAudio: false,
        canonical,
        transcript,
        delegationCount,
        firstSoundAfterSyntheticSpeechMs: firstSound && speechEnded ? firstSound - speechEnded : null,
        measurement:
          "Synthetic input to first sound, may include filler. Phone useful response and listening fidelity unmeasured.",
        durationMs: performance.now() - began,
        listeningAccepted: false,
        totalSessionCost: "unmeasured",
      },
      null,
      2,
    ) + "\n",
  );
  console.info("GPT-Live evaluation:", state);
}
