# How voice assistants, dialogue systems and LLM agent frameworks handle a request that can't proceed yet

Purpose: find the established mechanisms (and their real names) for "the agent can't do X yet: explain it, show the fix, then continue", so that `SMART-PRECONDITIONS.md` can be rewritten on evidence instead of Claude's unresearched design.

Sources (raw copies saved under `.firecrawl/product/11/conv/`, file name in brackets):
- Amazon Alexa: Dialog Interface Reference https://developer.amazon.com/en-US/docs/alexa/custom-skills/dialog-interface-reference.html [`alexa-dialog-ref.*`]; Request Customer Contact Information https://developer.amazon.com/en-US/docs/alexa/custom-skills/request-customer-contact-information-for-use-in-your-skill.html [`alexa-request-customer-contact-…`]; Use Voice-Forward Consent https://developer.amazon.com/en-US/docs/alexa/custom-skills/use-voice-forward-consent.html [`alexa-use-voice-forward-consent.*`]; Alexa Reminders Overview https://developer.amazon.com/en-US/docs/alexa/smapi/alexa-reminders-overview.html [`alexa-reminders.*`]; Voice Permissions for Reminders https://developer.amazon.com/en-US/docs/alexa/smapi/voice-permissions-for-reminders.html [`alexa-voice-permissions-for-reminders.*`]; Account Linking for Custom Skills https://developer.amazon.com/en-US/docs/alexa/account-linking/account-linking-for-custom-skills.html [`alexa-account-linking-voice.*`]
- Google: Dialogflow CX Parameters (form filling) https://cloud.google.com/dialogflow/cx/docs/concept/parameter [`dfcx-parameter.*`]; Dialogflow CX State handlers https://cloud.google.com/dialogflow/cx/docs/concept/handler [`dfcx-handler.*`]; Conversational Actions sunset https://developers.google.com/assistant/ca-sunset (WebSearch result only)
- Apple (DocC JSON of the pages below) [`apple-*.json/.txt`]: https://developer.apple.com/documentation/sirikit/resolving-the-parameters-of-an-intent ; …/sirikit/confirming-the-details-of-an-intent ; …/sirikit/handling-an-intent ; …/intents/insendpaymentintenthandling ; …/intents/insendpaymentintentresponsecode ; …/intents/insendpaymentpayeeunsupportedreason ; …/intents/insendpaymentcurrencyamountunsupportedreason ; …/appintents/intentparameter ; …/appintents/appintent ; …/appintents/appintenterror (+ `/permissionrequired`, `/useractionrequired`) ; …/appintents/foregroundcontinuableintent ; …/appintents/intentauthenticationpolicy
- Dialogue theory: Jurafsky & Martin, *Speech and Language Processing* 3rd ed. draft of Aug 19 2026, ch. 26 "Conversation and its Structure" https://web.stanford.edu/~jurafsky/slp3/26.pdf and appendix K "Frame-based Dialogue Systems" https://web.stanford.edu/~jurafsky/slp3/K.pdf [`slp3-26.txt`, `slp3-K.txt`]; Rasa Open Source 3.x Forms https://legacy-docs-oss.rasa.com/docs/rasa/forms [`rasa-forms.*`]; Rasa Pro flow steps https://rasa.com/docs/reference/primitives/flow-steps/ [`rasa-collect.*`]; Rasa patterns https://rasa.com/docs/reference/primitives/patterns [`rasa-patterns.*`]
- MCP: Elicitation (current) https://modelcontextprotocol.io/specification/latest/client/elicitation [`mcp-spec-latest-elicitation.md`]; Elicitation 2025-06-18 https://modelcontextprotocol.io/specification/2025-06-18/client/elicitation [`mcp-spec-2025-06-18-elicitation.md`]; Multi Round-Trip Requests https://modelcontextprotocol.io/specification/2026-07-28/basic/patterns/mrtr [`mcp-mrtr.md`]; Versioning https://modelcontextprotocol.io/specification/versioning [`mcp-versioning.md`]; Changelog https://modelcontextprotocol.io/specification/2026-07-28/changelog [`mcp-changelog.md`]; MCP Apps https://modelcontextprotocol.io/extensions/apps/overview [`mcp-apps-ext.md`]; MCP-UI https://mcpui.dev/guide/introduction [`mcpui-home.*`]
- OpenAI Apps SDK Authentication https://developers.openai.com/apps-sdk/build/auth [`oai-apps-auth.md`]
- LangGraph Interrupts https://docs.langchain.com/oss/python/langgraph/interrupts [`langgraph-interrupts.md`]
- Vercel AI SDK: Tool Calling https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling [`aisdk-tools.md`]; Chatbot Tool Usage https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-tool-usage [`aisdk-chatbot-tool-usage.md`]
- OpenAI Agents SDK HITL: JS https://openai.github.io/openai-agents-js/guides/human-in-the-loop/ ; Python https://openai.github.io/openai-agents-python/human_in_the_loop/ [`oai-agents-*-hitl.*`]
- Anthropic: Handle tool calls https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls [`anthropic-handle-tool-calls.md`]; Tool use overview https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview [`anthropic-tooluse-overview.md`]; "Writing effective tools for agents" https://www.anthropic.com/engineering/writing-tools-for-agents [`anthropic-writing-tools.*`]
- Google ADK Tool Confirmation https://google.github.io/adk-docs/tools-custom/confirmation/ [`adk-confirmation.*`]
- A2A Protocol spec (Latest Released Version 1.0.0) https://a2a-protocol.org/latest/specification/ [`a2a-spec.*`]
- Products: ChatGPT "Connected apps" https://help.openai.com/en/articles/11487775-connected-apps-in-chatgpt [`oai-help-connected-apps.md`] and "Managing app permissions" https://help.openai.com/articles/20001495 [`oai-help-app-permissions.md`]; Cash App "Moneybot" https://cash.app/help/us/en-us/671-moneybot-on-cash-app [`cashapp-moneybot-help.md`]; Claude Help Center https://support.claude.com/en/articles/11176164 and /13730515 (WebFetch only); Revolut AIR / Robinhood: see `04-analogs-and-competitors/fintech-ux-analogs.md`
- Telegram Bot API: https://core.telegram.org/bots/features (deep linking) and https://core.telegram.org/bots [`telegram-*`]
- Package versions (registry, today): `npm view ai version` → 7.0.122; `@openai/agents` 0.18.0; `@langchain/langgraph` 1.4.18; `@modelcontextprotocol/sdk` 1.31.0; `@modelcontextprotocol/ext-apps` 2.0.3; `@mcp-ui/server` 6.1.0; PyPI `langgraph` 1.2.12, `openai-agents` 0.22.3, `google-adk` 2.10.0

