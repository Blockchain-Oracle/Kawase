# Codex task: create three developer accounts and put their keys in Kawase's .env (2026-10-14)

You are working for Abu, the owner of Kawase (repo `/Users/abu/dev/hackathon/tamion`). Abu asked for this himself: you set up these developer accounts using computer use, without waiting for his permission at each step.
- He has accepted all the terms and conditions these sign-ups present.
- Use his **Zen browser** (`/Applications/Zen.app`), where his **Blockchain Oracle Google account** is signed in. Use "Continue with Google" with that account wherever sign-up offers it.
- Run this in the background and finish on your own.

## Hard rules
- **Free tiers only.** Never enter a card, never pick a paid plan, never start a paid trial. If a service demands payment, skip it and say so in your final message.
- **Never print a key or secret** in the terminal, in your messages or in any file other than `.env`.
- Write the keys **only** into `/Users/abu/dev/hackathon/tamion/.env`. It is git-ignored; check with `git -C /Users/abu/dev/hackathon/tamion check-ignore .env`.
  - Replace the line if the name already exists, otherwise append it.
  - Don't touch any other line in that file.
- Never commit, never push, never change code in the repo.
- If a page asks you to verify an email, open Gmail in the same Zen profile and use the code or link.

## 1. Privy (sign-in and the user's wallet; replaces Turnkey)
1. Go to https://dashboard.privy.io and sign in with Google. Create an app named **Kawase**.
2. **Login methods:** turn on Email, Google and Apple. Keep Privy's default OAuth credentials for now.
3. **Embedded wallets:** Ethereum/EVM on, "create on login" for users without a wallet. Leave the rest at the defaults.
4. **App clients (mobile):** create a client for the Expo app.
   - iOS bundle identifier `xyz.kawase.app`
   - Android package name `xyz.kawase.app`
   - URL scheme `kawase`
   - Copy its **client ID**.
5. **Allowed domains / origins:** add `https://app.getkawase.xyz`, `https://kawase.84.46.247.92.sslip.io` and `http://localhost:8081`.
6. Copy the **App ID** and the **App secret** (Settings / API keys). Write to `.env`:
   - `PRIVY_APP_ID=<app id>`
   - `PRIVY_APP_SECRET=<app secret>`
   - `EXPO_PUBLIC_PRIVY_APP_ID=<app id>`
   - `EXPO_PUBLIC_PRIVY_CLIENT_ID=<mobile client id>`

## 2. Uniswap Trading API (swap routing on Arc)
1. Go to the Uniswap developer platform (https://developers.uniswap.org, the Trading API / API keys section). Sign in with Google and create a free API key named **kawase**.
2. Write `UNISWAP_API_KEY=<key>` to `.env`.

## 3. 0x Swap API (swap routing on Arc)
1. Go to https://dashboard.0x.org. Sign in or sign up with Google. Create an app named **kawase** on the free plan and copy its API key.
2. Write `ZEROX_API_KEY=<key>` to `.env`.

## Finish
Run this, which prints names only, never values:

`grep -o -E '^(PRIVY_APP_ID|PRIVY_APP_SECRET|EXPO_PUBLIC_PRIVY_APP_ID|EXPO_PUBLIC_PRIVY_CLIENT_ID|UNISWAP_API_KEY|ZEROX_API_KEY)=' /Users/abu/dev/hackathon/tamion/.env`

Then end with a short plain-English summary:
- which of the six names are set;
- anything you skipped and why;
- any dashboard setting you couldn't find (say where you looked).
