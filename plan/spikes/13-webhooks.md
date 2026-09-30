# Spike 13: webhooks through Coolify (Circle Wallets v2 on Arc testnet; Telegram)

Code: `plan/spikes/code/13-webhooks/` (`server.mjs` receiver, `Dockerfile`, `transfer.mjs` to produce real events, `results.testnet.json`).
Date: 2026-09-30
**Result: PASS for Circle on testnet. Partial for the rest:** Circle mainnet is not tested (the LIVE key returns 403) and Telegram is tested only with simulated updates (there is no bot token in `.env`).

Docs read first: Circle "Webhooks" (event model, delivery, idempotency: developers.circle.com/wallets/webhook-notifications), "How-to: Verify webhook signatures" (developers.circle.com/api-reference/verify-webhook-signatures), the subscriptions API (`/v2/notifications/subscriptions`), Telegram `setWebhook` notes in `context/08-product-research/06-mobile-desktop-platform/notification-channels.md`, and the Coolify skill + `deploy/coolify.md`.

## How it was deployed (the same path the real services will use)
- Coolify app created from the git repo with the deploy key, Dockerfile build pack, Base Directory `/plan/spikes/code/13-webhooks`, **port 3000 and `https://kawase-spike13.84.46.247.92.sslip.io` passed at creation**. The Traefik labels came out right the first time (port 3000, Let's Encrypt) with no later edits.
- Runtime env vars set with `coolify app env create … --build-time=false`. Database: the Coolify Postgres over its internal host name (the database UUID) on port 5432.
- The app, its tables and the Circle subscription were removed afterwards.

## Results
- **Circle subscription:** `POST /v2/notifications/subscriptions` with `{"endpoint": …, "notificationTypes": ["*"]}` succeeded; Circle immediately delivered a signed `webhooks.test`.
- **Real events on ARC-TESTNET, both wallet types:** a 0.01 USDC transfer from the developer-controlled ops wallet to the user-controlled vault (tx `0x13e0ab9b…56e1`) produced `transactions.outbound` QUEUED → SENT → CLEARED → COMPLETE for the DCW wallet and `transactions.inbound` COMPLETE for the UCW wallet. The COMPLETE webhook arrived about 18 s after the request, slightly before our own polling saw it.
- **Signature:** every delivery verified with ECDSA-SHA256 over the raw body, using the public key from `/v2/notifications/publicKey/{X-Circle-Key-Id}`. Unsigned and forged requests got 401.
- **Retry + dedupe:** with the endpoint set to fail the first delivery of each notification (second transfer, tx `0xf4597a13…8c66`), Circle re-sent all 5 notifications within 1–3 s with the same `notificationId`. Each ended with 2 deliveries and exactly 1 side effect.
- **Telegram (simulated):** a request without the right `X-Telegram-Bot-Api-Secret-Token` got 401; the same `update_id` sent twice was stored once.
- HTTP requests are redirected to HTTPS (302), and HEAD on the Circle route returns 200.

## Findings (these shape Stages 3 and 9)
1. **Deduplicate on `notificationId` with a unique key, and run the side effect only when the insert is new.** `insert … on conflict do update … returning (xmax = 0)` does both in one statement.
2. **Order is not guaranteed.** In the retry run, CLEARED was recorded before QUEUED. Handle each notification by the state it carries, never by arrival order (Circle's docs say the same).
3. `webhooks.test` always uses `notificationId` `00000000-0000-0000-0000-000000000000`. Treat it as a ping, not an event.
4. Verify against the **raw** request body (`await c.req.text()` in Hono) before parsing.
5. The public key for a key id is static; cache it. The lookup needs an API key for the matching environment, so the api tries TEST and LIVE keys.
6. **Services on `node:*-alpine` must listen on `::`, not `0.0.0.0`.** Coolify's health check runs busybox `wget http://localhost:<port>/…` inside the container, and `localhost` resolves to `::1` there; an IPv4-only listener fails every check and the deploy rolls back. (Alternative: set the app's health-check host to `127.0.0.1`.)
7. The first HTTPS request after the first deploy can fail certificate verification for a few seconds, until Let's Encrypt issues the certificate. Create the Circle subscription only after `https://…/health` verifies.
8. Coolify's app `status` field can lag behind (it showed `running:unhealthy` after a healthy rolling update). Trust the deployment log and the health URL.
9. The Coolify CLI's `database get -s` returns the user, password and UUID but no ready-made internal URL; build it as `postgres://<user>:<url-encoded password>@<database uuid>:5432/<db>`.

## Still open
- **Circle LIVE (mainnet) webhooks:** waiting on a working LIVE key.
- **A real Telegram delivery:** needs a bot token from @BotFather in `.env` (`TELEGRAM_BOT_TOKEN`), then `setWebhook` with a `secret_token` and one message to the bot.

## Decision
Use Circle v2 webhooks as the primary signal for transaction state, with the reconcile workflow as the backstop (unchanged plan). No fallback needed on testnet.
