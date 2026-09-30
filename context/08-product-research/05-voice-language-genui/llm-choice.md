# LLM choice for a tool-calling money agent

Purpose: the current (Sept 2026) text/reasoning models from Anthropic, OpenAI and Google that could drive the agent's tool loop, with verified IDs, prices, structured-output support and latency signals.

Sources:
- Anthropic models overview: https://platform.claude.com/docs/en/about-claude/models/overview (saved `.firecrawl/product/llm/claude-models.txt`)
- Anthropic structured outputs: https://platform.claude.com/docs/en/build-with-claude/structured-outputs (saved `.firecrawl/product/llm/claude_build-with-claude_structured-outputs.md`)
- Anthropic fine-grained tool streaming: https://platform.claude.com/docs/en/agents-and-tools/tool-use/fine-grained-tool-streaming
- OpenAI models catalog: https://developers.openai.com/api/docs/models.md and per-model pages `…/models/gpt-6-astra.md`, `gpt-6-sol.md`, `gpt-6-luna.md`, `gpt-5.6-terra.md`, `gpt-5.6-luna.md` (saved `.firecrawl/product/llm/`)
- OpenAI structured outputs: https://developers.openai.com/api/docs/guides/structured-outputs.md; function calling: https://developers.openai.com/api/docs/guides/function-calling.md; data controls: https://developers.openai.com/api/docs/guides/your-data.md
- Google models: https://ai.google.dev/gemini-api/docs/models, per-model pages `…/models/gemini-3.8-flash`, `gemini-3.1-pro-preview`, `gemini-3.1-flash-lite`; pricing https://ai.google.dev/gemini-api/docs/pricing; structured output https://ai.google.dev/gemini-api/docs/structured-output; terms https://ai.google.dev/gemini-api/terms (all saved `.firecrawl/product/llm/`)
- Prior-work lessons: `context/07-prior-work/arc-agent-lessons.md:68-70`

Verified: 2026-09-29

---

## 1. Current models (verified today)

Prices are USD per 1M tokens, standard tier, and are temporal.

### Anthropic [VERIFIED, models overview]

| Model | API ID | Latency (vendor label) | Input / Output | Context / max out | Thinking |
|---|---|---|---|---|---|
| Claude Fable 5.1 | `claude-fable-5-1` | "Slower" | $10 / $50 | 1M / 128K | Adaptive (always on) |
| Claude Opus 5.5 | `claude-opus-5-5` | "Moderate" | $4 / $20 | 1M / 128K | Adaptive (always on), default effort medium |
| Claude Sonnet 5.5 | `claude-sonnet-5-5` | "Fast" | $2 / $10 | 1M / 128K | Adaptive, default effort high |
| Claude Haiku 4.5 | `claude-haiku-4-5-20251001` (alias `claude-haiku-4-5`) | "Fastest" | $1 / $5 | 200K / 64K | Extended |

- Anthropic's own guidance: "start with Claude Opus 5.5 for most workloads" [VERIFIED].
- All current models support tool use and "multilingual capabilities" [VERIFIED].
- Haiku 4.5 retirement "Not sooner than October 15, 2026", which is close to the hackathon window [VERIFIED]. Its reliable knowledge cutoff is Feb 2025 [VERIFIED].
- Structured outputs are GA. They offer JSON outputs (`output_config.format`) and **strict tool use** (`strict: true`, which "guarantee[s] schema validation on tool names and inputs"). Supported models include `claude-opus-5-5`, `claude-sonnet-5-5`, `claude-fable-5-1` and `claude-haiku-4-5-20251001` [VERIFIED, structured-outputs page front-matter].
- Fine-grained tool streaming streams tool inputs without server-side buffering, but inputs "might" be partial or invalid JSON [VERIFIED]. So do not use it for money-tool arguments that must be strict [INFERENCE].

### OpenAI [VERIFIED, models catalog + model pages]

| Model | API ID | Input / Cached / Output | Context / max out | Notes |
|---|---|---|---|---|
| GPT-6 Astra | `gpt-6-astra` | $10 / $1 / $50 | 1.05M / 128K | "Our most capable model"; effort `low`…`max` |
| GPT-6 Sol | `gpt-6-sol` | $2 / $0.2 / $10 | 1.05M / 128K | "complex coding and agentic workflows"; effort `none`…`max` |
| GPT-6 Luna | `gpt-6-luna` | $0.1 / $0.01 / $0.5 | 1.05M / 128K | "most efficient model for focused, high-volume tasks" |
| GPT-5.6 Terra | `gpt-5.6-terra` | $2 / $0.2 / $12 | 1.05M / 128K | "balances intelligence and cost" |
| GPT-5.6 Luna | `gpt-5.6-luna` | $0.2 / $0.02 / $1.2 | 1.05M / 128K | cost-sensitive |

