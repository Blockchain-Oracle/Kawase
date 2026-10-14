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

import type { CapabilityLine, WalletSummary } from "@kawase/api-client";

import type { AgentContext } from "./context";
import { factsUsed } from "./intelligence";
import { foldThread, windowFor } from "./threads";
import type { Models } from "./models";
import { instructions } from "./prompt";
import { buildTools } from "./tools";
import { toolApprovals } from "./approval";
import { turnTrust } from "./trust";

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
  // One account of the turn's trust for the tools and for who approves a money step (H2 + D38).
  const trust = turnTrust(context.lastUserText);
  const tools = buildTools(context, trust);
  const voice = context.surface === "voice";
  // What the person asked Kawase to remember, and a long thread's summary (A5); a failed read never stops the turn.
  const [memory, digest] = await Promise.all([
    context.intelligence.memory().catch(() => []),
    context.intelligence.threadDigest().catch(() => null),
  ]);
  // A long thread: the summary of its older part plus the recent messages, verbatim.
  const { window, summarized } = windowFor(messages, digest);
  const watch = watchTurn();
  // Talking: the voice role's model, with the least reasoning — the person is waiting in silence.
  const model = models.forRole(voice ? "agentVoice" : "agentChat");
  // Only reasoning models take a reasoning effort (gpt-4.1 and gpt-4o refuse it).
  const reasons = typeof model === "object" && /^(gpt-5|gpt-6|o\d)/.test(model.modelId);
  const result = streamText({
    model,
    instructions: instructions(context, new Date(), wallet, capabilities, { memory, digest: summarized && digest ? digest : undefined }),
    messages: await convertToModelMessages(window, { tools, ignoreIncompleteToolCalls: true }),
    tools,
    experimental_toolApprovalSecret: approvalSecret,
    // Inside the weekly budget a money step goes without a tap; otherwise the card asks first (approval.ts).
    toolApproval: toolApprovals(context, trust),
    stopWhen: isStepCount(MAX_STEPS),
    ...(abortSignal ? { abortSignal } : {}),
    // Short answers fast: little reasoning, terse text (spike 7: most latency was reasoning).
    providerOptions: {
      openai: {
        ...(reasons ? { reasoningEffort: voice ? "none" : "low", textVerbosity: "low" } : {}),
        promptCacheKey: voice ? `${PROMPT_CACHE_KEY}-voice` : PROMPT_CACHE_KEY,
        serviceTier: SERVICE_TIER,
      },
      // Gemini 3 (the fallback provider, D29): the least thinking it accepts (3.8 Flash refuses "minimal").
      google: { thinkingConfig: { thinkingLevel: "low" } },
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
    onEnd: async (event) => {
      await onEnd(event);
      // After the person has their answer: fold older messages into the summary when enough have piled up.
      if (event.isAborted) return;
      void foldThread(models, event.messages, digest)
        .then((next) => (next ? context.intelligence.saveThreadDigest(next) : undefined))
        .catch((error: unknown) => context.intelligence.warn(error, "thread summary failed"));
    },
    onError: (error) => {
      onError(error);
      return "error";
    },
  });
}
