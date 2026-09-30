# Reference flows: Agari (product flows only, not architecture)

Purpose: rebuild every user-facing flow in Abu's Agari repo from its code and copy, then pull out the product patterns and missing flows our Arc agent app should adopt. Architecture, stack and libraries are deliberately excluded (D7).
Sources: the shallow clone at `refs/abu/agari/` (read-only). Every `path:line` below is relative to that root. Nothing was browsed live.
Verified: 2026-09-29

**Tagging.** Statements about what Agari does are **[VERIFIED]** against the repo code or docs today, unless marked otherwise. Statements about what *we* should do are **[INFERENCE]**. Where the code and the docs disagree, both are cited.

---

## 1. What Agari is, and who it is for

Agari is "an on-chain stock prediction exchange (DEX) on Solana". Users "make an Up or Down call on a short price window", or "cover a tokenized stock you already hold", and can inspect the price prints that settled each result (`README.md:5`). It offers three ways in: **Predict** (Up/Down contracts on stocks, PreStocks pre-IPO names and baskets), **Cover** (a Down call against a token already in the wallet) and **Hold** (an hourly "portfolio desk" agent that trades a PreStocks basket inside owner limits, in paper practice) (`README.md:23-27`). Trading uses "Solana **devnet tUSDC**, which has no real-money value"; the desk runs in paper practice (`README.md:31`). It ships on web, an Android APK and an iOS TestFlight beta (`README.md:13-18`). The audience is crypto-literate retail traders with a Solana wallet, plus holders of tokenized or pre-IPO stock. It was built for the Stocklana hackathon's Main, PreStocks and Pyth tracks (`README.md:9`). **[VERIFIED]**

---

## 2. Every user-facing flow

Route inventory: 76 page routes and 64 API routes under `web/src/app/` (listed with `find`), plus the native Expo routes in `mobile/src/app/`. The web nav has **35** entries (`web/src/components/shell/header/nav-items.ts`, `grep -c 'href: "'`). Flows are grouped as the task asked.

### 2.1 Onboarding and first run

**A. Mobile first launch** (`/` → `/onboarding`)
1. The entry route checks a per-install flag and sends a first launch to `/onboarding`; every later launch goes to `/markets` (`mobile/src/app/index.tsx:4-9`).
2. A brand intro plays: the mark springs up, the wordmark tracks in, a hanko stamp lands with a chime and a haptic. **Tap anywhere to skip. Reduce Motion skips it entirely** (`mobile/src/features/onboarding/BrandIntro.tsx:21-37`).
3. Four swipeable pages sit under a progress rule, with a "n of 4" counter and **Skip** on every page except the last (`OnboardingScreen.tsx:129-141`). Each page says one true thing: call, settle, play, and "Start with test money": "connect any Solana wallet and get test tUSDC in one signature. No real money moves" (`onboarding-copy.ts:17-46`).
4. The last page has two exits: **"Connect a wallet"** or **"Look around first"** (`onboarding-copy.ts:51-52`, `OnboardingScreen.tsx:159-163`). Both set the flag and land on Markets. Connect then opens the connect sheet 350 ms later (`OnboardingScreen.tsx:115-124`).
- Friction removers: skippable at every step; **browse-first exit**; the wallet sheet opens *over* live markets rather than on a blank page; the web tutorial flag is written too, so web never repeats onboarding (`OnboardingScreen.tsx:119`).

**B. Web first run** (a Tutorial dialog over `/markets`)
1. On the first visit (a localStorage flag), a five-step dialog opens over the live markets. It renders nothing on the server, so returning visitors never see a flash of it. If storage is blocked, it shows again next visit rather than failing silently (`web/src/features/onboarding/useFirstRun.ts:14-25`).
2. The steps: Welcome (says devnet, no real money); How a Window works; Your wallet signs; Where your money sits; then a closing step that ends on **Connect** (`web/src/features/onboarding/steps.ts:29-55`).
3. **If the user connects on the last step, the tutorial closes itself** and leaves them on live markets (`Tutorial.tsx:36-40`). Skip and Close are always present (`Tutorial.tsx:99-111`).
4. Focus lands on the dialog, not on Close, so "a welcome screen [doesn't open] by pointing at the way out" (`Tutorial.tsx:55-59`).
- The mobile `/welcome` route reproduces this card over Markets (`mobile/src/app/welcome.tsx:14-19`).

**C. Wallet connect**
1. The web modal shows installed wallets, the recent one, and a "New to Solana wallets?" intro: "What is a Wallet?" with two points and **Get a Wallet** (`web/src/providers/wallet/copy.ts:5-23`, `wallet-steps.tsx:8-25`).
2. Per-wallet states: "Opening X…", with **RETRY** if the wallet refused; "X is not installed", with **INSTALL** (`wallet-steps.tsx:70-99`).
3. On mobile the choices are Phantom, Solflare, the Android wallet chooser (Android only), and a **"Practice wallet: Devnet only · kept on this phone"** (`mobile/src/wallet/choices.ts:14-19`). The practice seed is created on first use in the Keychain, this device only (`mobile/src/wallet/practice-store.ts:3-17`). The last-used wallet is remembered, and success or failure fires a haptic (`mobile/src/app/connect.tsx:17,38-54`).
- Friction removers: **a zero-install practice wallet** means a user can start with no wallet app at all; a remembered recent wallet; an explicit retry or install path. **[VERIFIED]**