- Every page above lists `structured_outputs` and `function_calling` [VERIFIED].
- For `gpt-6-sol`/`gpt-6-luna`: "Chat Completions supports function calling only with `reasoning_effort` set to `none`", so use the Responses API [VERIFIED].
- **Doc inconsistency.** The models index text recommends "GPT-5.6 Terra … or GPT-5.6 Luna" as the balanced and cheap picks. The same page's catalog and featured HTML list GPT-6 Sol and GPT-6 Luna [VERIFIED, both present in `openai-models.md` / `openai-models.html`]. Treat GPT-6 Sol/Luna as newest and pin the exact ID either way [INFERENCE].
- Strict mode exists for both `text.format` json_schema and function calling (`strict: true`) [VERIFIED].
- Data: API data is not used for training unless you opt in. Abuse-monitoring logs are "retained for up to 30 days". ZDR requires approval [VERIFIED, your-data.md:7,18-20].

### Google [VERIFIED, models page + model pages + pricing]

| Model | ID | Status | Input / Output (paid) | Context / max out |
|---|---|---|---|---|
| Gemini 3.8 Flash | `gemini-3.8-flash` | Stable (updated Sept 2026) | $0.75 / $3.75 through 2026-12-31; $1.50 / $7.50 from 2027-01-01 | 1,048,576 / 65,536 |
| Gemini 3.1 Pro | `gemini-3.1-pro-preview` | **Preview** | $2 / $12 (≤200K prompt) | 1,048,576 / 65,536 |
| Gemini 3.1 Flash-Lite | `gemini-3.1-flash-lite` | Stable | $0.25 / $1.50 (text) | 1,048,576 / 65,536 |

- All three list Function calling and Structured outputs as "Supported". "Live API: Not supported" means these are not the voice models; see `realtime-voice-options.md` [VERIFIED].
- Structured outputs **combined with tools** (function calling, search and so on) is "Preview … only to Gemini 3 series models" [VERIFIED, structured-output page].
- Data: on "Unpaid Services … the unpaid quota on Gemini API", Google uses content "to provide, improve, and develop Google products" and "human reviewers may read" it [VERIFIED, terms]. **Use paid tier for any real user data** [INFERENCE].

## 2. Lessons from arc-agent (cited as lessons only)

- The model fabricated a token address, copying USDC's address for EURC. Keep a post-parse allowlist and never trust a model-supplied address [VERIFIED, `context/07-prior-work/arc-agent-lessons.md:68`].
- Pin the model snapshot so the demo behaves as verified [VERIFIED, `arc-agent-lessons.md:69`]. Note: several current IDs above have **no dated snapshot**. The GPT-6 pages list only the alias, and Gemini 3.8 Flash is a "Stable" alias. Pinning therefore means pinning the alias plus recording a golden eval run [INFERENCE].
- Abu reports arc-agent's overall architecture failed. Its model choice (`gpt-5.1-2025-11-13`) is **not** a recommendation input here.

## 3. What matters for this agent [INFERENCE]

1. **Tool-argument exactness over raw IQ.** Strict schema tool calling (all three vendors have it) plus server-side validation (address book lookup, asset allowlist, decimals) matters more than benchmark rank.
2. **Latency budget.** In voice mode the reasoning LLM sits behind a realtime voice model, or inside a cascaded STT→LLM→TTS pipeline. There, the "Fast"/"Fastest" tier (Sonnet 5.5, Haiku 4.5, GPT-6 Luna/Sol at low effort, Gemini 3.8 Flash / 3.1 Flash-Lite) is the realistic range. None of the vendors publish TTFT numbers on these pages [UNKNOWN; measure].
3. **Multilingual.** All three state multilingual support in general. None publishes per-language tool-calling accuracy for Yoruba/Hausa/Igbo/Pidgin [UNKNOWN; see `language-coverage-matrix.md`].

## 4. Recommendation [INFERENCE]

- **Keep the model provider-swappable** behind the AI SDK provider interface (see `generative-ui.md`). Run a 30-utterance eval (EN/FR/Pidgin; amounts, contacts, corrections) on two or three candidates before locking one in.
- **Default candidates for the text/tool loop:**
  - `claude-sonnet-5-5`: "Fast", strict tool use GA, $2/$10.
  - `gpt-6-sol` at low effort: Responses API, strict functions, $2/$10.
  - `gemini-3.8-flash`: cheapest capable option at $0.75/$3.75 until year-end, stable.
- **Router/cheap tier:** `claude-haiku-4-5` (watch its Oct 2026 retirement floor), `gpt-6-luna`, or `gemini-3.1-flash-lite` for intent classification, summarisation and title generation.
- **Avoid Preview models** (`gemini-3.1-pro-preview`) on the money path.
- Whatever model is used, it only **proposes** typed actions. Deterministic code resolves contacts, validates and executes (see `voice-safety-confirmation.md`).

## Gaps

- No first-party latency (TTFT) figures for any model: [UNKNOWN].
- No vendor data on tool-calling accuracy in African languages: [UNKNOWN].
- The OpenAI index text vs catalog naming conflict (GPT-5.6 Terra vs GPT-6 Sol) is unresolved.
