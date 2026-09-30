# Generative UI: frameworks, mobile + web support, and a recommended approach

Purpose: pick the libraries that let the agent render rich, interactive money components (swap quote, bridge route comparison, contact picker, confirmation sheet, automation editor, charts) inside chat on **Expo (iOS/Android) and web** from one definition.

Sources:
- npm registry, queried 2026-09-29: `.firecrawl/product/genui/npm-versions-2026-09-29.txt`
- GitHub API repo metadata: `.firecrawl/product/genui/repos.txt`
- Vercel AI SDK: https://ai-sdk.dev/docs/getting-started/expo, https://ai-sdk.dev/docs/ai-sdk-ui/generative-user-interfaces, https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-tool-usage
- json-render: https://github.com/vercel-labs/json-render (README saved `.firecrawl/product/genui/json-render-README.md`), https://json-render.dev/docs
- A2UI: https://github.com/a2ui-project/a2ui (README + renderer table saved `.firecrawl/product/genui/a2ui-README.md`, `a2ui-renderers.md`), https://developers.googleblog.com/introducing-a2ui-an-open-project-for-agent-driven-interfaces/, https://developers.googleblog.com/a2ui-v0-9-generative-ui/
- assistant-ui: https://www.assistant-ui.com/docs/react-native
- CopilotKit: https://docs.copilotkit.ai/, https://docs.copilotkit.ai/react-native
- Thesys: https://www.thesys.dev/, https://docs.thesys.dev/ (redirects to https://www.openui.com/docs)
- MCP-UI / MCP Apps / OpenAI Apps SDK: https://mcpui.dev/, https://developers.openai.com/apps-sdk/build/chatgpt-ui
- Expo DOM components: https://docs.expo.dev/guides/dom-components/
- Prior-work lessons (what broke, not a design authority): `context/07-prior-work/arc-agent-lessons.md:68-70`

Verified: 2026-09-29

> Per Abu's course correction: arc-agent's genUI/renderer/AI SDK choices are **not** used as a basis here. Arc-agent is cited only for lessons about what failed.

---

## 1. What exists today (verified)