**D. Funding: the devnet faucet ("Get test funds")**
1. Once connected, the header shows a balance pill with a vermilion **+** that opens Add funds. It "never hides once connected: funding is one tap away at every balance". Until the balance loads it shows an em dash, never a false zero (`web/src/components/shell/header/HeaderMoneyPill.tsx:11-21`).
2. The Add funds dialog, titled "Add funds · devnet / Get test funds", says: "SOL pays network fees. We add a little first when your wallet is below 0.005 SOL, then add free tUSDC for trading. **One free signature covers both. You can start with an empty wallet.**" (`web/src/features/funding/copy.ts:9-14`).
3. It shows the account address with copy-to-clipboard, both balances, the policy line, and a live progress line (`AddFunds.tsx:71-88`, `FundingProgress.tsx:9-23`).
4. The user signs one **message** (not a transaction). The server verifies it, tops up SOL only if needed, then mints tUSDC. Challenges expire after 5 minutes (`packages/core/src/faucet/index.ts:6-16`). Limits: a 24-hour cooldown per wallet per asset, a per-IP daily cap, and a global daily budget (`faucet-service.server.ts:23-26, 112-122`).
5. Status messages explain every state before the user tries: "You already have enough SOL for fees. Continue to get test tUSDC", "This wallet has used its SOL top-up for the last 24 hours", "Our SOL faucet is waiting for a refill. External faucets are available below", and "It will not be paid twice" while pending (`faucet-service.server.ts:103-109`).
6. On success: "100000 tUSDC added to your wallet" (amount from `packages/core/src/constants/faucet.ts:2`), a **"Trade from wallet →"** CTA straight to markets, explorer links for each claim, "Next tUSDC claim: <time>", and "Get more test funds" (`AddFunds.tsx:91-107`, `useFundingProgress.ts:37-52`).
7. **First credit only:** a celebratory card, "You're funded · X tUSDC is in your wallet · On the house… You're ready to take your first side · Let's go →". It auto-dismisses after 8 s, fires once per address, and later credits are only a toast (`CreditWelcome.tsx:10-33`, `credited.ts:12-26`).
8. Fallback: if SOL is short or the faucet is down, a "Get SOL for fees first" panel lists external faucets with an **"I've got SOL — check again"** re-check button (`GasRouting.tsx:13-39`, `web/src/lib/copy.ts:62-71`).
9. The faucet appears in context too: the ticket's top-up gate says "Add N tUSDC more to place this — grab test funds from the faucet if you're short" with an **Add money** button (`web/src/lib/copy-ticket.ts:63-72`). The copy-trade join form says "Wallet empty, no problem: Get free tUSDC →" (`web/src/features/strategies/copy.ts` `join.emptyWallet/faucet`).
- Friction removers: **one signature, no fee, works from an empty wallet**; gas is auto-topped only when needed; the next action is linked; a first-time delight moment; the fallback is named, never silent; region-held users still see the explanation (`AddFunds.tsx:27-28`). **[VERIFIED]**

**E. Empty states that invite the first action**
- Portfolio: "No bets yet. · make your first call". A returning user with nothing open sees "Nothing open right now. · make your next call" instead of a first-call prompt (`web/src/lib/copy.ts:262-266`).
- Shared empties: "No positions yet. / Your first Window is one tap away."; "Nothing to claim. / Wins land here the moment a Window settles." (`packages/core/src/copy/strings.ts:36-40`).
- A pending capability is never a blank page. `CapabilityPending` says what the page will do, what it waits on, and gives a way out ("Make a call on the markets") (`web/src/components/shell/CapabilityPending.tsx:3-28`).

### 2.2 Core action flows

**A. Make a call (the one Ticket)**
1. Browse `/markets` with no wallet. A "Just ask" board phrases each market as a yes/no question ("No chart to read. Will it be up?") (`web/src/lib/copy.ts:15`).
2. Tapping a side opens the single ticket via a deep-link grammar, `/markets?m=<id>&dir=up|down` (`packages/core/src/urls/app.ts:19-20`). On mobile it rises as a bottom drawer (`mobile/src/app/ticket.tsx:22-27`).
3. The ticket shows Stake, quick-amount chips, Cost, "Payout if UP lands", **Max loss**, and "Settles on its own, right on the price" (`copy-ticket.ts:10-55`). Its promise: "Your stake is your max loss — always." (`strings.ts:15`).
4. It discloses friction up front: "Two signatures this first time: approve tUSDC, then your order." (`copy-ticket.ts:26`), plus a refundable seat deposit line (`:25`).
5. The CTA *is* the blocker: a single ordered list of about 45 reasons, each naming the first fixable one, such as "Connect a wallet to bet", "Switch to Solana devnet", "No tUSDC yet — mint from the faucet", "Out of SOL for fees — top up first", or "Stake exceeds your 12 tUSDC balance" (`packages/core/src/copy/blockers.ts:3-54, 86-182`).
6. **Carry intent across expiry:** "That 5m Window closed for entries — moved you to the next 5m Window. Side and stake kept." (`copy-ticket.ts:27-28`).
7. **Requote:** "The book moved — it now costs up to X. Confirm again to buy at the new price." / "The book moved before your order landed; nothing was taken." (`copy-ticket.ts:34-36`).
8. The placed call turns the ticket into "The Call", a shareable card with Portfolio / **Place another** (`web/src/features/markets/ticket/PlacedCall.tsx:22-27`).
9. When the market is closed, the same ticket rests a call at the user's price for the open (`web/src/features/demo/copy.ts:48`).

**B. "Bet against" mode**: a toggle that reorders the sides so every ticket opens on Down. "It is not a short" (`copy-ticket.ts:7-9`).

**C. Cover what you hold (a holdings-aware suggestion)**
1. The app reads the wallet read-only. A card shows the teaser states: no wallet ("Own a stock token? Connect…"), reading ("Nothing is moved and nothing is signed"), unreadable ("retries in a minute"), no holding, no window yet, and **calm** ("It has barely moved lately, so there is nothing to cover right now") (`web/src/features/hedge/copy.ts:23-33`).
2. The offer: "12.5 TSLAx ≈ $4,497 of Tesla · cover it this weekend". The CTA opens the ticket **pre-sized at 10% of the holding** (`hedge/copy.ts:14-18`, `ticket/stake-preset.ts:3-19`).
3. An opt-in "tell me if it drops" bell: 3% within an hour, device-local (`hedge/drop-bell.ts:3-11`).

