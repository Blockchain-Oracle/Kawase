# User flows index

Purpose: every user journey the product needs, pointing at the detailed step-by-step flows where they exist, and listing the flows **not yet written**. Abu: "The user flows are very, very important."
Sources: `10-reference-flows/{agari,shijima}.md` (F34–F50); `07-automations-contacts-safety/user-flows.md` (F1–F16, each step tagged with evidence); `FEATURE-INVENTORY.md`; `DECISIONS-FROM-ABU.md`
Verified: 2026-09-29

## Written (detailed in `07-automations-contacts-safety/user-flows.md`)

| ID | Flow | Feature refs |
|---|---|---|
| F1 | Onboarding | A1–A4 |
| F2 | First deposit | A5 |
| F3 | Send to a known contact | C1, L2 |
| F4 | Send to an unknown contact (the "Alex" pop-up) | I2, K3, L3 |
| F5 | Request money and split | C3 |
| F6 | Swap | D1, L4 |
| F7 | Bridge via the cheapest route | E1–E2, L5 |
| F8 | Earn yield | F1–F2, L6 |
| F9 | Create a recurring payment by voice | H1–H3, K1–K4, L7 |
| F10 | Edit or pause an automation | H4 |
| F11 | Set limits | N1–N5 |
| F12 | Connect Telegram | J2 |
| F13 | Get notified and approve | J5–J6 |
| F14 | Switch language | K6 |
| F15 | View history and "why" | O1–O2, M6 |
| F16 | Contact address change (security) | I4 |

## Not yet written (needed before or during plan mode) [INFERENCE: derived from the feature inventory]

| ID | Flow | Why it matters |
|---|---|---|
| F17 | **Switch network, mainnet ↔ testnet** (what changes, what's unavailable on testnet, how balances and history are separated) | D2, D15. **Design researched** in `12-network-toggle/recommendation.md` (toggle UX, data separation, in-flight work, availability wording); step-by-step flow still to write |
| F18 | Voice conversation lifecycle: start, small talk, clarify, UI pop-up mid-speech, barge-in, hand-off to screen confirm, end or resume | D5; the core differentiator |
| F19 | Voice in a non-English language, end to end (e.g. French: speak → French reply → French UI card → confirm) | D4 |
| F20 | Buy a meme coin safely (discovery → token safety card → copycat warning → swap → receipt) | D2–D4 |
| F21 | Marketplace: the agent buys a paid service under a budget (and the testnet "no listings" state) | G1–G3 |
| F22 | Connect Discord | J3 |
| F23 | Automation fails (insufficient funds, price moved, limit hit) → notification → fix → retry | H4, H8 |
| F24 | Price- or event-triggered automation ("when salary arrives, save 20%") | H5–H6 |
| F25 | Receive money (QR/share) and save the sender as a contact | C2, I3 |
| F26 | Crosschain send to a friend on another chain | C6, E1 |
| F27 | Risk dial: Guard ↔ Autonomous, and what the agent does differently | M4 |
| F28 | Kill switch: pause everything (from the app, or from Telegram) | N2, J6 |
| F29 | Recover an account / new device | A8 |
| F30 | Empty, error, and offline states (no funds, RPC down, quote expired, bridge stuck) | E3, N6 |
| F31 | Ask the agent about Arc / Arc House points (knowledge answers, no investment advice) | M7 |
| F32 | Desktop and web parity: the same flows via keyboard and mic; QR shown instead of scanned | Q3–Q4 |
| F33 | Business mode flows (invoice, payroll, vendor payout), **only if** Abu picks the RFB 4 framing | R |

## From the reference-product studies (merged; details in `10-reference-flows/`)

| ID | Flow | Feature refs | Source |
|---|---|---|---|
| F34 | **First run**: tour → guest try → one-tap test USDC (testnet) or starter $1 (mainnet) → first action; "already claimed" / "all gone" branches | S1, S2, S4, A1–A5 | agari F34/F35, shijima F34/F36 |
| F35 | Faucet claim edge states: cooldown, drip empty → fallback, already funded | S2 | agari F35 |
| F36 | **Practice → go live** for an automation or agent mode ("would have" notices → report → flip to live) | S3, S24 | agari F36, shijima F35 |
| F37 | Read-back + dry run before saving an automation | S13 | agari F37 |
| F38 | App reopened with pending sends (reconcile and report; no auto-retry) | S7 | agari F38 |
| F39 | Quote expired or price moved at confirm (re-quote, keep intent, confirm again) | S23 | agari F39 |
| F40 | Lost device with active grants (revoke or re-key an automation's authority) | A8, S11 | agari F40 |
| F41 | Share a receipt / send a payment-request link → recipient opens → pre-filled confirm | S15, C3 | agari F41, shijima F40 |
| F42 | Judge walkthrough: README → `/demo` → evidence → guest mode → `/status` | S9 | agari F42 |
| F43 | Degraded dependency (RPC/bridge down) + "is my agent awake?" | S8 | agari F43, shijima F42 |
| F44 | Agent brakes a risky action; the user overrides with step-up | S17 | agari F44, shijima F38 |
| F45 | **Approve from anywhere** (Telegram, voice, app) → re-validation → executed or "conditions changed"; "already answered elsewhere" | S23, J6 | shijima F37 |
| F46 | Exit: pause all → revoke the agent → sweep to your own wallet | S11, N2 | shijima F39 |
| F47 | Weekly report → drill into a graded decision → share | S24, S15 | shijima F40/F41 |
| F48 | Infeasible amount → one-tap fix | S5 | shijima F43 |
| F49 | Out of fees → "~0 actions left" → top up → retry | S6, A5 | shijima F44 |
| F50 | Accept or re-accept the disclosure before the first money move | S25 | shijima F45 |

## Conventions every flow must follow (from research) [VERIFIED sources in the linked files]

- **Voice proposes, the screen confirms, the device authorizes.** No money moves on voice or text alone (`05/voice-safety-confirmation.md`).
- Recipients come **only** from contacts or explicit input, never from transaction history (address poisoning, `03/README` #10).
- Every write shows network, amount, recipient, fee, and first-time/limit warnings on one card (`04/README` #4).
- Every write has an idempotency key; retries never double-pay (`context/06-ledgers-and-prior-art/design-principles-for-agent-writes.md`).
- Every automation run and agent decision lands in history with a "why" (M6).
