// The model's self-test (D10): one tiny tool call to the chat model, so a dead key, an empty balance or a retired model
// shows as "agent offline" on the phone before the person types, instead of a failed turn halfway through a money
// step. It costs a few dozen tokens: one short instruction, one tool with no input, the shortest answer.
import { generateText, isStepCount, tool } from "ai";
import { z } from "zod";

import type { Models } from "./models";

/** Long enough for a cold provider; short enough that a hung one counts as offline. */
const SELF_TEST_TIMEOUT_MS = 20_000;
const SELF_TEST_MAX_TOKENS = 256;

export type SelfTestResult = { ok: true; ms: number } | { ok: false; ms: number; reason: string };

/** Asks the chat model to call one tool; it passes only when the model really called it. */
export async function selfTestModel(models: Pick<Models, "forRole" | "hasKeyFor">, options: { signal?: AbortSignal | undefined } = {}): Promise<SelfTestResult> {
  const startedAt = Date.now();
  if (!models.hasKeyFor("agentChat")) return { ok: false, ms: 0, reason: "no_key" };
  let called = false;
  const model = models.forRole("agentChat");
  // Only reasoning models take an effort (as turn.ts): the least, so the tiny budget goes to the tool call.
  const reasons = typeof model === "object" && /^(gpt-5|gpt-6|o\d)/.test(model.modelId);
  try {
    await generateText({
      model,
      providerOptions: {
        openai: reasons ? { reasoningEffort: "none", textVerbosity: "low" } : {},
        google: { thinkingConfig: { thinkingLevel: "low" } },
      },
      instructions: "You are a health check. Call the ping tool once, then answer with the single word ok.",
      prompt: "ping",
      tools: {
        ping: tool({
          description: "Answers pong.",
          inputSchema: z.object({}),
          execute: async () => {
            called = true;
            return { pong: true };
          },
        }),
      },
      toolChoice: { type: "tool", toolName: "ping" },
      stopWhen: isStepCount(1),
      maxOutputTokens: SELF_TEST_MAX_TOKENS,
      maxRetries: 0,
      abortSignal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(SELF_TEST_TIMEOUT_MS)]) : AbortSignal.timeout(SELF_TEST_TIMEOUT_MS),
    });
  } catch (error) {
    return { ok: false, ms: Date.now() - startedAt, reason: reasonOf(error) };
  }
  return called ? { ok: true, ms: Date.now() - startedAt } : { ok: false, ms: Date.now() - startedAt, reason: "no_tool_call" };
}

/** A short, secret-free code for why the model is unreachable (logged and shown to support, never the raw error). */
function reasonOf(error: unknown): string {
  const status = (error as { statusCode?: number } | null)?.statusCode;
  if (typeof status === "number") return `http_${status}`;
  if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) return "timeout";
  return error instanceof Error ? error.name : "unknown";
}
