# Safe voice confirmation for money actions

Purpose: how to confirm amounts and recipients spoken by voice without acting on a mishearing, and why every write needs an on-screen tap plus device biometrics or passkey, not a spoken "yes".

Sources:
- OpenAI Realtime prompting guide (tool eagerness, exact-value capture): https://developers.openai.com/api/docs/guides/realtime-models-prompting (saved `.firecrawl/product/voice-safety/openai-realtime-prompting.md`, lines 240-295, 486-520)
- NIST SP 800-63B-4: https://pages.nist.gov/800-63-4/sp800-63b.html (saved `.firecrawl/product/voice-safety/nist-800-63b-4.txt`)
- EBA Single Rulebook Q&A 2018_4415 (quotes RTS 2018/389 Art. 5 dynamic linking): https://www.eba.europa.eu/single-rule-book-qa/qna/view/publicId/2018_4415
- Apple Cash support: https://support.apple.com/en-us/105013
- Amazon Alexa voice code: https://www.amazon.com/gp/help/customer/display.html?nodeId=GAA2RYUEDNT5ZSNK (503 when fetched; search snippet only)
- Capital One Alexa skill: https://developer.amazon.com/en-US/blogs/alexa/post/c70e3a9b-405c-4fe1-bc20-bc0519d48c97/the-story-of-the-capital-one-alexa-skil
- Google Assistant "Confirm with Voice Match": https://www.androidpolice.com/2020/05/25/google-assistant-gets-new-confirm-with-voice-match-setting-for-payments/
- Expo LocalAuthentication: https://docs.expo.dev/versions/latest/sdk/local-authentication/ (saved `.firecrawl/product/voice-safety/expo-local-auth.txt`); npm registry `expo-local-authentication` latest 57.0.3
- Circle passkey modular wallets in context: `context/04-sample-apps/arc-defi-lend-borrow.md:7,44-47`, `context/01-arc/sample-applications.md:21`
- arc-agent lessons (cited as lessons only): `/Users/abu/dev/hackathon/arc-agent/docs/raw/2026-07-30-openai-realtime-voice-trial.md`, `/Users/abu/dev/hackathon/arc-agent/docs/research/2026-07-30-voice-confirmation-semantics.md`, `context/07-prior-work/arc-agent-lessons.md:68-70`

Verified: 2026-09-29

---

## 1. What the sources say

### A voice is not an authenticator
- NIST SP 800-63B-4: "Biometric comparison based on voice SHALL NOT be used." Also: "Biometrics SHALL only be used as part of multi-factor authentication with a physical authenticator (i.e., 'something you have')", and "Biometric comparison is probabilistic, whereas the other authentication factors are deterministic." [VERIFIED]
- Google's own Voice Match purchase setting warned that "someone with a similar voice or recording may be able to confirm purchases". The pilot was limited to Play in-app purchases and restaurant orders, with per-transaction and daily caps [REPORTED, Android Police 2020].

### What users authorise must be bound to amount and payee
- PSD2 RTS Art. 5(1)(a): the PSP must ensure "the payer is made aware of the amount of the payment transaction and of the payee". Art. 5(3)(b) for batches: the auth code must be "specific to the total amount of the batch of payment transactions and to the specified payees" [VERIFIED, quoted in EBA Q&A 2018_4415]. Secondary summaries add that any change to amount or payee invalidates the code [REPORTED, e.g. Wultra/ASEE blogs in search results].
- Applied here, the tap and biometric must sign over the exact rendered amount, asset, chain and recipient address. Any edit re-issues the confirmation [INFERENCE].

### How consumer voice assistants gate money today
- **Apple Cash:** payments are confirmed "with Face ID, Touch ID, or your passcode" [VERIFIED, support.apple.com/105013]. Siri-initiated sends are described by secondary sources as confirming recipient and amount before sending [REPORTED].
- **Amazon Alexa:** an optional 4-digit spoken "voice code" is required before purchases [REPORTED, search snippet; Amazon help page returned 503].
- **Capital One on Alexa:** a 4-digit spoken "personal key" gates account access [VERIFIED, Amazon developer blog]. Secondary reports add that the unlock lasts 5 minutes and payments go only to a pre-linked account [REPORTED, SiliconANGLE/GeekWire 2016]. Note that a spoken PIN can be overheard. A phone app can do better with an on-device biometric [INFERENCE].

### Voice-model vendor guidance (OpenAI Realtime prompting guide) [VERIFIED]
- Tool-eagerness table: "Purchases, cancellations, payments → Confirm amount, target, and consequence before calling." "Irreversible or high-impact actions → Confirm explicitly…"
- "Capture entities conservatively. Collect one value at a time, normalize only what is clear, confirm high-precision values before tool calls, and make every correction recoverable."
- "Only say an action was completed after the tool call succeeds."
- Example read-back: "To confirm, you want me to charge the card on file $248.16 for the remaining balance. Should I proceed?"
- "Low eagerness is better when tools modify data, trigger external effects, or depend on exact identifiers."

