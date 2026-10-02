# Card: Automations, safety, notifications, history

Purpose: the how-ladder for letting things run, staying in control, staying informed, and looking back. Rules: R4, R5, R7, R8, R12.
Sources: `apps/api/src/automations/*`, `notify/*`, `packages/policy`, `packages/integrations/delegation`, `12-network-toggle/recommendation.md` §4, `07-automations-contacts-safety/*`.
Verified: 2026-10-02

## Automate anything
| Lens | Answer |
|---|---|
| Entry | Chat/voice ("every Friday send 20 to Mum", "buy $10 of ARGUS every day", "if USDC > 500 save the rest") · the token page "Automate" · the Automations screen · templates in "For you" |
| Which | Actions: send, pay many (payroll), swap/DCA, save (earn deposit/withdraw), bridge, perp TP/SL alerts, alert-only. Triggers: time, balance above/below, money in (from someone, minimum), price (on executable quotes) |
| How | Read-back card (what, when, cap, worst case) → **practice first** ("would have" runs) or go live → Face ID signs the automation's **own grant** (on-chain caps: per period, recipient, asset) |
| How much | Per-run amount, a period cap on chain, the worst case in one sentence |
| How long | Runs on time; exactly once per period (DBOS/lease); wakes on money in |
| What if | Underfunded → skip, notify, retry once on money in. Price moved → re-quote within slippage, else skip. A step needs attention (to someone new, over the grant) → **Needs you** (inbox + push + Activity badge), approved from anywhere with re-validation. The contact's address changed → paused until reviewed |
| After | A run row with why; next-run time; edit in place (narrowing instant, widening = new grant); pause/resume/skip/cancel + revoke |
| Consistency | Every action here is the same engine as its manual flow (same checks, cards, receipts) |

## Stay in control
- **Wallet & limits:**
  - the authority receipt (can / can never / worst case);
  - the **per-token allowance** (+ Add token), per-payment cap, new-recipient cooldown, allowlist, temporary raise (expires);
  - tightening is instant; loosening needs Face ID plus a new grant.
- **Pause all:** server-side and instant; blocks every agent and automation spend; reversible; shown app-wide as a chip.
- **Risk dial:**
  - **Guard**: confirm everything, chat too;
  - **Balanced**: the D33 default;
  - **Autonomous**: may act on its own suggestions inside grants and report after.
- **Practice mode:** writes simulated, with a PRACTICE eyebrow everywhere.
- **Brake:** a risky action (over half the balance to someone new, price impact over the rule, leverage above 5×) warns and needs Face ID to override.
- **Exit kit:** Pause all → Withdraw everything → Revoke (each with its on-chain proof); plus Export wallet and the "Withdraw without Kawase" docs.
- **Token rules (D12):**
  - access level (default: verified + popular, with warnings);
  - unverified caps ($50 per trade, $200 a day);
  - max price impact 5%;
  - copycats and high-risk tokens always blocked;
  - the agent cites the rule it applies.

## Stay informed
- **Channels:** inbox (always), push (Expo; APNs via EAS, FCM for Android), email (Resend), all per event kind, with quiet hours.
- **Kinds:**
  - money: received, sent, buy settled, request paid or reminder;
  - trading: swap filled, perp filled, TP/SL hit, liquidation risk;
  - positions and moves: bridge done or stuck, earn APY drop or liquidity crunch, borrow health;
  - automations: run, skip, Needs you;
  - security: new device, limit change;
  - price alerts.
- **Delivery:** a tap opens `/i/[intentId]` on the item's network; signed out → sign in → resume. "Hide amounts on lock screen" option. In the user's language.

## Look back
- **Activity:**
  - every kind (one row per outcome, R7);
  - filters All · In · Out · Trades · Automations · Needs you;
  - row → receipt → **why** (the decision log: the request, checks passed, route chosen and alternatives, approval, tx).
- **Records:** export CSV/beancount; weekly report card (spent, earned, P&L, fees, automations); share a receipt (a card image, never account internals).
- **Audit:** every write recorded (G9).

## Acceptance
- [ ] "Every day at 9 buy $1 of ARGUS" → practice shows 2 "would have" runs → go live (Face ID) → a real run lands with a why.
- [ ] Pause all → a running automation skips with "paused" → resume.
- [ ] Loosen the daily allowance → Now→After card → Face ID → new grant; tighten → instant.
- [ ] A liquidation-risk push opens the borrow position directly on the right network.