Verified: 2026-09-29

---

## 0. Short answer

Nobody calls this "just-in-time setup" or a "blocker". Every mature system splits Abu's single idea into **several distinct mechanisms**, and each has its own resume rule:

| Mechanism (established name) | Where the name comes from | What resumes |
|---|---|---|
| **Slot elicitation / form filling / "value required"** | Alexa `Dialog.ElicitSlot`; Dialogflow CX "form filling"; SiriKit `needsValue()`; MCP `elicitation/create` (form mode); Rasa `collect` | The same request continues with the new value filled in |
| **Disambiguation** | SiriKit "Needs disambiguation"; App Intents `requestDisambiguation(among:dialog:)`; Rasa `pattern_clarification` | Same request, one value chosen |
| **Confirmation** (of a value or of the whole action) | Alexa `Dialog.ConfirmSlot` / `Dialog.ConfirmIntent`; SiriKit confirm phase; App Intents `requestConfirmation`; AI SDK `toolApproval`; OpenAI Agents `needsApproval`; ADK `require_confirmation` | Same action runs, or is denied |
| **Permission / consent request** | Alexa `AskForPermissionsConsent` card and voice-forward consent; App Intents `AppIntentError.PermissionRequired` | Alexa voice-forward consent hands control back with `SessionResumedRequest` |
| **Account linking / auth required** | Alexa `LinkAccount` card; A2A `TASK_STATE_AUTH_REQUIRED`; ChatGPT `_meta["mcp/www_authenticate"]`; MCP URL-mode elicitation; App Intents `UserActionRequired.signin` / `.accountSetup` | Out of band. Completion is **not** reported back in-band (MCP) or the user re-invokes (Alexa card) |
| **Authentication step-up** | App Intents `IntentAuthenticationPolicy.requiresAuthentication`; Alexa voice-forward consent "might ask the user for a PIN or a one-time password" | Same action, after local auth |
| **Unsupported / policy refusal** | SiriKit `unsupported(forReason:)` (e.g. `paymentsAmountAboveMaximum`); A2A `TASK_STATE_REJECTED` (terminal); ChatGPT "a sensitive action may be denied instead of showing an approval prompt" | **Nothing resumes.** The task ends; any change is a *new* request |
| **Error** | Anthropic `tool_result` with `is_error: true`; SiriKit `failure…` codes; Rasa `pattern_internal_error`; A2A `TASK_STATE_FAILED` | Retry or alternative |
| **Continue in the app (surface handoff)** | SiriKit `failureRequiringAppLaunch`; App Intents `needsToContinueInForegroundError` / `continueInForeground(_:alwaysConfirm:)` | The app opens with the intent's context |

Abu's four examples fall into four different rows (see §5).

---

## 1. Voice assistants

### 1.1 Amazon Alexa

**Dialog management** [VERIFIED, `alexa-dialog-ref`, page "Last updated: Nov 28, 2023"]
- Two modes. With auto or manual delegation (`Dialog.Delegate`), "Alexa determines the next step in the dialog and uses the prompts defined in the dialog model to elicit slot values, confirm slot values, validate slot values, or confirm the entire intent." Each request carries `dialogState` = `STARTED` / `IN_PROGRESS` / `COMPLETED`, and `COMPLETED` "means that the IntentRequest has all the required slot values and confirmations from the user and all slot values are validated".
- Or the skill controls each step with `Dialog.ElicitSlot` ("ask the user for the value of a specific slot", `slotToElicit`), `Dialog.ConfirmSlot` ("Be sure repeat back the value to confirm") and `Dialog.ConfirmIntent` ("confirm the all the information the user has provided for the intent before the skill takes action… repeat back all the values").
- "`Dialog.ElicitSlot` does not perform any slot validation."
- **Switching intents mid-dialog:** every Dialog directive has `updatedIntent`, which can "Trigger a dialog on a completely different intent" and "carry over user information from the original intent to the new intent". This is the voice precedent for a side-flow ("add contact") inside the main flow ("send money").
- **Screens:** "You cannot combine the `Dialog.Delegate` directive with any APL directives"; to show visuals during a dialog you control it manually, and you can return `ElicitSlot`/`ConfirmSlot`/`ConfirmIntent` from an APL `UserEvent`, "so your overall dialog can incorporate both touch events and voice".