**D. Tap-trading (a scoped session key, i.e., popup-free actions inside caps)**
1. The chip shows its state: off, on, "needs a key", or expired (`web/src/features/session/copy.ts:6-16`).
2. The arm sheet: "Arm tap-trading once, tap in one signature forever… Skip it, and every tap simply asks your wallet instead." Caps: per tap, per day, open positions, "Dearest odds", expiry, and deposit. A worked example: "At 5 tUSDC a tap the key can place 4 taps today before the 20 daily cap stops it…" (`session/copy.ts:29-45, 74-82`).
3. **"What you are signing" receipt:** Scope; **Never: "withdraw, change where money goes, or spend past the caps"**; Key; Expires; Fees ("paid by the sponsor"); Signatures ("one: the deposit and grant, together") (`:45-59`).
4. The manager shows spent today, left today, budget left, resets-at, and fee status, plus **Revoke** ("unspent budget returns… positions the key opened stay yours"). It also handles **a grant with no key** (cleared storage or another browser) with **Re-key**, and **expired** with "Arm new" (`:83-119`).
5. Route fallback: "Tap-trading can't cover this one — <reason>. Signing from your wallet instead." (`:27`).

**E. The Desk (a bounded autonomous agent; the closest analog to our product)**
1. The studio has four steps: The basket → How strict, and the limits → The test read → Create (`web/src/features/desk/copy.ts:37-45`).
2. Limits are written in plain language, each labelled with **who enforces it**: "The program enforces this" vs "The desk's own code enforces this" (`:57-70`).
3. **"Anything in your own words… It shapes when the desk acts, never how much and never what it holds."** (`:71-72`).
4. **Test read:** one real cycle with no money: real prices and quotes, "the one AI question asked and answered". It returns **"Here is how I understood you"** plus the first decision (`:75-91`).
5. Create in **Practice** (one signed message, no transaction) or **Live**. "Go live unlocks after N practice checks and the record opened." (`:92-101`).
6. First steps after creation: Put money in; The Go live rule; **Turn on notifications ("when it acts, asks, or is stopped. Never for a quiet check")**; "Open your desk →" (`:102-111`).
7. **Modes:** Practice ("decides for real… spends nothing"), **Ask me first**, and **On its own** ("still asks above your large-action size") (`:21-26`).
8. Page: **Needs you** (approve or decline, with confidence, cost and expiry; "Expired unanswered. Nothing was done."); What it holds; Next check ("At the top of the hour… Also on deposits and 3% moves"); Limits in use ("Spent today X of Y"); The record; The mandate (versioned) (`:127-209`).
9. **"The promise"** is five plain points, plus **"Worst case, in one sentence: if the desk's key were ever stolen, the thief could only make bad trades, at most your daily limit a day, until you pause."** (`:212-222`).
10. Go live: four resumable steps, each one confirmation, with "Resuming at: <step>" (`copy-controls.ts:78-94`).

**F. Copy a strategy / an agent**: pick a risk mode (Guarded / Balanced / Active), set a per-trade limit, fund, and subscribe ("Two signatures: the first funds your Vault and sets your limits, the second subscribes"). It raises an **underfunded** state ("Your copying is paused… the desk is skipping every one. Top up to about X") and a **reconnect** state ("Your balance has not moved… This just says who is allowed to trade") (`web/src/features/strategies/copy.ts` `desk.underfunded`, `desk.stale`, `join.*`, `risk`).

**G. Trade from X (a social-channel agent)**: three steps (connect wallet, fund and authorize the agent, link your X account), then "Just tweet your calls". The can/cannot receipt: "**can** trade from your funded balance… **cannot** withdraw · transfer · drain" (`web/src/features/x/copy.ts:44-87`). A "Claim your account" flow lets mention-bettors find their balance (`:141-176`).

**H. Sensei (an AI assistant in a drawer)**
1. Intro: "I read and recommend, you place the trade." Four starters: "Read the current market", "Up or down on the next close?", "Is this a coin-flip?", "Why did my desk wait?" (`web/src/features/sensei/copy.ts:12-18`).
2. **Follow-up chips are derived from the reply**. After a "sit it out" answer they offer "Good call, skip it / Show me another market / Why sit out?", never three ways to bet again (`:47-62`).
3. "Act on it" trade cards **hand off to the one Ticket through the deep link; the chat never gets a second signing path** (`SenseiTradeCards.tsx:27-38`).
4. Rules: ground truth only (`prompt.ts:56`); no real-money advice, enforced by a regex tripwire (`:58, 71`); and **THE BRAKE**: "the one voice in this app allowed to say do not take this one… If the person is chasing losses… slow them down" (`:64`).

**I. Games and practice**: a "Practice" mode ("No stake · no position · no chain"; the opponent "is a coin flip and is labelled as one") (`web/src/features/games/practice/copy.ts:12-26`). Badges show locked goals: "A locked badge names what it takes rather than hiding" (`packages/core/src/games/achievements.ts:47,77`).