### Vercel AI SDK (`ai` 7.x, `@ai-sdk/react` 4.x)
- **Current major is 7**: `ai@7.0.122`, `@ai-sdk/react@4.0.125`, both published 2026-09-28 [VERIFIED, npm registry].
- Generative UI = a tool result rendered by an app-owned React component. Messages have a `parts` array; tool parts are typed `tool-${toolName}` [VERIFIED, https://ai-sdk.dev/docs/ai-sdk-ui/generative-user-interfaces].
- Tool part states: `input-streaming`, `input-available`, `approval-requested`, `approval-responded`, `output-available`, `output-error`, `output-denied` [VERIFIED, https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-tool-usage].
- Human-in-the-loop: `addToolOutput` returns a client/human tool result; `sendAutomaticallyWhen` with `lastAssistantMessageIsCompleteWithToolCalls` resumes the turn once results exist; `addToolApprovalResponse` records an approval. The page says the per-tool `needsApproval` is **deprecated**, replaced by `toolApproval` config on `streamText` [VERIFIED, same URL]. This is exactly the "I don't have Alex's address" → pop-up → resume loop.
- **Expo works**: the official Expo guide installs `ai @ai-sdk/react zod`, requires "Expo 52 or higher", uses `expo/fetch` for streaming, and polyfills `structuredClone` (`@ungap/structured-clone`) and `TextEncoderStream`/`TextDecoderStream` (`@stardazed/streams-text-encoding`); the backend is an Expo API route `app/api/chat+api.ts` [VERIFIED, https://ai-sdk.dev/docs/getting-started/expo].
- AI SDK gives the transport, message model and tool lifecycle, **not** components. You still write the cards per platform [INFERENCE].

### json-render (Vercel Labs) — `@json-render/*` 0.21.0
- Real and active: `vercel-labs/json-render`, Apache-2.0, ~18.4k stars, pushed 2026-09-25; tagline "The Generative UI framework" [VERIFIED, GitHub API + README]. The unscoped npm name `json-render` does not exist; packages are scoped [VERIFIED, npm].
- Model: you define a **catalog** of components and actions with **Zod** schemas; the AI emits a flat JSON spec constrained to that catalog; a **registry** maps catalog entries to platform components. README: "Guardrailed - AI can only use components in your catalog"; "Cross-Platform - React, Vue, Svelte, Solid (web), React Native (mobile) from the same catalog" [VERIFIED, README lines 45-48].
- Streaming: "Each JSONL patch adds to the spec and the UI updates in real time" [VERIFIED, https://json-render.dev/docs].
- `@json-render/react-native@0.21.0` exists; peers `react ^18||^19`, `react-native >=0.71.0`, `zod ^4` [VERIFIED, npm]. Its README example imports its own `schema` from `@json-render/react-native/schema` and a `standardActionDefinitions` catalog, so web and native registries are separate even if prop schemas are shared [VERIFIED, README lines 281-293]. Whether one catalog object can literally drive both renderers unchanged is [UNKNOWN] (not tested; the docs page for RN returned 404 at https://json-render.dev/docs/react-native).
- `@json-render/directives` includes a `$t` (i18n) and `$format` directive [VERIFIED, README line 147].
- Pre-1.0 (0.21) [VERIFIED]: expect breaking changes [INFERENCE].

### Google A2UI — `@a2ui/react` / `@a2ui/lit` 0.12.0
- Real. `github.com/google/A2UI` now redirects to `a2ui-project/a2ui` (Apache-2.0, ~16.5k stars, pushed 2026-09-29) [VERIFIED, GitHub API]. Google announced it on the Google Developers Blog (Dec 2025; v0.9 post in 2026) [REPORTED, https://developers.googleblog.com/introducing-a2ui-an-open-project-for-agent-driven-interfaces/, https://developers.googleblog.com/a2ui-v0-9-generative-ui/].
- README: "current production release is **v0.9.1** … The v1.0 specification is a release candidate" [VERIFIED, `a2ui-README.md:14-16`]. Declarative JSON, client-owned "catalog" of trusted components; "A2UI is a declarative data format, not executable code" [VERIFIED, README].
- Maintained renderers: React, Lit, Angular (web, stable on v0.9.1), **Flutter GenUI SDK** (mobile/desktop/web, stable), Jetpack Compose (Alpha), SwiftUI (planned) [VERIFIED, `a2ui-renderers.md`].
- **No maintained React Native renderer.** Only community `a2ui-react-native` (~9 stars, v0.8) and AGenUI [VERIFIED, `a2ui-renderers.md`]. json-render is listed as an ecosystem renderer that can render A2UI catalogs [VERIFIED, same file].

### assistant-ui — `@assistant-ui/react` 0.15.22, `@assistant-ui/react-native` 0.1.44
- MIT, ~12.3k stars [VERIFIED, GitHub API]. RN package exists with thread, thread list, composer; integrates AI SDK via `@assistant-ui/ai-sdk`; styled with Uniwind/Tailwind "using the same color tokens as the web kit"; example Expo app [VERIFIED, https://www.assistant-ui.com/docs/react-native]. Warning in docs: install only `@assistant-ui/react-native` in an RN app or duplicate core copies break `useAui` [VERIFIED, same].
- RN package is 0.1.x [VERIFIED, npm] → young [INFERENCE].

### CopilotKit — `@copilotkit/react-core` / `@copilotkit/react-native` 1.75.0; AG-UI `@ag-ui/core` 1.0.0
- MIT, ~37.6k stars; "Makers of the AG-UI Protocol" [VERIFIED, GitHub API]. Docs describe Controlled, Declarative and Open-ended genUI modes, shared state and human-in-the-loop [VERIFIED, https://docs.copilotkit.ai/].
- RN: `@copilotkit/react-native`, "React Native is feature complete, but the docs are still catching up"; headless hooks `useAgent`, `useFrontendTool`, `useRenderTool` (since 1.64.0); needs polyfills for ReadableStream, TextEncoder, crypto [VERIFIED, https://docs.copilotkit.ai/react-native].
- CopilotKit also hosts an A2UI runtime [VERIFIED, `a2ui-README.md:148`].

### Thesys C1 / OpenUI
- Thesys markets "C1", a generative-UI API; its site links docs, demos and pricing for "C1 Generative UI API" [VERIFIED, https://www.thesys.dev/ page metadata]. `docs.thesys.dev` now 307-redirects to `openui.com/docs`, which describes "OpenUI … a Generative UI toolkit" with a token-efficient "OpenUI Lang" [VERIFIED, redirect + https://www.openui.com/docs].
- OpenAI-compatible endpoint and "API layer on top of LLMs from OpenAI, Anthropic, and Google" [REPORTED, InfoWorld https://www.infoworld.com/article/3971182/thesys-introduces-generative-ui-api-for-building-ai-apps.html, ai-tldr.dev].
- `@thesysai/genui-sdk@0.10.3` (last publish 2026-07-01) [VERIFIED, npm]. React Native support: [UNKNOWN] (no official RN renderer found; only a 7-star community Flutter port `mtwichel/openui_flutter`). C1 decides layout itself → poor fit for money cards where every field must be exact [INFERENCE].

### MCP-UI / MCP Apps / OpenAI Apps SDK
- "MCP Apps is the official standard for interactive UI in MCP. The MCP-UI packages implement the spec" [VERIFIED, https://mcpui.dev/]. `@mcp-ui/client@7.1.1`, `@mcp-ui/server@6.1.0` [VERIFIED, npm].
- OpenAI Apps SDK widgets "run inside an iframe in ChatGPT, communicate with the host through the MCP Apps bridge (JSON-RPC over `postMessage`)", MIME `text/html;profile=mcp-app`; portable to other MCP Apps hosts [VERIFIED, https://developers.openai.com/apps-sdk/build/chatgpt-ui].
- These are **HTML-in-iframe** for third-party hosts (ChatGPT, Claude, etc.). In our own Expo app they would need a WebView [INFERENCE]. Useful later as a *distribution* channel (ship Tameion cards into ChatGPT), not as the in-app renderer [INFERENCE].

### React Native UI building blocks
| Package | Latest | Notes |
|---|---|---|
| `react-native-reusables` (shadcn for RN) | GitHub `founded-labs/react-native-reusables`, ~8.7k stars, CLI copy-in | "Bringing shadcn/ui to React Native … Nativewind/Uniwind" [VERIFIED, GitHub API] |
| `nativewind` | 4.2.7 | Tailwind for RN [VERIFIED, npm] |
| `uniwind` | 1.12.0 | "The fastest Tailwind bindings for React Native" [VERIFIED, GitHub/npm]; used by assistant-ui RN |
| `tamagui` | 2.7.7 | Universal RN + web UI kit [VERIFIED, npm] |
| `react-native-web` | 0.21.3 | Renders RN components on web [VERIFIED, npm] |
| `expo` | 57.0.25 | [VERIFIED, npm] |
| Expo DOM components (`'use dom'`) | built in | On native wraps a webview (`@expo/dom-webview` default from SDK 56); props must be serializable; functions must be async; "slower to parse and start up than optimized Hermes bytecode"; cannot render native views [VERIFIED, https://docs.expo.dev/guides/dom-components/] |

## 2. Web vs Expo support matrix

| Option | Web | Expo / RN | Maturity | Fit for money cards |
|---|---|---|---|---|
| AI SDK `ai@7` + `@ai-sdk/react@4` (`useChat`, tool parts) | Yes [VERIFIED] | Yes, Expo ≥52 + polyfills [VERIFIED] | Stable major | Transport + lifecycle; you own components |
| json-render `@json-render/{core,react,react-native}` 0.21 | Yes [VERIFIED] | Yes, RN renderer [VERIFIED] | Pre-1.0 | Catalog + Zod guardrails match our need |
| A2UI `@a2ui/react` 0.12 (spec v0.9.1) | Yes [VERIFIED] | No official RN; Flutter yes [VERIFIED] | Spec RC for 1.0 | Good spec, wrong mobile stack for Expo |
| assistant-ui 0.15 / RN 0.1 | Yes | Yes [VERIFIED] | RN is young | Chat shell + tool UI, not a spec |
| CopilotKit 1.75 + AG-UI 1.0 | Yes | Yes, headless [VERIFIED] | Mature web, RN docs lagging | Protocol + hooks; heavier runtime |
| Thesys C1 / OpenUI | Yes (React) | [UNKNOWN] | Commercial API | Model-chosen layout; risky for exact values |
| MCP-UI / Apps SDK widgets | In MCP hosts | Only via WebView [INFERENCE] | Standardized | External distribution, not in-app |
| Expo DOM components | n/a | Webview [VERIFIED] | Stable | Escape hatch for a web-only chart |

## 3. Lessons from arc-agent (what broke, cited only as lessons)
- The model "fabricated a token address: it copied USDC's address for EURC" → keep a post-parse allowlist and never trust a model-supplied address [VERIFIED, `context/07-prior-work/arc-agent-lessons.md:68`].
- Voice re-asked for confirmation after the user had confirmed [VERIFIED, `arc-agent-lessons.md:70`]. The genUI card must carry the single confirmation state so voice and UI don't diverge [INFERENCE].

## 4. Recommendation [INFERENCE]

**Declarative component specs over a fixed, typed catalog, with one registry per platform.**

1. **Transport / loop:** `ai@7` + `@ai-sdk/react@4` `useChat` on both Expo and web (same hook, officially supported on Expo). Tools are typed with Zod 4 (`zod@4.6.5`).
2. **Spec, not code:** read-only tools (`getSwapQuote`, `compareBridgeRoutes`, `listContacts`, `getBalances`) return **data**. A server step wraps that data into a validated spec `{ component: "SwapQuoteCard", props: {...}, version }` whose `props` are parsed with the same Zod schema the client uses. The model may pick *which* catalog component to show and fill display text; **amounts, addresses, chain IDs and quote IDs come from server tool output, never from model text**.
3. **Catalog (v1):** `SwapQuoteCard`, `BridgeRouteComparison`, `ContactPicker` (+ `AddContactForm`), `ConfirmationSheet`, `AutomationEditor`, `Chart`, `Receipt`, `ErrorCard`. Keep catalog definitions (names + Zod prop schemas + allowed actions) in a shared package; ship two registries: web (shadcn / Tailwind) and native (react-native-reusables + Uniwind or NativeWind).
4. **Library choice:** use **json-render** (`@json-render/core` + `/react` + `/react-native`) as the catalog/registry/streaming layer, because it is the only verified option with Zod catalogs *and* an official RN renderer. Pin the exact 0.21.x version. If it fights us, the fallback is a ~200-line in-house `switch(part.type)` registry over AI SDK tool parts — the pattern is simple enough to own. Keep the spec shape A2UI-like so a later move to A2UI (if it gains an RN renderer) is cheap.
5. **Human-in-the-loop:** missing data (e.g., Alex's address) is a client tool (`requestContactAddress`) that renders `AddContactForm`; its result goes back via `addToolOutput`, and `sendAutomaticallyWhen` resumes the task.
6. **Money writes are never executed from a spec.** A spec action like `confirm` only sends `{planId, planHash}` back to the server; the server re-validates the plan, policy and limits and requires the on-screen tap + biometric (see `voice-safety-confirmation.md`). Treat every UI action payload as untrusted input.
7. **Charts:** a native chart lib on RN and a web chart lib on web behind the same `Chart` spec; or an Expo DOM component as an escape hatch (accepting webview startup cost).
8. **Not chosen for in-app:** A2UI (no official RN), Thesys C1 (model-owned layout, RN unknown), MCP-UI/Apps SDK (iframe; keep for a later "Tameion in ChatGPT/Claude" channel). CopilotKit and assistant-ui are viable chat shells but add a second abstraction over AI SDK; adopt assistant-ui only if we want its prebuilt thread/composer on both platforms.

## 5. Gaps
- No hands-on test that one json-render catalog renders identically on `@json-render/react` and `@json-render/react-native` [UNKNOWN].
- No verified RN chart library comparison in this file.
- Thesys C1 pricing / RN not verified.