**Permissions consent card** [VERIFIED, `alexa-request-customer-contact-…`, "Last updated: Aug 23, 2024"]
- The skill can't tell from the token whether it has permission: "you can't use the presence of `apiAccessToken` to determine whether you have the necessary permissions… An HTTP 403 Forbidden response indicates that your skill doesn't have the necessary permissions."
- "You request customer consent by sending a permissions card in the response to Alexa. When you include the `AskForPermissionsConsent` card in the response, Alexa speaks to the customer to tell them to view the card in the Alexa app… The voice prompt that your skill provides should describe why the skill needs these permissions."
- Guidance: "If possible, develop your skill so that some functionality is available without the requested permission and prompt the customer for permissions when needed to fulfill a customer request."
- The card is out of band: the example ends with "To grant permission, go to the home screen in your Alexa app." The docs don't describe automatic resumption [INFERENCE from the example].

**Voice-forward consent (in-conversation, with resume)** [VERIFIED, `alexa-use-voice-forward-consent`, "Last updated: May 01, 2024"]
- On a missing permission, "your skill initiates the voice-forward consent process by passing control to an Amazon-owned voice consent skill by using an Alexa feature called skill connections… and then passes control back to your skill with a success or failure status".
- Directive: `Connections.StartConnection` with `"uri": "connection://AMAZON.AskForPermissionsConsent/2"`, input `@type: AskForPermissionsConsentRequest`, `permissionScopes[]` with `consentLevel` `ACCOUNT` or `PERSON`, and a `token`.
- Sequence from the doc: the skill says why ("I need access to your name, current location, and mobile number so that I can find a ride for you"); Alexa (Amazon-owned wording) asks "Do you give Ride Hailer permission…? You can say 'I approve' or 'no'"; "Based on the type of user information, there might be an additional authentication flow here… a PIN or a one-time password"; then "Alexa sends the skill a `SessionResumedRequest` request (with an `ACCEPTED` status)". Other outcomes: `DENIED`, or `NOT_ANSWERED` / 204 when the user ended the session.
- "you can alter the dialog for your skill, but Amazon controls the dialog for Alexa." The platform owns the consent wording, and the skill owns the "why".

**Reminders permission** [VERIFIED, `alexa-reminders`, `alexa-voice-permissions-for-reminders` "Last updated: May 22, 2024"]
- Two layers: "Global Reminders Read/Write permission" plus "Explicit customer permission for setting each specific reminder", obtained "as part of the dialog", e.g. "Would you like me to remind you?"
- Without the permission, the skill "gracefully informs the customer how to grant permissions and… sends the customer a home card providing a link to the skill permissions page".
- With voice permissions, the skill asks the first question, then "Alexa controls the next prompts… which provides a consistent experience for users across skills": "Do you give Sports News permission to update your reminders? You can say I approve or no." On an unintelligible answer, "Alexa re-prompts the user with a rephrased question." Afterwards the skill should restate "the reminder, its date and time, and its purpose".

**Account linking** [VERIFIED, `alexa-account-linking-voice`, "Last updated: Jul 14, 2026"]
- Users can link "From a link account card in the Alexa app after making a request that requires authentication." The skill detects that no link exists from the missing `accessToken` and returns a `LinkAccount` card plus "Speech text that briefly explains the benefits of linking accounts".
- After OAuth, "The user is redirected back to a 'success' page within the Alexa app and the skill is ready to use." The user then makes the request again. The doc describes no automatic resume [INFERENCE from the flow as written]. Alexa also documents "Voice-Forward Account Linking" (nav title seen, page not read [UNKNOWN details]).

### 1.2 Google (Dialogflow CX)

- Google Assistant Conversational Actions were **sunset on June 13, 2023** [REPORTED via WebSearch of developers.google.com/assistant/ca-sunset]. Google's current reference for form filling is Dialogflow CX.
- **Form filling** [VERIFIED, `dfcx-parameter`, "Last updated 2026-09-24"]: "For each page, you can define a form, which is a list of parameters that should be collected from the end-user… until it has collected all of the required form parameters… For each required form parameter, you also provide prompts… This process is called **form filling**." Fields: `Page.form.parameters[].required`, `.fillBehavior.initialPromptFulfillment`, `.fillBehavior.repromptEventHandlers`, `.redact`, `.defaultValue`. "Your webhook can set the values of form parameters at runtime."
- **Reprompts** [VERIFIED, `dfcx-handler`]: `sys.no-match-default` and `sys.no-input-default`, or numbered `sys.no-match-1…6` / `sys.no-input-1…6`, which "are invoked instead of sys.no-match-default and in order". This escalates the reprompt on each failed attempt.
- The CX form page URL (`/docs/concept/form`) returned 404 today; the form-filling definition above comes from the parameter page [VERIFIED 404].