### 2.3 Confirmations and receipts
- Mobile: "The native ticket shows the current cost, return, and maximum loss before the wallet presents a signing request" (`mobile/README.md:21`).
- **Control cards (desk):** "Each one shows you a card first. Nothing happens until you confirm it." Each card has **Now → After**, **who signs** ("one mainnet transaction" / "one message; nothing moves" / "one message; the desk carries it out at its next check"), **"This card expires <when>"**, Confirm / Not now, then "Sent. Waiting for Solana mainnet…" → "Done. See the transaction ↗" / "Left alone. Nothing changed." / "This card expired. Open it again." (`web/src/features/desk/copy-controls.ts:6-44`).
- The network is named on every money card: "Phantom will show a Solana mainnet transaction." / "No transaction. Practice moves no money." (`desk/copy.ts:20`). Eyebrows read "YOUR DESK · SOLANA MAINNET · REAL MONEY" vs "PRACTICE · NO MONEY MOVES" (`:8-13`).
- The money sheet receipt lists: You send / Your desk receives / 1% transfer fee / Network fee / Takes N seconds (`copy-controls.ts:53`).
- Settlement receipt: opening print, closing print, source, settlement tx, "Don't trust it. Click it.", "Only you can cash out." (`web/src/lib/copy-verdict.ts:11-20`, `strings.ts:10-12`).
- Verdict: "You won / Not this time / Returned (void)". "Collect it with one signature now, or the venue pays it to your wallet automatically a few minutes after settlement" (`copy-verdict.ts:25-44`).
- Claim all: "claiming 2 of 5", "Stopped early — every remaining item is untouched", "3 of 5 claimed — the rest stayed put" (`copy-verdict.ts:55-94`).

### 2.4 Notifications
- **Push kinds** (per device): Calls filled, Results, Payouts. "A take is someone's words, not news about you: never pushed." (`web/src/features/push/protocol.ts:13-17`, `mobile/src/features/alerts/copy.ts:15-19`).
- Registration: "Your wallet signs once to prove this phone may hear about it. No transaction, no fee." The screen handles the "set up for another wallet → Follow the connected wallet instead" and "denied in Settings" cases (`mobile/src/features/alerts/copy.ts:10-33`, `web/src/app/api/push/register/route.ts:8-13`).
- **Live Activity / Dynamic Island** while a call is open, an Android ongoing notification, and a **Home Screen widget** of the next windows (`mobile/src/features/alerts/copy.ts:20-28`). The Live Activity was simulator-verified end to end. Push delivery was **not**: "APNs credentials are missing" (`mobile/TAKEOVER_STATUS.md:91-93`).
- Notification wording is shared with the in-app inbox: "X settled: you won · 12 to claim. Claim within 5 minutes or it's paid automatically." Bursts are batched as "**3 more updates** · See them all in Activity" (`web/src/features/activity/copy.ts:61-75`).
- Price alerts are honest about their scope: "Fires while Agari is open in a tab" / "Browser notifications are off — alerts show here as a toast" (`web/src/features/alerts/copy.ts:26-31`).
- On mobile, notifications are enabled in place on Activity rather than from a separate nav entry (`mobile/TAKEOVER_STATUS.md:42`).

### 2.5 Portfolio and history
- **One spendable number**: "what you can bet right now — nothing else is added in". Other pools are labelled beneath it (order escrow, payout credit, SOL for fees), and a low-gas warning reads "below the fee reserve — the next write needs more SOL" (`web/src/lib/copy.ts:286-296`).
- Portfolio has no headline: "the thing people open this page for is the number". It has Open / History tabs and "N to collect" (`copy.ts:248-276`).
- **Activity inbox** tags: Fill, Call filled, Won, Lost, Void, Claim, Paid auto (`activity/copy.ts:8-40`).
- **Desk record:** "One entry for every check, including the ones that found nothing to do. Those are the proof it was awake." Outcomes: Acted, Acted in part, Acted on your call, **Would have acted**, Asked you, Nothing to do, Waited, Decided not to, Stopped by a limit, Could not decide. Quiet runs fold ("12 quiet checks · 09:00–20:00") (`desk/copy-record.ts:5-28`). Filters: All, Acted, Decided not to, Asked you, Quiet, Problems (`desk/activity/copy-activity.ts:2-17`).
- **One decision in full:** The decision · Why it looked (trigger) · What it saw · The options it weighed · The limits check ("plain arithmetic, not an assistant. It can refuse, and it can never start anything") · The cost, shown before acting · What happened · Proof · How it looks now. Each decision is **graded a day later** ("Waiting was better by 0.4%") (`copy-record.ts:29-129`). **Check it** rebuilds the record's fingerprint in the browser and lets the user download the record (`:131-140`).
- A public trader profile at `/u/[address]` shows the record, edge, open calls and takes, with a **"Copy this trader"** button (`web/src/features/profile/copy.ts:7-32`).

### 2.6 Error and recovery states
- **Diagnosis catalogue:** each failure kind has a headline plus what happened to the money. Examples: "You cancelled in your wallet / Nothing was sent. If your wallet said 'Network mismatch'… switch"; "The Window closed under you / Your stake was never taken"; "Waiting for the chain to answer / Your order is either in or it never left; we'll show you which"; "The chain endpoint isn't answering / rotating to the backup RPC. Last-good values stay on screen" (`packages/core/src/copy/diagnosis.ts:9-38`).
- **Write-journal recovery on return:** once per session, the app asks the chain about every send still open and says what it found: "An earlier call landed… It is in your Portfolio" / "never reached the chain… Nothing was spent" / "reverted… only the network fee was spent" / "could not be verified… Check your Portfolio before placing it again" / "N earlier sends are still being checked… **Nothing is retried on its own**" (`web/src/features/recovery/copy.ts:1-14`, `mobile/src/features/recovery/WriteRecovery.tsx:26-29`).
- **Stale data:** the last good value stays at full ink with "as of 14:02 — retrying / aging / offline" (`web/src/components/states/StaleTick.tsx:14`, `strings.ts:42-50`).
- **Error boundary:** "A quiet moment on the floor. …Your funds and positions are safe on-chain. This is only the screen." Try again / Go to markets / Technical details (`strings.ts:28-34`).
- **Dead links recover:** "That Window is gone — showing the live Windows instead" / "That 5m Window settled — moved you to its successor" (`web/src/lib/copy.ts:144-148`). Retired routes redirect instead of returning a 404 (`web/src/app/bell/page.tsx:3`, `web/src/app/beta/page.tsx:3`).
- **Desk-specific:** "The desk has not checked in… Your money is in your own account" (`desk/copy.ts:143`); "Something did not go through. **Nothing was sent twice.**" (`copy-controls.ts:101`).
- Docs **troubleshooting** maps each symptom to its meaning, e.g. "A wallet popup confirming a signature is not the same as a confirmed fill… retrying an order that actually landed can produce a second, unwanted fill" (`docs-site/content/docs/help/troubleshooting.mdx:14-16`).

