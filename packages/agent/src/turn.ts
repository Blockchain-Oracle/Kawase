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

import type { AgentContext } from "./context";
import type { Models } from "./models";
import { instructions } from "./prompt";
import { buildTools } from "./tools";

/** Tool calls and replies in one turn before it stops (a guard against loops). */
const MAX_STEPS = 6;
const MESSAGE_ID_SIZE = 16;
/** Keeps the cacheable prefix keyed for the provider (OpenAI prompt caching). */
const PROMPT_CACHE_KEY = "kawase-agent-chat-v1";

const messageId = createIdGenerator({ prefix: "msg", size: MESSAGE_ID_SIZE });

export type TurnInput = {
  models: Models;
  context: AgentContext;
  messages: UIMessage[];
  /** HMAC key for tool approvals (spike 7): a client cannot forge or edit one. */
  approvalSecret: string;
  onEnd: UIMessageStreamOnEndCallback<UIMessage>;
  onError: (error: unknown) => void;
  abortSignal?: AbortSignal | undefined;
};

export async function agentTurn({ models, context, messages, approvalSecret, onEnd, onError, abortSignal }: TurnInput) {
  const tools = buildTools(context);
  const result = streamText({
    model: models.forRole("agentChat"),
    instructions: instructions(context),
    messages: await convertToModelMessages(messages, { tools, ignoreIncompleteToolCalls: true }),
    tools,
    experimental_toolApprovalSecret: approvalSecret,
    stopWhen: isStepCount(MAX_STEPS),
    ...(abortSignal ? { abortSignal } : {}),
    // Short answers fast: little reasoning, terse text (spike 7: most latency was reasoning).
    providerOptions: { openai: { reasoningEffort: "low", textVerbosity: "low", promptCacheKey: PROMPT_CACHE_KEY } },
    onError: ({ error }) => onError(error),
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
