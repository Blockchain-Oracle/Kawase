# Stage 9: Notifications + channels

Purpose: a stage of the Kawase build. Source of truth for scope is `plan/MASTER-PLAN.md`; decisions are in `context/08-product-research/DECISIONS-FROM-ABU.md`.
Status: not started

## Scope (from the master plan)
- The outbox notify queue → push (Expo), inbox, email (Resend).
- **Telegram:**
  - Connect: deep-link token, then in-app show-and-confirm.
  - Two-way chat with the same brain.
  - Voice notes via batch STT.
  - Buttons: deny, pause, open-app only.
  - Quiet pinned status digest.
- **Discord:** OAuth webhook, with a bot DM where possible.
- Preferences per event, channel and network; quiet hours; hygiene rules; missing-channel nudges; Live Activity / widget for in-flight transfers (S12).
- **Exit:** "notify me on Telegram when I get paid" with no link → ConnectChannel card → waiting → linked → rule created → a real incoming payment pings Telegram within seconds, prefixed with the network.

## Docs to read first (Context7 / official docs)
- (fill in before starting: every library touched in this stage)

## 21st.dev sourcing (surfaces, queries, picks: component · author · URL · why)
- (fill in when the stage touches UI)

## Progress log
- (dated entries: what was done, evidence such as tx hashes and URLs, blockers)