### 2.7 Network handling (devnet vs mainnet)
- The wrong-network banner sits **above content, never as a modal**, and every write control beneath it renders blocked-with-reason (`web/src/components/chrome/WrongNetworkBanner.tsx:13`).
- The app spells out the manual wallet step because it cannot switch an injected wallet: "Switch the wallet to Solana Devnet (Phantom: Settings → Developer Settings → Testnet Mode, then Solana Devnet)" (`strings.ts:52-58`).
- The network is repeated in every surface's copy: onboarding, faucet eyebrow "Add funds · devnet", share cards "SOLANA DEVNET", and the not-advice line "Devnet test balances only" (`funding/copy.ts:10`, `share/copy.ts:23`, `packages/core/src/copy/advice.ts:7`).
- Practice and real money are kept visually separate, with eyebrow strings per mode and per viewer (owner vs "SOMEONE ELSE'S DESK · READ-ONLY") (`desk/copy.ts:8-13`).
- There is a "Not live on this network yet" diagnosis (`diagnosis.ts:35`) and an **Availability matrix** doc giving each path's network and prerequisites, with dated evidence (`docs-site/content/docs/help/availability.mdx:6-18`).
- **Geofence:** reading stays open everywhere; funded actions show "Not available in your region" plus "Funded actions are closed in your region. Reading stays open." (`web/src/proxy.ts:4-13`, `web/src/features/region/RegionNote.tsx:6-16`).

### 2.8 Sharing, social, referral
- **Share card:** after a call, "Share this call ↗" renders a PNG and uses the native share sheet when files are supported; otherwise it downloads the PNG and opens a pre-filled post ("Card saved. Attach it to your post on X"). The popup path is chosen inside the click gesture so it isn't blocked (`web/src/features/share/useShareCard.ts:13-21`, `share/copy.ts:21-30`). The post text uses **real staked numbers only** (`share/copy.ts:55-58`).
- **Actionable links:** `/actions.json` makes every shared Window URL an executable action, so "a shared market link and its Action stay one URL apart, so nothing has to be re-shared" (`web/src/app/actions.json/route.ts:4-11`).
- The desk has a **read-only share link**: "Anyone with the link sees the desk's holdings and record, never your notes. Turn it off at any time." (`copy-controls.ts:40`).
- Other social surfaces: Rooms (callers-only chat), Takes (public posts, "public and effectively permanent" (`strings.ts:19`)), a leaderboard, and copy-trading. **No referral program was found** [VERIFIED by absence: grep for referral/invite in `web/src` and `mobile/src` returns nothing].

### 2.9 Settings
- **There is no settings hub.** No settings route exists in `web/src/app` [VERIFIED by listing]. Settings are scattered: theme in the header ("saved on this device; the app follows your system preference until you choose one", `docs-site/content/docs/start/find-your-way.mdx:39-41`), notifications on Activity (mobile), tap-trading caps in the session chip, desk limits and mode in desk Controls, and the account sheet holds only "Copy Address / Disconnect… Nothing else" (`mobile/src/app/account.tsx:17-20`).
- **No i18n.** A grep for i18n libraries returns nothing, and there are 18 hard-coded `toLocaleString("en-US")` calls in `web/src` [VERIFIED].

### 2.10 Judge and demo surfaces
- `/demo`: a video, numbered feature sections, **live traction** ("N wallets ranked · N closed calls · live on Solana devnet"), and a verify section, "Real actions. Open receipts.", listing every lifecycle transaction with explorer links. It separates fork rows from devnet rows honestly (`web/src/features/demo/copy.ts:24-96`). Captured screenshots are dated (`:108-109`).
- `/pitch`: an in-app pitch deck (`web/src/app/pitch/page.tsx:6`). `/stats` and `/api/traction`: numbers "served from the same three-minute cache" (`web/src/app/api/traction/route.ts:4-8`).
- `/status`: a public health page with good/warn/bad per pipeline (RPC, indexer, price relays, faucet budget, sponsor budget, AI model, databases), "closed (expected)" outside hours, and "Auto-refreshes every 30s" (`web/src/features/status/copy.ts:5-42`, `grade.ts:1-30`).
- `/dev`: a fixture gallery that renders "every card, receipt, and state from canned data — no wallet, no database" (`web/src/lib/copy.ts:105-108`, `web/src/app/dev/page.tsx:5-31`).
- `/download`: the APK with QR, size and SHA-256, TestFlight, PWA install steps, and a launch film (`web/src/features/install/copy.ts:7-65`).
- The README links the demo, proof, APK and guides at the top, plus a per-track integration table with explorer links (`README.md:7, 33-41`). The docs offer an "I want to… → guide" table (`find-your-way.mdx:10-31`) and an `llms.txt` "for automated readers" (`README.md:94`).

---

## 3. Product patterns worth copying for our Arc agent app [INFERENCE]