### 1.3 Apple SiriKit and App Intents

**SiriKit: resolve → confirm → handle** [VERIFIED, `apple-sirikit-*`]
- "During the resolution phase, you validate the individual parameters of an intent object and ask SiriKit for clarifications as needed. During the confirmation phase, you perform one final check of all intent parameters and verify that your services are ready to fulfill the intent."
- Resolution results (quoted from "Resolving the Parameters of an Intent"):
  - **Success**: "Use this resolution even if it means making an educated guess about what the user meant."
  - **Not required**.
  - **Needs disambiguation**: "two or more possible results… causes SiriKit to prompt the user to select one" (the example is two contacts named "John").
  - **Needs confirmation**: "you can choose a single value, but are not completely confident".
  - **Value required** (`needsValue()`): "Return this resolution if the user requests a payment from another person but does not specify the payment amount."
  - **Unsupported**: "the value supplied by the user is invalid or conflicts with the value of other parameters… causes SiriKit to notify the user that the value is not supported."
- Guidance: "Try to reach a resolution of 'Success' or 'Not required' as quickly as possible… avoid repeatedly asking for clarification of the same parameter… choose reasonable values based on the user's patterns and habits, and ask for disambiguation or confirmation only as needed."
- Confirm phase: "verify that any needed services are available"; return a failure code if not. "If SiriKit needs to launch your app for any reason, it passes the provided [NSUserActivity] object to your app."

**The payments domain has reason codes for Abu's exact cases** [VERIFIED, `apple-intents-*`]
- `INSendPaymentPayeeUnsupportedReason`: `.noAccount` ("The payee does not have an account in your app"), `.noValidHandle` ("The unique handle that you use to identify the payee is invalid or missing"), `.credentialsUnverified`, `.insufficientFunds`.
- `INSendPaymentCurrencyAmountUnsupportedReason`: `.paymentsAmountAboveMaximum` ("exceeds the maximum transfer amount allowed by your app for the user"), `.paymentsAmountBelowMinimum`, `.paymentsCurrencyUnsupported`.
- `INSendPaymentIntentResponseCode`: `.ready`, `.inProgress`, `.success`, `.failure`, `.failureRequiringAppLaunch` ("The user must launch your app to send the funds"), `.failureCredentialsUnverified`, `.failurePaymentsAmountBelowMinimum`, `.failurePaymentsAmountAboveMaximum`, `.failurePaymentsCurrencyUnsupported`, `.failureInsufficientFunds`, `.failureNoBankAccount`, `.failureNotEligible`, `.failureTermsAndConditionsAcceptanceRequired`.

**App Intents (current framework)** [VERIFIED, `apple-appintents-intentparameter`, `apple-ai-*`]
- On a parameter: `requestValue(_:)`, `needsValueError(_:)` ("request a value from the user for this parameter and **re-perform the intent** with the new value"), `requestDisambiguation(among:dialog:)`, `needsDisambiguationError(among:dialog:)`, `requestConfirmation(for:dialog:)`.
- On the intent: `requestChoice(between:dialog:)` ("Pauses the app intent and asks the person to choose"), `requestConfirmation(conditions:actionName:dialog:showDialogAsPrompt:snippetIntent:)` ("confirmation prompt that includes an interactive snippet").
- Typed errors: `AppIntentError.PermissionRequired` (`.contacts`, `.location(precise:)`, `.photos`, `.siri`, …: "inform people that the app requires specific permissions") and `AppIntentError.UserActionRequired` (`.accountSetup`, `.signin`, `.confirmation`: "steps they can take to fix the error").
- Continue in the app: `needsToContinueInForegroundError(_:alwaysConfirm:)` and `continueInForeground(_:alwaysConfirm:)` (iOS 26.0+). The older `ForegroundContinuableIntent` (iOS 16.4) is deprecated in favour of `supportedModes` `.foreground(.dynamic)`.
- Step-up: `IntentAuthenticationPolicy` `.alwaysAllowed` / `.requiresAuthentication` / `.requiresLocalDeviceAuthentication`.
- The on-screen wording Siri uses for "continue on iPhone" / "open app" is not given on these pages [UNKNOWN].

---

## 2. Task-oriented dialogue theory

**Jurafsky & Martin, SLP3 (draft Aug 19 2026)** [VERIFIED, `slp3-26.txt`, `slp3-K.txt`]
- **Frames and slot filling** (App. K): the frame's slots "specify what the system needs to know"; the system asks questions to fill them, then "perform[s] the relevant action".
- **Grounding** (§26.1.3): establishing "common ground (Stalnaker, 1978)", with the hearer showing understanding along a continuum (Clark & Schaefer 1989): continued attention, next contribution, acknowledgment, demonstration, display. "Grounding is also important when the hearer needs to indicate that the speaker has not succeeded in performing an action." The elevator-button light is their example of grounding a non-linguistic action.
- **Side sequences / clarification subdialogues** (§26.1.4): "Another side sequence is the clarification question, which can form a subdialogue between a REQUEST and a RESPONSE." After a correction subdialogue the agent must "go back to finding return flights", i.e. return to the interrupted task.
- **Initiative** (§26.1.5): "mixed initiative (Carbonell, 1970)"; "Even modern large language model-based dialogue systems… often don't have completely natural initiative switching."
- **Confirmation policy** (App. K.1.3): explicit confirmation vs implicit confirmation vs rejection ("I'm sorry, I didn't understand that"); explicit "makes it easier for users to correct… But… is time-consuming and awkward"; a four-tier confidence policy: below α reject, ≥α confirm explicitly, ≥β confirm implicitly, ≥γ don't confirm.

