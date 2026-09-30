# Notifications: event taxonomy, channels, preferences, quiet hours, actionable approvals and their risks

Purpose: which events the app should notify about, over which channels (push, Telegram, Discord, email), how preferences and quiet hours work, and whether "approve from Telegram" is safe.

Sources:
- Telegram: https://core.telegram.org/bots/features (deep linking, inline keyboards); https://core.telegram.org/bots/api (Bot API 10.3; `callback_data` 1-64 bytes; `secret_token`; `disable_notification`), saved `.firecrawl/product/07/tg-bot-api.html`; https://telegram.org/faq (secret chats vs cloud chats)
- Discord: https://docs.discord.com/developers/resources/webhook
- Apple: https://developer.apple.com/documentation/usernotifications/unnotificationactionoptions/authenticationrequired ; `.../unnotificationinterruptionlevel/timesensitive` (via the docs JSON endpoints)
- Android: https://developer.android.com/reference/android/app/Notification.Action.Builder (`setAuthenticationRequired`, API 31)
- Circle webhooks: `context/03-circle-platform/other-apis.md:16-24`
- Analogs: sibling `04-analogs-and-competitors/telegram-and-chat-bots.md` §5–6, `fintech-ux-analogs.md:125`
- Incident: AIXBT dashboard compromise (see `limits-and-safety.md` §5)

Verified: 2026-09-29

---

## 1. Event taxonomy [INFERENCE for defaults]

| Category | Events | Default channels | Default urgency | Can quiet hours mute it? |
|---|---|---|---|---|
| **Money in** | Payment received (with the contact name, or "unknown sender"), request paid, salary detected | Push, Telegram | Normal | Yes |
| **Money out** | Send completed, send failed, swap/bridge completed or failed, bridge leg pending too long | Push | Normal. Failures are high. | Completed: yes. Failed: no. |
| **Automations** | Run succeeded, **skipped** (insufficient funds or price not met), **failed**, next-run reminder (24 h before a large one), delegation expiring | Push, Telegram | Failures are high | Success: yes |
| **Price & balance alerts** | Price crossed, balance below threshold, EURC depeg bound (feed vs quote divergence) | User-chosen | User-chosen | Yes |
| **Limits** | 80% of the daily/weekly cap used, a send blocked by a limit, a cooldown ending ("Alex's new address is now active") | Push | Normal | Yes |
| **Approval needed** | The agent proposed an action above a threshold, an automation run needs a signature, a first-time recipient | Push (time-sensitive), in-app | High, with an expiry | **No.** Deliver it, but it expires unacted. |
| **Security** | New device or session, **contact address added or changed**, limit raised, allowlist changed, Telegram/Discord linked, recovery started, a login from a new location | **All linked channels plus email** | Critical | **Never** |
| **Digest** | Daily/weekly summary: in/out, automations ran, yield earned | Email or Telegram | Low | n/a (scheduled) |
| **Incoming dust / zero-value** | Tiny inbound transfers from unknown addresses | **None** (hidden in the feed, flagged "possible poisoning") | — | — |

"Security" is the change-control alarm. Coinbase emails immediately when an allowlist address is added, and the user has 48 h to delete it [REPORTED; see `contacts-and-names.md` §8].

## 2. Event sources (what emits the event)

- Circle webhooks v2 (`transactions.inbound`, `transactions.outbound`, `contracts.eventLog`, Gateway events) are signed (`X-Circle-Signature`), and delivery is **at-least-once and unordered**, so dedupe on `notificationId` [VERIFIED `other-apis.md:16-24`].
- Arc RPC/indexer on EIP-7708 native `Transfer` logs plus ERC-20 USDC events (dedupe the pair) [VERIFIED `context/01-arc/transactions-memo-batching.md`].
- Our own automation runner and policy engine (skips, blocks, approvals).
- Use an **outbox pattern**: the event is written in the same DB transaction as the state change, then a dispatcher fans out to channels with per-channel retry. "Delivery/acknowledgement neither authorizes nor changes the financial outcome" was a correct boundary in arc-agent's matrix [REPORTED lesson; outbox is INFERENCE].

## 3. Channels

