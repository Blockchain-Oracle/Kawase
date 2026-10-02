# Stage 12: History, reporting, privacy

Purpose: a stage of the Kawase build. Source of truth for scope is `plan/MASTER-PLAN.md`; decisions are in `context/08-product-research/DECISIONS-FROM-ABU.md`.
Status: not started

## Scope (from the master plan)
- Activity feed (all kinds, per network) → the decision page ("why": checks, rule, cost, model id); the weekly report with outcome grading.
- CSV + beancount export (balance assertions); share cards + public read-only receipts; payment-request links.
- The drawdown/loss stop for trading automations; automation templates.
- Transcript/audio retention controls, delete/export, channel unlink.
- **Exit:** every action taken in Stages 5–10 appears with a correct "why", and the export round-trips into beancount with balance assertions passing.

## Docs to read first (Context7 / official docs)
- (fill in before starting: every library touched in this stage)

## 21st.dev sourcing (surfaces, queries, picks: component · author · URL · why)
- Why timeline (screen and chat card): 28381 Process Timeline · shadcnui-blocks · https://21st.dev/r/shadcnui-blocks/timeline-05 → `ui-native/process-timeline.tsx`.
- Weekly report in chat: 8412 Stats Card · ravikatiyar162 · https://21st.dev/r/ravikatiyar162/stats-card-2 → `ui-native/stats-card.tsx`.

## Progress log
- (dated entries: what was done, evidence such as tx hashes and URLs, blockers)
- 2026-09-30: The revamp designs the Activity tab (filter chips, rows with identity and status chips, receipt sheet with a "why" slot), the share-card frame and Settings → Data & privacy; this stage fills them (decision page, weekly report, export, retention).
- 2026-10-02 (B2-2): weekly_report, explain_transaction and export_history from chat; the export is a signed 15-minute link (`/files/export/:token`) the share sheet opens without a session. Verified with the real model on testnet (why → payout record; CSV fetched; forged link 404).
