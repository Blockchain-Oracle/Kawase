# Codex task: Coinbase Developer Platform for in-app Apple Pay, and a read-only look at Circle's KYB (2026-10-14)

You are working for Abu, owner of Kawase (repo `/Users/abu/dev/hackathon/tamion`). He asked for this himself: set it up with computer use, without waiting for his permission at each step.
- He has accepted all the terms and conditions these sign-ups present.
- Use his **Zen browser** (`/Applications/Zen.app`), where his **Blockchain Oracle Google account** is signed in. Use "Continue with Google" wherever it's offered.
- Run in the background and finish on your own.

## Hard rules
- **Free only.** Never enter a card, never pick a paid plan.
- **Never print a key or secret**, in the terminal, your messages or any file other than `.env`.
- Write keys **only** into `/Users/abu/dev/hackathon/tamion/.env` (git-ignored; check with `git -C /Users/abu/dev/hackathon/tamion check-ignore .env`).
  - Replace the line if the name already exists, otherwise append it.
  - Touch no other line.
- Never commit, push or change code.
- **Do not submit any KYB / business-verification form anywhere.** Part 2 is read-only.

## 1. Coinbase Developer Platform: Onramp (Apple Pay inside the app)
1. Go to https://portal.cdp.coinbase.com and sign in or sign up with Google (set up 2FA if it insists, using the Google account's authenticator flow it offers).
2. Create a project named **Kawase**. Copy the **Project ID**.
3. Create a **Secret API key** for that project (Onramp access; the default ES256/Ed25519 choice is fine). Copy the key ID/name and the private key.
4. Open the **Onramp** section of the project.
   - Note whether it is in "trial mode".
   - Note what the "onboarding form" for full access asks (don't submit it; list its questions).
   - Add `https://app.getkawase.xyz` and `http://localhost:8081` as allowed domains/origins if there is such a setting.
5. Write to `.env`:
   - `CDP_PROJECT_ID=<project id>`
   - `EXPO_PUBLIC_CDP_PROJECT_ID=<project id>`
   - `CDP_API_KEY_ID=<key id or name>`
   - `CDP_API_KEY_SECRET=<private key>`, on ONE line with literal `\n` for newlines if it is a PEM.

## 2. Circle Console: what does Onramp KYB ask? (read-only)
1. Go to https://console.circle.com and sign in. Abu already has a Circle developer account with TEST and LIVE keys; try Google sign-in first.
2. Open the App Kits / Onramp area and find the **KYB** (business verification) page.
3. **Do not submit anything.** Write down exactly what it asks:
   - Is it for a registered company only, or can an individual / sole trader apply?
   - Which documents?
   - Is there a `web_url` / domains field?
   - The expected review time.
4. Also note whether **bank transfer** is listed as available without KYB.

## Finish
Run this, which prints names only, never values:

`grep -o -E '^(CDP_PROJECT_ID|EXPO_PUBLIC_CDP_PROJECT_ID|CDP_API_KEY_ID|CDP_API_KEY_SECRET)=' /Users/abu/dev/hackathon/tamion/.env`

End with a short plain-English summary covering:
- which names are set;
- Coinbase trial-mode status and the onboarding form's questions;
- what Circle's KYB form asks (company-only or not, documents, domains field, review time), quoted as closely as you can;
- anything you skipped and why.
