# Android: EAS builds and Google Play

Kawase's Android app is built in the cloud by EAS (no Android SDK on this Mac) and shipped through Google Play's
**internal testing** track. Expo project: `@abu.dev/kawase` (`apps/mobile/eas.json`, project id in `app.json`).

## Why internal testing

- A personal Play developer account created after 13 Nov 2023 must run a **closed test with at least 12 testers for
  14 days** before it can apply for production ([Play Console help](https://support.google.com/googleplay/android-developer/answer/14151465)).
  Internal testing has no such requirement: up to 100 testers, no review, available within minutes.
- New apps must target **Android 16 (API 36)** from 31 Aug 2026 ([target API](https://developer.android.com/google/play/requirements/target-sdk));
  React Native 0.86 (Expo SDK 57) already does (`targetSdk = 36`).

## Profiles (`apps/mobile/eas.json`)

| Profile | Output | Use |
|---|---|---|
| `preview` | APK, internal distribution | Install directly on a phone from the build page / QR — no Play needed |
| `production` | App bundle (.aab), versionCode auto-incremented on EAS | Google Play |
| `development` | Dev client | Metro on the LAN, like the iOS simulator build |

Public config (`EXPO_PUBLIC_*`) comes from the EAS `preview`/`production` environments (`eas env:list`), with the
production api. Local `.env` files are never uploaded (`.easignore` at the repo root repeats every `.gitignore` rule).
The upload keystore was generated on EAS on the first build; Play App Signing holds the app signing key.

## Commands (from `apps/mobile`)

```sh
npx eas-cli@latest build -p android --profile preview      # APK to install on a phone
npx eas-cli@latest build -p android --profile production   # .aab for Google Play
npx eas-cli@latest submit -p android --latest              # newest .aab → Play internal track
```

## Google Play, once

1. Play Console → **Create app**: name *Kawase*, app, free.
2. **The first .aab is uploaded by hand** — the Play Developer API cannot create releases for an app that has never had
   one ("Package not found" / "Only releases with status draft may be created on draft app"). Testing → Internal
   testing → Create new release → upload the .aab from the EAS build page → roll out.
3. Internal testing → Testers: add the testers' Google accounts; each opens the opt-in link on the phone and installs
   from the Play Store.
4. `eas submit` uses the service account key at `~/.config/kawase/play-service-account.json` (outside the repo). The
   account needs access to the Kawase app in Play Console → Users and permissions (release to testing tracks, manage
   testing tracks).

After step 2, every release is `production` build → `submit` (track `internal`, status `completed`).

## Before a wider release (closed/open testing, production)

Privacy policy URL, account deletion (in app and a web link), Data safety, content rating, target audience, financial
features declaration, store listing with screenshots — tracked in `plan/COVERAGE.md` (Q, U).