**Rasa** [VERIFIED]
- Rasa Open Source 3.x **Forms** (legacy docs site): `active_loop`, `requested_slot`, a `validate_<form_name>` custom action extending `FormValidationAction` with `validate_<slot_name>` methods, and "Writing Stories / Rules for Unhappy Form Paths", e.g. "User interrupts the form and doesn't want to continue".
- Rasa Pro CALM **flows**:
  - `collect: <slot>` asks via `utter_ask_{slot}` or a custom `action_ask_{slot}` ("display available values for the slot fetched from a database as buttons"), and "a collect step is skipped if the corresponding slot is already filled".
  - `force_slot_filling: true` (new in 3.12) suppresses digressions.
  - The **`call` step** (new in 3.8.0): "When the execution reaches a call step, CALM starts the child flow. Once the child flow is complete, the execution continues with the parent flow."
- Rasa **conversation-repair patterns**: `pattern_continue_interrupted`, `pattern_correction`, `pattern_cancel_flow`, `pattern_clarification`, `pattern_cannot_handle`, `pattern_internal_error`, `pattern_human_handoff`, `pattern_chitchat`. `pattern_continue_interrupted` asks "Would you like to continue with {{context.interrupted_flow_options}}?". From 3.17, `pattern_internal_error` carries structured failure context for MCP tool and A2A sub-agent failures.

---

## 3. LLM agent frameworks (current docs)

### 3.1 MCP elicitation [VERIFIED]
- **Versions:** elicitation was "newly introduced" in **2025-06-18** (server sends an `elicitation/create` request; form only; "Servers MUST NOT use elicitation to request sensitive information"). **URL mode** was "introduced in the `2025-11-25` version". The **current** protocol version is **2026-07-28** (`mcp-versioning.md`).
- **2026-07-28 breaking change (MRTR, SEP-2322):** server-initiated requests are gone. During a `tools/call`, the server returns an **`InputRequiredResult`** (`resultType: "input_required"`) whose `inputRequests` map holds one or more `elicitation/create` requests. The client collects the input and **retries the original request** with `inputResponses`, plus an opaque `requestState` that it "MUST NOT inspect". "If `requestState` influences authorization, resource access, or business logic, servers MUST protect its integrity (e.g. HMAC or AEAD)." `notifications/elicitation/complete` and `elicitationId` were removed. Tasks moved to an extension (`io.modelcontextprotocol/tasks`).
- **Form mode:** `message` plus a `requestedSchema` limited to "flat objects with primitive properties only" (string with formats `email`/`uri`/`date`/`date-time`, number, boolean, single- or multi-select enum), with defaults the client "SHOULD pre-populate".
- **URL mode:** "Servers MUST use URL mode for interactions involving such sensitive information" (passwords, API keys, tokens, payment credentials), and for **third-party OAuth** where "The third-party credentials MUST NOT transit through the MCP client".
  - Clients MUST NOT open the URL without consent, "MUST show the full URL", and must open it securely: "on iOS, SFSafariViewController is good, but WkWebView is not."
  - **Completion is not reported in-band:** "`accept` indicates that the user has consented to the interaction. It does not mean that the interaction is complete." On retry the server decides whether it is done or returns another `InputRequiredResult`. Clients "SHOULD provide manual controls that let the user retry or cancel".
  - **Phishing:** "the server MUST ensure that the user who started the elicitation request… is the same user who completes the authorization flow" (e.g. compare the `sub` from the session cookie).
- **Response actions:** `accept` (with `content`), `decline` ("explicitly declined… e.g., offer alternatives"), `cancel` ("dismissed… e.g., prompt again later"). "Servers MUST bind elicitation requests to the client and user identity."

### 3.2 Inline UI: MCP Apps, MCP-UI, OpenAI Apps SDK [VERIFIED]
- **MCP Apps** (an official extension; postMessage spec folder `specification/2026-01-26`): a tool declares `_meta.ui.resourceUri` pointing to a `ui://` resource, and the host renders the HTML "inside a sandboxed iframe within the conversation". The app talks to the host over a JSON-RPC dialect (`ui/…` methods) and "can call any tool on the MCP server". The doc lists "Context preservation. The app lives inside the conversation" as the reason not to send a link.
- **MCP-UI** "pioneered" the idea, and today "the @mcp-ui/* packages implement this standard" (`@mcp-ui/server` 6.1.0; `@modelcontextprotocol/ext-apps` 2.0.3).
- **OpenAI Apps SDK: the "connect" prompt mid-conversation:** "ChatGPT only surfaces its OAuth linking UI when your MCP server signals that OAuth is available or necessary." This needs per-tool `securitySchemes` (`noauth`, `oauth2` with scopes; both means "start with anonymous calls but that linking unlocks privileged behavior"), plus a runtime tool result with `isError: true` and `_meta["mcp/www_authenticate"]` containing `error` and `error_description`. That payload "is what actually triggers the tool-level OAuth UI".

