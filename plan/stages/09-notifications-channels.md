# Stage 9: Notifications + channels

Purpose: a stage of the Kawase build. Source of truth for scope is `plan/MASTER-PLAN.md`; decisions are in `context/08-product-research/DECISIONS-FROM-ABU.md`.
Status: not started

## Scope (from the master plan)
- The outbox notify queue → push (Expo), inbox, email (Resend).
- **Channels are the in-app inbox, push, and email only (D31).** Telegram and Discord were removed on 2026-09-30: Kawase is a mobile app, so push covers what Telegram would, and email reaches iPhone users on the web app.
- **Email:** receipts, incoming payments, approvals waiting, automation results. A guest has no email, so asking for email notifications shows an "add your email" card (the same resolve-and-resume pattern) and then finishes the request. Email links only open the app (`/i/{intentId}`); nothing is ever approved from an email.
- Preferences per event, channel and network; quiet hours; hygiene rules; missing-channel nudges; Live Activity / widget for in-flight transfers (S12).
- **Exit:** a guest says "email me when I get paid" → AddEmail card → code verified → rule created → a real incoming payment sends a push and an email within seconds, prefixed with the network.

## Docs to read first (Context7 / official docs)
- (fill in before starting: every library touched in this stage)

## 21st.dev sourcing (surfaces, queries, picks: component · author · URL · why)
- (fill in when the stage touches UI)

## Progress log
- (dated entries: what was done, evidence such as tx hashes and URLs, blockers)
- 2026-09-30: The revamp designs the inbox (bell + count in the header, rows, empty state), the notification primer sheet and Settings → Notifications (push, email via the code flow, in-app; per-event preferences, quiet hours) as shells; this stage wires them.
