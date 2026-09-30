# Distribution in two weeks, and store policy for a crypto money agent

Purpose: what judges can actually install by Oct 10, 2026, how long each channel takes, and the exact Apple/Google rules for crypto wallet apps.

Sources:
- Apple App Review Guidelines ("Last Updated: June 8, 2026"): https://developer.apple.com/app-store/review/guidelines/ (raw copy `.firecrawl/product/06-platform/apple-guidelines.txt`)
- TestFlight: https://developer.apple.com/testflight/ (`.firecrawl/product/06-platform/apple-testflight.txt`) · https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/ · https://developer.apple.com/help/app-store-connect/test-a-beta-version/add-internal-testers/
- App Review timing: https://developer.apple.com/distribute/app-review/ (`apple-app-review.txt`)
- Apple enrollment: https://developer.apple.com/programs/enroll/
- Google Play blockchain policy: https://support.google.com/googleplay/android-developer/answer/13607354 (`google-play-blockchain.txt`)
- Google Play internal testing: https://support.google.com/googleplay/android-developer/answer/9845334 · new personal accounts: https://support.google.com/googleplay/android-developer/answer/14151465
- Android developer verification: https://android-developers.googleblog.com/2026/06/android-developer-verification.html
- EAS internal distribution: https://docs.expo.dev/build/internal-distribution/ (`expo-internal-distribution.md`) · EAS pricing: https://expo.dev/pricing
- Tauri signing: https://v2.tauri.app/distribute/sign/macos/ · https://v2.tauri.app/distribute/sign/windows/
- Judging: `context/00-hackathon/judging-and-submission.md`

Verified: 2026-09-29

## 1. What judges can realistically install

Judging is asynchronous after Oct 10. A live URL is "encouraged", and the organizers ask you to "Build for a reviewer who will click around without you in the room" (`context/00-hackathon/judging-and-submission.md`, `brief.md:50`). [VERIFIED]

| Channel | Judge effort | Lead time | Verdict [INFERENCE] |
|---|---|---|---|
| **Web URL** (Expo web export / PWA) | click | minutes | **Primary.** Every judge can reach it. |
| **Android APK** via EAS internal distribution link | tap link, allow unknown sources | one EAS build (free tier: "Low-priority queue", "45-minute build timeout") | **Strong secondary.** EAS internal URLs "are available to anybody with the URL" [VERIFIED] |
| **Google Play internal testing** | needs opt-in with a Google account on your list | "available to testers within minutes"; max "up to 100 testers per app" [VERIFIED] | Only for known testers; you need judges' emails in advance |
| **iOS TestFlight public link** | install TestFlight, tap link | first build needs Beta App Review; 90% of App Review submissions reviewed "in less than 24 hours" [VERIFIED for App Review generally, not specifically TestFlight] | **Best iOS path**, if review passes (see §3 risks) |
| **iOS ad hoc** (EAS internal) | send UDID, wait for rebuild | per device | ❌ for judges: "only those devices in the list at build time will be able to install it" [VERIFIED] |
| **App Store / Play production** | search store | App Review + for new personal Play accounts a 14-day closed test | ❌ for Play personal accounts: "a minimum of 12 testers who have been opted in continuously for at least 14 days" [VERIFIED]. That is at least 14 days, more than the 12 days left. |
| **macOS DMG / Windows EXE** | download, bypass warnings if unsigned | build + signing | Optional. Unsigned macOS shows the app "is broken and can not be started"; Windows shows SmartScreen [VERIFIED Tauri docs] |

## 2. Details per channel

### TestFlight [VERIFIED unless tagged]
- Internal testers: "up to 100 members of your development team who hold the Account Holder, Admin, App Manager, Developer, or Marketing role". This doesn't fit judges.
- External testers: "up to 10,000 external testers", invited by email or **public link**. External testing requires "your first build already approved by App Review for TestFlight". "Your beta app description and beta app review information are required in order to share your beta with external testers."
- Builds are testable "for up to 90 days".
- Guideline 2.2: "Any app submitted for beta distribution via TestFlight should be intended for public distribution and should comply with the App Review Guidelines." So the crypto rules in §3 already apply to TestFlight external builds.
- Guideline 2.1: provide "an active demo account or fully-featured demo mode" and "Enable backend services so that they're live and accessible during review." An app that needs a wallet login must ship a reviewer login path [INFERENCE].
- **Plan:** submit the first external build to Beta App Review by about **Oct 3** so there's room for a rejection and resubmission before Oct 10 [INFERENCE].

### Google Play [VERIFIED unless tagged]
- Internal testing: up to 100 testers, available "within minutes", "might not be subject to standard Play policy or security reviews". Testers join by opt-in link and aren't discoverable in search.
- Personal developer accounts created after Nov 13, 2023 must run the 12-tester / 14-day closed test before production. Internal testing is optional and not gated.
- **Android developer verification** begins Sep 30, 2026: "App registration becomes required for participating stores in Brazil, Indonesia, Singapore, and Thailand." "Unregistered apps can be sideloaded with Android Debug Bridge (adb) or advanced flow." Judges in those four countries may hit extra friction installing an unverified APK. Elsewhere, a sideloaded APK is unaffected for now [VERIFIED blog; judge locations UNKNOWN].