### 3.3 LangGraph `interrupt()` [VERIFIED; `langgraph` 1.2.12 / `@langchain/langgraph` 1.4.18]
- `interrupt(payload)` pauses inside a node. The payload surfaces under `__interrupt__` (`invoke`) or `stream.interrupts` (`stream_events(..., version="v3")`). You resume with `Command(resume=value)`, which "becomes the return value of the interrupt() call".
- Requires a **checkpointer** ("use a durable checkpointer in production") and `thread_id` ("your persistent cursor").
- **The node re-runs from the start on resume:** "any code before the interrupt runs again". So "Side effects called before interrupt must be idempotent", and "Do not wrap interrupt calls in try/except". For validation, "call interrupt() once per node invocation… and use a conditional edge to loop back", not a `while True` loop. Parallel interrupts are resumed with a map of interrupt ids.

### 3.4 Vercel AI SDK [VERIFIED; `ai` 7.0.122]
- **Tool approval:** `toolApproval` on `generateText` / `streamText` / `ToolLoopAgent`. Values are `'not-applicable'` (default), `'approved'`, `'denied'`, `'user-approval'`, optionally `{type, reason}`, or a function per call. "The older `needsApproval` property on `tool()` definitions is deprecated."
- "When a tool requires manual approval, generateText and streamText **don't pause** execution. Instead, they complete and return `tool-approval-request` parts… the manual approval flow requires two calls to the model." In `useChat`, tool part states include `approval-requested`, `approval-responded` and `output-denied`, and the UI answers with `addToolApprovalResponse`. Automatic decisions set `part.approval.isAutomatic`.
- **Client-side tools / "awaiting user input":** tools without server `execute` reach the client in state `input-available`. Auto-run ones are handled in `onToolCall`; interactive ones render UI, and the user's answer goes back via `addToolOutput` (or `state: 'output-error'` with `errorText`). `sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls` resubmits automatically. The docs' example is an `askForConfirmation` client tool.

### 3.5 OpenAI Agents SDK [VERIFIED; `@openai/agents` 0.18.0, `openai-agents` 0.22.3]
- `needsApproval` (JS) / `needs_approval` (Py): `true` or an async function per call. Python callables "fail closed" on malformed arguments.
- When approval is required, "the tool call does not execute… the run pauses and returns all pending approvals in the result `interruptions` array" (`RunToolApprovalItem` / `ToolApprovalItem`). You resolve them with `state.approve(item)` / `state.reject(item, {message})` (options `alwaysApprove` / `alwaysReject`) and **resume** with `runner.run(agent, state)`.
- Durable: `RunState` → `toString()`/`fromString()` (JS), `to_json()`/`from_string()` (Py). "`from_string()` do[es] not authenticate the snapshot"; "For browser or mobile approval interfaces, keep the complete snapshot in application-controlled server storage", sending the reviewer only details plus "opaque identifiers".
- Voice: Realtime sessions approve via `approve_tool_call` / `reject_tool_call`. `toolExecution: { preApprovalInputGuardrails: true }` runs guardrails before the approval is shown, and on rejection "returns the guardrail message to the model as tool output instead of creating an approval interruption".

### 3.6 Anthropic [VERIFIED]
- Errors: return a `tool_result` with `"is_error": true`, and "Claude will then incorporate this error into its response to the user." Tip: "Write instructive error messages… include what went wrong and what Claude should try next." For missing parameters, "Claude will retry 2-3 times with corrections before apologizing to the user", and "strict tool use with `strict: true`… guarantees that tool inputs will always match your schema".
- **Clarifying vs guessing:** "Claude Opus is much more likely to recognize that a parameter is missing and ask for it. Claude Sonnet might ask… But it might also infer a reasonable value". The example guesses `"New York, NY"`, and "This behavior is not guaranteed". So a model may **invent a missing value**.
- Engineering blog: an agent "might… ask a clarifying question about location first"; "prompt-engineer your error responses to clearly communicate specific and actionable improvements, rather than opaque error codes".
- No Anthropic-API-level "pause for user input" primitive was found in these pages [UNKNOWN beyond tool results and MCP].

### 3.7 Google ADK [VERIFIED; page marks the feature **Experimental**, "ADK Python v1.14.0, TypeScript v0.2.0, Go v0.3.0, Kotlin v0.1.0"; PyPI `google-adk` 2.10.0]
- `FunctionTool(fn, require_confirmation=True | callable)`, or `tool_context.request_confirmation(hint=…, payload=…)` for structured input. The TypeScript sample returns `status: 'AWAITING_CONFIRMATION'` / `'AWAITING_MANAGER_APPROVAL'` ("The amount … exceeds the $1000 limit and requires manager approval").
- The client answers with a `function_response` named `adk_request_confirmation` (matching id) and `{confirmed, payload}`. With the Resume feature it must pass the same `invocation_id`, "otherwise the system starts a new invocation". Known limitation: `DatabaseSessionService` and `VertexAiSessionService` are not supported.

