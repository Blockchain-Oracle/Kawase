# User-flow catalogue: 16 core journeys, happy path plus edge cases

Purpose: step-by-step flows for the core journeys of the Arc money agent, each step tagged with its evidence or [INFERENCE], so design and build start from checked facts.

Sources: the other files in this folder (`automations.md`, `contacts-and-names.md`, `limits-and-safety.md`, `notifications.md`, `history-and-reporting.md`); siblings `03-wallets-custody-limits/circle-wallet-options.md`, `05-voice-language-genui/voice-safety-confirmation.md`, `05-voice-language-genui/i18n.md`, `05-voice-language-genui/generative-ui.md`; `context/01-arc/{app-kit.md, gotchas.md, network-config.md, stablecoins-fx-and-yield.md}`; https://core.telegram.org/bots/features; https://eips.ethereum.org/EIPS/eip-681
Verified: 2026-09-29

Tags: **[E: file §]** means supported by that file's verified evidence. **[I]** means INFERENCE (a design choice). Any wallet model named here is an option, not a decision (see `circle-wallet-options.md`).

---

## F1. Onboarding
1. Welcome, then pick a language (defaults to the device locale) [I; `i18n.md`].
2. Sign up with social, email OTP, or a passkey. Circle user-controlled wallets support Google/Apple/Facebook, email OTP (you supply SMTP), and PIN; modular wallets use passkeys [E: `circle-wallet-options.md` §1].
3. A wallet is created on Arc (`ARC` mainnet is supported for UCW, modular, dev-controlled and Agent Wallets) [E: same, comparison table].
4. A limits wizard with safe defaults ($250/tx, $500/day, 24 h new-recipient cooldown) that the user can adjust [I; `limits-and-safety.md` §1].
5. Optional: add the first contact, link Telegram, enable voice.
6. Agent greeting: "What do you want to do today?" [I; Abu's brief].
- Edge: the user loses their social login. "Circle cannot recover lost provider credentials" [E: `circle-wallet-options.md` §1], so show recovery setup before the first deposit [I].
- Edge: a passkey RP-domain bind broke arc-agent's demo on localhost. Deploy on a real domain from day one [E: `what-was-learned.md` §1, §5.4].

## F2. First deposit
1. The agent shows three options: **Receive** (QR + address), **Bridge in** (from another chain), **Buy** (onramp) [I].
2. Receive: an EIP-681 QR with `@5042` so senders use the right chain [E: `contacts-and-names.md` §6].
3. Bridge in: App Kit Bridge / CCTP. Arc is the only chain with all six App Kit capabilities [E: `app-kit.md:78`]. See F8.
4. Buy: App Kit Onramp. It **requires** a Circle Console API key [E: `app-kit.md:38`]. Availability by country is [UNKNOWN].
5. Detect the inbound transfer (EIP-7708 log or Circle `transactions.inbound`), then notify and add it to the feed [E: `notifications.md` §2].
- Edge: on testnet, fund from faucet.circle.com, which is rate-limited [E: `network-config.md`].
- Edge: the user sends from an exchange on the wrong chain. Show supported chains before the address and warn [I].

## F3. Send to a known contact
1. The user says or types "Send Alex 20 dollars" [I].
2. The LLM emits a typed proposal with no address [E: `limits-and-safety.md` §3].
3. The resolver finds Alex v3 with a preferred Arc address [E: `contacts-and-names.md` §2].
4. The policy engine checks caps, the per-recipient cap and the floor, and the preflight `eth_call` and `eth_estimateGas` run [E: `limits-and-safety.md` §2, §4].
5. A confirmation card shows name, short address + chain, amount, fee, and balance after. Tap plus biometric above the threshold [E: `voice-safety-confirmation.md`; I for the threshold].
6. The intent is persisted with an idempotency key, then execution, then the witness, then "Sent ✓" with a receipt link [E: `automations.md` §6].
- Edge: two Alexes lead to a picker, never a guess [E: `contacts-and-names.md` §2].
- Edge: the voice transcript says "Alyx". Fuzzy suggestion only [I].
- Edge: the amount is over the cap. The agent explains which cap and offers to edit the amount (a new, freshly authorized draft) or raise the limit with step-up. **Never offer a split** (a limit bypass; `../REVIEW-RECONCILIATION.md` #2).
- Edge: the balance covers the amount but not gas. Offer an **editable new draft**; never silently change the amount (`../REVIEW-RECONCILIATION.md` #4).

## F4. Send to an unknown contact
1. "Send 15 to Maria": no match, so "I don't have Maria's address. Add her?" [E: `contacts-and-names.md` §3].
2. Pop-up form: Scan QR / Paste / Name (alex.eth, *.base.eth, .arc) / Send request link instead [E: same §3–4].
3. Validate the checksum, run the lookalike check against saved addresses, and show the full chunked address [E: same §7].
4. For a name, show the resolved address plus its source, and a "third-party namespace" warning for .arc [E: same §4].
5. Save as `pending_cooldown` or `active` per policy [E: same §8].
6. First-time-recipient card: "Send $1 test first?" [I]. Then F3 steps 4–6.
- Edge: the pasted address resembles a saved one. Hard stop [E: `contacts-and-names.md` §7].
- Edge: the cooldown is active and the amount is over the new-recipient limit. Explain and wait; **do not** send part now and the rest later (undermines the cooldown; `../REVIEW-RECONCILIATION.md` #2).
- Edge: the ENS name has only the default EVM record. Label it "not Arc-specific" [E: `contacts-and-names.md` §4].

## F5. Request money (and split)
1. "Ask Sam and Lee for $30 each for dinner" [I].
2. A request is created with id `r_…`, and per payer an EIP-681 link/QR with the amount and a Memo id [E: `automations.md` §4; `contacts-and-names.md` §6].
3. Share via the OS share sheet, or directly to known contacts in-app [I].
4. The payer pays. The inbound transfer is matched by memo id + amount + sender, and the request is marked paid only on that witness [E: `design-principles-for-agent-writes.md` §1].
5. Pending list with remind and cancel, like Venmo [E: sibling `fintech-ux-analogs.md:66`].
- Edge: a partial payment shows "$20 of $30" [I].
- Edge: the payer says "I sent it". It stays unpaid until observed onchain (the essay's phantom payment) [E: `agents-and-ledgers.md` §2].
- Edge: no Arc-native request standard exists [E: `automations.md` §4].

## F6. Swap
1. "Swap 100 USDC to EURC" [I].
2. App Kit `estimateSwap` gives a quote card: rate, 2 bps provider fee plus any custom fee, min-out, and the Chainlink EUR/USD reference for a sanity check [E: `stablecoins-fx-and-yield.md:30`; `automations.md` §4].
3. Confirm, then `kit.swap` with `stopLimit` / slippage, then the witness [E: same].
- Edge: the token isn't USDC, EURC or cirBTC. Not swappable on Arc [E: `app-kit.md:86`].
- Edge: the quote expired or the price moved beyond min-out. Re-quote, never widen automatically [E: `automations.md` §5].
- Edge: arc-agent saw a Circle HTTP 500 on its first swap. Idempotent retry after re-reading balances [E: `arc-agent-lessons.md` #20].

## F7. Bridge (cheapest route)
1. "Move my 50 USDC from Base to Arc, cheapest" [I].
2. Fetch route quotes: App Kit Bridge (CCTP Standard vs Forwarding) and Gateway; compare fee + gas + time [E: `app-kit.md`]. Comparing bridge **aggregators** is out of this folder's scope [UNKNOWN here].
3. A comparison card ranks by total cost, then time [I; `generative-ui.md`].
4. Confirm the source-chain signature, then track multi-step progress (burn → attest → mint) [E: `app-kit.md`].
- Edge: gas is needed on the source chain [I].
- Edge: stuck pending. Notify at a threshold and offer recovery [E: `notifications.md` §1].
- Edge: Arc Testnet Fast Transfer is unavailable [REPORTED arc-agent matrix].

## F8. Earn yield
1. "Put $500 to work" [I].
2. List App Kit Earn vaults on Arc (USDC/EURC) with the underlying protocol, performance fee (0–50%), management fee (0–5%/yr) and withdrawal terms [E: `stablecoins-fx-and-yield.md:46`].
3. A risk card: not insured, smart-contract risk, variable rate [I].
4. Confirm and deposit, then show shares and value in the feed [E: same].
- Edge: USYC is shown only to eligible institutions, never to consumers [E: `stablecoins-fx-and-yield.md:47`].
- Edge: withdrawing more than is liquid. Explain [I].

## F9. Create a recurring payment by voice
1. Voice: "Every Tuesday send Alex ten dollars" [I].
2. The agent reads back: "Every Tuesday at 9 am your time, $10 USDC to Alex Martin, starting next Tuesday, no end date. Right?" [E: `automations.md` §7].
3. A preview card with the next 3 dates, max exposure, the insufficient-funds rule, and attended vs unattended mode [E: same].
4. The user confirms **on screen** with biometric; a spoken "yes" is not enough [E: `voice-safety-confirmation.md`].
5. Unattended: sign a scoped delegation (period cap 10 USDC per 7 days, recipient = Alex, expiry) or use a budget sub-wallet [E: `automations.md` §3].
6. "Done. Next run Tue 6 Oct." [I].
- Edge: "every week" with no day given. Clarify [E: `automations.md` §7].
- Edge: Alex is unknown. Go to F4 first [E: `contacts-and-names.md` §3].
- Edge: the amount exceeds the per-recipient weekly cap. Explain and offer to raise it (settings, with a delay) [E: `limits-and-safety.md` §1].
- Edge: mis-hearing "fifteen" vs "fifty". The on-screen number is authoritative [E: `voice-safety-confirmation.md`].

## F10. Edit or pause an automation
1. "Pause Alex's allowance" or the Automations tab [I; Bankr has both, E: sibling `telegram-and-chat-bots.md:73`].
2. Pause: stop scheduling, optionally `disableDelegation` [E: `automations.md` §8].
3. Edit amount 10 → 15 (widening): re-confirmation plus a new delegation. Narrowing is immediate, and the old delegation is disabled [E: same].
4. Skip next, resume, cancel. Each writes a decision-log entry [E: same, §9].
- Edge: editing while a run is in flight. The edit applies from the next occurrence [I].
- Edge: cancel after a run already sent. It can't be reversed; Arc finality applies [E: `automations.md` §8].

## F11. Set limits
1. Settings → Limits shows the current caps, usage bars, and **which layer enforces each** ("guaranteed by wallet" vs "checked by app") [E: `limits-and-safety.md` §2].
2. Lowering is instant. Raising takes effect after 24 h, plus biometric (and a Circle email OTP if Agent Wallet policies are used) [E: same §1; Circle OTP VERIFIED].
3. The change produces a security notification on all channels [E: `notifications.md` §1].
- Edge: the agent is asked in chat to "raise my limit". It refuses and links to settings [E: `limits-and-safety.md` §5 item 5].

## F12. Connect Telegram
1. Settings → Notifications → Telegram → "Connect" [I].
2. The app creates a one-time token (≤64 chars, `[A-Za-z0-9_-]`) and opens `t.me/<bot>?start=<token>` [E: Telegram bot features].
3. The bot receives `/start <token>`, the server binds the chat id to the user, and the token is burned [E: same, "connect the user's Telegram account to their account on another platform"].
4. A confirmation in the app and in Telegram, plus a security event on other channels [E: `notifications.md` §1].
5. Choose categories for Telegram [E: `notifications.md` §4].
- Edge: the token is expired or reused. Reject [I].
- Edge: someone forwards the link. Binding requires an active app session [I].

## F13. Get notified and approve
1. An automation needs a signature, or the agent proposes a $300 send above the threshold [E: `automations.md` §3 model A].
2. A push arrives (time-sensitive) with "Review" and "Decline" buttons; Telegram gets the same with "Open app" and "Decline" [E: `notifications.md` §3, §5].
3. Review opens the app card, then passkey/biometric signs, then execution [E: same §5].
4. Decline works from any channel and is recorded [E: same §5 asymmetry rule].
- Edge: the approval expires, and the run is marked `skipped(expired)` [E: `automations.md` §5].
- Edge: during quiet hours, approvals still deliver [E: `notifications.md` §4].

## F14. Switch language
1. "Parle-moi en français" or Settings → Language [I; `i18n.md`].
2. UI strings, agent replies, voice (STT/TTS) and notifications all switch. Amounts are formatted per locale; asset symbols are kept [E: `notifications.md` §4; `i18n.md`].
3. Contact names and aliases are unchanged. Aliases can be multilingual ("mon frère") [I].
- Edge: mixed-language utterances ("send 10 à Alex") are resolved by the same typed proposal [I].

## F15. View history and "why"
1. The Activity tab shows the feed with filters [E: `history-and-reporting.md` §2].
2. Tap a row, then "Why?" shows the decision chain (trigger, resolution, checks, approval, tx) [E: same §3].
3. Ask the agent "Why didn't Alex get paid Tuesday?". The answer comes from the decision log, citing the row [E: same §3].
4. Export CSV, beancount or a receipt [E: same §4].
- Edge: a hidden dust transfer. The "possible poisoning" toggle shows it [E: same §2].

## F16. Contact address change (security journey)
1. Alex messages "I have a new wallet". The user edits the contact [I].
2. A new address version enters `pending_cooldown` (24 h), and a security notification goes to all channels [E: `contacts-and-names.md` §8].
3. During the cooldown, payments to Alex are **held** (never sent to the old address, which may be compromised; `../REVIEW-RECONCILIATION.md` #3). After it, the first payment shows "Address changed on …".
- Edge: the agent read "new address" in an email. It offers a suggestion card only and never auto-applies [E: same §8].

## Gaps
- No flow has been usability-tested.
- Onramp country coverage is unknown.
- Bridge aggregator comparison is covered elsewhere.
