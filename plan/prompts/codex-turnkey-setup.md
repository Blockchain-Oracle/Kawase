# Prompts for Codex: set up Turnkey (and Google / Apple sign-in) for Kawase

Purpose: two prompts Abu can paste into Codex. Prompt 1 is required for spike 16. Prompt 2 can run afterwards.
Written: 2026-09-30. Sources for the steps: Turnkey docs (Auth Proxy, React Native getting started, social logins) saved under `.firecrawl/product/17/turnkey-llms-full.txt`.

---

## Prompt 1: Turnkey organization, Auth Proxy, and the env files

```
<task>
Set up Turnkey for the Kawase app, using the Zen browser on this Mac, where Abu is already logged in to https://app.turnkey.com. Then write the resulting ids into the project's env files.

Project: /Users/abu/dev/hackathon/tamion (an Expo / React Native app; the wallet provider reads two public ids from env).

Do these steps in the Turnkey dashboard:
1. Find the organization ID of the logged-in (parent) organization.
2. Go to Embedded Wallets → Configuration (https://app.turnkey.com/dashboard/walletKit). Turn the Auth Proxy ON.
3. In that configuration:
   - Email OTP: ON. SMS OTP: OFF.
   - OTP: 6 digits, numeric.
   - Passkeys: ON.
   - Email customization: application name "Kawase". Leave the logo empty.
   - Session expiration: 2592000 seconds (30 days). If the field rejects it, use the largest value it accepts and report that value.
   - Allowed origins: leave the default "*" for now. Do not restrict it yet (the native app's requests have not been tested against a restricted list).
   - Leave Google, Apple, X, Discord and external wallets OFF in this run.
4. Save, then copy the Auth Proxy Config ID.
5. Create one API key for the parent organization named "kawase-server" (the dashboard generates the key pair in the browser). Capture the public key and the private key. If the dashboard only offers a download, read the values from the downloaded file and delete the file afterwards.

Then write the values into BOTH env files (create apps/mobile/.env if it does not exist; keep every existing line in both files unchanged; replace a key's line if the key already exists):
- /Users/abu/dev/hackathon/tamion/.env
    EXPO_PUBLIC_TURNKEY_ORGANIZATION_ID=<organization id>
    EXPO_PUBLIC_TURNKEY_AUTH_PROXY_CONFIG_ID=<auth proxy config id>
    TURNKEY_API_PUBLIC_KEY=<public key>
    TURNKEY_API_PRIVATE_KEY=<private key>
- /Users/abu/dev/hackathon/tamion/apps/mobile/.env
    EXPO_PUBLIC_TURNKEY_ORGANIZATION_ID=<organization id>
    EXPO_PUBLIC_TURNKEY_AUTH_PROXY_CONFIG_ID=<auth proxy config id>
</task>

<action_safety>
- Work only in the Turnkey dashboard and in the two env files named above. Do not edit any other project file.
- Use the existing Zen session. Do not log out, do not switch accounts, do not open a private window.
- Never print, log, screenshot or paste TURNKEY_API_PRIVATE_KEY anywhere except the root .env file. Do not put it in apps/mobile/.env.
- Do not enter payment details, accept paid plans, or change billing. If the dashboard requires a card or a plan change to continue, stop and report exactly what it asked for.
- Do not delete or change existing API keys, users, policies or wallets in the organization.
- Do not commit anything to git. Both env files are git-ignored; confirm that with `git check-ignore` and stop if either is not ignored.
</action_safety>

<default_follow_through_policy>
Keep going without asking for routine choices (naming, which menu an option lives in). Stop and report instead of guessing only when: a step needs a 2FA or email code from Abu, a payment, or a setting named above does not exist in the dashboard.
</default_follow_through_policy>

<verification_loop>
Before you finish:
1. Run: curl -s -X POST https://authproxy.turnkey.com/v1/wallet_kit_config -H "Content-Type: application/json" -H "X-Auth-Proxy-Config-Id: <auth proxy config id>" -d '{}'
   It must return JSON that shows email OTP enabled. If it errors, re-check the config id and that the Auth Proxy is ON.
2. Confirm both env files contain the two EXPO_PUBLIC_ lines with non-empty values, and the root .env contains both TURNKEY_API_ lines.
3. Re-open the configuration page and confirm the settings from step 3 were saved.
</verification_loop>

<compact_output_contract>
Reply with a short list:
- organization id (it is public, print it)
- auth proxy config id (public, print it)
- session expiration actually set
- "API key kawase-server created: yes/no" (never the key itself)
- the result of the curl check in one line
- anything you could not do, and what Abu must do for it
</compact_output_contract>
```

