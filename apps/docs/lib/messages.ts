// The docs' own interface strings: English in messages/en.json, the other nine written by scripts/translate.ts.
// Anything missing in a language falls back to English, key by key.
import en from "@/messages/en.json";
import { MESSAGES, SCOPE } from "@/messages/index";

export type Messages = typeof en;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function merge<T>(base: T, over: unknown): T {
  if (!isRecord(base) || !isRecord(over)) return base;
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(base)) {
    const replacement = over[key];
    if (isRecord(value)) out[key] = merge(value, replacement);
    else if (typeof replacement === "string" && replacement.length > 0) out[key] = replacement;
  }
  return out as T;
}

export function getMessages(lang: string): Messages {
  return merge(en, MESSAGES[lang]);
}

/**
 * A capability-scope sentence in `lang`. Translations are keyed by the exact English sentence, so when the registry's
 * wording changes the page shows the new English instead of a stale translation.
 */
export function translateScope(lang: string, sentence: string): string {
  return SCOPE[lang]?.[sentence] ?? sentence;
}
