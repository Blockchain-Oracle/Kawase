# Notification channels as integrations (Telegram, Discord, email, WhatsApp, SMS, Web Push)

Purpose: exact endpoints and account-linking flows for each channel the user can connect in Settings, and whether the agent can also be *chatted with* there.

Sources:
- Telegram Bot API: https://core.telegram.org/bots/api (raw text `.firecrawl/product/06-platform/tg-api.txt`; latest changelog entry "August 24, 2026 Bot API 10.3") · features/deep linking: https://core.telegram.org/bots/features (`tg-features.txt`)
- Discord API docs (GitHub source `discord/discord-api-docs`, `developers/resources/user.mdx`, `webhook.mdx`, `application.mdx`, `developers/topics/oauth2.mdx`; saved as `.firecrawl/product/06-platform/discord-*.mdx`)
- Resend pricing: https://resend.com/pricing
- WhatsApp Cloud API send messages: https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-messages
- Twilio A2P 10DLC: https://www.twilio.com/docs/messaging/compliance/a2p-10dlc
- WebKit Web Push on iOS: https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/
- Vercel Chat SDK: https://chat-sdk.dev/llms.txt · npm `chat` 4.41.1, `@chat-adapter/telegram|discord|whatsapp` 4.41.1
- npm versions: `.firecrawl/product/06-platform/npm-versions-2026-09-29.tsv`

Verified: 2026-09-29

## Summary [INFERENCE]

| Channel | Linking effort | Two-way chat with agent | Two-week priority |
|---|---|---|---|
| Mobile push (Expo) | none (permission prompt) | no | **Must** |
| **Telegram bot** | one tap (deep link) | **yes**, incl. buttons and voice notes | **Must**: cheapest high-wow channel |
| Email (Resend) | verify address | reply parsing possible, not worth it | Should (receipts, weekly summary) |
| Discord | OAuth2 | yes (bot DM / slash commands) | Could |
| Web Push | permission; iOS needs home-screen install | no | Could (web/desktop users) |
| WhatsApp Cloud API | Meta business verification + templates | yes, inside 24 h window | Won't (setup time) |
| SMS (Twilio) | phone verify; US A2P 10DLC registration | yes | Won't |

## 1. Telegram [VERIFIED unless tagged]

**Base:** `https://api.telegram.org/bot<token>/METHOD_NAME`. GET and POST are supported.

**Linking flow (deep link `/start <token>`):**
1. App: `POST /api/integrations/telegram/link` → server creates a one-time, short-TTL link token (random, base64url, ≤64 chars) bound to the user [INFERENCE].
2. App opens `https://t.me/<bot_username>?start=<token>`. Telegram: "When someone opens a chat with your bot via this link, you will receive: /start <param>". Allowed chars "A-Z, a-z, 0-9, _ and -"; "The parameter can be up to 64 characters long"; base64url is recommended.
3. Bot receives the update via webhook (`setWebhook` with `secret_token`; Telegram then sends header "X-Telegram-Bot-Api-Secret-Token" so you can authenticate the call). Server matches the token, stores `chat.id` and `from.id` against the user, marks the token used [INFERENCE on storage].
4. Bot replies with `sendMessage` ("Connected to <app> as alex@…") plus a URL button back to the app (`https://<domain>/settings/notifications` Universal Link). App polls or receives a push that the link is complete [INFERENCE].

**Sending notifications:** `sendMessage` with `chat_id`, `text` ("1-4096 characters after entities parsing"), `parse_mode`, `reply_markup`. Default broadcast limit: "up to 30 messages per second" (Paid Broadcasts raise it to 1000/s for Stars).

**Inline buttons (approve/deny):** `InlineKeyboardButton.callback_data` is "1-64 bytes", so put an opaque approval id there, not payload. Taps arrive as `callback_query`. You must call `answerCallbackQuery` ("necessary to react by calling answerCallbackQuery even if no notification to the user is needed"). Then `editMessageText` to show "Approved ✓" and remove the buttons. Recent Bot API versions added `DisabledButton` / `disabled` on inline buttons (changelog).

**Chatting with the agent in Telegram: yes.**
- Text: every message arrives as an update. Route it into the same agent runtime and conversation store as the app, with the chat id → user mapping from linking [INFERENCE].
- Streaming replies: Telegram now has `sendMessageDraft` / `sendRichMessageDraft`; "An empty sendMessageDraft displays a Thinking… placeholder", and the user can stop generation (`MessageGenerationStopped`).
- Voice notes: `Message.voice` exists. Download via `getFile` then `https://api.telegram.org/file/bot<token>/<file_path>` ("files of up to 20MB"), run STT, answer in text or TTS voice [INFERENCE on pipeline].
- Safety [INFERENCE]: in Telegram, money actions should end with an inline-button confirmation bound to a server-side pending operation with expiry and limits. High-value actions should require confirming in the app (biometric). A Telegram account is weaker authentication than the device.
- Libraries: `grammy` 1.46.0, `telegraf` 4.16.3 (last publish 2026-03-06), or Vercel Chat SDK `@chat-adapter/telegram` 4.41.1 [VERIFIED npm]. Chat SDK describes itself as "A unified TypeScript SDK for building chat bots and agents across Slack, Microsoft Teams, Google Chat, Discord, Telegram, WhatsApp, and more — with type-safe handlers, JSX cards, and AI streaming" [VERIFIED].
- Mini Apps: a Telegram Mini App could host the web UI inside Telegram. Note the Bot API hardening "disallowing the usage of Mini App methods from origins different from the original Mini App domain" (auto-enabled July 20, 2026). Not needed for v1 [INFERENCE].