| # | Pattern (from Agari) | Our adaptation | Maps to |
|---|---|---|---|
| P1 | Browse-first: every read works without a wallet; onboarding ends with "Look around first" (§2.1A, 2.2A) | Let a new user try the agent (ask questions, see quotes, see what a bridge would cost) before sign-up. Gate only writes | A1, A7, F1 |
| P2 | One-signature, fee-free testnet faucet inside the app, from an empty wallet, with auto gas top-up, cooldown text, explorer link, "next claim at", and a named fallback (§2.1D) | On **Arc testnet**, one tap "Get test USDC" after wallet creation. Arc gas is USDC, so a single drip covers both jobs. Show cooldown and fallback (faucet.circle.com). The agent can offer it: "You have 0 USDC on testnet. Want 20 test USDC?" | A5, F2, F17 |
| P3 | Balance pill with an always-visible "+" (§2.1D-1) | A permanent "+ Add money" on the balance, switching by network: faucet on testnet, receive/bridge/onramp on mainnet | A5, B1 |
| P4 | First-credit celebration, once per address, then only toasts (§2.1D-7) | "You're funded" moment, then a suggested first action ("Send $1 to yourself" / "Try a swap") | F2, A7 |
| P5 | Practice wallet on the device (§2.1C) | A zero-signup **testnet demo account** for judges and curious users | NEW-G1 |
| P6 | Blocker-as-label: an ordered reason list, with the CTA naming the first fixable reason and an inline fix (§2.2A-5) | Every confirm card's button says why it can't proceed ("Switch to Arc Testnet", "Add 3.20 USDC", "Limit reached: resets 00:00") with a one-tap fix | L2, N6, F30 |
| P7 | Diagnosis catalogue: headline plus what happened to the money (§2.6) | Every agent error says "Nothing was sent" / "Only the fee was spent" / "We'll tell you which". Spoken in voice mode too | F30, K4 |
| P8 | Write-journal recovery on return, never auto-resent (§2.6) | On app open, reconcile pending sends, bridges and automation runs, then post one message per outcome | C7, E3, H8 |
| P9 | Carry intent across expiry; explicit requote-and-confirm (§2.2A-6,7) | Expired swap or bridge quotes requote while keeping the amount and recipient: "The price moved: now costs up to X. Confirm again." | D1, E1, F30 |
| P10 | The assistant hands off to the one confirmation surface; no second signing path in chat (§2.2H-3) | Voice and chat produce only a deep-linked draft into the single confirm sheet. This matches our "voice proposes, screen confirms" rule | K3, K4, L2 |
| P11 | Starters, follow-up chips derived from the reply, and a "sit it out" brake (§2.2H) | Starter chips per network and state; the agent talks users down from FOMO meme buys or panic-bridging | A7, M5, D3 |
| P12 | Scoped session key with a "What you are signing: Scope / **Never** / Fees / Signatures" receipt, a worked example, a manager with usage and headroom, revoke, re-key for a grant with no key, expired, and fallback-with-reason (§2.2D) | Automation envelope UI: per-run cap, daily cap, expiry, the **"Never"** row (can't change recipient, can't withdraw), "At $10 a run this covers 4 runs…", plus Re-key when a device is lost | H3, N1, L7, A8 |
| P13 | Agent modes Practice / Ask me first / On its own, plus an "ask first above X" threshold (§2.2E-7) | This is our risk dial, with **Practice** added as a first-class mode: the agent decides on real quotes and moves nothing | M4 |
| P14 | "The promise" plus **"Worst case, in one sentence"** (§2.2E-9) | Show next to limits: "Worst case: if the agent misbehaves it can move at most $50/day to your saved contacts until you pause." | N1–N3, F11 |
| P15 | Control cards: Now → After, who signs, card expiry, "Left alone. Nothing changed." (§2.3) | Every settings change (limits, channels, automation edits) uses the same card, spoken the same way in voice | P, N5, F10, F11 |
| P16 | A test read before creating: "Here is how I understood you" plus the first decision, with no money (§2.2E-4) | Before saving an automation, run a dry run: real quote, "Here's what I'll do next Tuesday: send $10 to Alex (0x…), fee ≈ $0.01" | H2, L7, F9 |
| P17 | Free-text notes that "shape when… never how much" (§2.2E-3) | User notes for automations ("not on weekends") that can never raise amounts or change recipients | H1, M2, M8 |
| P18 | A record including quiet checks, an outcome taxonomy, a nine-section decision view, next-day grading, filters, and folded quiet runs (§2.5) | Our decision log and "why" view. Include "Would have acted" (practice) and "Skipped because…" rows | M6, O1, O2, F15 |
| P19 | Go-live gate: N practice runs plus "read the record", resumable steps (§2.2E-5,10) | Autonomous mode unlocks only after N supervised or practice runs | M4, H3 |
| P20 | Notification rules: "never for a quiet check", batching ("3 more updates"), same words in push and inbox (§2.4) | Adopt in J5; batch automation bursts; the inbox wording is the push wording | J1, J5 |
| P21 | Live Activity / Dynamic Island plus Home Screen widget (§2.4) | A live bridge or CCTP transfer on the Lock Screen; a widget for "Next automation: Tue $10 → Alex" | NEW-G9 |
| P22 | Signed device registration, per-device kinds, "follow the connected wallet instead" (§2.4) | Channel binding bound to the account; per-channel kinds | J2, J3, J5 |
| P23 | One spendable number; other pools labelled and never summed; em dash while loading, never zero; stale "as of" tick (§2.5, 2.1D-1) | "Available to send" separate from "In yield", "Reserved for automations" and "Bridging". No false zeros | B1, B2, B3 |
| P24 | Wrong-network banner above content, never modal, with writes blocked by reason; the network named on every money card; per-mode eyebrows (§2.7) | Our testnet banner and mainnet/testnet eyebrow on every confirm card | A3, N7, F17 |
| P25 | Holdings-aware suggestion with honest teaser states, including "calm: nothing to do" (§2.2C) | Proactive idle-cash → yield, or "your EURC is idle"; say "nothing to suggest right now" rather than hide | M5, F4 |
| P26 | Share card after an action (PNG, native share, pre-filled post, real numbers) (§2.8) | A "Paid" receipt card and a payment-request card to share; never a fake number | C2, C3, L10 |
| P27 | A shared link that is directly actionable (§2.8) | A payment-request link that opens a prefilled confirm card in-app (and EIP-681 for wallets) | C3, F5 |
| P28 | A read-only public share of the agent's record, toggleable, never showing notes (§2.8) | Share an automation's or business payout run's record with an accountant or teammate | O3, R |
| P29 | Public `/status` with per-dependency health and "expected closed" (§2.10) | Status for Arc RPC (both networks), Circle APIs, LI.FI/bridges, voice provider, scheduler heartbeat, faucet | NEW-G6 |
| P30 | Judge surfaces: `/demo` with a dated evidence table, a traction widget, `/dev` state gallery, download page with QR+SHA (§2.10) | A judge kit | NEW-G7 |
| P31 | "Not investment advice" line, plus an advice tripwire in the assistant (§2.2H-4) | Meme-coin and yield answers get one line; the tripwire refuses tax or allocation advice | D3, M7 |
| P32 | Error boundary: "Your funds… are safe. This is only the screen." (§2.6) | Same message, localized | F30, K6 |

