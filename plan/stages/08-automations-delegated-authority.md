# Stage 8: Automations + delegated authority

Purpose: a stage of the Kawase build. Source of truth for scope is `plan/MASTER-PLAN.md`; decisions are in `context/08-product-research/DECISIONS-FROM-ABU.md`.
Status: in progress — 8a scheduled sends (chat-first, grant-bounded, unattended runner, lifecycle) done on testnet; price/event triggers, templates, practice mode and the DBOS executor open.

## Scope (from the master plan)
- `apps/executor` DBOS workflows: tick, run-occurrence, grant-lifecycle.
- `draft_automation` with clarifications (day, time zone, asset), the read-back + dry run + next 3 runs + max exposure, the **delegation grant signed by the user's wallet** (one Face ID) (caveats built by code, receipt decoded from the caveats).
- Scheduled, price-triggered (on the executable quote) and event-triggered (salary received, balance below X) automations; DCA, round-ups, yield sweep, payroll templates (R).
- Lifecycle: pause, resume, edit (narrowing is immediate; widening needs a new grant), skip next, cancel (`disableDelegation`), a 24 h reminder, "skipped because…", underfunded state, missed-run policy.
- Practice mode + the go-live gate. The "Needs you" queue with expiry + re-quote at execution.
- Attended mode (ask every time) for users who prefer it.
- **Exit:** "every Tuesday send $1 to Alex" runs unattended on testnet and mainnet within its caveat; over-cap and wrong-recipient attempts revert on chain; editing never double-pays; practice produces "would have" records.

## Docs to read first (Context7 / official docs)
- (fill in before starting: every library touched in this stage)

## 21st.dev sourcing (surfaces, queries, picks: component · author · URL · why)
- (fill in when the stage touches UI)

## Build order (Claude's plan, 2026-10-01)
- **8a (done on testnet):** scheduled sends ("every Tuesday send $1 to Alex"): draft with read-back, next runs and the on-chain bound; the automation's own grant signed with one Face ID; a runner in the api that claims each occurrence once and redeems the grant through the send pipeline; skip with reasons; pause / resume / skip next / cancel + revoke; chat card, automations screen, inbox.
- **8b:** event triggers (balance below / above X → sweep into earn; salary received), price-triggered swaps (on the executable quote), templates (DCA, round-ups, payroll).
- **8c:** practice mode ("would have" records) + the go-live gate, the "Needs you" queue, attended mode, the 24 h reminder, moving the runner into the DBOS executor.

## Progress log
- **2026-10-01 — 8a scheduled sends, built and verified on Arc testnet.**
  - **The bound is on chain.** Turning an automation on signs `buildAutomationGrant` (already proven by spike 15): a delegation from the person's 7702 wallet to Kawase's ops wallet that may only call `token.transfer(recipient, …)` — the recipient pinned by an `AllowedCalldata` caveat — at most `amount` per period (`ERC20PeriodTransfer`), only redeemable by the ops wallet, until it ends (a year). The period is the schedule's: a day, a week, or 28 days for monthly (a calendar month is never shorter, so two monthly runs never share a period).
  - **Exactly once.** `automation_runs` has a unique (automation, scheduled time) row: the runner claims an occurrence by inserting it, so a second runner, a retry or a re-look finds it taken. Missed occurrences (the runner was down for longer than a period) are recorded as `MISSED_RUN`, not made up. Schedules are computed in the person's own zone with `Intl` only (`packages/intents/schedule.ts`; checked across zones and London's DST change).
  - **Each run re-checks.** `SendService.runAutomation`: the send rules on fresh facts for the automation's own recipient (paused, limits under the per-person lock, a held / blocked / lookalike address, the balance), then the grant's room this period read from the chain (`getAvailableAmount`); a run that cannot go is `skipped` with the reason and an `automation_skipped` inbox item; otherwise the ops wallet redeems the automation's grant through the same attempt → tracking → receipt witness as any send (inbox `send_completed`, contacts marked paid).
  - **Lifecycle:** pause (runs stop at once), resume (next occurrence from now), skip next (recorded as `SKIPPED_BY_YOU`), cancel (runs stop at once; the revoke transaction for the grant is handed to the wallet: `disableDelegation`, one more Face ID; if declined, Kawase still never uses it and says so).
  - **Agent:** `draft_automation` (the address only from the person's own words; 09:00 and their zone when not said — the app now records the device's time zone on the account the first time it sees "UTC"), a read-back summary with the next runs and the bound.
  - **App:** the chat automation card (read-back in the person's language via `Intl`, next runs in the automation's zone, the bound, "Turn on with Face ID"; "Add Alex" when the name is unknown, which drafts again with the same words), `/automations` (from Settings) with recent runs and the lifecycle, inbox rows for skipped runs, ten languages.
  - **Also fixed:** the wallet service compared a signed transaction's hex data case-sensitively (it would have refused some revokes); it now compares without case and names the field that differs.
  - **Evidence:** `apps/api/test/automation-testnet.test.ts` passes: daily automation drafted, grant signed and activated, run unattended [`0x6e04…c601`](https://testnet.arcscan.app/tx/0x6e04d87dfcc1ad7e1d4581b91df981f3d1f3968636127ec84fc45212fb66c601), the same occurrence not paid twice, a second occurrence in the period skipped as `AUTOMATION_PERIOD_USED` with an inbox item, the ops wallet refused when redeeming to a stranger, pause holds, skip recorded, cancel + revoke [`0x7828…80a7`](https://testnet.arcscan.app/tx/0x7828b06fc19adf30dc6a9a2fd24a8687b1a5d2562900260c35b76b8462bd80a7). On the simulator with Turnkey + Face ID: "every day at 14:05 send 0.05 dollars to Bob" → card → Turn on with Face ID → at 14:05 it ran by itself [`0x4de9…b07d`](https://testnet.arcscan.app/tx/0x4de96ce04044b9f9f0c84e38d4718ff272c526c55762e6fcf4f591874ab7b07d), shown as "Sent" under recent runs.
  - **Not done in 8a:** mainnet runs; the runner lives in the api process (no DBOS executor yet: a restart loses nothing, since occurrences are claimed in the database, but a run in flight is picked up by the send sweeper); event/price triggers; practice mode; editing (today: cancel and draft again).