### 3.8 A2A protocol [VERIFIED, "Latest Released Version 1.0.0"]
- Task states: `TASK_STATE_INPUT_REQUIRED` ("requires additional user input to proceed. This is an **interrupted** state"), `TASK_STATE_AUTH_REQUIRED` ("authentication is required… interrupted"), `TASK_STATE_REJECTED` ("the agent has decided to not perform the task… can't or won't proceed. This is a **terminal** state"), plus `COMPLETED`, `FAILED`, `CANCELED` (terminal) and `SUBMITTED`, `WORKING`.
- Resume: "The client continues the interaction by sending a new message with the same `taskId` and `contextId`."

---

## 4. Product precedents

- **ChatGPT apps** [VERIFIED, help center]: "choose an available app, connect an account if prompted"; "If prompted, select **Connect** or continue the app's setup flow". Permission levels are "Always ask", "Allow read actions", "Allow low-risk actions" ("Higher-risk actions may require confirmation or be denied") and "Allow all actions". Before an action, "ChatGPT may show an approval card describing the app and the proposed action" with **Allow once / Allow low-risk actions / Always allow**, but "Always allow" is not offered "for actions that require additional safety review". Also: "Some requests may be denied instead of showing an approval prompt."
- **Claude connectors** [VERIFIED absence]: the two help articles fetched describe setup, per-conversation toggles and org-level "Always allow, Needs approval, or Blocked", but not a mid-conversation "connect this" prompt [UNKNOWN whether Claude shows one; not documented there].
- **Cash App Moneybot** [VERIFIED, cash.app help]: can "add to your balance, withdraw…, send payments, and transfer to Cash App Savings"; "guides you through steps, only completing actions once you confirm them"; "cannot take actions without your confirmation".
- **Revolut AIR, Robinhood Assistant, Erica**: already covered in `04-analogs-and-competitors/fintech-ux-analogs.md` (AIR: biometric approval for sensitive actions [REPORTED]; Robinhood: "No transaction will be executed without your explicit confirmation on the final order confirmation screen" and unsupported requests hand off "with conversation context" [VERIFIED there]). I found no documented "missing recipient → add-contact pop-up" flow in any of them [UNKNOWN].
- **Siri "continue on iPhone"**: only the APIs are verified (`failureRequiringAppLaunch`, `needsToContinueInForegroundError`). The user-facing wording is [UNKNOWN].
- **Telegram constraint** [VERIFIED, core.telegram.org]: "Bots can't start conversations with users. A user must either add them to a group or send them a message first." Deep link `https://t.me/<bot>?start=<param>`; the parameter allows `A-Z a-z 0-9 _ -`, "can be up to 64 characters", and can carry "an authentication token to connect the user's Telegram account to their account on another platform".

---

## 5. Synthesis [INFERENCE]

### 5.1 Abu's four examples, named correctly

