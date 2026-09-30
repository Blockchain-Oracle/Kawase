# Resolve and resume: how the agent handles "can't do that yet"

Purpose: Abu's core UX requirement (D13), rewritten against established practice. When a request can't go straight through, the agent works out **which kind of situation** it is and explains it plainly. It offers the right fix in place, and **resumes the original request** without the user repeating it, wherever the standards say it should.
Sources:
- Abu, Message 8 (`ABU-BRIEF-VERBATIM.md`); Abu approved the design direction.
- `11-blocked-actions-research/ux-and-error-standards.md` (UX and API standards) and `11-blocked-actions-research/conversational-and-agent-patterns.md` (voice assistants, agent frameworks).
- Codex review corrections (`REVIEW-RECONCILIATION.md` #1–#3, #6, #20).
- `10-reference-flows/`.

Verified: 2026-09-29

> **History.** Claude first drafted this from reasoning and called it "just-in-time setup" with "blockers". Those were Claude's own words; no source uses them. Abu approved the direction, then two research streams checked it. This version keeps everything Abu approved (ambiguity handling, hold-and-resume, inline pop-ups, the catalogue) and fixes what the sources showed was wrong or naive. Anything still without a source is tagged [INFERENCE].

## 1. What it's called (the research answer to Abu's "is this an error?")

- **Mostly, it is not an error.**
  - Microsoft defines an error as "a problem that has already occurred".
  - GOV.UK says "not eligible / no permission" must **not** be shown as an error message.
  - NN/g's definition is broader. (`ux-and-error-standards.md` §1.1)
- **No established source names the whole pattern.** Mature systems split it into distinct mechanisms, each with its own name and resume behavior (`conversational-and-agent-patterns.md` §0, §5.1):
  - *Parameter resolution / slot elicitation*: SiriKit `needsValue`, Alexa `Dialog.ElicitSlot`, MCP `elicitation/create`.
  - *Disambiguation* and *confirmation*: SiriKit, App Intents, Alexa `ConfirmIntent`.
  - *Precondition failure*: gRPC `FAILED_PRECONDITION`, which "should not retry until the system state has been explicitly fixed".
  - *Permission consent* and *account linking*: Alexa permission cards and `LinkAccount`, A2A `AUTH_REQUIRED`.
  - *Policy refusal*: SiriKit `failurePaymentsAmountAboveMaximum`, A2A `REJECTED` (terminal).
  - *Warning* (the user can proceed) and *error* (something failed).
- **Our names.**
  - Internally: **"precondition"** and **"resolve and resume"**. These trace to SiriKit's resolve→confirm→handle, App Intents' re-perform, and MCP's "retry the original".
  - User-facing: **no name at all**. Plain language, no codes (NN/g #9, GOV.UK, AIP-193 `LocalizedMessage`).

## 2. The five kinds, each handled differently

| Kind | What it is (source) | Resumes? | Treatment |
|---|---|---|---|
| **1. Clarification** (missing or ambiguous value) | SiriKit `needsValue`/`disambiguation`; Alexa `ElicitSlot`; MCP elicitation | **Yes, automatically.** The same request continues with the value filled (App Intents re-perform; Alexa `SessionResumedRequest`) | Ask inline, prefilled. Not styled as an error |
| **2. Unmet precondition** (setup missing) | gRPC `FAILED_PRECONDITION`; "ask in context" (NN/g, Material, Android, Apple); Stripe `requires_action`/`next_action`; Plaid update mode | **Yes.** After the fix, **re-run every check**, then continue. Out-of-band fixes (Telegram, onramp) resume **asynchronously** | Explain; put the fix one tap away; no blame |
| **3. Policy / limit refusal** (the user's own rule or a platform rule) | GOV.UK: "not permitted" is not an error; gRPC `RESOURCE_EXHAUSTED` (quota) and `FAILED_PRECONDITION` (rule state); SiriKit amount-above-maximum; A2A `REJECTED` | **No, terminal.** Changing the rule is a *separate*, step-up-gated settings action, followed by a **fresh check and a fresh confirmation**. Never a silent continue | Cite the specific rule and numbers. Offer: edit the request (new draft) · open the rule (step-up to loosen) · cancel. Platform or regulatory rules ("not eligible") get an explanation page, no fix card |
| **4. Warning** (the user can proceed) | Microsoft "might cause a problem"; MetaMask "you can still confirm"; Rabby graded levels | n/a; the user decides | Shown on the confirm card, with friction scaled to severity. No modal for routine cases (NN/g: modals "cry wolf") |
| **5. Error** (something failed) | Microsoft; gRPC `UNAVAILABLE`/`ABORTED`; Anthropic tool `is_error` | Retry only if idempotent; re-quote if stale | Say what happened and what's safe now ("nothing was sent" / "may have been sent, checking") |

## 3. Abu's examples, placed correctly

| Abu's example | Kind | Behavior |
|---|---|---|
| "Send to Alex", and Alex is unknown | **1. Clarification** (payee elicitation) | "I don't have Alex yet. Add their address?" The add-contact form pops up on screen, because a 0x address can't be spoken safely. The contact is saved, and the **payment draft resumes** with Alex filled in. Two Alexes → disambiguation picker |
| "Notify me on Telegram", and it isn't connected | **2. Precondition, out-of-band** (account linking) | "You haven't connected Telegram. Connect it?" A connect card appears, then the app shows **"Waiting for Telegram… / I've done it / Cancel"**. A bot cannot message first; completion arrives when the bot receives `/start <token>`. The app verifies the token belongs to this user, then the **alert rule is created** |
| Exceeds limits | **3. Policy refusal** | "That's $300. Your per-payment limit is $200." Options: change the amount (new draft, fresh approval) · review the limit (loosening = step-up, then a fresh check and confirm) · cancel. **No split or "rest later" offer** (see §6) |
| Meme coin blocked "by your rule" | **3. Policy refusal** (user-set rule) | "Your token settings only allow verified tokens, so I can't buy this one." Options: see the rule · allow this token (step-up) · cancel |

## 4. Full catalogue by kind

Abu's cases are marked **(Abu)**. The rest are carried over from the approved draft and re-sorted, with mechanism names from the research.

**1. Clarification (ask, then resume automatically)**
- Unknown contact **(Abu)**: add-contact form (paste · scan QR · name lookup)
- Two contacts match: picker (disambiguation)
- Fuzzy voice match ("Alyx"): "Did you mean Alex Martin?" (confirmation)
- Contact has no address on the needed chain: add the address, or offer to route via a bridge
- Currency unclear ("send 10"): USDC / EURC chips
- Schedule unclear ("every week"): day and time-zone picker
- Chain unclear: chips
- *Low-risk defaults.* If only one stablecoin is held, default to it with **implicit** confirmation, shown on the card. **Recipient and amount always get explicit confirmation.** (SiriKit prefers success even with "an educated guess"; Jurafsky & Martin describe confidence-tiered confirmation. See `conversational-and-agent-patterns.md` §1.3, §2.)

**2. Unmet precondition (fix, re-check, resume)**
- Telegram / Discord / email not connected **(Abu)**: connect card, with an async wait state
- Push or mic permission:
  - **First time:** explain in context, then show the OS prompt.
  - **Previously denied:** explain, and **link to Settings**, because the OS won't prompt again (NN/g, Material 1, Apple HIG).
- Not signed up (guest): sign up at the confirm step
- Wallet empty / not enough balance: top up via onramp · bridge in · (testnet) get test USDC
- Funds on another chain: move them (Gateway/bridge card)
- Not enough left for fees: an editable new draft (never silently change the amount)
- Passkey or biometric not enrolled on this device: enroll
- Automation needs a spending permission: grant card with the can / can-never receipt, **signed by the wallet**
- Disclosure not accepted: consent card
- **Capability not on the current network** (D15; researched in `12-network-toggle/recommendation.md` §6):
  - **Say** what isn't here and where it *is*: "Paid services are only on Arc mainnet. On testnet you can try practice mode instead." (Rainbow: "Testnets are not supported by Swap…"; MetaMask: "Unavailable on this network" [VERIFIED precedents].) A bare "I can't. Switch?" is what Abu called bad.
  - **Offer, in order:** an alternative on this network · [Switch to <network>] · [Cancel]. The switch is a tap, never voice-only ("I've put the options on your screen"), and the agent never switches by itself.
  - **Asymmetric resume** (money safety, NN/g on costly mode errors):
    - switching **to testnet** → auto-resume after re-running every check;
    - switching **to mainnet** → read-only requests auto-resume, but **money requests never auto-resume**: a fresh mainnet draft marked "REAL MONEY" with a normal confirm and wallet signature. The first-ever mainnet switch shows a one-time "real money" sheet.
  - Exists on **neither** network → explain like kind 3, no switch offer.
  - Never hide the capability from the model; never carry a draft across networks.
- An approval would be missed (no channel connected): connect-a-channel nudge

**3. Policy / limit refusal (explain the rule; no silent resume)**
- Over the per-payment or daily limit **(Abu)**
- Token blocked by the user's token rules **(Abu)**
- Recipient not on the allowlist ("only allowed addresses" **(Abu)**)
- New-recipient cooldown active: explain and wait (no partial send)
- Contact's address changed recently: **payments to that contact are held** until the new address is reviewed with step-up. No fallback to the old address (Codex #3)
- Price impact or slippage above the user's max
- Marketplace budget not set, or used up
- Not eligible (USYC, region): a platform rule. Explanation plus alternatives, no fix card

**4. Warning (can proceed; shown on the confirm card)**
- First payment to this address
- Price impact high but under the user's max
- Token flagged but not blocked by the user's rules
- Address resembles a saved contact: **escalates to a hard stop**, because poisoning risk is severe (Rabby's "Forbidden" level)

**5. Error (something failed)**
- Provider or RPC down: "The bridge service isn't responding. Nothing was sent." Offer retry, an alternative route, or "notify me"
- Quote expired or price moved: re-quote card (re-confirm)
- Transaction reverted or timed out: reconcile first ("may have been sent, checking"); never retry blindly (Codex #6)
- **Network mismatch at execution** (the intent, session, wallet environment and RPC `eth_chainId` disagree): hard stop. "Nothing was sent. This was prepared for testnet, but you're now on mainnet." No retry on the other network (`12-network-toggle/recommendation.md` §6)

## 5. How resume works (from the precedents)

1. **One durable, server-held task per request, with a status.** Borrow A2A's vocabulary: `input-required`, `auth-required`, `rejected`, `failed`, `completed`. The task carries `intent_id` + `draft_version`. It is **bound to the user**, integrity-protected, and **expires** (MCP binding rule; OpenAI Agents SDK server-side state; Codex #20).
2. **Resume means re-running the whole check with the new input** (MCP retries the original; LangGraph re-runs the node). So **nothing with side effects runs before the last pause**: no reserving quotes, no transfers.
3. **Only paused states resume.** `rejected` (a policy refusal) is terminal. After a rule change, start a fresh check and a fresh confirmation.
4. **Decline is not cancel** (MCP). *Decline* → offer alternatives. *Cancel* → keep the task and offer to remind later.
5. **Report all problems at once** (`google.rpc.PreconditionFailure` "describes all precondition violations"). On screen, show them together; **by voice, take them one at a time** [INFERENCE].
6. **Cap re-asks.** After repeated no-match, stop asking and switch to the screen (SiriKit; Dialogflow `sys.no-match` escalation).
7. **Auto-clear** a prompt if the condition is fixed elsewhere, e.g. Telegram connected from another device (Plaid `LOGIN_REPAIRED`; an InfoBar closes when resolved).
8. **Per surface:**
   - **Chat / generative UI:** the fix renders inline as a card.
   - **Voice:** short spoken values ("which Alex", an amount) can be asked by voice. Anything unspeakable or sensitive (a 0x address, account linking, signing) goes **to the screen with a spoken pointer** ("I've put a form on your screen"), which is Alexa's model for permission cards.
   - **Telegram:** it can't render the fix form. Send a deep link back into the app carrying the task id, so the task resumes there.
9. **Consent and approval wording is fixed app copy**; the model only phrases the explanation (Alexa: "Amazon controls the dialog"). Secrets never pass through chat or the model (MCP forbids credentials in form-mode elicitation).

## 6. Safety rules (research-checked)

- **The model never decides whether a check passed, and never fills an address.** Anthropic's docs note a model "might also infer a reasonable value" for a missing parameter. So recipients are resolved server-side only, with strict tool schemas.
- **The agent suggests fixes but never applies one itself.**
- **Loosening safety** (raise a limit, allow a token, allowlist an address, accept a changed address) requires step-up, and the **wallet signs** anything that changes spending authority. A local Face ID prompt alone isn't binding (Codex #1).
- **Tightening safety** (lower a limit, pause) is one tap.
- **No limit bypass.** Never offer to split a payment or "send the rest later" to get under a limit or cooldown (Codex #2). The UX research cites Wise offering split-payment alternatives, but that is a **bank's** transfer limit. Here the limit is **the user's own safety setting**, so splitting defeats its purpose; Claude sides with Codex. [INFERENCE]
- **"Never by voice alone" for money is our product decision**, not an industry rule; Alexa does grant some permissions by voice (`conversational-and-agent-patterns.md` §5.3 #5).

## 7. Token / meme-coin settings (D12) [INFERENCE: proposed shape; defaults decided in plan mode]

User-controlled, in Settings and by voice or chat ("don't let me buy meme coins over $20"):
- Token access level: Verified only · Verified + popular (with warnings) · Anything (with warnings)
- A per-trade cap and a daily budget for unverified tokens
- A maximum price impact / slippage
- Always block known copycats and high-risk scores (GoPlus on mainnet; see `02-defi-bridge-trade/tx-safety-services.md`)
- A per-token allow/block list; loosening requires step-up

The agent always cites the rule it is applying ("based on your meme-coin setting…").

## 8. What it needs underneath (for plan mode)

- Every capability declares its preconditions, per network, in the capability registry.
- One checker returns **typed results**, mapped onto standards (`ux-and-error-standards.md` §5.4):
  ```
  { kind: clarification|precondition|policy|warning|error,
    reason: "TELEGRAM_NOT_CONNECTED",
    metadata: {...},
    violations: [{type, subject, description}],
    localizedMessage: {locale, message},
    fix: {action, loosensSafety},
    resumable, retryable }
  ```
  Over HTTP this is RFC 9457 `application/problem+json`. The user message is kept separate from the developer message (Plaid's `display_message` vs `error_message`).
- The app, chat, voice and Telegram render the same typed result identically.

## 9. Known gaps

- No shipped consumer finance assistant was found with "unknown payee → add contact inline → payment resumes". The closest are SiriKit payee resolution and Alexa intent chaining. This is new territory (good for the "innovation" score) but unproven UX. [UNKNOWN]
- Material 3 and Fluent 2 guidance was not retrieved; Coinbase and Revolut in-flow "raise limit" UIs were not confirmed.
- No usability study was found measuring inline fix-and-resume against plain errors in chat or voice agents.