| Channel | Linking | Interactive? | Notes |
|---|---|---|---|
| **Mobile push** (APNs/FCM) | App install | Yes: action buttons | iOS `authenticationRequired`: "The action can be performed only on an unlocked device." Android `setAuthenticationRequired(true)`: "the OS will show the keyguard and require successful authentication before invoking the intent" (API 31+). iOS `timeSensitive` "breaks through system notification controls" [VERIFIED] |
| **Telegram bot** | Deep link `t.me/<bot>?start=<token>`: "A-Z, a-z, 0-9, _ and - are allowed … up to 64 characters". The documented use is "an authentication token to connect the user's Telegram account to their account on another platform" [VERIFIED]. Use a one-time token that expires in minutes and is bound to the logged-in app session. | Inline keyboard callback buttons, which "doesn't send messages to the chat". `callback_data` is 1-64 bytes [VERIFIED]. Mini Apps open a web UI inside Telegram [VERIFIED]. | Set a webhook `secret_token` ("X-Telegram-Bot-Api-Secret-Token" header) so only Telegram can post to you [VERIFIED]. `disable_notification` "Sends the message silently", which can serve for quiet hours [VERIFIED]. |
| **Discord** | OAuth app/bot DM, or a user-provided webhook URL | Webhooks "do not require a bot user or authentication". "Non-application-owned webhooks cannot send interactive components" [VERIFIED] | A user-pasted webhook is send-only. Buttons need our own Discord application. |
| **Email** | Verified address | Links only | The security channel of last resort. It is also the Circle Agent Wallet OTP channel, so an email compromise is a policy compromise [VERIFIED `guardrails-and-policies.md` §1]. |
| **In-app inbox** | Always | Full | The source of truth. Every external notification links here. |

## 4. Preferences and quiet hours [INFERENCE]

- A matrix of **category × channel** toggles, plus per-alert thresholds (e.g. "notify me of received payments ≥ $5").
- Quiet hours are set in the user's timezone. During them, low and normal events are batched into a morning digest or sent silently (Telegram `disable_notification`). **Security events and approval requests are never suppressed**, though approvals can be configured to wait until morning *if* they aren't time-bound.
- Rate limiting and coalescing: "3 payments received ($45 total)" instead of three pings.
- Language: notifications render in the user's app language (see sibling `05-voice-language-genui/i18n.md`), and amounts are formatted per locale while keeping the asset symbol.
- Privacy: lock-screen previews default to **no amounts and no names** ("You received a payment"). The user can opt in to details.

## 5. Actionable notifications: approve from Telegram?

| Approval path | Who proves intent | Risks | Verdict [INFERENCE] |
|---|---|---|---|
| Push action button with `authenticationRequired` / `setAuthenticationRequired` | The device unlock (biometric or PIN) | The device unlock is not a per-transaction signature | OK for **low-risk** approvals (e.g. "skip this run", "snooze"). For payments, open the app and sign with a passkey. |
| Push opens the app, passkey/biometric sign | The user's key | Lowest | **Default for any money-moving approval** |
| **Telegram inline "Approve" button** | Possession of the Telegram account | Telegram E2E encryption covers only "secret chats"; other data is stored in Telegram's cloud [VERIFIED FAQ]. Bots use cloud chats [INFERENCE: the bot FAQ and features pages mention no E2E]. A SIM swap or session hijack of Telegram becomes a payment approval. Operator-side compromise (AIXBT pattern) could forge messages [REPORTED]. | **Don't let a Telegram tap be the signature.** Allow it only for (a) non-money actions (pause an automation, **deny/decline**, lock the account) and (b) opening a Mini App or deep link that then requires a passkey signature in-app. |
| Telegram Mini App with WebAuthn | Passkey in the Mini App web view | Whether WebAuthn works inside each Telegram client's webview is [UNKNOWN] | Test before relying on it |
| Discord button | Discord account | Same as Telegram | Same as Telegram |
| Email link | Mailbox possession | Phishing lookalikes | View-only. Never approve by email link. |

Asymmetry rule [INFERENCE]: actions that **reduce** risk (deny, pause, freeze, revoke) may be one-tap from any linked channel. Actions that **move money or widen authority** require the user's signing key on a trusted device. Approval payloads carry an `approval_id` (fits 64-byte `callback_data`), bound server-side to a specific proposal hash and expiry, and they are single-use.

## Gaps

- WebAuthn inside Telegram Mini Apps is untested.
- Discord DM delivery and rate limits were not checked.
- I did not verify Web Push on iOS PWAs (the product is native plus desktop).
