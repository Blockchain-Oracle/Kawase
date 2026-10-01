# Stage 9: Notifications + channels

Purpose: a stage of the Kawase build. Source of truth for scope is `plan/MASTER-PLAN.md`; decisions are in `context/08-product-research/DECISIONS-FROM-ABU.md`.
Status: 9a push + email delivery built (2026-10-01); waiting on Firebase (Android push), an APNs key (iOS push, Apple account), and a Resend key + sending domain (email)

## Scope (from the master plan)
- The outbox notify queue → push (Expo), inbox, email (Resend).
- **Channels are the in-app inbox, push, and email only (D31).** Telegram and Discord were removed on 2026-09-30: Kawase is a mobile app, so push covers what Telegram would, and email reaches iPhone users on the web app.
- **Email:** receipts, incoming payments, approvals waiting, automation results. A guest has no email, so asking for email notifications shows an "add your email" card (the same resolve-and-resume pattern) and then finishes the request. Email links only open the app (`/i/{intentId}`); nothing is ever approved from an email.
- Preferences per event, channel and network; quiet hours; hygiene rules; missing-channel nudges; Live Activity / widget for in-flight transfers (S12).
- **Exit:** a guest says "email me when I get paid" → AddEmail card → code verified → rule created → a real incoming payment sends a push and an email within seconds, prefixed with the network.

## Docs to read first (Context7 / official docs)
- Expo push (read 2026-10-01): docs.expo.dev/push-notifications/push-notifications-setup (channel before the Android 13+ prompt; `getExpoPushTokenAsync({ projectId })`; Android needs FCM V1 credentials), /sending-notifications (≤100 messages per request, 600/s per project; tickets now, receipts ~15 min later, ≤1000 ids; `DeviceNotRegistered` → stop sending; optional access token), /fcm-credentials (google-services.json via `android.googleServicesFile`; service account with "Firebase Cloud Messaging API Admin", uploaded to EAS).
- Resend (read 2026-10-01): resend.com/docs/api-reference/emails/send-email — `POST /emails`, `Idempotency-Key` header (≤256 chars, kept 24 h); sending to anyone but the account owner needs a verified domain.

## 21st.dev sourcing (surfaces, queries, picks: component · author · URL · why)
- (fill in when the stage touches UI)

## Progress log
- (dated entries: what was done, evidence such as tx hashes and URLs, blockers)
- **2026-10-01 — 9a: push and email delivery.** The inbox stays the record; every inbox item queues one `notification_deliveries` row per phone with a push token and one email row, in the item's own transaction (migration 0015). A loop in the api (2 s) claims due rows (`FOR UPDATE SKIP LOCKED`), reads the person's choices (per event × channel, defaults in `@kawase/config`) and quiet hours (their time zone; push waits, email does not) at send time, renders the words in their language from the shared catalogs (testnet prefixed), and sends: push to Expo in batches (at most once — Expo has no idempotency key, so a delivery cut off mid-send is dropped), receipts after 15 min with `DeviceNotRegistered` forgetting the token; email to Resend with the delivery id as `Idempotency-Key` (retried safely), only when `RESEND_API_KEY` and `EMAIL_FROM` are set. `GET/PATCH /notifications`, `PUT /notifications/push-token`. App: `expo-notifications`, channel before the prompt, token re-sent while signed in and forgotten on sign-out, tap opens inbox/automations, Settings → Notifications (this phone, email, per-event switches, quiet hours as three common nights), brand notification icon. **Evidence:** Expo's live service took a request and answered `DeviceNotRegistered` for an unregistered token, which was forgotten; `apps/api/test/notify.test.ts` (quiet hours across midnight in a time zone; rendered words); endpoints exercised on the local api. **Blocked on accounts:** Firebase project + FCM V1 key for Android (Codex prompt given), APNs key for iOS (Apple account), Resend key + a sending domain (Kawase has no domain yet — D27 uses the Coolify host). **Next in 9:** the primer at the right moments (after the first receive address, after turning on an automation), the "add your email" card for guests, the exit flow on a device, then attended "Needs you" for rules that send.
- 2026-09-30: The revamp designs the inbox (bell + count in the header, rows, empty state), the notification primer sheet and Settings → Notifications (push, email via the code flow, in-app; per-event preferences, quiet hours) as shells; this stage wires them.
