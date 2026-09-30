# What established UX, design-system and API standards call "can't proceed until X is fixed", and how they say to handle it

Purpose: answer Abu's question from Message 8 ("I don't know what that is called") with sources: is "Alex isn't a contact / Telegram isn't connected / over your limit / blocked by your meme-coin rule" an *error* or something else, and what is the established way to handle it? This file also checks `../SMART-PRECONDITIONS.md` against that guidance.

Sources (raw copies saved under `.firecrawl/product/11/`):
- NN/g: [10 Usability Heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/) · [Error-Message Guidelines](https://www.nngroup.com/articles/error-message-guidelines/) (Neusesser & Sunwall, 2023-05-14) · [Permission Requests](https://www.nngroup.com/articles/permission-requests/) (Rosala, 2019-04-28) · [Indicators, Validations, Notifications](https://www.nngroup.com/articles/indicators-validations-notifications/) (Flaherty, 2024-01-17) · [Onboarding Tutorials vs. Contextual Help](https://www.nngroup.com/articles/onboarding-tutorials/) (Laubheimer, 2023-02-12) · [Help and Documentation](https://www.nngroup.com/articles/help-and-documentation/) (Kendrick, 2020-12-13) · [Empty States](https://www.nngroup.com/articles/empty-state-interface-design/) (Kaplan, 2021-09-19) · [Confirmation Dialogs](https://www.nngroup.com/articles/confirmation-dialog/) (Nielsen, reviewed 2026-08-07) · [Designing Use-Case Prompt Suggestions](https://www.nngroup.com/articles/designing-use-case-prompt-suggestions/)
- Apple: HIG [Privacy](https://developer.apple.com/design/human-interface-guidelines/privacy) · [Onboarding](https://developer.apple.com/design/human-interface-guidelines/onboarding) · [Alerts](https://developer.apple.com/design/human-interface-guidelines/alerts) · [Feedback](https://developer.apple.com/design/human-interface-guidelines/feedback); SiriKit [INIntentResolutionResult](https://developer.apple.com/documentation/intents/inintentresolutionresult) · [INPersonResolutionResult](https://developer.apple.com/documentation/intents/inpersonresolutionresult) · [Resolving and handling intents](https://developer.apple.com/documentation/sirikit/resolving-and-handling-intents) · [INSendPaymentIntentResponseCode](https://developer.apple.com/documentation/intents/insendpaymentintentresponsecode); App Intents [IntentParameter](https://developer.apple.com/documentation/appintents/intentparameter) (fetched as Apple's DocC JSON at `developer.apple.com/tutorials/data/...json`)
- Google/Android: Material Design 1 [Errors](https://m1.material.io/patterns/errors.html) · [Permissions](https://m1.material.io/patterns/permissions.html) (Material 1 says it is "no longer maintained"); Android [Request runtime permissions](https://developer.android.com/training/permissions/requesting)
- Microsoft: Windows UX guide [Error messages](https://learn.microsoft.com/en-us/windows/win32/uxguide/mess-error) · [Warning messages](https://learn.microsoft.com/en-us/windows/win32/uxguide/mess-warn) (Win32-era guide); WinUI [InfoBar](https://learn.microsoft.com/en-us/windows/apps/design/controls/infobar)
- GOV.UK Design System: [Error message](https://design-system.service.gov.uk/components/error-message/) · [Validation](https://design-system.service.gov.uk/patterns/validation/)
- Atlassian Design System: [Error messages](https://atlassian.design/foundations/content/designing-messages/error-messages) · [Warning messages](https://atlassian.design/foundations/content/designing-messages/warning-messages)
- Baymard: [Improve Validation Errors with Adaptive Messages](https://baymard.com/blog/adaptive-validation-error-messages) (via WebFetch; page is JS-rendered)
- API standards: [gRPC status codes](https://github.com/grpc/grpc/blob/master/doc/statuscodes.md) · [google/rpc/code.proto](https://github.com/googleapis/googleapis/blob/master/google/rpc/code.proto) · [google/rpc/error_details.proto](https://github.com/googleapis/googleapis/blob/master/google/rpc/error_details.proto) · [AIP-193 Errors](https://google.aip.dev/193) · [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457) · [RFC 9110 §15.5](https://www.rfc-editor.org/rfc/rfc9110#section-15.5) · [RFC 6585 §3](https://www.rfc-editor.org/rfc/rfc6585#section-3)
- Agent protocols: [MCP Elicitation, spec 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/client/elicitation) · [LangGraph Interrupts](https://docs.langchain.com/oss/python/langgraph/interrupts)
- Payments/fintech: Stripe [Payment Intents lifecycle](https://docs.stripe.com/payments/paymentintents/lifecycle) · [PaymentIntent object](https://docs.stripe.com/api/payment_intents/object) · [Error codes](https://docs.stripe.com/error-codes) · [Errors](https://docs.stripe.com/api/errors); Plaid [Update mode](https://plaid.com/docs/link/update-mode/) · [Item errors](https://plaid.com/docs/errors/item/); [Coinbase Account limits](https://help.coinbase.com/en/coinbase/trading-and-funding/buying-selling-or-converting-crypto/limits-and-account-levels) (Firecrawl) · Wise [limits](https://wise.com/help/articles/2526719/are-there-limits-to-how-much-i-can-send) · [send more than my bank allows](https://wise.com/help/articles/2977944/what-if-i-want-to-send-more-than-my-bank-allows) · [Revolut monthly spending limit](https://help.revolut.com/en-US/help/card-payments-withdrawals/getting-started-with-card-payments/changing-card-security-settings/setting-a-monthly-spending-limit/) (Firecrawl) · [MetaMask security alerts](https://support.metamask.io/configure/wallet/security-alerts/) · Rabby security-rules thread (Rabby's own X posts, 2022-01-22, read via [threadreaderapp](https://threadreaderapp.com/thread/1484883157920862208.html))

Verified: 2026-09-29

---

## 0. Short answer for Abu

- **Is it an error?** It depends on which standard you ask, and they disagree. NN/g defines "error message" broadly enough to include it. GOV.UK and Microsoft say it is *not* an error. See §1.
- **What is it called?** No UX body gives this whole flow ("notice what's missing, pop up the fix, then carry on") one standard name. The established names cover pieces of it:
  - **precondition failure**: engineering (gRPC `FAILED_PRECONDITION`, `google.rpc.PreconditionFailure`).
  - **parameter resolution**: voice assistants. SiriKit's `needsValue`, `disambiguation` and `confirmationRequired`; App Intents' `needsValueError` "re-performs" the intent afterwards.
  - **elicitation**: AI-agent protocols (MCP's `URLElicitationRequiredError`, "required to complete before the original can be retried").
  - **ask in context / educate in context**: permissions (Material, Android, Apple, NN/g).
  - **pull revelations / contextual help**: NN/g.
  - **incompatible state errors**: Material Design 1.
- **"Just-in-time setup" is not an established term.** I found no primary source that uses it (§1.4). Neither "inline remediation" nor "progressive onboarding" showed up in any primary source I checked.

---

## 1. Terminology: what sources call these situations

### 1.1 "Error": sources disagree on scope

| Source | What it says | Where Abu's cases fall |
|---|---|---|
| NN/g Error-Message Guidelines [VERIFIED] | "Error message: A system-generated interruption to the user's workflow that informs the user of an incomplete, incompatible, or undesirable situation according to the system's implementation." | Inside the definition: "incomplete" (no address for Alex) and "incompatible" (Telegram not connected). |
| Material Design 1, Errors [VERIFIED] | "Errors occur when an app fails to complete an action, such as: The app does not understand user input; The system or app fails; A user intends to run incompatible operations concurrently." It names three types: **user input errors, app errors, incompatible state errors**. "Incompatible state errors occur when users attempt to run operations that conflict, such as making a call while in airplane mode… When these errors are triggered, do not imply that they are the user's fault." | "Notify me on Telegram" while Telegram isn't connected is the airplane-mode example in our domain. |
| GOV.UK Error message [VERIFIED] | "Do not use error messages to tell a user that they are not eligible or do not have permission to do something. Or to tell them about a lack of capacity or other problem the user cannot fix… Instead, take the user to a page that explains the problem… and provides useful information about what to do next." GOV.UK Validation adds: "Do not use validation to check whether the user is eligible to use the service or has permission to do something." | Limit exceeded and meme coin blocked by the user's rule are permission/eligibility cases. By GOV.UK's rule, they are **not error messages**. |
| Microsoft Windows UX guide, Error messages [VERIFIED] | "Is the user interface (UI) presenting a problem that has already occurred? If not, the message isn't an error. If the user being alerted of a condition that might cause a problem in the future, use a warning message." It also says: "Can the problem be prevented without causing confusion? If so, prevent the problem instead." | A check that runs *before* executing is, on Microsoft's test, not an error. Nothing has failed yet. |
| Atlassian [VERIFIED] | "An error message, different from a warning message, appears after someone has taken an action." "A warning message… appears before someone takes an action… It draws their attention to a potential problem that may or may not require an action on the user's part." | The same before/after split as Microsoft. |
| NN/g Indicators, Validations, Notifications [VERIFIED] | "Validation messages are error messages related to users' inputs: they communicate whether the data just entered was incomplete or incorrect." | Only an input the user got wrong counts as validation (e.g. a malformed address). |

### 1.2 Error prevention vs. error recovery (NN/g heuristics) [VERIFIED]
- **#5 Error Prevention:** "Good error messages are important, but the best designs carefully prevent problems from occurring in the first place. Either eliminate error-prone conditions, or check for them and present users with a confirmation option before they commit to the action." Also: "There are two types of errors: slips and mistakes. Slips are unconscious errors caused by inattention. Mistakes are conscious errors based on a mismatch between the user's mental model and the design."
- **#9 Help Users Recognize, Diagnose, and Recover from Errors:** "Error messages should be expressed in plain language (no error codes), precisely indicate the problem, and constructively suggest a solution."
- [INFERENCE] Abu's pattern is **#5's "check for them… before they commit"** delivered with **#9's "constructively suggest a solution"**. The user has made neither a slip nor a mistake. The system is missing data or a configuration step, or a rule the user chose is doing its job.

### 1.3 Permission prompts: the closest UX precedent for "not set up yet → fix it here"
- NN/g Permission Requests [VERIFIED]: "Rather than reporting an error when users try to access a feature that relies on a denied permission, clearly explain why that functionality can't be used, and make it easy for them to grant access… provide a link to where they can toggle the permission on." Also: "Whenever possible, initiate a permission request when the user selects a feature that requires that permission."
- Material 1 Permissions [VERIFIED] names the patterns **"Educate before asking", "Ask up-front", "Ask in context", "Educate in context"**: "For non-critical permissions, wait until a feature is invoked to request permission." On denial: "the app should state that permission is needed and provide a way to allow it."
- Android [VERIFIED]: "Ask for a permission in context, when the user starts to interact with the feature that requires it." "Don't block the user. Always provide the option to cancel an educational UI flow." "gracefully degrade your app so that the user can continue using your app."
- Apple HIG Privacy [VERIFIED]: "Ideally, wait to request permission until people actually use an app feature that requires access." HIG Onboarding: "Postpone nonessential setup flows or customization steps. Provide reasonable default settings… Otherwise, present a permission request when people first access the specific function that relies on private data or resources."

### 1.4 Onboarding terms: "just-in-time", "progressive", "contextual"
- NN/g's established terms are **push vs. pull revelations** [VERIFIED]. "Pull revelations are help content triggered by some signal that the user would benefit from that information at that moment." Also "Favor pull over push revelations" (Help and Documentation), and "A good user experience depends heavily on context — presenting information and options to users at the right moment, when they are ready for it, not when it's convenient for the system" (Onboarding Tutorials).
- Apple HIG Onboarding [VERIFIED]: "Consider providing a collection of context-specific tips instead of a single onboarding flow."
- "Just-in-time" appears in NN/g only in passing, about AI prompt suggestions: "offering just-in-time guidance and relevant next steps" (Designing Use-Case Prompt Suggestions) [VERIFIED]. It is not a defined pattern name there.
- [UNKNOWN] "progressive onboarding", "just-in-time onboarding/setup" and "inline remediation": I found no definition from NN/g, Apple, Google, Microsoft or GOV.UK. A WebSearch for "inline remediation" returned only blogs and GitHub issues. These are informal industry phrases at best, so do not present them as standards.

### 1.5 Empty state and blocked state
- **Empty state** (NN/g) [VERIFIED]: "containers, screens, or panels for which content does not yet exist or otherwise cannot be displayed." It applies to *screens* (e.g. an empty Contacts list or "no alerts configured"), not to a refused *action*. It is relevant to our Contacts and Notifications screens, not to the "send to Alex" moment.
- **"Blocked state"**: [UNKNOWN] I found no design-system definition. Searches returned only engineering issue trackers.

### 1.6 Voice/agent vocabulary (closest to our product)
- **SiriKit** [VERIFIED] splits a request into phases: "During the resolution phase, you validate the individual parameters of an intent object and ask SiriKit for clarifications as needed. During the confirmation phase, you perform one final check of all intent parameters and verify that your services are ready to fulfill the intent." Resolution results include `needsValue()` ("a required parameter value is missing"), `disambiguation(with:)` ("requires the user to select from among the specified objects"), `confirmationRequired(with:)` ("the user must confirm the value before proceeding"), `unsupported()` ("your app doesn't support the specified value") and `notRequired()`. Apple also advises: "always strive toward successful resolutions… use the previous… values as default values rather than asking the user."
- **SiriKit payments** [VERIFIED]: `INSendPaymentIntentResponseCode` includes `failurePaymentsAmountAboveMaximum`, `failurePaymentsAmountBelowMinimum`, `failureInsufficientFunds`, `failureNoBankAccount`, `failureCredentialsUnverified`, `failureNotEligible`, `failureTermsAndConditionsAcceptanceRequired` and `failureRequiringAppLaunch` ("The user must launch your app to send the funds"). This is a first-party taxonomy of payment blocks, and it maps closely onto our catalogue.
- **App Intents** [VERIFIED]: `needsValueError(_:)` "Returns a `restartPerform` error with context to request a value from the user for this parameter and re-perform the intent with the new value." `needsDisambiguationError(among:dialog:)` works the same way. This is Apple's own "ask, then resume the original request".
- **MCP Elicitation** [VERIFIED]: "a standardized way for servers to request additional information from users through the client during interactions." "When a request cannot be processed until an elicitation is completed, the server MAY return a `URLElicitationRequiredError` (code `-32042`)… The error MUST include a list of elicitations that are required to complete before the original can be retried." Clients "SHOULD still provide manual controls that let the user retry or cancel the original request." Sensitive data: "Servers MUST NOT use form mode elicitation to request sensitive information such as passwords, API keys, access tokens, or payment credentials."
- **LangGraph** [VERIFIED]: "Interrupts allow you to pause graph execution at specific points and wait for external input before continuing… LangGraph saves the graph state using its persistence layer and waits indefinitely until you resume execution."

### 1.7 Which term fits each of Abu's examples [INFERENCE, based on the sources above]

| Abu's example | Best-fitting established term | Why |
|---|---|---|
| "Transfer to Alex", no such contact | **Missing parameter value → elicitation / parameter resolution** (SiriKit `needsValue`, App Intents `needsValueError`, MCP elicitation) | The request is fine. One input is missing. If several Alexes match, it's `disambiguation`. |
| "Notify me on Telegram", not connected | **Unmet precondition** (gRPC `FAILED_PRECONDITION`); UX: **ask/educate in context** (Material 1, Android, NN/g), also Material's **incompatible state** | The system isn't in the state the action needs, and a setup step fixes it. |
| Exceeds limit | **Policy/quota limit**: gRPC `RESOURCE_EXHAUSTED` ("perhaps a per-user quota") for a rolling daily/weekly allowance; SiriKit `failurePaymentsAmountAboveMaximum` for a per-payment cap. UX: GOV.UK treats it as a "not permitted" page, not an error message | It isn't the user's mistake, and the user's own setting can change it. |
| Meme coin blocked by the user's rule | **Policy block from a user-set rule** (gRPC `FAILED_PRECONDITION` fits better than `PERMISSION_DENIED`, see §3.1) | The rule is the system state. Changing the rule changes the outcome. |
| Price impact high, first payment to a new address | **Warning** (Microsoft, Atlassian, MetaMask) | It can proceed. The user decides. |

---

## 2. UX guidance: exact wording

### 2.1 NN/g Error-Message Guidelines (2023) [VERIFIED]
- Severity: "Design errors based on their impact… sometimes users only need to be warned of unexpected or potentially undesirable outcomes but can otherwise advance their workflow. Differentiate between these 'good to know' messages from those posing a barrier to the user's progress… modal dialogs require the user's attention and resolution and should be reserved for severe errors."
- Placement: "Display the error message close to the error's source."
- Remedy: "Offer constructive advice. Merely stating the problem is also not enough; offer some potential remedies."
- Tone: "Don't use phrasing that blames users or implies they are doing something wrong, such as invalid, illegal, or incorrect."
- Preserve effort: "Preserve the user's input. Let users correct errors by editing their original action instead of starting over."
- One-tap fix: "Reduce error-correction effort. If possible, guess the correct action and let users pick it from a small list of fixes. For example, instead of just saying City and ZIP code don't match, let users click on a button for the city that matches."
- No codes: "Hide or minimize the use of obscure error codes or abbreviations; show them for technical diagnostic purposes only."

### 2.2 NN/g Confirmation Dialogs [VERIFIED]
- "Use a confirmation dialog before committing to actions with serious consequences — such as destroying users' work or costing large amounts of money."
- "Do not use confirmation dialogs for routine actions… if you cry wolf too many times, people will stop paying attention."
- "A confirmation dialog must restate the user's request and explain what the computer is about to do, with specific information."

### 2.3 Apple HIG [VERIFIED]
- Feedback: "Show people when a command can't be carried out and help them understand why. For example, if people request directions without specifying a destination, Maps tells them that it can't provide directions to and from the same location."
- Alerts: "Use alerts sparingly." "Avoid using an alert merely to provide information… prefer finding an alternative way to communicate it within the relevant context." "Avoid writing a title that doesn't convey useful information — like 'Error' or 'Error 329347 occurred'." "Aim for a one- or two-word title that describes the result of selecting the button." "Avoid using OK as the default button title unless the alert is purely informational."
- Permission pre-alert screens: "Include only one button and make it clear that it opens the system alert… Use a term like 'Continue' or 'Next'." And "don't provide a way for people to leave the screen or window without viewing the system alert — like offering an option to close or cancel." (Note: Android says the opposite for its educational UI: "Always provide the option to cancel". The platforms differ here.)
- Purpose strings: "Aim for a brief, complete sentence that's straightforward, specific, and easy to understand." Apple's bad examples are "Microphone access is needed for a better experience." and "Turn on microphone access."

### 2.4 Google: Material 1 and Android [VERIFIED]
- Material 1 Errors: "To address errors: Clearly communicate what is happening; Describe how a user can resolve it; Preserve as much user-entered input as possible." "Features not available may be indicated as disabled in the UI… paired with text explaining it is not available. Not every error requires a new component to pop up. If possible, give your user an action that will help them address the error."
- Material 1 Permissions, critical case: "explain why that permission must be allowed and offer a button to open Settings so the user can allow it."
- [UNKNOWN] Material 3: I did not find an equivalent errors, permissions or empty-states page. m3.material.io is client-rendered and was not searched with a browser. Material 1 is marked "no longer maintained", so treat it as a historical precedent.

### 2.5 Microsoft [VERIFIED]
- Win32 UX guide: "Effective error messages inform users that a problem occurred, explain why it happened, and provide a solution so users can fix the problem." It also says "Can the problem be corrected automatically? If so, handle the problem and suppress the error message." and "disable controls when clicking would result in error, as long as it's obvious why the control is disabled." Warning: "A warning message is a modal dialog box, in-place message, notification, or balloon that alerts the user of a condition that might cause a problem in the future."
- WinUI InfoBar: "for displaying app-wide status messages to users that are highly visible yet non-intrusive. There are built-in Severity levels… as well as the option to include your own call to action." It supports closing "when the status is resolved".
- [UNKNOWN] Fluent 2 (fluent2.microsoft.design): not fetched (client-rendered). A Microsoft Writing Style Guide error-messages URL returned 404.

### 2.6 GOV.UK [VERIFIED]
- "Describe what has happened and tell them how to fix it. The message must be in plain English, use positive language and get to the point."
- "Do not use: words like 'forbidden', 'illegal', 'you forgot' and 'prohibited'; 'valid' and 'invalid'…; humourous, informal language like 'oops'."
- "Be specific. An error for a specific situation is more helpful."
- Eligibility/permission: covered in §1.1 (send users to an explanation with next steps, not an error message).

### 2.7 Atlassian [VERIFIED]
- Error body: "Include: the reason for the error and the problem, how someone should act and what happens if they don't act." "If you don't know the reason for an error, don't make one up."
- "Avoid messaging that focuses on the problem without offering a solution or way forward."

### 2.8 Baymard [VERIFIED via WebFetch, JS page]
- "Improve Validation Errors with Adaptive Messages (98% Don't)" (Edward Scott, 2023-12-14): "98% of sites in our benchmark don't use error messages targeted specifically at the exact problem that triggered the error." This concerns checkout form validation. It is relevant only as support for "one specific message per cause, not a generic 'can't do that'".

---

## 3. API and system standards for typed "can't proceed because X" results

### 3.1 gRPC canonical codes ([statuscodes.md](https://github.com/grpc/grpc/blob/master/doc/statuscodes.md)) [VERIFIED]
- **INVALID_ARGUMENT (3):** "The client specified an invalid argument. Note that this differs from `FAILED_PRECONDITION`. `INVALID_ARGUMENT` indicates arguments that are problematic regardless of the state of the system."
- **NOT_FOUND (5):** "Some requested entity (e.g., file or directory) was not found."
- **PERMISSION_DENIED (7):** "The caller does not have permission to execute the specified operation. `PERMISSION_DENIED` must not be used for rejections caused by exhausting some resource (use `RESOURCE_EXHAUSTED` instead…)."
- **RESOURCE_EXHAUSTED (8):** "Some resource has been exhausted, perhaps a per-user quota…"
- **FAILED_PRECONDITION (9):** "The operation was rejected because the system is not in a state required for the operation's execution… (a) Use `UNAVAILABLE` if the client can retry just the failing call. (b) Use `ABORTED` if the client should retry at a higher level… (c) Use `FAILED_PRECONDITION` if the client should not retry until the system state has been explicitly fixed."
- **OUT_OF_RANGE (11):** "Unlike `INVALID_ARGUMENT`, this error indicates a problem that may be fixed if the system state changes."
- **UNAVAILABLE (14):** "most likely a transient condition, which can be corrected by retrying with a backoff. Note that it is not always safe to retry non-idempotent operations."
- HTTP mappings in `code.proto`: FAILED_PRECONDITION→400, PERMISSION_DENIED→403, RESOURCE_EXHAUSTED→429, INVALID_ARGUMENT→400, UNAVAILABLE→503.
- [INFERENCE] **"Should not retry until the system state has been explicitly fixed"** is the closest standard definition of what Abu describes. "Explicitly fixed" is the pop-up; "retry" is the resume.

### 3.2 Google AIP-193 and `google/rpc/error_details.proto` [VERIFIED]
- AIP-193: "Error messages **should** help a reasonably technical user *understand* and *resolve* the issue." "Messages **should** use simple descriptive language… and offer an actionable resolution to it." "All error responses **must** include an `ErrorInfo` within `details`."
- `ErrorInfo`: `reason` ("a constant value that identifies the proximate cause… UPPER_SNAKE_CASE"), `domain`, `metadata` (map; "the units should be contained in the key, not the value", e.g. `instanceLimitPerRequest`).
- `PreconditionFailure`: "Describes what preconditions have failed. For example, if an RPC failed because it required the Terms of Service to be acknowledged…" Each `Violation` has `type`, `subject` and `description` ("Developers can use this description to understand how to fix the failure"). The message is `repeated Violation violations`, which "Describes all precondition violations".
- `QuotaFailure`: violations with `subject` and `description`, e.g. "Daily Limit for read operations exceeded".
- `Help`: "Provides links to documentation or for performing an out of band action… a URL pointing directly to the right place in the developer console to flip the bit."
- `LocalizedMessage`: "a localized error message that is safe to return to the user", with a BCP-47 `locale`. AIP-193: "The `LocalizedMessage` payload **should** contain the complete resolution to the error." `Status.message` is "a developer-facing… 'debug message'".

### 3.3 RFC 9457 Problem Details (obsoletes RFC 7807) [VERIFIED]
- "a 'problem detail' to carry machine-readable details of errors in HTTP response content". The members are `type` (URI, "primary identifier"), `title`, `status`, `detail` and `instance`.
- `detail` "ought to focus on helping the client correct the problem, rather than giving debugging information." "Consumers SHOULD NOT parse the 'detail' member for information; extensions are more suitable."
- The RFC's own example is a balance problem: `403 Forbidden`, `"type": "https://example.com/probs/out-of-credit"`, `"title": "You do not have enough credit."`, `"detail": "Your current balance is 30, but that costs 50."`, with extensions `balance` and `accounts` ("links where the account can be topped up"). This is a direct standards precedent for "blocked, here is the fix link".

### 3.4 HTTP status semantics (RFC 9110, RFC 6585) [VERIFIED]
- **403:** "the server understood the request but refuses to fulfill it. A server that wishes to make public why the request has been forbidden can describe that reason in the response content."
- **409:** "could not be completed due to a conflict with the current state of the target resource. This code is used in situations where the user might be able to resolve the conflict and resubmit the request."
- **412:** "one or more conditions given in the request header fields evaluated to false". This is about **conditional-request headers** (If-Match etc.), not business rules.
- **422:** "the syntax of the request content is correct, but it was unable to process the contained instructions."
- **428** (RFC 6585): "the origin server requires the request to be conditional… to avoid the 'lost update' problem." This is also about conditional headers.
- [INFERENCE] **Do not use 412/428 for "Telegram not connected" or "over limit".** Those codes mean HTTP preconditions, not business preconditions. The standards leave 409, 403 or (via gRPC mapping) 400 plus a typed body.

### 3.5 Stripe PaymentIntent: the "paused, needs X, then resumes" object [VERIFIED]
- Status is one of `requires_payment_method`, `requires_confirmation`, `requires_action`, `processing`, `requires_capture`, `canceled` or `succeeded`.
- `requires_action`: "The PaymentIntent requires additional action from the customer." `next_action`: "If present, this property tells you what actions you need to take in order for your customer to fulfill a payment."
- Lifecycle: "If the payment attempt fails (for example, due to a decline), the PaymentIntent's status returns to `requires_payment_method` so that the payment can be retried." The intent object survives the failure.
- Error code `authentication_required`: "The payment requires authentication to proceed. If your customer is off session, notify your customer to return to your application and complete the payment."
- Error object: `type`, `code`, `doc_url` ("A URL to more information about the error code").

### 3.6 Plaid Link update mode: "fix it, then continue" [VERIFIED]
- "Update mode is used when an existing Item requires input from a user, such as to update credentials or to grant additional consent."
- "If you receive the `ITEM_LOGIN_REQUIRED` error after calling a Plaid endpoint, implement Link in update mode during the user flow, and ask the user to re-authenticate before proceeding to the next step in your flow."
- "Plaid will present an abbreviated re-authentication flow requesting only the minimum user input required to repair the Item."
- `ITEM_LOGIN_REQUIRED` is defined as: "Additional input from the user is required to continue getting data for this Item." It is returned as HTTP 400 with `error_type: ITEM_ERROR` and a separate `display_message` (user-facing) alongside `error_message` (developer-facing).
- `LOGIN_REPAIRED` webhook: "you can dismiss any messaging you are presenting to the user telling them to fix their Item." In other words, the block clears itself when the precondition is fixed elsewhere.

---

## 4. Fintech and wallet precedents for "blocked, with a fix"

| Product | What is documented | Tag |
|---|---|---|
| **Wise** | "We'll also let you know if you try to send too much at one time." ([limits](https://wise.com/help/articles/2526719/are-there-limits-to-how-much-i-can-send)). When a bank caps the amount, Wise lists alternatives, including "set up a transfer for the full amount and pay for it in several, smaller amounts", which "will trigger an email asking if… your bank has limits". | [VERIFIED] |
| **Coinbase** | "Purchase or deposit limits are set as financial safeguards." "You may be eligible to raise your account limits by completing certain steps on your account. If you're eligible, you'll see next steps in the Account limits section of your settings." "Your remaining weekly limits will be displayed any time you buy or sell crypto." | [VERIFIED] (Firecrawl scrape) |
| **Coinbase** "complete verification to continue" | The WebSearch summary claimed that sending needs "Level 3" verification. I did not verify this on a primary page (curl got a 42-byte shell; WebFetch returned 403). | [UNKNOWN] |
| **Revolut** | "You can set a monthly spending limit so you won't over-spend. Any transaction over this limit will be declined." This is a user-set limit, like Abu's. I found no documented in-flow "raise limit" prompt. | [VERIFIED] limit; [UNKNOWN] in-flow fix |
| **MetaMask** | Two levels, 'Warning' ("Potential risk detected") and 'Malicious' ("High confidence of harmful activity"). "Even though a warning is displayed, you can still confirm the transaction if you choose to." "Security alerts are designed to help you identify potential threats — but you remain in control." | [VERIFIED] |
| **Rabby** | "Triggering security rules will redirect users to do extra interactions based on the 'risk level' before the final 'send': Forbidden: Enter the wallet password + check the double-confirmation box · Danger: Enter the wallet password · Warning: Alert only." Example Forbidden rule: "The recipient address is a contract address but NOT multi-signed." | [REPORTED] (Rabby's own X thread 2022-01-22, via threadreaderapp; the current Rabby help-center article 404'd) |
| **Apple SiriKit payments** | The first-party failure codes are listed in §1.6 (amount above max, insufficient funds, not eligible, T&C required, requires app launch). | [VERIFIED] |

[INFERENCE] The wallets (MetaMask, Rabby) handle *risk* with **graded friction**: the user can proceed after extra confirmation, and nothing becomes a hard block they can't lift. Fintechs (Revolut, Wise, Coinbase) handle *limits* by **declining and pointing to a settings or verification path**. None of these sources shows the fix happening inline in the same flow, then resuming. The closest documented examples of that are Plaid update mode, Stripe `next_action`, App Intents `needsValueError` and MCP elicitation.

---

## 5. Synthesis for our product [INFERENCE: built on the sources cited inline]

### 5.1 Recommended vocabulary
- **Internal/engineering term:** use **precondition** (gRPC `FAILED_PRECONDITION`, `google.rpc.PreconditionFailure`). The checker returns *unmet preconditions*, or `violations`, reusing AIP's word. Keep "blocker" out of the product and specs, because no standard I found defines it.
- **Name for the flow:** "**resolve and resume**". The pieces come from standards: SiriKit *resolution* → *confirmation* → *handle*, App Intents' *re-perform*, and MCP's *retry the original after elicitation*. If a single label is needed, "precondition resolution" is traceable to these sources. "Just-in-time setup" is not.
- **User-facing:** give it no name. Every source says plain language with no codes (NN/g #9, GOV.UK, Apple Alerts, AIP-193 `LocalizedMessage`).

### 5.2 Taxonomy (five kinds; each needs a different treatment)

| Kind | Definition (source) | Our examples | Treatment |
|---|---|---|---|
| **1. Clarification / missing value** | SiriKit `needsValue` / `disambiguation`; MCP elicitation | Unknown "Alex", two Alexes, "send 10" (which currency?), schedule unclear | Ask inline, prefilled, and resume automatically (App Intents "re-perform"). Not an error, so no error styling. |
| **2. Unmet precondition (setup)** | gRPC `FAILED_PRECONDITION` "should not retry until the system state has been explicitly fixed"; Material "incompatible state"; NN/g/Material/Android "ask in context" | Telegram not connected, push/mic permission off, passkey not enrolled, disclosure not accepted, allowance not granted, funds on another chain | Explain and show the fix inline, then resume (Plaid update mode, Stripe `next_action`). No blame (Material). |
| **3. Policy / limit block** | GOV.UK "not eligible or do not have permission" is **not** an error message; gRPC `RESOURCE_EXHAUSTED` for quotas; SiriKit `failurePaymentsAmountAboveMaximum` | Over per-payment or daily limit, meme coin blocked by user rule, recipient not on allowlist, region/product not eligible | Cite the rule, then offer alternatives (Wise: split, smaller amount) and the rule editor. Loosening a rule needs step-up. A user-set rule is changeable. A platform or regulatory rule (not eligible) gets an explanation page with next steps, not a fix. |
| **4. Warning (can proceed)** | Microsoft "condition that might cause a problem in the future"; Atlassian "before someone takes an action"; MetaMask "you can still confirm"; Rabby graded friction | First payment to a new address, price impact under the user's max but high, flagged-but-not-malicious token | Show on the confirm card with severity-scaled friction (Rabby levels). Don't use a modal for routine cases (NN/g confirmations "cry wolf"). |
| **5. Error (something failed)** | Microsoft "a problem that has already occurred"; gRPC `UNAVAILABLE` / `ABORTED` / `INTERNAL`; NN/g #9 | Provider down, quote expired mid-flow, transaction reverted, RPC timeout | Say what happened and what's safe now. Retry with backoff only if idempotent (gRPC `UNAVAILABLE` note). Re-quote on `ABORTED`-like cases. |

### 5.3 Principles our design must follow (each traceable)
1. **Check before commit, not after failure** (NN/g #5; Microsoft "prevent the problem instead"; SiriKit's resolution and confirmation phases come before handle).
2. **Say what, why, and how to fix it, in plain words with no codes** (NN/g #9; GOV.UK; Microsoft; Atlassian; AIP-193 `LocalizedMessage`).
3. **Put the fix one tap away, in context** (NN/g "let users pick it from a small list of fixes"; NN/g permissions "make it easy for them to grant access"; Material "give your user an action").
4. **Preserve the original request and resume** (NN/g "Preserve the user's input"; Material 1 "Preserve as much user-entered input"; Stripe intent persists and returns to `requires_payment_method`; App Intents re-perform; LangGraph checkpointed interrupt; MCP "before the original can be retried").
5. **Scale interruption to severity** (NN/g "modal dialogs… reserved for severe errors"; Apple "Use alerts sparingly"; Rabby Forbidden/Danger/Warning).
6. **No blame** (NN/g; Material "do not imply that they are the user's fault"; GOV.UK banned words).
7. **Always offer cancel and a manual path** (Android "Always provide the option to cancel"; MCP "SHOULD still provide manual controls… retry or cancel"). The exception is iOS pre-permission screens, where Apple requires a single "Continue".
8. **Keep secrets and consent out of the chat/model channel** (MCP: form mode MUST NOT carry "passwords, API keys, access tokens, or payment credentials"; use URL mode, meaning an out-of-band secure surface).
9. **Return typed, machine-readable reasons with separate user text** (AIP-193 `ErrorInfo.reason` + `metadata` + `LocalizedMessage` + `Help`; RFC 9457 `type` + extensions; Plaid `error_message` vs `display_message`). Report **all** violations at once (`PreconditionFailure` "Describes all precondition violations").
10. **Clear the prompt automatically when the condition is fixed elsewhere** (Plaid `LOGIN_REPAIRED`; InfoBar closes "when the status is resolved").

### 5.4 Suggested typed shape [INFERENCE: maps our fields onto standard ones]
`{ kind: clarification|precondition|policy|warning|error, reason: "TELEGRAM_NOT_CONNECTED" (ErrorInfo.reason), metadata: {limitPerPaymentUsd: "200"} (ErrorInfo.metadata, units in key), violations: [{type, subject, description}] (PreconditionFailure), localizedMessage: {locale, message} (LocalizedMessage), fix: {action, loosensSafety} (≈ Stripe next_action / Help link), resumable: true, retryable: false (gRPC FAILED_PRECONDITION vs UNAVAILABLE) }`. Over HTTP, use RFC 9457 `application/problem+json` with these as extension members.

### 5.5 Where `SMART-PRECONDITIONS.md` conflicts with established guidance

| # | Line in SMART-PRECONDITIONS.md | Issue | Source |
|---|---|---|---|
| 1 | Title "just-in-time setup" | Invented label. No primary UX or standards source uses it. | §1.4 |
| 2 | "blocker" used throughout | Not a defined term in any source checked. Standards say *precondition* (gRPC, Google) or distinguish error/warning (Microsoft, Atlassian). | §1.1, §3.1 |
| 3 | "every blocker follows the same five steps" | Guidance says to **differentiate by impact**. The catalogue mixes *warnings* ("First payment to this address", "Address looks like…", "Token flagged risky"), *clarifications* ("Ambiguity" section, "Two contacts match") and *errors* ("A provider is down", "Quote expired") with true preconditions. Warnings should let the user proceed (MetaMask, Microsoft). Errors need retry, not a setup fix. | NN/g "Design errors based on their impact"; Microsoft; MetaMask; gRPC UNAVAILABLE/ABORTED |
| 4 | "Push permission off → OS permission prompt" and "Mic permission denied → OS prompt" | Once a user has denied a permission, guidance is to explain and **link to Settings**. Material 1 notes permissions can be "silently denied… because a user once selected 'Don't ask again'". On iOS, any custom pre-prompt screen must follow Apple's one-button "Continue" rule. | NN/g Permission Requests; Material 1 Permissions; Apple HIG Privacy |
| 5 | Limits and token rules framed as the same kind of "blocker" as setup | GOV.UK says eligibility/permission problems should not be presented as error messages. gRPC separates quota (`RESOURCE_EXHAUSTED`) from state (`FAILED_PRECONDITION`) from access (`PERMISSION_DENIED`). Also separate a user-set rule (changeable) from a platform or regulatory rule ("Not eligible (USYC, region)"), which has no fix card. | GOV.UK; gRPC |
| 6 | "Explain… in one plain sentence" plus a fix card | Consistent with NN/g, Apple and GOV.UK. However, Abu's own example wording "I'm sorry, this exceeds your limits" should state the specifics (amount vs limit), per GOV.UK "Be specific" and the NN/g Maps example. The file's table already does this, so it is consistent. | — |
| 7 | "The agent can also offer the safe alternative" | Consistent and well supported (NN/g "small list of fixes"; Wise split-payment alternatives). | — |
| 8 | "A single precondition checker returns typed blockers: {code, params, severity, fixCard, loosensSafety}" | Direction is consistent with AIP-193 and RFC 9457. Missing pieces: a separate localized user message vs. developer message, reporting *all* violations at once, and a retryable/resumable distinction. | AIP-193; error_details.proto; Plaid |
| 9 | "Sources:" cites Agari/Shijima patterns only | The file cites no UX or standards source for the pattern itself. This file fills that gap. | — |

Nothing I found contradicts: step-up for fixes that loosen safety, "the agent can suggest but never apply a fix", server-side pending intents, or "the model never decides whether a precondition passed". Rabby's graded friction and MCP's rule against secrets in form mode are consistent with these.

---

## Gaps
- Material 3 and Fluent 2 errors/permissions guidance: not retrieved (client-rendered sites). [UNKNOWN]
- Coinbase "verify to continue" in-flow behaviour, and any Revolut/Wise in-flow "raise limit" UI: not confirmed on primary pages. [UNKNOWN]
- Rabby's current security-rule docs: the help-center URL returned 404; only the 2022 X thread was read. [REPORTED]
- No usability study found that measures inline fix-and-resume against a plain error in chat or voice agents. [UNKNOWN]
