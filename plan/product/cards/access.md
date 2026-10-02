# Card: Get in and stay in (account and access)

Purpose: the how-ladder for opening the app, signing in, linking methods, devices, export and deletion. Rules: R12, R13, R8.
Sources: `apps/mobile/src/wallet/turnkey-account-core.ts`, `sign-in/sign-in-sheet.tsx`, `apps/api/src/auth/*`, Turnkey kit 2.3.7 / core 2.12.0 source, the Release repro of 2026-10-02.
Verified: 2026-10-02

## First open
| Lens | Answer |
|---|---|
| Entry | App launch (fresh install), the web `/welcome`, a deep link from a request link `/r/[token]` |
| Which | 5 story panels, the language pill on panel 1 (device language detected), narration speaker beside it |
| Who / when | Anyone; nothing stored yet |
| How | Swipe or auto-advance (UI thread, velocity spring); **Try first** → guest Home; **I have an account** → sign-in sheet over the story |
| How long | Instant; narration clips bundled |
| What if | Reduced motion → still art, no auto-advance; screen reader → panels as a list; language change keeps the panel |
| After | Guest session with locale; the story is never shown again unless signed out |
| Consistency | The language pill appears on every onboarding screen and on guest Home |
| Copy & identity | One title + one line per panel; real marks (USDC, Arc, Apple Pay, exchange logos on panel 5) |

## Sign in / sign up
| Lens | Answer |
|---|---|
| Entry | Story; the guest header **Sign in** pill; **any guarded action** (in place, resumes after); Settings → Account; an expired session (re-auth sheet over the current page) |
| Which | Email code · Apple · Google (passkey once a domain exists) |
| How | Email: address → code (6 digits, paste supported) → signed in. Apple/Google: provider sheet → back. All reach the **same Turnkey sub-org** for a linked person |
| Then | New account: optional @handle → testnet setup runs by itself (wallet, 7702 relayed, allowance with one Face ID) → completion receipt. Returning: straight back to the original task |
| How long | Code email in seconds; setup ~5–15 s with a stepper |
| What if | Wrong code (inline), expired code (resend), **too many codes → countdown** (Turnkey "Max number of OTPs"), offline, provider down, session-link failure (retry that stage only, never a new code), wallet registration failure (retry), cancelled provider sheet (back to the sheet). The beacon `POST /client-events` records the stage and error for support |
| After | Session for 30 days; push token registered; guest data merged (drafts resume; clashing contacts flagged) |
| Consistency | Same flow on iOS/Android/web; web uses an email code for approvals until passkeys |
| Copy & identity | Apple and Google marks per their brand rules; stage-specific error copy in 10 languages |

## Link methods / change email
- **Entry:** Settings → Account → Sign-in methods.
- **How:** add Apple, Google or email to the current Turnkey user (authenticators). Changing the email sends a code to the new address.
- **What if:** the method already belongs to another account → explain and offer sign-in there.
- **After:** the method is listed with its mark; the notification email follows the account email.

## Devices and sessions
- **Entry:** Settings → Account → Devices.
- **Which:** this device and others (name, OS, last active, approximate location).
- **How:** "Sign out this device" revokes the Kawase session and deletes that device's Turnkey API key. "Sign out everywhere" does it for all.
- **Lost phone:** sign in elsewhere → Devices → sign out the lost one → **Pause all** (instant, server) → optionally Revoke (on chain).
- **After:** a security notification by email.

## Export wallet
- **Entry:** Settings → Account → Export wallet; the "Withdraw without Kawase" docs page.
- **How:** warnings → Face ID → Turnkey export bundle shown with screen-capture protection → copy or reveal.
- **After:** an audit row.

## Delete account
1. Holdings check, shown per asset and chain.
2. "Withdraw everything" (Withdraw card) or "Export wallet".
3. Revoke grants on both networks (one Face ID each).
4. Confirm by typing the @handle.
5. Personal data deleted (contacts, threads, transcripts, inbox); open requests cancelled; @handle held 30 days.

The wallet stays the user's.

## Sign out
Clears the account's caches and drafts, unregisters the push token server-side, logs out of Turnkey, and returns to the story with the language kept.

## Acceptance (walk on a phone)
- [ ] Fresh install → story → change language on panel 1 → Try first → guest Home in that language.
- [ ] Guest taps Buy → sign-in sheet → email code → setup → **returns to Buy**.
- [ ] Request 4 codes quickly → countdown shown, no generic error.
- [ ] Sign in with Apple on a second device → same wallet address and contacts.
- [ ] Devices → sign out the first device → it lands on the story.
- [ ] Delete account on a test account → the steps run in order; the @handle can't be reused for 30 days.