| Abu's example | Correct mechanism | Closest precedents | Resume? |
|---|---|---|---|
| "Send to Alex", Alex unknown | **Slot resolution failure on the payee → elicitation of a new value** (form-mode elicitation). If two Alexes: **disambiguation**. If one fuzzy match: **needs confirmation** | SiriKit `resolvePayee` → `needsValue()` / `.disambiguation` / `unsupported(forReason: .noValidHandle/.noAccount)`; Alexa `Dialog.ElicitSlot` + `updatedIntent` to an AddContact intent; Rasa `call: add_contact` then back to parent; MCP `elicitation/create` form mode | Yes: same request continues with the payee filled |
| "Notify me on Telegram", not connected | **Account linking / third-party auth required** (out of band) | Alexa `LinkAccount` card; A2A `AUTH_REQUIRED`; MCP **URL-mode** elicitation; ChatGPT `mcp/www_authenticate` → linking UI; App Intents `UserActionRequired.accountSetup` | Yes, but **asynchronous**: the app learns of completion only when the bot receives `/start <token>` |
| Exceeds limits | **Unsupported value / policy refusal** of the amount against the user's own limit. The "fix" (raise the limit) is a **separate settings action that needs step-up** | SiriKit `paymentsAmountAboveMaximum`; ADK "exceeds the $1000 limit and requires manager approval"; `IntentAuthenticationPolicy.requiresAuthentication` | The original request is **refused**; offer alternatives (smaller amount, split). If the user changes the limit, re-run the full check and re-confirm |
| Meme coin blocked "based on your rule" | **Policy refusal** (the user's own rule), not missing input | A2A `TASK_STATE_REJECTED` (terminal); ChatGPT "may be denied instead of showing an approval prompt"; SiriKit `unsupported` | Not a pause. Explain which rule applied; a rule change is a new, step-up-gated settings action |

The remaining rows of the catalogue map the same way: two contacts → disambiguation; ambiguous currency → value required or confirmation; push or mic permission → **permission request** (`AppIntentError.PermissionRequired`; the OS prompt); not signed in → `UserActionRequired.signin`; terms not accepted → `failureTermsAndConditionsAcceptanceRequired`; insufficient funds → `failureInsufficientFunds` (error with alternatives); provider down → **error** (`is_error` with an instructive message); first payment → **explicit confirmation** (`ConfirmIntent`).

### 5.2 How pause → fix → resume should work (based on the precedents)
1. **Model the request as a durable, server-held task with a status**, using A2A's vocabulary: `input-required`, `auth-required`, `rejected`, `failed`, `completed`. Keep the snapshot server-side and give clients opaque ids (OpenAI Agents SDK guidance). If the state is ever put in a token, protect it with HMAC/AEAD (MCP `requestState` rule), bind it to the user (MCP "MUST bind elicitation requests to… user identity"), and give it an expiry.
2. **Resume = re-run the whole check with the new input.** MCP MRTR retries the original request, and LangGraph re-runs the node. So everything before the pause must be idempotent, and nothing with side effects (quotes that reserve funds, the transfer itself) may run before the last pause.
3. **Only interrupted states resume.** `rejected` is terminal (A2A). After a rule or limit change, start a fresh check and a fresh confirmation, never a silent continue.
4. **Handle `decline` and `cancel` separately** (MCP): decline → offer alternatives; cancel → keep the task and remind later.
5. **Out-of-band fixes (Telegram, OAuth, onramp) don't report completion in-band** (MCP URL mode). Show "Waiting for Telegram… / I've done it / Cancel", listen for the bot's `/start <token>`, verify the token belongs to the same user (the MCP phishing rule), then resume.
6. **Per surface:**
   - **Chat / generative UI:** render the fix inline (MCP Apps / AI SDK client tool with `addToolOutput`, or an approval part).
   - **Voice:** short spoken values (amount, which of two contacts) can be elicited by voice (`ElicitSlot`, re-prompts with escalation as in `sys.no-match-1..6`). Anything unspeakable or sensitive (a 0x address, OAuth, a biometric) goes to the screen with a spoken pointer, as Alexa does with `AskForPermissionsConsent` ("view the card in the Alexa app").
   - **Telegram:** it can't render the fix form. Send a deep link back into the app (the Alexa-card model) and keep the task id so it resumes there.
7. **Consent wording belongs to the platform, the "why" to the requester** (Alexa: "Amazon controls the dialog for Alexa"). The fix card's approval text should be fixed app copy, with the LLM only phrasing the explanation.

### 5.3 What SMART-PRECONDITIONS.md gets wrong or naive
1. **One "blocker" type with one five-step loop is too coarse.** Precedents separate input, disambiguation, confirmation, permission, auth/linking, step-up, policy refusal and error, and they differ in whether and how they resume (§0). In particular the doc treats the meme-coin rule and the limit as "blockers to fix and resume". In A2A and SiriKit terms they are **refusals/unsupported values**, and loosening them should start a new, step-up-gated settings action followed by a fresh confirm, not a resume.
2. **"Resume… the user never has to repeat the request"** holds for in-band elicitation (MCP retry, LangGraph, Alexa `SessionResumedRequest`) but **not** for out-of-band linking as documented by Alexa (the user re-invokes) or MCP URL mode (no completion signal). The Telegram row needs an explicit waiting state and a completion signal.
3. **"Connect Telegram card (deep link)"** ignores that the bot can't message first, that `start` is ≤64 chars, and that the link token must be bound to and checked against the same user (the MCP URL-mode phishing rule).
4. **"Pending intents are stored server-side… with an expiry"** is right, but it should also be user-bound and integrity-protected, and it should be re-validated in full on resume (LangGraph re-run semantics). The doc says "re-checks everything", which is consistent; keep that.
5. **"Never happen by voice alone"** is a product choice, not an industry rule: Alexa grants permissions by voice ("I approve"), sometimes adding a PIN/OTP. Keep it for money, but label it a decision.
6. **The ambiguity section always asks.** SiriKit says to prefer "Success… even if it means making an educated guess" and to avoid repeat questions, and SLP3 gives confidence-tiered explicit/implicit confirmation. Use defaults plus implicit confirmation for low-risk slots (e.g. the only stablecoin held), and explicit confirmation for recipient and amount.
7. **"The model never decides whether a precondition passed"** is strongly supported: Anthropic documents that Sonnet "might also infer a reasonable value" for a missing parameter. For "send to Alex" the model must never fill an address; server-side resolution plus `strict: true` schemas.
8. **Terminology:** "just-in-time setup" and "blocker" are Claude's words (the doc admits it). Use the established terms: slot elicitation / form filling, disambiguation, confirmation, permission consent, account linking (auth-required), step-up authentication, policy refusal (rejected), error, and "input-required / interrupt-and-resume" for the umbrella behaviour.
9. **Missing from the doc:** a decline-vs-cancel path; a limit on re-asks (SiriKit, Dialogflow no-match escalation); multiple simultaneous missing items (MCP `inputRequests` is a map, and LangGraph resumes several interrupts at once), where batching on screen and sequencing by voice is my inference.

### Gaps
- No verified product flow anywhere for "unknown payee → add contact inline → payment resumes" in a consumer AI assistant; the closest are SiriKit's payee resolution and Alexa's intent chaining [UNKNOWN in shipped fintech assistants].
- Claude's and ChatGPT's exact in-chat "connect" UI copy was not documented in the pages read. The Alexa voice-forward account-linking page was not read.
