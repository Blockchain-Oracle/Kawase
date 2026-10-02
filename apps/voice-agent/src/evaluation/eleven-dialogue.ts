import { ReadableStream } from "node:stream/web";
const SYNTHESIS_TIMEOUT_MS = 30_000;

/** Isolated evaluation adapter for v4's dialogue protocol. The production Flash plugin uses a different URL. */
export function dialogueAudio(input: { text: string; voiceId: string; apiKey: string; signal?: AbortSignal }) {
  let socket: WebSocket;
  let finished = false;
  let cancelled = false;
  let cancelSynthesis = () => {};
  const output = new ReadableStream<Uint8Array>({
    start(controller) {
      socket = new WebSocket(
        "wss://api.elevenlabs.io/v1/text-to-dialogue/stream-input?model_id=eleven_v4_turbo&output_format=pcm_24000",
      );
      const timeout = setTimeout(() => fail(new Error("Dialogue synthesis timed out")), SYNTHESIS_TIMEOUT_MS);
      const abort = () => {
        if (finished) return;
        cancelled = true;
        fail(new Error("Dialogue synthesis cancelled"));
      };
      const clean = () => {
        clearTimeout(timeout);
        input.signal?.removeEventListener("abort", abort);
      };
      cancelSynthesis = () => {
        if (finished) return;
        cancelled = true;
        finished = true;
        clean();
        socket.close();
      };
      const fail = (error: Error) => {
        if (finished) return;
        finished = true;
        clean();
        controller.error(error);
        socket.close();
      };
      input.signal?.addEventListener("abort", abort, { once: true });
      socket.addEventListener("open", () => {
        if (finished) return;
        socket.send(JSON.stringify({ voices: [input.voiceId], xi_api_key: input.apiKey }));
        socket.send(JSON.stringify({ inputs: [{ text: input.text, voice_id: input.voiceId, new_turn: true }] }));
        socket.send(JSON.stringify({ close_socket: true }));
      });
      socket.addEventListener("message", (event) => {
        if (finished || cancelled) return;
        try {
          const frame = JSON.parse(String(event.data)) as { audio?: string; is_final?: boolean; error?: unknown };
          if (frame.error) return fail(new Error("Dialogue provider rejected the evaluation request"));
          if (frame.audio) controller.enqueue(Buffer.from(frame.audio, "base64"));
          if (frame.is_final) {
            finished = true;
            clean();
            controller.close();
            socket.close();
          }
        } catch {
          fail(new Error("Invalid dialogue audio response"));
        }
      });
      socket.addEventListener("error", () => fail(new Error("Dialogue connection failed")));
      socket.addEventListener("close", () => {
        if (!finished) fail(new Error("Dialogue closed before completion"));
      });
      if (input.signal?.aborted) abort();
    },
    cancel() {
      cancelSynthesis();
    },
  });
  return output;
}
