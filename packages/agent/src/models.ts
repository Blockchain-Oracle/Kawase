// The model behind each role (D29): a "provider:model" id from @kawase/config, overridable per deployment by env
// (KAWASE_MODEL_AGENT_CHAT=anthropic:claude-sonnet-5-5), resolved through the AI SDK provider registry so
// switching provider is configuration, not code. Keys come from the caller (the api's env loader).
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createProviderRegistry, type LanguageModel } from "ai";

import { DEFAULT_MODELS, type ModelRef, type ModelRole } from "@kawase/config";

export type ModelKeys = { openai?: string; anthropic?: string; google?: string };
export type ModelOverrides = Partial<Record<ModelRole, ModelRef>>;

export function createModels(keys: ModelKeys, overrides: ModelOverrides = {}) {
  const registry = createProviderRegistry({
    openai: createOpenAI(keys.openai ? { apiKey: keys.openai } : {}),
    anthropic: createAnthropic(keys.anthropic ? { apiKey: keys.anthropic } : {}),
    google: createGoogleGenerativeAI(keys.google ? { apiKey: keys.google } : {}),
  });
  return {
    /** The language model for a role, after the deployment's override. */
    forRole(role: ModelRole): LanguageModel {
      return registry.languageModel(overrides[role] ?? DEFAULT_MODELS[role]);
    },
    /** Whether the role's provider has a key here (the chat answers "unavailable" instead of failing mid-stream). */
    hasKeyFor(role: ModelRole): boolean {
      const provider = (overrides[role] ?? DEFAULT_MODELS[role]).split(":")[0] as keyof ModelKeys;
      return Boolean(keys[provider]);
    },
  };
}

export type Models = ReturnType<typeof createModels>;