### EAS (Expo) [VERIFIED]
- Free plan: "15 Android and 15 iOS builds" per month, low-priority queue, 45-minute timeout. The Starter plan gives high priority and "$45 of build credit". EAS Update free: "Send updates to 1K MAUs". EAS Hosting free: 100,000 requests/month.
- `"distribution": "internal"` builds an APK on Android (directly installable) and ad hoc/enterprise on iOS.
- EAS Update lets you ship JS-only fixes to TestFlight/APK users without a new store review [VERIFIED feature exists at https://docs.expo.dev/eas-update/introduction/; policy nuance not checked].
- **Budget:** 15 iOS builds for 12 days is tight if every change triggers a rebuild. Use EAS Update for JS changes and save native builds for native-dependency changes [INFERENCE].

### Desktop signing [VERIFIED Tauri docs]
- macOS outside the App Store needs a `Developer ID Application` certificate; "Only the Apple Developer Account Holder can create Developer ID Application certificates." The same $99/year membership as iOS. Notarization is part of this flow.
- Windows: signing prevents "a SmartScreen warning". OV and EV certificates are treated the same for SmartScreen since 2024. Azure Artifact Signing is a cloud option. Unsigned still runs "if users accept the SmartScreen warning".

## 3. Apple rules for crypto apps (exact quotes)

Source: https://developer.apple.com/app-store/review/guidelines/ ("Last Updated: June 8, 2026"). [VERIFIED, raw text saved]

**3.1.1 In-App Purchase (crypto sentence):**
> "Apps may not use their own mechanisms to unlock content or functionality, such as license keys, augmented reality markers, QR codes, cryptocurrencies and cryptocurrency wallets, etc."

**3.1.5 Cryptocurrencies:**
> "(i) Wallets: Apps may facilitate virtual currency storage, provided they are offered by developers enrolled as an organization."
>
> "(ii) Mining: Apps may not mine for cryptocurrencies unless the processing is performed off device (e.g. cloud-based mining)."
>
> "(iii) Exchanges: Apps may facilitate transactions or transmissions of cryptocurrency on an approved exchange, provided they are offered only in countries or regions where the app has appropriate licensing and permissions to provide a cryptocurrency exchange."
>
> "(iv) Initial Coin Offerings: Apps facilitating Initial Coin Offerings ("ICOs"), cryptocurrency futures trading, and other crypto-securities or quasi-securities trading must come from established banks, securities firms, futures commission merchants ("FCM"), or other approved financial institutions and must comply with all applicable law."
>
> "(v) Cryptocurrency apps may not offer currency for completing tasks, such as downloading other apps, encouraging other users to download, posting to social networks, etc."

**5.1.1(ix) regulated fields:**
> "Apps that provide services in highly regulated fields (such as banking and financial services, healthcare, gambling, legal cannabis use, air travel and crypto exchanges) or that require sensitive user information should be submitted by a legal entity that provides the services, and not by an individual developer."

**What this means for the agent [INFERENCE]:**
1. **Organization account.** A wallet app must come from a developer "enrolled as an organization" (3.1.5(i)). Organization enrollment needs a D-U-N-S Number, a legal entity ("We do not accept DBAs, fictitious business names, trade names, or branches") and a functional website on the entity's domain (enrollment page) [VERIFIED]. Apple states no processing time [VERIFIED absence]. **Blocking question for Abu: which Apple account type does he have?** If it's individual, external TestFlight review of a wallet app risks rejection under 3.1.5(i)/5.1.1(ix), and switching to an organization account inside 12 days is uncertain.
2. **Swaps and trades.** 3.1.5(iii) ties exchange features to "an approved exchange" plus licensing per region. Swaps via on-chain DEX/aggregators aren't clearly covered. Consider hiding swap/trade/meme-coin actions in the iOS build and keeping them on web [INFERENCE].
3. **Meme coins / token launches.** Anything resembling token sales can fall under (iv). Keep token *launch* out of the iOS build [INFERENCE].
4. **No rewards for tasks** (v). No "earn USDC for inviting a friend" on iOS.
5. **3.1.1.** Don't unlock premium agent features by paying in USDC inside the iOS app. Paying other people or merchants (the product's purpose) isn't "unlocking functionality" [INFERENCE].

## 4. Google Play rules for crypto apps (exact quotes)

Source: https://support.google.com/googleplay/android-developer/answer/13607354 ("Blockchain-based Content"). [VERIFIED, raw text saved]

> "The purchase, holding, or exchange of cryptocurrencies should be conducted through certified services in regulated jurisdictions. You must also comply with applicable regulations for any region or country that your app targets and avoid publishing your app where your products and services are prohibited. Google Play may request you to provide additional information or documents regarding your compliance with any applicable regulatory or licensing requirements."

> "We don't allow apps that mine cryptocurrency on devices. We permit apps that remotely manage the mining of cryptocurrency."

> "If your app sells or enables users to earn Tokenized Digital Assets, you must declare this via the Financial features declaration form on the App Content page in Play Console." … "You may not promote or glamorize any potential earning from playing or trading activities."

The page links a separate "country-specific requirements" Help Center article, which was not fetched [UNKNOWN]. Internal testing "might not be subject to standard Play policy or security reviews" [VERIFIED], so policy risk only bites at closed/production tracks [INFERENCE].

## 5. Recommended distribution plan [INFERENCE]

1. **Day 1–2:** web URL live (judge link). This is also the desktop story if the native desktop build slips.
2. **Day 3–4:** EAS dev build on your own devices. First `preview` APK link for Android.
3. **By ~Oct 3:** first iOS build to TestFlight external with demo account + reviewer notes, in a conservative iOS feature set (transfers, contacts, automations, notifications; swaps behind a flag). Resolve the organization-account question first.
4. **Oct 8–9:** freeze native builds; ship JS fixes with EAS Update.
5. **Optional:** unsigned or ad-hoc Tauri/Electron DMG/EXE with install instructions in the README.
6. Submission form: web URL + APK link + TestFlight public link + video.
