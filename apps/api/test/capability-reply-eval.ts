// Measures how the agent answers "what can you do?" and a scope question with the real prompt, tools and model,
// for a guest, against the production capability list. Not a test (D22): run it before and after changing how the
// capability result reaches the model, and compare. Nothing here can move money: every other context call throws.
//   pnpm --filter @kawase/api exec tsx test/capability-reply-eval.ts <label> [runs]
import { mkdir, writeFile } from "node:fs/promises";
import { config } from "dotenv";
import type { UIMessage } from "ai";

import { agentTurn, createModels, type AgentContext, type CapabilityLine } from "@kawase/agent";
import { CAPABILITY_SCOPE, type CapabilityId } from "@kawase/config";

config({ path: new URL("../../../.env", import.meta.url).pathname, quiet: true });

const API = "https://kawase-api.84.46.247.92.sslip.io";
const OUT = new URL("../../../plan/design/review-evidence/2026-10-02/", import.meta.url).pathname;
const label = process.argv[2] ?? "run";
const runs = Number(process.argv[3] ?? "6");

type View = Record<string, Record<"mainnet" | "testnet", { state: CapabilityLine["here"]; reason?: string }>>;
const { capabilities: view } = (await (await fetch(`${API}/capabilities`)).json()) as { capabilities: View };
const lines: CapabilityLine[] = Object.keys(view).map((id) => ({
  id,
  here: view[id]!.testnet.state,
  otherNetwork: view[id]!.mainnet.state,
  ...(view[id]!.testnet.reason ? { reason: view[id]!.testnet.reason } : {}),
  ...(CAPABILITY_SCOPE[id as CapabilityId] ?? {}),
}));

const guest = (locale: string, languageName: string): AgentContext =>
  new Proxy(
    {
      network: "testnet",
      locale,
      languageName,
      isGuest: true,
      handle: null,
      surface: "chat",
      lastUserText: "",
      capabilities: async () => lines,
      wallet: async () => ({ status: "guest" }),
    } as unknown as AgentContext,
    {
      get(target, key) {
        if (key in target) return target[key as keyof AgentContext];
        if (key === "then") return undefined;
        return () => {
          throw new Error(`evaluation context has no ${String(key)}`);
        };
      },
    },
  );

// Words that show the reply listing capabilities the card already shows (a restatement count, per language).
const RESTATED: Record<string, RegExp[]> = {
  en: [/\bsend/i, /\brequest/i, /\bswap/i, /\bbridge|another chain/i, /\bearn|yield|vault/i, /automat/i, /contact/i, /\bvoice/i, /test money|faucet/i, /payment link/i],
  fr: [/envoy/i, /demand/i, /échang/i, /transf|pont|autre réseau/i, /rendement|fructif|coffre/i, /automatis/i, /contact/i, /\bvoix/i, /argent de test/i, /lien/i],
};
const QUESTIONS = [
  { locale: "en", languageName: "English", text: "What can you do?", kind: "overview" },
  { locale: "fr", languageName: "Français", text: "Qu'est-ce que tu peux faire ?", kind: "overview" },
  { locale: "en", languageName: "English", text: "Can you buy meme coins for me?", kind: "scope" },
] as const;

const models = createModels({ ...(process.env.OPENAI_API_KEY ? { openai: process.env.OPENAI_API_KEY } : {}) });

async function ask(question: (typeof QUESTIONS)[number]) {
  const user: UIMessage = { id: `u-${crypto.randomUUID()}`, role: "user", parts: [{ type: "text", text: question.text }] };
  let final: UIMessage[] = [];
  const started = Date.now();
  const stream = await agentTurn({
    models,
    context: { ...guest(question.locale, question.languageName), lastUserText: question.text } as AgentContext,
    messages: [user],
    approvalSecret: "evaluation-only",
    onEnd: ({ messages }) => {
      final = messages;
    },
    onError: () => undefined,
  });
  for await (const chunk of stream as AsyncIterable<unknown>) void chunk;
  const reply = final.at(-1);
  const text = (reply?.parts ?? []).map((part) => (part.type === "text" ? part.text : "")).join("").trim();
  const tools = (reply?.parts ?? []).filter((part) => part.type.startsWith("tool-")).map((part) => part.type.slice(5));
  const restated = (RESTATED[question.locale] ?? []).filter((pattern) => pattern.test(text)).length;
  return {
    ...question,
    ms: Date.now() - started,
    tools,
    chars: text.length,
    paragraphs: text ? text.split(/\n\s*\n/).length : 0,
    sentences: text ? text.split(/(?<=[.!?])\s+/).filter(Boolean).length : 0,
    restated,
    text,
  };
}

const results: Awaited<ReturnType<typeof ask>>[] = [];
for (const question of QUESTIONS)
  for (let i = 0; i < runs; i += 1) {
    const result = await ask(question);
    results.push(result);
    process.stdout.write(`${question.kind}/${question.locale} #${i + 1}: ${result.chars} chars, ${result.paragraphs} para, restated ${result.restated}\n`);
  }

const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;
const summary = QUESTIONS.map((question) => {
  const mine = results.filter((result) => result.text !== undefined && result.locale === question.locale && result.kind === question.kind);
  return {
    question: question.text,
    runs: mine.length,
    medianChars: median(mine.map((result) => result.chars)),
    medianParagraphs: median(mine.map((result) => result.paragraphs)),
    medianRestated: median(mine.map((result) => result.restated)),
    calledCapabilities: mine.filter((result) => result.tools.includes("get_capabilities")).length,
  };
});
console.log(JSON.stringify(summary, null, 2));
await mkdir(OUT, { recursive: true });
await writeFile(`${OUT}capability-reply-${label}.json`, `${JSON.stringify({ label, model: "default agentChat role", network: "testnet", guest: true, at: new Date().toISOString(), summary, results }, null, 2)}\n`);
