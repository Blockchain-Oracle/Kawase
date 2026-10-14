# Codex task: Privy test accounts and a Socket API key (2026-10-14)

You are working for Abu, owner of Kawase (repo `/Users/abu/dev/hackathon/tamion`). He asked for this himself: set it up with computer use, without waiting for his permission at each step.
- He has accepted all terms.
- Use his **Zen browser** with his **Blockchain Oracle Google account**.
- Run in the background.

## Hard rules
- Free tiers only, never a card.
- **Never print a key**, in the terminal, your messages or any file other than `.env`.
- Write only to `/Users/abu/dev/hackathon/tamion/.env` (git-ignored). Replace the line if the name exists, otherwise append it. Touch no other line.
- No code or repo changes. Never commit.

## 1. Privy: test accounts (so sign-in can be tested without a real inbox)
1. Go to https://dashboard.privy.io → the **Kawase** app you created earlier.
2. Find **Test accounts** (usually under User management, Authentication or Advanced) and enable them.
3. Privy shows a test email and a fixed one-time code (and possibly a test phone). Write them to `.env`:
   - `PRIVY_TEST_EMAIL=<test email>`
   - `PRIVY_TEST_OTP=<the fixed code>`
4. Check that **Email**, **Google** and **Apple** login are enabled and **embedded wallets: create on login** is on. Turn on anything that's missing.
5. If there is an option to "return user data in the identity token" (identity tokens), turn it on.

## 2. Socket (Bungee): an API key
1. Socket's public API tier rate-limits us (HTTP 429 on every request). Find the developer key sign-up for the Socket / Bungee API: start at https://docs.socket.tech or https://docs.bungee.exchange and look for "API key", "Get a key" or a developer dashboard.
2. Create a **free** key for an app named "kawase". If the only route is a form to contact sales, don't submit anything; just report what it asks.
3. Write `SOCKET_API_KEY=<key>` to `.env`.

## Finish
Run this, which prints names only:

`grep -o -E '^(PRIVY_TEST_EMAIL|PRIVY_TEST_OTP|SOCKET_API_KEY)=' /Users/abu/dev/hackathon/tamion/.env`

Then give a short summary:
- what's set;
- which Privy settings you changed;
- what Socket's key process required;
- anything skipped.