---

## 4. Missing from our FEATURE-INVENTORY and USER-FLOWS-INDEX [INFERENCE]

Proposed IDs use the `NEW-G` prefix. Flow IDs continue after F33.

| ID | Proposal | Why (Agari evidence) | Nearest existing ID |
|---|---|---|---|
| **NEW-G1** | **Guest / look-around mode + testnet demo account.** The agent answers, quotes and previews with no account; a one-tap "Try on testnet" creates a device-local testnet wallet, auto-funded | §2.1A-4, §2.1C practice wallet | A1, A7 (F1 forces sign-up first) |
| **NEW-G2** | **In-app testnet faucet ("Get test USDC")**: one tap, rate-limited, cooldown and next-claim time, tx link, first-credit celebration, named fallback. Also offered by the agent in chat and voice | §2.1D. Our A5 only cites external `circle wallet fund` / faucet.circle.com | A5, F2 |
| **NEW-G3** | **Practice mode for the agent and automations**: decides on real quotes, spends nothing, records "Would have acted"; **go-live gate** after N practice runs | §2.2E-5,7,10 | M4, H2 |
| **NEW-G4** | **Blocker-as-label ladder + diagnosis catalogue** as a product spec: one ordered list of reasons shared by the UI, the voice read-out and chat | §2.2A-5, §2.6 | F30, N6 |
| **NEW-G5** | **Pending-write reconciliation on app open** ("An earlier send landed / never reached the chain / reverted / still checking; nothing retried") | §2.6 | C7, E3, H8 |
| **NEW-G6** | **Public status page + in-app degraded banner** (per dependency, per network) | §2.10 `/status` | none |
| **NEW-G7** | **Judge kit**: `/demo` (video + dated evidence table of real Arc tx links on both networks), live traction numbers, a `/dev` state gallery rendering every card and error state from fixtures, a download page (APK QR + SHA, TestFlight, PWA), README top links, `llms.txt` | §2.10 | Q2, Q3 |
| **NEW-G8** | **"What you are signing" can/cannot receipt + "Worst case in one sentence"** on every delegated authority (automations, agent mode, channel bots) | §2.2D-3, §2.2E-9, §2.2G | H3, N1, J7 |
| **NEW-G9** | **Live Activity / Dynamic Island + Home Screen widget**: in-flight bridge or transfer status; next automation run | §2.4 | J1, E3 |
| **NEW-G10** | **Test read / dry run before saving an automation** ("Here is how I understood you") | §2.2E-4 | H2, L7 |
| **NEW-G11** | **Control-card grammar** (Now → After, who signs, expires, "Left alone") for every setting change | §2.3 | P, N5 |
| **NEW-G12** | **Share cards + actionable request links** (paid receipt, payment request that opens a prefilled confirm) | §2.8 | C2, C3 |
| **NEW-G13** | **Read-only share of the agent's or an automation's record** (toggle, never shows notes) | §2.8 | O3, R |
| **NEW-G14** | **Underfunded-automation state**: "Paused: you have $4, next run needs $10. Top up $6 to resume" (in the list, in notifications, and in voice) | §2.2F | H4, F23 |
| **NEW-G15** | **Brake behavior**: the agent can advise *not* acting (FOMO meme buys, repeated failed swaps, chasing), with chips that don't re-offer the trade | §2.2H-2,4 | D3, M5 |
| **NEW-G16** | **Help: an "I want to…" task table + a troubleshooting page mapping symptoms to meaning**, reachable from the agent ("why didn't my bridge arrive?") | §2.6, §2.10 | M7 |
| **NEW-G17** | **Network availability matrix**, user-facing and generated from the same capability flags the agent uses ("On testnet, meme coins and x402 listings don't exist") | §2.7 availability doc | A3, F17 |
| **NEW-G18** | **Starter chips + follow-up chips** per state (new user, testnet, empty wallet, mid-automation) | §2.2H-1,2 | A7 |
| **NEW-G19** | **Notification hygiene rules**: never for no-op checks; batch bursts; identical inbox and push wording; per-device kinds | §2.4 | J5 |
| **NEW-G20** | **Settings hub** (single place), since Agari's absence of one scattered controls (§2.9). We already list P but have no flow for it | §2.9 | P |
| **NEW-G21** | **Region/sanctions hold (mainnet)**: reads open, funded actions disabled with a reason. *Needs legal input; not decided* | §2.7 geofence | N (safety) |
| **NEW-G22** | **Achievements / first-steps checklist** with locked goals visible ("First send", "First automation", "Connect Telegram") as onboarding scaffolding | §2.2I | A7 |

**New flows for USER-FLOWS-INDEX**