## 2. Discord [VERIFIED unless tagged]

Two very different mechanisms:

| | Incoming webhook | Bot DM (app) |
|---|---|---|
| What | Posts into one channel of a server the user controls | Bot messages the user privately |
| Linking | OAuth2 scope `webhook.incoming`: "this generates a webhook that is returned in the oauth token response for authorization code grants" (user picks a channel) | OAuth2 `identify` to learn the user id; the app must be able to reach them (see below) |
| Send | `POST /webhooks/{webhook.id}/{webhook.token}` (Execute Webhook), no bot token needed | `POST /users/@me/channels` with `{ "recipient_id": … }` (Create DM) → then `POST /channels/{channel.id}/messages` [endpoint from Discord docs, message route not re-quoted] |
| Two-way chat | no | yes (DM messages / slash commands via interactions) |

- OAuth URLs: authorize `https://discord.com/oauth2/authorize`, token `https://discord.com/api/oauth2/token`.
- Installation contexts: `GUILD_INSTALL` (0) and `USER_INSTALL` (1). User-installed apps "are visible across all of an authorizing user's servers, DMs, and GDMs". `integration_type=1` in the authorize URL requests user install and "is only relevant when `scope` contains `applications.commands`".
- Discord warns about Create DM: "DMs should generally be initiated by a user action. If you open a significant amount of DMs too quickly, your bot may be rate limited or blocked from opening new ones."
- Whether a bot can open a DM with a user who only *user-installed* the app and shares no server with it: [UNKNOWN]. Not stated in the fetched docs. Test before promising.
- **Simplest v1 [INFERENCE]:** the `webhook.incoming` OAuth flow. One redirect, and notifications land in a channel of the user's choosing. Two-way chat on Discord is a stretch goal (`discord.js` 14.27.0 or `@chat-adapter/discord`).

## 3. Email (Resend)
- `resend` 6.30.0 on npm [VERIFIED]. Send endpoint `POST https://api.resend.com/emails` (from Resend API docs; not re-fetched today) [REPORTED].
- Free plan: "3,000" emails/month, "100 emails per day", and a domain limit given as 3 on the pricing page. Pro "$20/mo" for 50,000 [VERIFIED].
- Linking: send a 6-digit code or magic link to verify the address [INFERENCE]. Needs a verified sending domain (SPF/DKIM) [INFERENCE].

## 4. WhatsApp Cloud API [VERIFIED]
- Send: `POST https://graph.facebook.com/v25.0/<WHATSAPP_BUSINESS_PHONE_NUMBER_ID>/messages`.
- "When a WhatsApp user messages you or calls you, a 24-hour timer called a customer service window starts." "When the window closes, you can only send pre-approved template messages."
- Implication [INFERENCE]: proactive alerts ("automation ran") need approved templates. Business setup and template approval don't fit a 12-day window. Linking would mirror Telegram (user sends a code to your number via `wa.me` link), and `@chat-adapter/whatsapp` exists [VERIFIED npm].

## 5. SMS (Twilio)
- "Anyone sending SMS/MMS messages over a 10DLC number from an application to the US must register for A2P 10DLC." Unregistered senders "will receive additional carrier fees" [VERIFIED]. Vetting time: not stated on the page [UNKNOWN].
- Send endpoint `POST https://api.twilio.com/2010-04-01/Accounts/{AccountSid}/Messages.json` [REPORTED, not fetched].
- Skip for the hackathon [INFERENCE].

## 6. Web Push (web / desktop PWA)
- iOS/iPadOS 16.4+ only for web apps "added to the Home Screen", and permission must be requested "in response to direct user interaction" [VERIFIED].
- Standard VAPID push. The `web-push` npm package 3.6.7 was last published 2024-01-16 [VERIFIED npm]. Stable but unmaintained-looking [INFERENCE].
- `expo-notifications` can return a web `PushSubscription` via `getDevicePushTokenAsync` [VERIFIED expo docs], so the Expo web build can reuse the same settings UI [INFERENCE].

## 7. Settings UX model [INFERENCE]
- `Settings → Notifications`: channels (Push ✓, Telegram "Connect", Discord "Connect", Email "Verify") × event types (incoming funds, automation ran, automation failed, approval needed, limit reached, price alert, weekly summary). Per-type channel toggles, quiet hours, and "Test notification" per channel.
- Store `notification_channels(user_id, kind, address/chat_id/webhook_url, verified_at, disabled_at)` and a delivery log per event × channel.
- Disconnect = delete the row. For Telegram, also react to the `my_chat_member` "kicked" update when the user blocks the bot [INFERENCE; update type exists in Bot API but not quoted here].
