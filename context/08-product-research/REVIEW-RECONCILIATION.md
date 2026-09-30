# Codex review: what Claude accepts, qualifies, or disputes

Purpose: Claude's developer response to `CODEX-REVIEW.md`, point by point, and the corrections applied to the research files as a result. This follows Abu's instruction that the two reviewers "both just agree", not accept blindly.
Sources: `CODEX-REVIEW.md`; the files it cites; `DECISIONS-FROM-ABU.md` (including D10–D13, which Codex did not have: Codex still lists the Apple account type as unknown)
Verified: 2026-09-29

## Accepted, and corrected in the files

| # | Codex point | Verdict | Fix applied |
|---|---|---|---|
| 1 | **A Face ID prompt is not a signature.** `expo-local-authentication` returns local success; it does not bind to `hash(draft)` | **Agree; important.** The research overstated it | FEATURE-INVENTORY K4 + note in `05/voice-safety-confirmation.md` context: the **wallet/passkey must sign the exact typed payload** (chain, account, recipient, asset, amount, nonce, expiry, draft version) |
| 2 | **Offering a "split" or "send the limit now, the rest later" when over a cap is a limit bypass**; the same goes for new-recipient cooldowns | **Agree.** Claude's own `SMART-PRECONDITIONS.md` had the same flaw | Removed those alternatives. Over-limit options are now: edit the amount (a **new draft, freshly authorized**) or raise the limit (step-up). Flagged in `user-flows.md` F3/F4 |
| 3 | **An address change must freeze payments to that contact** rather than fall back to the old address (it may be compromised) | **Agree** | SMART-PRECONDITIONS + F16 note |
| 4 | "Send amount minus gas" silently changes the user's amount | **Agree** | It becomes an editable new draft |
| 5 | **A delegation period cap is not a schedule**: a 7-day budget doesn't guarantee "Tuesday", one payment per occurrence, or DST correctness | **Agree** | FEATURE-INVENTORY H3 note; schedule discipline lives in the executor, and the cap is the loss bound |
| 6 | **A UUID doesn't make an on-chain transfer idempotent.** Reconcile by provider idempotency key *or* chain nonce/tx hash; enforce DB uniqueness on `(automation_id, version, scheduled_for)`; never replay blindly | **Agree** | FEATURE-INVENTORY H8 |
| 7 | **Telegram deep-link tokens are bearer credentials**; the app session must show and confirm the Telegram account before linking | **Agree** | FEATURE-INVENTORY J2 |
| 8 | **"Verified contact" is undefined**; name, QR, and paste can all come from an attacker | **Agree** | FEATURE-INVENTORY I1: record *how* it was verified; require out-of-band confirmation before unattended recurring payments |
| 9 | **Pyth "testnet only" is wrong**: a mainnet contract has code; feed freshness is unproven | **Agree** (Codex checked `eth_getCode`) | Correction notes in `07/README.md` and the synthesis |
| 10 | "Voice may never authorize" is a **product rule**, not a legal mandate. NIST bans voice *biometrics*; PSD2 applies to payment service providers | **Agree** | Synthesis fact 9 reworded |
| 11 | "No keeper on Arc mainnet" should read "**no verified shared keeper identified**" | **Agree** | Synthesis fact 5 |
| 12 | x402: 687 **catalog listings**, not 687 proven callable services | **Agree** | FEATURE-INVENTORY G1 |
| 13 | "Testnet has no meme tokens" really means none are **listed by LI.FI**; "CCTP is cheapest" is one 100-USDC sample, so compare per intent | **Agree** | FEATURE-INVENTORY D2/E1 |
| 14 | **Web wasn't Abu's words**; he said mobile (iOS + Android) and desktop | **Agree on the record.** But with D10 (individual Apple account), a web app is the **only** way iPhone users and judges can reach a wallet app. So web is required in practice, as a consequence of D10, not a preference | DECISIONS D3 relabelled |
| 15 | **"Marketplace = x402" is Claude's interpretation** of "go into the marketplace and do export too" | **Agree** | Open question for Abu |
| 16 | `06/recommended-stack.md` voice/wallet rows contradict `09-voice-decision` and `03` | **Agree** | A superseded note on `recommended-stack.md`; plan mode uses one decision record |
| 17 | F1/F2 (sign-up first) conflict with S1/S2 (guest + faucet): merge them into one first-run flow | **Agree** | Planning action |
| 18 | Accessibility / no-mic path; privacy and retention for audio and transcripts; x402 execution boundary | **Agree**: all missing | FEATURE-INVENTORY additions U1–U3 |
| 19 | **Prove scoped unattended authority on both networks before claiming hard limits**, including negative tests and a leaked-worker-key worst case | **Agree; this is the #1 technical gate** | Planning action |
| 20 | One brain needs one **durable intent** (`intent_id`, `draft_version`, approvals, receipts); LiveKit RPC is only delivery; reject delayed voice corrections against old drafts | **Agree**, and it strengthens SMART-PRECONDITIONS step 4 (hold the intent) | Noted in SMART-PRECONDITIONS |

## Qualified or disputed

| # | Codex point | Claude's view |
|---|---|---|
| Q1 | **Scope: ship one narrow journey; swap, yield, meme coins, x402, Discord, and Tauri are "roadmap"** | **Partly disagree.** Abu was explicit: "we still want to build what I want to build" (Message 8) and "everything the ARK ecosystem has" (Message 1). Two points in favour of more breadth than Codex suggests: (a) once one proven execution pipeline exists (intent → policy → signed approval → execute → reconcile), swap, bridge, and earn through Circle App Kit are comparatively thin adapters; (b) "Circle tool usage" is 20% of the score. **Agree** that depth comes first: the core journey must be real before breadth is added. Proposal: sequence it (core journey, then App Kit breadth, then the rest) rather than cut it. This is Abu's call |
| Q2 | Replace the Guard ↔ Autonomous dial with named modes plus a signed grant per widening | Agree with the safety substance (every widening = new signed grant). A single simple control is still good UX; the modes can be named and backed by a can/cannot receipt (S10). Minor |
| Q3 | Business identity with approver roles | For the hackathon, a single owner is enough; multi-user roles are a real feature, but later. Agree not to call a personal contact book "accounts payable" without vendor-address change control, which I4 already covers |
| Q4 | "Apple account unknown" | Outdated: Abu confirmed **individual** (D10). So iOS = web/PWA for users and judges, plus Abu's own iPhone via a development build for the demo video (development builds install on registered devices; `06/distribution-and-store-policy.md` ad hoc row) |

## Later finding: automations on network switch

Codex (§4, F17) said to "revoke or suspend network-specific drafts and grants" on a switch. The network research (`12-network-toggle/recommendation.md` §4) **partly disagrees**, and Claude agrees with that research: a *view* switch is not a revocation. Unsigned drafts are cancelled and never migrate. **Signed automations keep running on their own network**, visibly separated, with a "pause all on this network" control in Settings; revocation is an explicit, step-up-gated user action. Suspending them silently on every toggle would break the user's standing instructions. (Stripe keeps live processing while the dashboard shows test data [VERIFIED].)

## Open questions this raises for Abu

1. ~~"Marketplace… do export too"~~ **Answered (Message 9 → D14):** the agent discovers and pays for tools in the x402 / agent marketplace.
2. **Scope sequencing**: do you accept "core journey first, then breadth in waves", or build everything in parallel?