| ID | Flow | Uses |
|---|---|---|
| F34 | **Guest → try on testnet in under 60 s**: open app → ask the agent something → "Try it" → demo testnet wallet → auto faucet → first send to a sample contact → "You're funded / you did it" | NEW-G1, NEW-G2, P4 |
| F35 | **Testnet faucet claim**, including cooldown, faucet empty → fallback, and already funded | NEW-G2 |
| F36 | **Practice → supervised → autonomous** for an automation (go-live gate) | NEW-G3, M4 |
| F37 | **Dry-run an automation before saving** | NEW-G10 |
| F38 | **App reopened with pending sends** (reconcile and report) | NEW-G5 |
| F39 | **Quote expired or price moved at confirm** (requote, keep intent, confirm again) | P9 |
| F40 | **Lost device: grant with no key** (revoke or re-key an automation's authority) | P12, A8 |
| F41 | **Share a receipt / send a payment-request link → recipient opens → prefilled confirm** | NEW-G12 |
| F42 | **Judge walkthrough**: README → demo page → evidence table → open the app in guest mode → status page | NEW-G7 |
| F43 | **Degraded dependency** (RPC or bridge API down): banner, stale "as of" values, blocked writes with reason, status link | NEW-G4, NEW-G6 |
| F44 | **Agent talks the user down** (brake) and records the decision | NEW-G15, M6 |

---

## 5. Product mistakes to avoid (cited)

1. **Docs contradict the product.** The quickstart says "nothing pays out automatically into your wallet" (`docs-site/content/docs/start/quickstart.mdx:42`), while first-trade describes automatic redemption (`trading/first-trade.mdx:44`) and the UI says "Paid automatically" (`web/src/lib/copy-verdict.ts:38`). The quickstart says a "10,000-tUSDC mint" (`quickstart.mdx:23`), while the constant is `100_000n` (`packages/core/src/constants/faucet.ts:2`). *Lesson: generate user-facing numbers from the same constants.* [VERIFIED]
2. **The tutorial points at UI that isn't there.** "Switch anytime with the Plain words toggle above the live Windows" (`web/src/features/onboarding/steps.ts:52`). A grep for a Plain words toggle in `web/src` finds only copy. The word board always renders (`web/src/features/markets/MarketsScreen.tsx:77-79`). [VERIFIED by grep; that no toggle exists at runtime is INFERENCE]
3. **Onboarding walls of text.** Tutorial step 3 packs the devnet wallet setting path, the faucet, holding detection and a real-money desk into one paragraph (`steps.ts:43`). *Keep one idea per screen, as the mobile pages do* (`onboarding-copy.ts:17-46`).
4. **External-wallet testnet friction.** Users must switch Phantom manually via Settings → Developer Settings → Testnet Mode, and a mainnet wallet rejects with "Network mismatch" (`packages/core/src/copy/strings.ts:52-58`, `diagnosis.ts:12`). *Our embedded wallet should own the network switch; never make users dig in a third-party wallet's settings.* [INFERENCE]
5. **Scope sprawl in navigation.** 35 nav entries on web (`nav-items.ts`), with games, parlay, short, reels, news, takes and more. The owner later removed News, Pitch, Demo, Print proof, Stats, Market Surface and Download from the phone app (`mobile/TAKEOVER_STATUS.md:42`). *Pick a small core; keep judge surfaces off the main nav.*
6. **No settings hub and no i18n.** Controls are scattered (§2.9); 18 hard-coded `en-US` formatters; no i18n library [VERIFIED by grep]. Both conflict with our D3/D4.
7. **Inconsistent limit models between agent surfaces.** Tap-trading has per-tap, daily, position and price caps (`session/copy.ts:32-38`), but X trading has "No separate per-trade or daily spending limit" (`x/copy.ts:77,132`). *One limits model must govern every agent entry point (app, voice, Telegram, Discord).*
8. **Local-only alerts.** Price alerts fire only while a tab is open (`alerts/copy.ts:27-29`), and the drop bell is device-local (`hedge/drop-bell.ts:3-8`). The copy is honest, but the feature is weak. *Our automations and alerts must run server-side (H1, J8).*
9. **Device-held keys orphan grants.** The "needs a key" state arises when storage is cleared or the user switches browser (`session/copy.ts:13,110-111`). *Design authority for multi-device from the start (A8).*
10. **Cross-platform auth left for last.** "X sign-in and recovery for a new account" is blocked because the web OAuth cookie doesn't reach the native app (`mobile/TAKEOVER_STATUS.md:95-97`). *Plan the Telegram/Discord binding for web and native together.*
11. **Links published before they worked.** The TestFlight link was shown on /download "before it accepted testers" (`mobile/TAKEOVER_STATUS.md:24-29`). Push was built but not delivered because APNs credentials were missing (`:93`). *A judge-facing install link or notification demo must be verified on a device first.*
12. **Safety copy without a setter.** "Daily Stop" has a blocker, a diagnosis and copy (`strings.ts:20`, `blockers.ts:144-147`, `diagnosis.ts:25`), but no user control to set it was found in `web/src` or `mobile/src` [grep; absence is INFERENCE]. *Every limit the agent cites must be visible and editable in Settings (F11).*
13. **Two-signature first-time friction.** Agari discloses the approve-then-order pair (`copy-ticket.ts:26`), and copy-trade needs two signatures too (`strategies/copy.ts` `join.twoSignatures`). Disclosure is good; *our embedded wallet and batching (C4) should avoid needing it at all.* [INFERENCE]

---

## Gaps in this review
- Games (Duel, Lucky, Range, Moonshot, arcade), Parlay, Short, Earn, Baskets, Rooms, Takes and News were surveyed only at the route and nav level. Their flows are specific to prediction markets and not relevant to our product.
- Runtime behavior was not observed (no live browsing, per instructions). Items 2 and 12 in §5 are absence-by-grep and could be wired elsewhere in ways grep missed.
