// One agent turn for chat (K1: the same brain will serve voice): the person's messages and the injected context
// in, a UI message stream out. The caller persists the conversation in `onEnd`.
import {
  convertToModelMessages,
  createIdGenerator,
  isStepCount,
  streamText,
  toUIMessageStream,
  type UIMessage,
  type UIMessageStreamOnEndCallback,
} from "ai";

import type { CapabilityLine, WalletSummary } from "@kawase/api-client";

import type { AgentContext } from "./context";
import type { Models } from "./models";
import { instructions } from "./prompt";
import { buildTools } from "./tools";

/** Tool calls and replies in one turn before it stops (a guard against loops). */
const MAX_STEPS = 6;
const MESSAGE_ID_SIZE = 16;
/** Keeps the cacheable prefix keyed for the provider (OpenAI prompt caching). */
const PROMPT_CACHE_KEY = "kawase-agent-chat-v1";
/**
 * OpenAI Fast mode (formerly priority processing; docs guides/priority-processing): the person is waiting on every turn.
 * Measured 2026-10-02 on gpt-5.6-luna with the real prompt and tools: first word median 3.4 s → 2.5 s, whole turns
 * 2.5–7.8 s → 1.7–4.1 s. About twice the standard token price (~$0.0005 a turn); cached input keeps its discount.
 */
const SERVICE_TIER = "priority";

const messageId = createIdGenerator({ prefix: "msg", size: MESSAGE_ID_SIZE });

/** Where a turn's time goes (logged by the caller): the first thing the person sees (a word or a tool's step chip) and each step. */
export type TurnTimings = { onFirstChunk?: (ms: number) => void; onStep?: (ms: number, toolNames: string[]) => void };

export type TurnInput = {
  models: Models;
  context: AgentContext;
  messages: UIMessage[];
  /** HMAC key for tool approvals (spike 7): a client cannot forge or edit one. */
  approvalSecret: string;
  onEnd: UIMessageStreamOnEndCallback<UIMessage>;
  onError: (error: unknown) => void;
  abortSignal?: AbortSignal | undefined;
  timings?: TurnTimings | undefined;
  /** The wallet read at the start of a voice turn, given to the model as one line (no tool round trip). */
  wallet?: WalletSummary | undefined;
  /** What works on each network, read at the start of a voice turn, so "what can you do?" is answered in one step. */
  capabilities?: CapabilityLine[] | undefined;
};

export async function agentTurn({
  models,
  context,
  messages,
  approvalSecret,
  onEnd,
  onError,
  abortSignal,
  timings,
  wallet,
  capabilities,
}: TurnInput) {
  const startedAt = Date.now();
  let firstChunk = true;
  let stepStartedAt = startedAt;
  const tools = buildTools(context);
  const voice = context.surface === "voice";
  // Talking: the voice role's model, with the least reasoning — the person is waiting in silence.
  const model = models.forRole(voice ? "agentVoice" : "agentChat");
  // Only reasoning models take a reasoning effort (gpt-4.1 and gpt-4o refuse it).
  const reasons = typeof model === "object" && /^(gpt-5|gpt-6|o\d)/.test(model.modelId);
  const result = streamText({
    model,
    instructions: instructions(context, new Date(), wallet, capabilities),
    messages: await convertToModelMessages(messages, { tools, ignoreIncompleteToolCalls: true }),
    tools,
    experimental_toolApprovalSecret: approvalSecret,
    stopWhen: isStepCount(MAX_STEPS),
    ...(abortSignal ? { abortSignal } : {}),
    // Short answers fast: little reasoning, terse text (spike 7: most latency was reasoning).
    providerOptions: {
      openai: {
        ...(reasons ? { reasoningEffort: voice ? "none" : "low", textVerbosity: "low" } : {}),
        promptCacheKey: voice ? `${PROMPT_CACHE_KEY}-voice` : PROMPT_CACHE_KEY,
        serviceTier: SERVICE_TIER,
      },
    },
    onError: ({ error }) => onError(error),
    onChunk: ({ chunk }) => {
      if (!firstChunk || (chunk.type !== "text-delta" && chunk.type !== "tool-call")) return;
      firstChunk = false;
      timings?.onFirstChunk?.(Date.now() - startedAt);
    },
    onStepFinish: (step) => {
      timings?.onStep?.(Date.now() - stepStartedAt, step.toolCalls.map((call) => call.toolName));
      stepStartedAt = Date.now();
    },
  });
  return toUIMessageStream({
    stream: result.stream,
    tools,
    originalMessages: messages,
    generateMessageId: messageId,
    onEnd,
    onError: (error) => {
      onError(error);
      return "error";
    },
  });
}
