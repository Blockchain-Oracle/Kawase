/**
 * Model roles, provider-agnostic (D29). Each role is a "provider:model" id resolved by the AI SDK provider
 * registry (createProviderRegistry, https://ai-sdk.dev/docs/ai-sdk-core/provider-management).
 * Override per deployment with env KAWASE_MODEL_<ROLE> (read in @kawase/env), so switching provider is config, not code.
 * Defaults: OpenAI gpt-5.6-luna for every role (Abu, 2026-09-29: "a GPT-5 model that is sufficient and very cheap").
 * Catalog (context/08-product-research/05-voice-language-genui/llm-choice.md): gpt-5.6-luna $0.2 in / $0.02 cached / $1.2 out
 * per 1M tokens, 1.05M context, "cost-sensitive". Upgrade path without code changes: KAWASE_MODEL_AGENT_CHAT=openai:gpt-6-sol.
 */
export const MODEL_PROVIDERS = ["openai", "anthropic", "google"] as const;
export type ModelProvider = (typeof MODEL_PROVIDERS)[number];
export type ModelRef = `${ModelProvider}:${string}`;

export const MODEL_ROLES = ["agentChat", "agentVoice", "utility"] as const;
export type ModelRole = (typeof MODEL_ROLES)[number];

export const DEFAULT_MODELS = {
  agentChat: "openai:gpt-5.6-luna",
  agentVoice: "openai:gpt-5.6-luna",
  utility: "openai:gpt-5.6-luna",
} as const satisfies Record<ModelRole, ModelRef>;

/** Known-good alternatives, one line each, for switching providers without looking anything up. */
export const ALTERNATIVE_MODELS = {
  agentChat: "anthropic:claude-sonnet-5-5",
  agentVoice: "anthropic:claude-sonnet-5-5",
  utility: "anthropic:claude-haiku-4-5-20251001",
} as const satisfies Record<ModelRole, ModelRef>;

/** Env var that overrides a role's model, e.g. KAWASE_MODEL_AGENT_CHAT=anthropic:claude-sonnet-5-5 */
export const MODEL_ENV_VARS = {
  agentChat: "KAWASE_MODEL_AGENT_CHAT",
  agentVoice: "KAWASE_MODEL_AGENT_VOICE",
  utility: "KAWASE_MODEL_UTILITY",
} as const satisfies Record<ModelRole, string>;
