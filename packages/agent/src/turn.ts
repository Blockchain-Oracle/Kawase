// One agent turn for chat (K1: the same brain will serve voice): the person's messages and the injected context
// in, a UI message stream out. The caller persists the conversation in `onEnd`.
import {
  convertToModelMessages,
  createIdGenerator,
  isStepCount,
  streamText,
  toUIMessageStream,
  type TextStreamPart,
  type ToolSet,
  type UIMessage,
  type UIMessageStreamOnEndCallback,
} from "ai";

import type { WalletSummary } from "@kawase/api-client";

import type { AgentContext } from "./context";
import { factsUsed } from "./intelligence";
import type { Models } from "./models";
import { instructions } from "./prompt";
import { buildTools } from "./tools";

/** Tool calls and replies in one turn before it stops (a guard against loops). */
const MAX_STEPS = 6;
const MESSAGE_ID_SIZE = 16;
/** Keeps the cacheable prefix keyed for the provider (OpenAI prompt caching). */
const PROMPT_CACHE_KEY = "kawase-agent-chat-v1";

const messageId = createIdGenerator({ prefix: "msg", size: MESSAGE_ID_SIZE });

/** Where a turn's time goes (logged by the caller at debug): the model's first token and each step. */
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
};

/** What a turn said and did, read off its stream as it passes (for noticing which remembered fact it used). */
function watchTurn() {
  let replyText = "";
  let toolInputs = "";
  let toolOutputs = "";
  const stream = new TransformStream<TextStreamPart<ToolSet>, TextStreamPart<ToolSet>>({
    transform(part, controller) {
      if (part.type === "text-delta") replyText += part.text;
      else if (part.type === "tool-call") toolInputs += ` ${JSON.stringify(part.input)}`;
      else if (part.type === "tool-result") toolOutputs += ` ${JSON.stringify(part.output)}`;
      controller.enqueue(part);
    },
  });
  return { stream, seen: () => ({ replyText, toolInputs, toolOutputs }) };
}

export async function agentTurn({ models, context, messages, approvalSecret, onEnd, onError, abortSignal, timings, wallet }: TurnInput) {
  const startedAt = Date.now();
  let firstChunk = true;
  let stepStartedAt = startedAt;
  const tools = buildTools(context);
  const voice = context.surface === "voice";
  // What the person asked Kawase to remember (A5); a failed read never stops the turn.
  const memory = await context.intelligence.memory().catch(() => []);
  const watch = watchTurn();
  // Talking: the voice role's model, with the least reasoning — the person is waiting in silence.
  const model = models.forRole(voice ? "agentVoice" : "agentChat");
  // Only reasoning models take a reasoning effort (gpt-4.1 and gpt-4o refuse it).
  const reasons = typeof model === "object" && /^(gpt-5|gpt-6|o\d)/.test(model.modelId);
  const result = streamText({
    model,
    instructions: instructions(context, new Date(), wallet, { memory }),
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
      },
    },
    onError: ({ error }) => onError(error),
    onChunk: () => {
      if (!firstChunk) return;
      firstChunk = false;
      timings?.onFirstChunk?.(Date.now() - startedAt);
    },
    onStepFinish: (step) => {
      timings?.onStep?.(Date.now() - stepStartedAt, step.toolCalls.map((call) => call.toolName));
      stepStartedAt = Date.now();
    },
  });
  return toUIMessageStream({
    stream: result.stream.pipeThrough(watch.stream),
    tools,
    originalMessages: messages,
    generateMessageId: messageId,
    // The facts the reply relied on ride on the message (the chat's "From memory" line), and are marked used.
    messageMetadata: ({ part }) => {
      if (part.type !== "finish" || memory.length === 0) return undefined;
      const memoryUsed = factsUsed(memory, { userText: context.lastUserText, ...watch.seen() });
      if (memoryUsed.length === 0) return undefined;
      void context.intelligence.markMemoryUsed(memoryUsed.map((fact) => fact.id)).catch(() => undefined);
      return { memoryUsed };
    },
    onEnd,
    onError: (error) => {
      onError(error);
      return "error";
    },
  });
}