These principles are vendor-neutral and apply to any voice stack [INFERENCE].

### What broke in arc-agent's voice trials (lessons only)
- A clean synthetic clip "Move 1.00 USDC from Base Sepolia to my Arc account" was transcribed as "Base to Polygon … Ark", giving the wrong destination chain. It was fixed only by adding domain vocabulary and constraining chain slots to an enum [VERIFIED, arc-agent `docs/raw/2026-07-30-openai-realtime-voice-trial.md`, "Correction Evidence"].
- Decimal fields came back with a "USDC" suffix, so amount fields need decimal-only schema and normalisation [VERIFIED, same file].
- The agent re-asked for confirmation after the user had confirmed. A WebRTC track carries silence and never reports that it stopped [VERIFIED, `context/07-prior-work/arc-agent-lessons.md:70`].
- The model fabricated a token address [VERIFIED, `arc-agent-lessons.md:68`].
- The trial proved clean English synthetic audio only. There was no real mic, accent or noise testing [VERIFIED, trial "What Remains Open"].

## 2. Recommended confirmation pattern [INFERENCE]

The principle is simple. **Voice gathers intent, the screen shows the truth, and the device authorises.** A spoken "yes" never moves money.

1. **Slot capture (voice).**
   - The LLM fills a typed draft: `recipient_ref`, `amount` (decimal string), `asset` (enum), `chain` (enum), `schedule?`.
   - Schemas use enums for asset and chain and a strict tool schema (see `llm-choice.md`). Unknown or ambiguous values produce one narrow question, e.g. "Which Alex, Alex Okafor or Alex Chen?", and never a guess.
2. **Deterministic resolution (server).**
   - Contact name → saved address from the user's own address book only. The model never supplies an address.
   - If there is no match, the agent says "I don't have Alex's address" and a **ContactPicker / add-contact sheet** opens. The user pastes or scans the address. Voice never dictates a 0x address.
   - Amount → normalised decimal. Balance and limit checks run.
3. **Read-back (voice + screen at once).**
   - The agent speaks a short, number-safe summary: "Send fifteen USDC, one-five, to Alex Okafor on Arc. Check the card and tap confirm."
   - Read-back rules:
     - Say risky numbers twice: once as a word, once digit-by-digit for teen/-ty pairs (15/50, 13/30) and for decimals ("zero point one zero").
     - Use the saved contact name plus the address suffix on screen ("…9f3a"), not the full address, in speech.
     - Speak in the user's language. Always render the amount on screen with locale formatting plus the ISO code (see `i18n.md`).
   - The **ConfirmationSheet** shows the full address, amount, asset, chain, fee, resulting balance and, for automations, the schedule.
4. **Authorisation (screen only).**
   - Tap "Confirm", then the OS biometric via `expo-local-authentication` `authenticateAsync` [VERIFIED API], or a WebAuthn passkey on web.
   - On Android, pass `biometricsSecurityLevel: 'strong'` to allow only Class 3 biometrics; the default is `'weak'` [VERIFIED, Expo docs].
   - iOS Face ID needs `NSFaceIDUsageDescription` and does not work in Expo Go, so it needs a development build [VERIFIED].
   - If the wallet is a Circle passkey modular wallet, the passkey signature itself is the binding authorisation for that UserOp [INFERENCE; passkey wallets in `context/04-sample-apps/arc-defi-lend-borrow.md:44-47`].
5. **Binding.**
   - The confirmation token is bound to `hash(draft)`, covering amount, asset, chain, address and schedule, with an expiry (the dynamic-linking analogue).
   - Any spoken or tapped edit creates a new draft version and voids the old confirmation.
   - Execute with an idempotency key.
6. **Outcome.** The agent speaks "Sent" only after the chain or provider confirms, with the tx link in the card. This is OpenAI's "only say an action was completed after the tool call succeeds".
7. **Barge-in.** If the user interrupts during read-back, cancel TTS and keep the draft, but **never** treat the interruption as consent. Words like "yes" said during TTS playback of an older draft are ignored if the draft version changed.

### Policy tiers (suggested) [INFERENCE]

| Action | Voice alone | Tap | Tap + biometric/passkey |
|---|---|---|---|
| Balance, history, quotes, route comparison | ✓ | | |
| Save/edit contact | | ✓ (address shown in full) | |
| Send / swap / bridge (any amount) | | | ✓ |
| Create/edit automation (recurring send) | | | ✓ (signs the rule and its cap) |
| Each automation run within its signed cap | executes by policy, notifies after | | |
| Raise limits, export keys, add new device | | | ✓ plus re-auth |

## Gaps

- No primary source was found for bank voice assistants' read-back scripts (e.g., Erica). Only the Alexa/Capital One patterns above were found.
- Mishearing rates for Nigerian English, Pidgin or Yoruba number words are unmeasured [UNKNOWN]. Test before relying on voice for any language (see `language-coverage-matrix.md`).
- Android Protected Confirmation (hardware-backed confirmation UI) was not checked.