---

## Prompt 2: Google and Apple sign-in for the wallet (run after Prompt 1)

```
<task>
Enable "Continue with Google" and "Continue with Apple" for the Kawase app's Turnkey wallet, using the Zen browser on this Mac where Abu is logged in to Turnkey, Google Cloud and Apple Developer.

Facts you need:
- App: Kawase. iOS bundle id and Android package: xyz.kawase.app. App URL scheme: kawase.
- Turnkey dashboard: Embedded Wallets → Configuration (https://app.turnkey.com/dashboard/walletKit). It shows an "OAuth redirect URL". Use that exact value wherever a provider asks for a redirect or return URL. (Turnkey's default is https://oauth-redirect.turnkey.com with the app scheme as a query parameter.)
- Project env files: /Users/abu/dev/hackathon/tamion/.env and /Users/abu/dev/hackathon/tamion/apps/mobile/.env.

Steps:
1. Google (https://console.cloud.google.com/apis/credentials): first look for an existing project and OAuth client that is clearly meant for Kawase. If none exists, create a project named "Kawase", configure the OAuth consent screen (external, app name "Kawase", Abu's account as support and developer contact, no extra scopes beyond email/profile/openid), and create an OAuth client of type "Web application" named "Kawase wallet" with the Turnkey OAuth redirect URL as an authorized redirect URI. Copy the client id.
2. Apple (https://developer.apple.com/account/resources/identifiers/list): make sure an App ID exists for xyz.kawase.app with the "Sign In with Apple" capability enabled (create or edit it). Create a Services ID "xyz.kawase.app.signin" (description "Kawase sign-in"), enable Sign In with Apple on it with xyz.kawase.app as the primary App ID, and add the Turnkey OAuth redirect URL's host as the domain and the full URL as the return URL. Note the Team ID shown in the account.
3. Turnkey dashboard: in the OAuth / social logins section, turn Google and Apple ON and enter the Google web client id and the Apple Services ID where the dashboard asks for client ids. Save.
4. Add these lines to BOTH env files (keep all other lines unchanged; replace a key's line if it exists):
    EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=<google web client id>
    EXPO_PUBLIC_APPLE_SERVICES_ID=xyz.kawase.app.signin
    EXPO_PUBLIC_APPLE_IOS_BUNDLE_ID=xyz.kawase.app
    APPLE_TEAM_ID=<team id>
</task>

<action_safety>
- Touch only: the Google Cloud project for Kawase, the Apple identifiers named above, the Turnkey OAuth settings, and the two env files.
- Do not change or delete OAuth clients, identifiers, certificates or profiles that belong to other apps.
- Do not enter payment details or accept paid programs. Do not publish the Google consent screen for verification; leave it in testing.
- No client secret is needed for this setup. If you create one by accident, do not print it and do not store it.
- Use the existing Zen sessions. Do not log out or switch accounts. Do not commit to git.
</action_safety>

<default_follow_through_policy>
Keep going on routine choices. Stop and report when a step needs a 2FA code, a legal agreement only Abu can accept, a payment, or when an existing resource looks like it belongs to another app and you would have to change it.
</default_follow_through_policy>

<verification_loop>
Before you finish: re-open each of the three consoles and confirm the client, the identifiers and the Turnkey toggles are saved; confirm the four env lines exist in both files; run the curl from Prompt 1's verification and confirm the response now shows Google and Apple enabled.
</verification_loop>

<compact_output_contract>
Reply with: the Google web client id, the Apple Services ID, the Apple Team ID, the Turnkey OAuth redirect URL you used, whether each provider toggle is ON, and anything left for Abu.
</compact_output_contract>
```

---

## Not in these prompts (Abu decides)
- **Passkey domain.** A passkey is tied to its domain for life, so it should be a domain Abu owns for Kawase (not the sslip.io host). Once chosen, it goes in `EXPO_PUBLIC_PASSKEY_RP_ID`, and the domain must serve two small files for iOS and Android.
- **Card on file.** Turnkey gives 25 free signatures a month; past that it needs a card. Codex is told not to enter one.
- **Tightening "Allowed origins"** from `*` to the real web addresses, after the native app is confirmed to work with a restricted list.
