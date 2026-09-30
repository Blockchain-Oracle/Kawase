# Spike 7: streaming chat with a tool approval (AI SDK 7, useChat + expo/fetch → Hono)

Code: `plan/spikes/code/07-streaming-chat/` (`node server.mjs`, `node test-node.mjs`; device screen `mobile-spike-chat.tsx`, run from a temporary route + tab that has since been removed from `apps/mobile`; Traefik probe `sse-probe.mjs` + `Dockerfile.sse-probe`). Screenshot: `07-ios-spike-chat.png`.
Date: 2026-09-30
**Result: PASS.** Node 7/7; the iOS simulator round trip is complete; SSE streams through Coolify's Traefik over HTTPS with gzip on, including to `expo/fetch` on iOS.

## Results
- Node (DefaultChatTransport + readUIMessageStream): auto tool ✅ · `approval-requested` with nothing executed ✅ · deny → `output-denied` ✅ · **forged approval (amount changed after approving) → `AI_InvalidToolApprovalSignatureError`** ✅ · approve → executed once → model continues ✅ · client tool `input-available` → `addToolOutput` → model continues ✅.
- iOS 26.5 simulator, Expo 57 / RN 0.86.3 dev build: `useChat` + `DefaultChatTransport({ fetch: expo/fetch })` streamed **18 incremental text updates** (not buffered); approval-requested → `addToolApprovalResponse({id, approved:true})` → `sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses` resumed → tool output + final text. The server log shows exactly one execution.

## Findings
1. API names in ai@7.0.122 (from its types): **`toolApproval: { tool: 'user-approval' }` on streamText** (takes precedence over tool-level `needsApproval`); client `addToolApprovalResponse`; states `approval-requested` → `approval-responded` → output, or `output-denied`; `isStepCount` (alias `stepCountIs`); `instructions` (alias `system`); `toUIMessageStream({ onEnd })` (`onFinish` deprecated).
2. **`experimental_toolApprovalSecret` HMAC-signs approvals**, and the signature covers the tool input. Use it in `agentTurn`. It is a UX gate only; money still needs the wallet signature (K2).
3. **No polyfills are needed on Expo 57 / RN 0.86.3:** `structuredClone`, `TextEncoderStream`, `TextDecoderStream` and `ReadableStream` all exist natively (the AI SDK's Expo guide still lists `@ungap/structured-clone` + `@stardazed/streams-text-encoding`).
4. Latency with `gpt-5.6-luna`: first streamed chunk 1.2–4.1 s (mostly model reasoning). Voice (#5) should use low reasoning effort.
5. The model must be told which contacts exist, or it picks `add_contact_form`; the turn context already plans this (the contacts index).

## Traefik / Coolify (throwaway app `kawase-sse-probe`, created in project `kawase`, then deleted)
- Probe: 12 SSE events 250 ms apart with AI SDK 7's `UI_MESSAGE_STREAM_HEADERS`, behind Coolify's default labels (`gzip` compress middleware, HTTP→HTTPS redirect, Let's Encrypt on an sslip.io domain, HTTP/2).
- Node client, HTTP and HTTPS, `identity` and `gzip`: 13 events, gaps 185–313 ms. **No buffering, even with `content-encoding: gzip`.**
- **iOS `expo/fetch` over HTTPS + gzip: 13 events, gaps 171–313 ms**, first event at 1.4 s (TLS + LE). Streaming is incremental on the device.
- No proxy changes are needed for the chat route; keep Coolify's defaults.

## Coolify gotchas found (copied to `deploy/coolify.md`)
1. `POST /applications/dockerfile` needs the Dockerfile **base64-encoded** (422 otherwise).
2. On the **Dockerfile-content** endpoint only, Coolify sets the port itself and overrides `ports_exposes`: it searches the still-base64 text for `EXPOSE`, finds nothing, and uses `80` (v4.3.23 `ApplicationsController.php` line 2100). I first wrote this up as "the CLI ignored the port"; that was the wrong cause. Git-based apps (how Kawase deploys) take `--ports-exposes` as given. Separately, `PATCH`ing `ports_exposes` alone does **not** regenerate the Traefik labels (502); the API regenerates them only on a domain change (line 3465). So pass the port and domain at creation.
3. Coolify's healthcheck runs `curl`, then `wget`, **inside the image**. `node:*-alpine` has only busybox `wget`, which works. Slim images without either fail every healthcheck.
4. A domain left empty gets `http://<uuid>.<ip>.sslip.io`. Passing `https://<name>.<ip>.sslip.io` at creation gives a Let's Encrypt cert, which is how Abu's other sslip.io apps (`our-journal`, `ruckus-play`, `baku-*`) already run. iOS ATS blocks plain HTTP to non-local hosts, so devices use the HTTPS domain.

## Process lesson
`CI=1 npx expo start` disables Metro's file watching ("reloads are disabled"), so edits silently don't reach the app. Start Metro with `< /dev/null` instead of `CI=1` when running it in the background. (For a while I wrongly suspected the React Compiler.)
