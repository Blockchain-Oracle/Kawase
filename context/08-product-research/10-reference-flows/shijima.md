# Shijima: product flows reconstructed from the repo, and what our Arc agent is missing

Purpose: mine Shijima (Abu's reference repo) for **product flows and UX patterns**, not architecture, and turn them into concrete additions to `FEATURE-INVENTORY.md` and `USER-FLOWS-INDEX.md`.
Sources: the shallow clone at `refs/abu/shijima` (commit `bbd932b`, 2026-09-28): `README.md`, `docs-site/content/docs/**`, `packages/shared/src/copy/*.ts` (every user-facing string lives here), `apps/web/app/**` routes, `apps/web/features/**` and `apps/web/components/**` components, `apps/worker/src/{gift,telegram}/*`. Only the repo was used; the live UI was not browsed.
Verified: 2026-09-29

**Path convention:** every `path:line` below is relative to `refs/abu/shijima/`. Unless a row says otherwise, claims about Shijima are **[VERIFIED]** from that line. Recommendations for us are **[INFERENCE]**.

> **A correction to the brief.** Shijima has **no testnet and no faucet**. A grep for `testnet|faucet` across `apps packages docs-site/content docs README.md` finds only one comment ("cannot turn the gift wallet into a faucet", `apps/worker/src/gift.ts:118`). The friction remover Abu remembers is the **mainnet "Free $1 to try"**: $1 of USDG plus about 30¢ of ETH for gas, paid by a gift wallet (`packages/shared/src/copy/gift.ts:1-8`). The no-money path is **Practice mode**, not a testnet (`docs-site/content/docs/start/live-or-practice.mdx:11`). Both ideas carry over to Arc; see §3 P1–P3.

---

## 1. What it is and who it's for

Shijima gives a retail holder of Robinhood **Stock Tokens** a personal AI agent that keeps a chosen basket (for example "The giants": Apple, Microsoft, Nvidia and others, plus cash) on target weights around the clock. It targets the nights and weekends when New York is shut but the tokens still trade on-chain (`README.md:12`, `README.md:34-38`). The user decides **what** to hold and the hard limits. The AI decides only **when** to rebalance: act now, act in part, wait for the reopen, or decline (`docs-site/content/docs/start/what-is-shijima.mdx:20-28`, `docs-site/content/docs/agent/how-it-decides.mdx:66-75`). Each agent is the user's own contract on Robinhood Chain **mainnet** (chain 4663). Only the owner's wallet can withdraw, and the per-trade and per-day caps are enforced on-chain (`README.md:155-164`). The audience is crypto-comfortable, non-US retail users with a browser wallet (`packages/shared/src/copy/onboarding.ts:45-46`, `packages/shared/src/copy/web.ts:107-113`). It was built for the SERV (OpenServ) hackathon (`README.md:28`), and its author is Abubakr Jimoh (`README.md:247`). **It is English-only:** `'en-US'` is hard-coded 53 times across `apps/web` and `packages` (grep), and every clock is New York time (`packages/shared/src/copy/telegram.ts:52`, `:235`).

---

## 2. Every user-facing flow

Routes found in `apps/web/app/`: `/` (landing), `/home`, `/demo`, `/how-it-works`, `/docs`, `/wallet`, `/fund`, `/send`, `/receive`, `/withdraw`, `/bridge`, `/evidence`, `/activity`, `/agents`, `/agents/new`, `/agents/[slug]` (+ `/settings`, `/record`, `/report`, `/decision/[seq]`), `/strategies`, `/markets`, `/stock/[symbol]`, `/reels`, `/live`, `/status`, `/compare`, `/settings`, `/dev/states`, `/dev/share`. APIs: `api/ask`, `api/auth/{nonce,verify,logout}`, `api/prices`, `api/room`, `api/takes`, `api/status`, `api/ticker`.

### 2.1 First-run tour (before sign-in)

1. The tour opens once per browser, and only for someone with no agent yet (`apps/web/features/onboarding/FirstRun.tsx:26`, `:53`).
2. It has five steps: **welcome → how → connect → gift → create** (`FirstRun.tsx:27`). The copy is short: "Wall Street closes. / Your agent doesn't." (`packages/shared/src/copy/onboarding.ts:15-19`), then three beats, *Money in · Your agent trades · Only you take it out* (`onboarding.ts:20-40`).
3. Connect step: "Sign one message… It costs nothing and moves nothing." It includes a region note that keeps browsing open to everyone (`onboarding.ts:41-47`, `apps/web/features/onboarding/steps.tsx:92-105`).
4. Gift step: it shows "N left" before sign-in and asks the user to connect first. Once claimed or gone, it offers "Fund from any token" (`steps.tsx:114-172`, `onboarding.ts:48-57`).
5. The last step has two exits, **Create your agent** or **Look around first** (`FirstRun.tsx:215-223`, `onboarding.ts:58-63`).
6. It can be reopened from Settings ("Take the tour", `onboarding.ts:64-65`, `apps/web/features/onboarding/tour.ts:1-6`).

**Friction removers:** Skip on every step; swipe, arrow keys and Escape; a haptic tick per step; a soft chime (volume 0.22) that plays only after the first press, with mute remembered (`FirstRun.tsx:31-36`, `:118-130`, `:185`; `apps/web/features/onboarding/sound.ts:8-11`, `:30-31`). Nothing renders until storage is read, so returning users never see a flash of it (`FirstRun.tsx:46-47`).

### 2.2 Starter funds: the "Free $1 to try" gift (mainnet)

1. The card shows up in three places: the Wallet page, step 2 of agent creation, and the sidebar (compact) (`docs-site/content/docs/start/free-dollar.mdx:26`; `apps/web/features/strategies/MoneyStep.tsx:187`; `apps/web/components/shell/app/AppSidebar.tsx:202`).
2. Contents: "$1 USDG · ≈30¢ ETH · Robinhood Chain" (`packages/shared/src/copy/gift.ts:28`). That is enough to create an agent, fund it and withdraw later (`free-dollar.mdx:12`). The smallest trade is $0.20, and Shijima pays the agent's trade gas, so $1 buys "a real, live trade you can check on the chain" (`free-dollar.mdx:32`).
3. **Slide to claim.** The handle is also a button, so keyboard users can press Enter (`apps/web/features/gift/GiftCard.tsx:141-182`).
4. Every state has its own line: signed out, eligible, queued ("arrive… in about a minute"), sending, sent (with both tx links), failed (retry), already claimed, IP used, all gone, sender switched off (`gift.ts:11-24`; `GiftCard.tsx:117-132`). While a claim is moving, the card polls every 4 s (`GiftCard.tsx:20`, `:34-50`).
5. Scarcity is honest. "N left" is computed live from the gift wallet's USDG and ETH, minus claims still owed. There is no fixed number (`apps/web/app/gift-actions.ts:44-59`).
6. Abuse limits: one claim per wallet, one per connection ever (a salted IP hash), and the wallet always comes from the session (`gift-actions.ts:21-25`, `:78-85`, `:95-117`; `free-dollar.mdx:18-22`). A payout is capped at the fixed gift even if a row is edited (`apps/worker/src/gift.ts:116-124`).

**Friction removed:** the user needs no exchange, no bridge and no gas before trying the product. The gift also solves the chicken-and-egg of needing ETH to create the agent (`packages/shared/src/copy/studio.ts:222-227`).

### 2.3 Sign-in and network

1. **Connect wallet** opens a picker that lists wallets "In this browser". If none are found, it says "Install MetaMask or Rabby, or open this page inside your wallet app", with links. WalletConnect offers a QR code or **Copy link** (`packages/shared/src/copy/web.ts:105-134`; `apps/web/components/shell/wallet/ConnectWalletModal.tsx:172-184`).
2. **Sign to continue:** SIWE-style, "One signature, no transaction" (`web.ts:124-126`). The session lasts 7 days (`docs-site/content/docs/start/sign-in.mdx:36`).
3. Network: sign-in asks the wallet to switch to Robinhood Chain. If it refuses, sign-in still works and a non-modal banner, **Wrong network · Switch to Robinhood Chain**, sits above the content (`sign-in.mdx:38-40`; `apps/web/components/shell/WrongNetworkBanner.tsx:9-17`; `web.ts:136-141`). Money screens switch the chain just in time before signing (`apps/web/features/strategies/CreateStep.tsx:195`). If the connected address changes mid-flow: "Switch back to the one you signed in with" (`studio.ts:217-218`).
4. Troubleshooting prints the add-network facts (chain id, RPC, currency, explorer) (`docs-site/content/docs/help/troubleshooting.mdx:13-25`).
5. A "Live on Robinhood Chain mainnet · block N" badge, read from the browser, is always visible (`packages/shared/src/copy/app.ts:99-104`).

### 2.4 Agent creation (the four-step studio)

1. The steps are **Strategy → Amount → Limits → Review**, one decision per screen, with a live summary beside them. "You confirm in your wallet only at the end." (`studio.ts:14-16`; `apps/web/features/strategies/Studio.tsx:24-27`).
2. **Drafting needs no account.** The draft persists in localStorage, so a closed tab loses nothing. A preset in the URL wins over a saved draft (`apps/web/features/strategies/useStudioDraft.ts:9-13`, `:33-40`).
3. Strategy: 20 presets, search, filter chips and sort ("Popular, Best 30 days, Most cash, A to Z"), or **Build your own** with **Even split** (`studio.ts:19-30`, `:106-111`; `docs-site/content/docs/start/first-agent.mdx:21-25`). Past returns carry the note "Not a forecast" (`studio.ts:292-295`).
4. Amount: $20 by default; quick picks $1/10/20/50/100/**Max**; "What that buys" shown in dollars (`first-agent.mdx:32`). An untouched $20 **auto-shrinks to the wallet balance** when that is lower, "so a wallet with the free $1 starts at $1 instead of at a warning" (`MoneyStep.tsx:105-114`).
5. **Feasibility check with one-tap fixes.** If the amount split across the basket makes a buy smaller than the minimum trade, the step shows "Too small to trade yet" with **Put in $X** and **Switch to <a fitting preset>** (`MoneyStep.tsx:28-41`, `:162-181`; `studio.ts:182-188`). If the wallet is short, it offers "Bring USDG to your wallet →" (`MoneyStep.tsx:182-185`).
6. **Practice with no money** is a one-tap toggle on the same step (`MoneyStep.tsx:206-214`).
7. Limits: per-trade and per-day caps (on-chain) are **auto-sized to the amount** until the user types, with the line "Sized to your $X, so its first buys are never held back" (`apps/web/features/strategies/draft.ts:82-93`; `studio.ts:42`). **More options** holds drift tolerance, max position, loss stop, "Ask me first above", 600-character private notes, and standing rules (`first-agent.mdx:41-50`).
8. Review:
   - Sign-in is gated here, not earlier (`CreateStep.tsx:168-175`).
   - A one-time **disclosure** must be read and accepted (`CreateStep.tsx:177-186`).
   - The route card reads *Your wallet → $X → Your new agent* (`CreateStep.tsx:270-287`).
   - The fee is shown in dollars, with "You have $Y ✓" or a short-of-ETH box that offers **Get ETH for fees** and **Check again** (`CreateStep.tsx:289-311`).
   - The user picks **It starts: Live / Practice** (`CreateStep.tsx:313-332`).
   - A numbered list shows what the wallet will sign (`CreateStep.tsx:334-348`).
9. The button label narrates each phase: "Confirm in your wallet…" → "Sent. Waiting for the network…" → "In the network. Confirming…" → "Recording it…" → "Putting in $X…" (`CreateStep.tsx:363-379`; `studio.ts:73-80`, `:206-214`).
10. **Done card:** "<Name> is live" (or "is practising"). It shows holdings (polled every 8 s), the address with copy and explorer links, an inline **Connect Telegram** with **Skip for now** (the skip is recorded), **Open your agent →**, **Add money** and **Start another agent** (`apps/web/features/strategies/FirstSteps.tsx:19-23`, `:42-56`, `:107-139`; `studio.ts:230-261`).

**Recovery:** the agent's address is known before the contract exists, so money can arrive first (`studio.ts:198-199`, `:309-311`). If the user signed and then closed the tab, the next visit records the agent **with no second signature** (`CreateStep.tsx:145-158`). A failure keeps the draft: "Nothing was created, and your draft is still here." (`studio.ts:214-215`).

### 2.5 Rules, budgets and limits

1. Limits come in two tiers (`docs-site/content/docs/agent/limits.mdx:12-19`, `:36-44`):
   - **Chain-held:** per trade ($10 default) and per day ($50 default).
   - **Agent-held:** drift 3%, max position 50%, loss stop 15%, "Ask me first above" $100.
2. The **"Limits in use"** panel shows live usage: "Spent in the last 24 hours: $X of $Y", "Room before the loss stop", "Largest single holding: N of at most M" (`packages/shared/src/copy/web.ts:634-650`).
3. **Standing rules** read as one structured sentence: "If **Nvidia** falls more than **5%** below its reference, sell **50%**." Bounds are 1–20% and 10–100%, with up to 10 rules. A rule stays a draft until reviewed (`web.ts:677-690`; `docs-site/content/docs/agent/rules.mdx:14-24`).
4. **Notes for your agent:** free text that shapes *when* the agent acts, never *how much*. The notes are private; the public record only says "a note applied" (`studio.ts:129-133`; `rules.mdx:37-41`).
5. **Loss stop, two-stage.** On the first breach the agent stops and alerts. On the second consecutive check it also pauses the contract on-chain. Restarting re-baselines from the current value, and deposits and withdrawals never count as gain or loss (`limits.mdx:48-55`; `packages/shared/src/copy/engine.ts:32-39`).
6. Changing limits: lowering one can use the browser session key; **raising always needs the wallet** (`limits.mdx:31-33`; `web.ts:909-917`).

### 2.6 Modes and approvals (who acts)

1. There are three modes, **Practice / Ask me first / On its own**. The mode changes only what happens *after* a decision (`docs-site/content/docs/agent/modes.mdx:12-18`; `web.ts:442-447`). Switching is instant and free, and it cancels waiting requests (`modes.mdx:20`).
2. "On its own" still asks for any action at or above the "Ask me first above" amount, marked **large** (`modes.mdx:30-32`; `web.ts:544-548`).
3. An approval request carries what, why, what it turned down, how sure, and when it expires (1 h). No answer means nothing happens, and that is recorded (`modes.mdx:26`; `packages/shared/src/copy/telegram.ts:59-79`).
4. **Re-validation at execution.** After approval the agent re-reads prices and re-runs every check. It acts only if the result is within 0.5% of what the user saw; otherwise the record says "approved, conditions changed, not executed" (`modes.mdx:28`; `engine.ts:41-49`).
5. **One answer, every surface.** An answer on the web updates the Telegram message and vice versa ("Answered on the website") (`telegram.ts:82-96`; `docs-site/content/docs/agent/telegram.mdx:37`).
6. **"Do it anyway":** the user can overrule a wait from chat, with a second confirmation. It is recorded as the user's call and excluded from the agent's grades, and it is not available in Practice (`docs-site/content/docs/agent/ask.mdx:37-39`; `engine.ts:51-53`).

### 2.7 Talking to the agent ("Ask Shijima")

1. The chat opens anywhere with **⌘J** or a floating button. It talks to the agent on screen, otherwise the user's first agent (`apps/web/components/shell/app/AskDrawer.tsx:16-20`, `:33-53`).
2. Starter chips: "How am I doing? / Why did you wait? / Move me into The giants / Check now" (`web.ts:505`). A slow answer shows "Still thinking. Shijima answers in about ten seconds." (`web.ts:507`).
3. Answers cite their sources ("Based on decision #n / a waiting request / your note / the NVDA price") (`web.ts:514-521`). The agent "will not quote facts it was not given" (`ask.mdx:23`).
4. **Changes come back as a proposal card** showing Now → After. The user presses **Confirm** or **Not now**, and the card expires after 10 min (`apps/web/features/desk/ProposalCard.tsx:83-131`; `web.ts:524-539`; `ask.mdx:25-27`). Destructive kinds (sell everything, remove assistant, close) are drawn in the danger tone (`ProposalCard.tsx:24-25`).
5. A **tiered confirmation matrix** is printed on each card as "You confirm here / Your session key signs / Your wallet signs" (`web.ts:525`; table at `ask.mdx:29-35`).
6. **Buttons and chat produce the same card.** "Each opens one small form and makes the same card the chat would" (`web.ts:788-795`).
7. Rate limits: 6 messages a minute, 150 a day, up to 1,000 characters each (`ask.mdx:43`; `packages/db/src/queries/chat.ts:56`).

### 2.8 Notifications

1. **Bell / inbox** in the header. It carries the same messages as Telegram, with an unread count, **Mark all as read**, and kinds (Asking you, Asking you large, Acted, Would have acted, Chose not to act, Alert, After the reopen, Price alert). Each item deep-links to its decision or stock (`apps/web/components/shell/HeaderInbox.tsx:12-15`, `:64-71`; `web.ts:1172-1187`).
2. **Telegram's anti-noise design.** The copy file explains it: about 160 decisions a week, most "nothing to do", so the bot keeps **one pinned status message, edited in place, that never notifies**, and sends new messages only for needs-you, acted or went-wrong (`telegram.ts:1-7`, `:31-53`). The first-contact message states this contract to the user (`telegram.ts:18-29`).
3. Message types: *Approval needed · I did this · I would have done this (Practice) · I chose not to act (only when worth knowing) · Heads up · The report is ready* (`telegram.ts:59-110`).
4. **Connect Telegram:**
   - It works **before owning an agent**, because it links to the wallet and every future agent reports there (`telegram.mdx:18`; `telegram.ts:164-170`).
   - The user gets a deep link `t.me/<bot>?start=<code>`, a QR code for a phone beside the computer, or a code to paste. The code works once, for 10 minutes (`apps/web/features/settings/TelegramConnect.tsx:25`, `:114`; `web.ts:1072-1089`).
   - "This page turns green as soon as it does" (`web.ts:1083`).
5. Telegram commands: `/portfolio /record /pause /resume /ask /agents /help`, and plain text works too. Changes that need the wallet show **Confirm on the website** (`telegram.ts:123-132`, `:237-241`).
6. **Price alerts** are one-shot: "Tell me when Nvidia is 5% below its reference". If the price is already there, it fires within five minutes. At most 10 alerts can wait at once. The message says it will not repeat (`web.ts:404-438`; `packages/db/src/queries/alerts.ts:14`).
7. A **missing-channel warning** appears when Telegram is not connected: "the agent can only ask you here and cannot tell you when something happens" (`web.ts:673-674`).

### 2.9 Activity and history

1. `/activity` has tabs **All · Needs you (count) · Trades**, a header pill ("N WAITING" / "UP TO DATE"), and a stat grid: Decisions, Trades ("Real money moved"), Practice ("Decided, nothing sent"), Need you (`apps/web/features/activity/ActivityScreen.tsx:67-115`; `app.ts:164-188`).
2. **Needs-you rows are answered inline** (Approve/Reject with expiry) without leaving the feed (`ActivityScreen.tsx:154-167`; `apps/web/components/answer.tsx:9`).
3. Each row shows the token logo, agent, BUY/SELL/SAVE/REDEEM tag, summary, time and status pill, plus **Open ↗** to the decision page. Practice rows are labelled "· PRACTICE" (`ActivityScreen.tsx:37-46`, `:177-205`).
4. The per-agent **Record** is grouped by day, with "N quiet checks" collapsed and filters for outcome, token and Practice/Live (`web.ts:694-725`; `docs-site/content/docs/agent/record.mdx:24-26`). Money in and out is annotated ("You took out $X", "Changed outside the agent") so it never reads as a gain or loss (`web.ts:703-721`; `packages/shared/src/copy/money.ts:70-75`).
5. `/evidence` lists every on-chain decision and money move with **Copy every hash** (`record.mdx:53-55`; `money.ts:113-125`).
6. The **Overview** page shows the total across all agents, 24 h change, running/practice counts, "Needs you" and a Connections status (`app.ts:127-161`).

### 2.10 Explanations of agent decisions

1. The **decision page** has fixed sections: *The decision · Why it looked · What it saw · The options it weighed · The limits check · The cost, shown before acting · What happened · If you were asked · Proof · How it looks now* (`packages/shared/src/copy/record.ts:126-137`; `apps/web/app/agents/[slug]/decision/[seq]/page.tsx:116-351`).
2. Confidence is shown as "74% sure", with the tooltip "The account's limits apply whatever it says." (`app.ts:266-267`).
3. **Every refusal is a plain sentence** from one reviewed file, for example: "Nvidia reports on <date>. The agent does not buy in the two days before a report."; "…is 3.1% away from its own average of the last half hour. The agent waits for it to settle."; limits-check reasons such as "over what is left of the daily limit" (`engine.ts:1-11`, `:100-135`).
4. **Why a wait ended** is also sentenced: "New cash arrived", "The price gap moved by N bps", "There is a new headline naming the company" (`engine.ts:88-98`).
5. The **"Right now" card** on the agent page is a state machine in the first person: "Paused by you. I am not acting until you resume.", "Waiting to buy Nvidia. I look again at 14:30, or sooner if something changes.", "Watching your 6 stocks. Everything is inside its range." (`web.ts:459-481`; `app.ts:284-330`).
6. **Grading after the fact.** After the reopen, each call is compared with its real alternative. Under 0.25% counts as "no real difference" (`how-it-decides.mdx:86-88`). A per-stretch **report** (`/agents/[slug]/report`) comes with a Telegram "The report is ready" message (`apps/web/app/agents/[slug]/report/page.tsx:25-30`; `record.ts:252-295`; `telegram.ts:98-99`). The track record appears as "3 of 5 timing calls beat the alternative" (`app.ts:331-332`).
7. **Check it:** the browser recomputes the decision hash and compares it with the chain ("It matches / It does NOT match"), with **Download this record** (`record.mdx:37-45`).

### 2.11 Error, empty and recovery states

1. **The diagnosis taxonomy** has a plain headline and body per kind, with "Technical details" folded away: signer-required, wrong-chain, user-rejected, out-of-gas, chain-unreachable, desk-unreachable, not-found, unknown (`web.ts:155-199`; `apps/web/components/states/ErrorState.tsx:18`, `:49-56`).
2. The **reassurance line** "Nothing was sent and nothing moved." appears on every failure. The error page adds "Your money is not affected: it sits in your agent's account on the chain" (`web.ts:162-163`; `app.ts:654-659`).
3. **Money endings** are an explicit set: *done · nothing sent · approval given but nothing moved · on its way · may have been sent* ("Check the explorer link before trying again") (`money.ts:1-5`, `:18-27`).
4. **Transaction watcher:**
   - It distinguishes "the network never received this transaction, so nothing was spent" from "your wallet says it sent this, but the network has not seen it yet… cancel the pending one" (after 25 s) (`CreateStep.tsx:232-253`; `studio.ts:76-79`).
   - It takes the nonce from the network, not the wallet's memory (`CreateStep.tsx:197-199`).
5. **Standard components:**
   - `EmptyState`: "Says why it is empty and names the next action — never a blank panel" (`apps/web/components/states/EmptyState.tsx:14`).
   - `BlockedButton`: "a dead control never looks tappable, and always says why" (`apps/web/components/states/BlockedButton.tsx:16`).
   - `StaleTick`: "Last known 4 min ago. Refreshing did not work." (`apps/web/components/states/StaleTick.tsx:10`; `web.ts:157`).
   - `ReadingBoundary`: loading/unavailable/empty/stale/live drawn the same everywhere (`apps/web/components/states/ReadingBoundary.tsx:26`).
6. **Pre-send refusals:** a token contract as the recipient is refused ("Money sent there is lost"); a send to one's own agent is redirected to **Add money**; "The chain would refuse this right now. Nothing was sent." (a simulation ran first) (`money.ts:58-62`; `docs-site/content/docs/money/send-and-receive.mdx:13-15`).
7. **Quotes:** re-priced 0.5 s after typing stops and every 30 s; they hold 60 s, then "That price has expired. Here is a fresh one."; approvals are for the exact amount only (`docs-site/content/docs/money/fund.mdx:34-44`; `money.ts:66`).
8. **Troubleshooting by stage:** "First find which stage you are at: signing in, a signature in your wallet, a transaction on the chain, or Relay delivering" (`troubleshooting.mdx:11`, `:33-49`).
9. **Awkward agent states** each have a designed card: paused, stopped by loss limit, needs attention, waiting for money, too small to trade (with **Add $X** / **Change the plan**), "has not checked in" (`app.ts:293-329`; `web.ts:613-624`; `apps/web/features/agent/TooSmallToTrade.tsx:50-64`). A dev-only `/dev/states` gallery renders every one from fixtures (`apps/web/app/dev/states/page.tsx:11-14`), hidden in production unless `DEV_PAGES=1` (`apps/web/app/dev/layout.tsx:4-9`).
10. The **404** page offers "Did you mean", plus links to Markets and Live agents (`app.ts:643-652`).

### 2.12 Money in, money out, gas

1. **Fund** from one screen:
   - The user picks **Into which agent** and **From**: *Your wallet* (USDG direct; ETH or other Stock Tokens swapped on the way), *Another chain* (Base/Arbitrum/Ethereum/BNB via Relay, about 1%, about a minute), or *From anywhere* (a QR code of the agent address) (`fund.mdx:11-32`).
   - The summary shows what you pay, what arrives, the cost all in, the time, and **how many signatures** (`fund.mdx:36`).
   - The optional tick "Also send about $1 of ETH to my own wallet… for my network fees" is a gas top-up bundled with the deposit (`web.ts:855`).
2. **Withdraw:** Cash / One stock (as-is or sell) / Everything (as cash or as-is). It always goes to the owner's own wallet, so there is no address field to get wrong (`docs-site/content/docs/money/withdraw.mdx:10-26`).
3. **Gas as a count:** the wallet chip shows "~N signatures" rather than an ETH amount. Its tooltip explains that the agent's trades are paid by Shijima (`app.ts:85-96`; `docs-site/content/docs/money/fees.mdx:11-20`). **Get gas:** swap $1 of USDG to ETH, or bring ETH from another chain (`docs-site/content/docs/money/bridge.mdx:27-34`).
4. **Receive:** per account (wallet or agent) there is a QR code, a "Robinhood Chain only." callout, and "Coming from Base, Arbitrum, Ethereum or BNB? Bridge it in" (`money.ts:88-111`).
5. **No per-trade fee,** framed as a trust argument: "An agent that is paid per trade is paid to trade too much" (`fees.mdx:30-32`).

### 2.13 Exit, control and trust

1. A "You are always in control" table covers **Pause** (instant, free), **Remove the assistant** (revoke), **Withdraw everything**, **Close the agent** (one signature sells or sends everything, revokes, and stops checks; the record stays readable), and **Leave without our website** (`docs-site/content/docs/security/what-it-can-do.mdx:41-50`; `web.ts:954-960`).
2. **Withdraw without us:** step-by-step explorer instructions. The footer link "Withdraw without this website" is on every page (`docs-site/content/docs/security/withdraw-without-us.mdx:10-35`; `web.ts:147`).
3. **The honest worst case:** if the key is stolen, the loss is at most about 8% of the daily limit per window, with a dollar example (`docs-site/content/docs/security/worst-case.mdx:10-20`).
4. **Versioned disclosure:** eight short sections. "A change to the words asks every owner to accept again." A region self-declaration checkbox gates Accept (`web.ts:1189-1230`; `apps/web/features/settings/Disclosure.tsx:26`, `:65-73`).
5. **Session key ("This browser's key"):** up to 7 days, revocable. A receipt lists "It can / It can never / It ends / Fees / Signatures" before granting (`web.ts:747-786`).
6. **Banned words:** "profit", "guaranteed" and "beat the market" in model output void the decision, and the same list lints the product copy (`packages/shared/src/banned-words.ts:1-21`).

### 2.14 Sharing and social

1. **Public read-only link** per agent, off by default: "never your chat or your notes" (`web.ts:1141-1150`). Agents and stocks get generated link-preview images (`apps/web/app/agents/[slug]/opengraph-image.tsx`, `apps/web/app/stock/[symbol]/opengraph-image.tsx`; `web.ts:1236-1265`).
2. **Share card per decision:** a rendered image ("Bought." / "Waited." / "Blocked by a limit.") with the grade and proof hashes, plus a pre-filled post built from **real fields only, never a claim of an edge** (`apps/web/features/share/ShareDecisionButton.tsx`; `web.ts:1266-1320`).
3. **Copy trading:**
   - The user gets their own agent that mirrors another's moves proportionally, after a one-time $0–5 fee split 80/20 between creator and platform (`docs-site/content/docs/agent/copy.mdx:12-47`).
   - Copies that cannot happen are recorded as a **missed copy with a reason** (`packages/shared/src/copy/copying.ts:31-47`).
   - Sharing is two ordered steps, the public link and then copying. Turning copying on also turns the link on (`web.ts:1031-1061`).
4. **Watch before joining:** the landing's secondary CTA is "Watch a live agent" (a showcase agent) (`packages/shared/src/copy/home.ts:27-36`). `/agents` lists shared agents with their track records (`app.ts:382-427`). `/strategies` offers "What shared agents hold" as a starting point, copying only the mix (`studio.ts:285-298`).
5. **Owners-only social:** a per-stock **Room** and **Takes** (short posts). Both are gated to agent owners ("even in practice") and "Your agent never reads" them. **Reels** is a vertical feed of stocks, decisions and takes (`web.ts:1322-1418`).
6. **Proof pages:** `/live` (counts, latest transactions, revenue) and `/compare` (the same model with and without the reasoning service) (`app.ts:567-608`).

### 2.15 Settings

1. **Account settings** (`/settings`): Connections · Wallet & gas · Agents & access (who can trade, the session key, who can withdraw: "Only your wallet") · What you agreed to · Verify it yourself · reopen the tour (`app.ts:200-251`; `onboarding.ts:64-65`).
2. **Agent settings** (`/agents/[slug]/settings`) tabs: Trading · Plan · Connections · Sharing · Agreement (`web.ts:966-972`).
   - Trading groups controls as **Money · Running · What it may do · Danger zone**, each tile with one line of consequence ("Pause: Stops acting; sells nothing") (`web.ts:1000-1029`).
   - Every control first shows a card: "Nothing happens until you confirm it." (`web.ts:1010`).
3. **Theme:** light/dark toggle (`web.ts:98-103`).

---

## 3. Product patterns worth copying for our Arc agent [INFERENCE]

Each maps to a `FEATURE-INVENTORY.md` ID, or is marked **NEW** (with its proposed ID from §4).

| # | Pattern (Shijima evidence) | Why it fits our Arc agent | Maps to |
|---|---|---|---|
| P1 | **Starter funds inside onboarding**: a claim card with live "N left", honest states, per-wallet/per-IP limits, tx links (§2.2) | On **testnet**, replace "go to faucet.circle.com" (rate-limited, `context/01-arc/agentic-and-ai.md:144`) with a one-tap in-app top-up from our own drip wallet. On **mainnet**, Arc has no faucet (`context/01-arc/overview-and-architecture.md:111`), so an optional sponsored $1 lets a judge do one real send. On Arc, gas **is** USDC (`context/01-arc/network-config.md:27`), so one asset covers both "money" and "gas", which is simpler than Shijima's two legs | A5 → **NEW-S2** |
| P2 | **Practice mode**: decides for real, spends nothing, "I would have done this" messages (§2.6) | A dry-run for automations and trading agents ("run this DCA in practice for a week"), which also works on mainnet without money | M4 → **NEW-S3** |
| P3 | **Draft without an account; sign at the end**; draft persisted (§2.4.2) | Let users build an automation or a send by voice before signing up; sign-up happens at confirm | A1, H2 → **NEW-S4** |
| P4 | **Skippable 5-step tour, reopenable from Settings**, with a "Look around first" exit (§2.1) | Our A7 is a chat tour only; add a visual first run that ends in "Talk to your agent" or "Look around first" | A7 → **NEW-S1** |
| P5 | **Feasibility check with one-tap fixes** ("Too small to trade" → Put in $X / Switch plan) (§2.4.5) | Arc equivalents: below the minimum bridge amount, a fixed fee eating a big share (Shijima: "$20 or more is better value", `fund.mdx:44`), a vault too small, "send max leaves no USDC for gas" | D1, E1, F2 → **NEW-S6** |
| P6 | **Limits auto-sized to the amount** until the user edits (§2.4.7) | Our F11 defaults are static ($250/$500). Size them to the user's balance or automation amount, with one sentence of why | N1, H3 |
| P7 | **Fees as a count** ("~N signatures") (§2.12.3) | For a sponsored or paymaster setup, show "~N actions left" or "fees covered", never gwei | B2, N6 → **NEW-S7** |
| P8 | **Unified "Needs you" queue** answered inline, synced across web, Telegram and chat ("Answered on the website") (§2.6.5, §2.9.2) | Voice, push, Telegram and in-app all answer the same request, and each surface shows where it was answered | J1, J6 → **NEW-S8** |
| P9 | **Re-validate at execution after approval** (≤0.5% drift, else "conditions changed, not executed") (§2.6.4) | Essential for swaps and bridges approved from Telegram or a notification minutes later | J6, L2, D6 → **NEW-S9** |
| P10 | **One quiet pinned status + notify only on needs-you, acted or went wrong**, and the bot says so on first contact (§2.8.2) | Automations running on schedule would otherwise spam users; this is the anti-mute design | J5 → **NEW-S10** |
| P11 | **Proposal card = Now → After diff + "who confirms" line + expiry**; buttons and chat make the same card (§2.7.4–6) | Our L2/K4 already say "screen confirms". Add the before/after diff, the tier label ("You confirm here / Face ID / wallet"), a 10-minute expiry, and the rule that chat, voice and buttons create one card type | L2, L7, K4, N5 → **NEW-S15** |
| P12 | **"Right now" card, first person**: state machine with last and next check (§2.10.5) | Each automation and agent gets "Waiting for Tuesday 09:00 · last run ✓ · next run in 2 d" or "Paused by you" | H4 → **NEW-S11** |
| P13 | **Decision page anatomy** (why it looked, what it saw, options weighed, limits check, cost shown before, what happened, if you were asked, proof, now) (§2.10.1) | This is our L12/O2 "why" made concrete. Bridge example: routes compared, the cheapest chosen, fees, limits checked | L12, O2, M6 → **NEW-S12** |
| P14 | **Every refusal is a sentence from one reviewed copy file** (§2.10.3) | Also the prerequisite for translation (D4): one catalogue of engine sentences, localized | M6, K6 |
| P15 | **Grade the agent's choices afterwards** and send a report (§2.10.6) | "Cheapest route saved you $0.41 vs the fastest", "Yield earned this week", "2 automations skipped, why". This fits the "agentic sophistication" judging criterion | **NEW-S13** |
| P16 | **"Do it anyway" override**, recorded as the user's call (§2.6.6) | When the agent refuses (risky meme coin, slippage), the user can overrule with step-up and it is recorded as their call | D3, M6 → **NEW-S14** |
| P17 | **Money-ending taxonomy + tx watcher that tells "never seen" from "pending"**, with a network nonce (§2.11.3–4) | Our F30 is unwritten; this is its spine | C7, E3 → **NEW-S16** |
| P18 | **Non-modal wrong-network banner; reads work anywhere, writes switch just in time** (§2.3.3) | Our D2 needs mainnet and testnet explicit. Use a persistent network chip plus a non-modal banner, never a blocking modal | A3, N7 |
| P19 | **Refuse token-contract recipients; redirect own-account sends to "Add money"** (§2.11.6) | Cheap, high-value send guards | C1, I5 |
| P20 | **Telegram linkable before any agent, QR for desktop, one-time 10-minute code, page turns green** (§2.8.4) | Our F12 lacks the QR, the "before first automation" timing and the live confirmation | J2 |
| P21 | **One-shot alerts that say they won't repeat** ("already there → fires next price"; cap 10) (§2.8.6) | Makes J8 concrete | J8 |
| P22 | **Exit kit**: pause (free), revoke, close-everything in one step, "withdraw without our app", honest worst case (§2.13) | With Circle wallets: "how to get your money if we disappear" and "what the agent can never do", both linked from the footer | A8, N2 → **NEW-S17** |
| P23 | **Versioned consent before first money move; re-accept on change** (§2.13.4) | Needed before meme-coin trading and marketplace spending (open question in `DECISIONS-FROM-ABU.md`) | D3 → **NEW-S18** |
| P24 | **Public read-only page + share card with real fields only** (§2.14.1–2) | Share a receipt, a bridge savings or an automation template; good for traction scoring | **NEW-S19** |
| P25 | **Watch a live showcase agent before signing up** (§2.14.4) | A demo agent on testnet, always running, for judges without accounts | **NEW-S4** |
| P26 | **Standard state components** (EmptyState names the next action, BlockedButton says why, StaleTick, ReadingBoundary) plus a `/dev/states` gallery (§2.11.5, .9) | A process pattern that guarantees F30 states exist on mobile and web | F30 → **NEW-S26** |
| P27 | **Chat answers cite sources** ("Based on decision #12 / your note") and use starter chips (§2.7.2–3) | Grounded answers for history and knowledge Q&A | M1, M7 |
| P28 | **Private notes to the agent + standing rules as one structured sentence** (§2.5.3–4) | Typed preferences (M2) plus a readable rule sentence for voice read-back | M2, M3, H5 |
| P29 | **Two-stage loss stop** that re-baselines on restart; money in and out never counted as gain or loss (§2.5.5) | For trading and meme-coin automations | D6, N1, B4 → **NEW-S22** |
| P30 | **Banned-words lint on model output and copy** (no "profit", "guaranteed") (§2.13.6) | Compliance for yield and meme-coin talk, in every language | M7, M8 |

---

## 4. What our inventory and flow index are missing

### 4a. New features (proposed IDs)

| ID | Feature | Detail | Main / Test |
|---|---|---|---|
| **NEW-S1** | First-run tour | 4–5 swipeable steps (what it does · what it can never do · connect · get starter funds · talk to it), skippable, reopenable in Settings, "Look around first" exit, localized | ✅ / ✅ |
| **NEW-S2** | In-app starter funds | **Testnet:** one-tap "Get test USDC", paid by our drip wallet; states *eligible · sending · sent (tx) · already claimed · daily limit · drip empty*; per-account + per-device limits. **Mainnet (optional):** sponsored first $1 while budget lasts, with "N left" computed live. On Arc, USDC is also gas | ⚠️ budget / ✅ |
| **NEW-S3** | Practice (dry-run) mode | Per automation or agent: runs the full pipeline and records "would have sent/swapped" with no money moved; notifications say "I would have…"; switch to live anytime | ✅ / ✅ |
| **NEW-S4** | Guest/demo mode + deferred sign-up | Browse a live showcase agent; draft a send or automation without an account; the draft persists; sign-up and wallet creation happen at the confirm step | ✅ / ✅ |
| **NEW-S5** | Post-setup "First steps" card | After the first wallet or automation: fund · connect Telegram (skip recorded) · open it · start another | ✅ / ✅ |
| **NEW-S6** | Feasibility pre-check with one-tap fixes | Before quoting: minimum bridge amount, fixed-fee share, vault minimum, balance-after-gas. Offers "Send $X instead / Pick route Y / Keep $0.05 for fees" | ✅ / ✅ |
| **NEW-S7** | Fee-reserve indicator | "~N actions left" or "Fees covered by Tameion"; warns when "send max" would strand the account with no USDC for gas | ✅ / ✅ |
| **NEW-S8** | "Needs you" queue | One queue of pending approvals across chat, voice, push, Telegram and Discord; badge count; answer inline; expiry; "answered on Telegram" sync | ✅ / ✅ |
| **NEW-S9** | Approval re-validation | Re-quote at execution; abort with "conditions changed, not executed" if drift > threshold | ✅ / ✅ |
| **NEW-S10** | Quiet status digest | One pinned or edited status per channel (balance, last and next automation run, spent today); new pings only for needs-you, done or failed | ✅ / ✅ |
| **NEW-S11** | Agent/automation "Right now" card + `/status` | First-person state, last and next run, heartbeat; a public status page with "has not checked in" honesty | ✅ / ✅ |
| **NEW-S12** | Decision page anatomy | The fixed sections of §2.10.1 for every agent action, including routes and quotes compared | ✅ / ✅ |
| **NEW-S13** | Outcome grading + weekly report | Post-hoc: route savings, quote vs executed, yield earned, automations skipped (with why); "Your report is ready" notification | ✅ / ⚠️ thin data |
| **NEW-S14** | User override ("do it anyway") | Step-up, then act; recorded as the user's call | ✅ / ✅ |
| **NEW-S15** | Tiered confirmation matrix | Every card states its tier: tap in session · biometric · high-value step-up; a published table of which action needs which | ✅ / ✅ |
| **NEW-S16** | Money-ending taxonomy + tx watcher | done / nothing sent / approval only / on its way / may have been sent; "never seen" vs "pending" detection; stage-based troubleshooting | ✅ / ✅ |
| **NEW-S17** | Exit kit + trust page | Pause all (exists as N2), revoke agent, sweep everything to the user's wallet, "what the agent can never do", honest worst case, "your money if we disappear" (Circle wallet recovery/export path) | ⚠️ custody-dependent |
| **NEW-S18** | Versioned consent | Short disclosure before the first money move; separate meme-coin and marketplace risk sections; re-accept on change; localized | ✅ / ✅ |
| **NEW-S19** | Share cards + public read-only pages | Receipt, bridge savings, automation template; pre-filled post with real fields only; link-preview images | ✅ / ✅ |
| **NEW-S20** | In-app help | Glossary, FAQ, troubleshooting by stage; the agent can answer from them | ✅ / ✅ |
| **NEW-S21** | Missing-channel nudges | "Telegram not connected, so I can only ask you in the app" wherever an approval could be missed | ✅ / ✅ |
| **NEW-S22** | Drawdown/loss stop for trading automations | Two-stage, re-baselines on restart, excludes deposits and withdrawals | ✅ / ⚠️ |
| **NEW-S23** | Rules read-back | Before activating an automation, the agent reads the envelope back in its own words and lists what is unclear. Shijima wrote this copy but never wired it (see §5.3); voice makes it natural for us (K4) | ✅ / ✅ |
| **NEW-S24** | Start from a template | "Start from what others run": automation templates and shared agents' configurations (only the configuration is copied, never money) | ✅ / ✅ |
| **NEW-S25** | Live proof page | `/live`: counts of real actions, latest transactions, per network. Judges value mainnet traction (`context/01-arc/README.md:61`) | ✅ / ✅ |
| **NEW-S26** | States gallery (internal) | Every awkward state rendered from fixtures on mobile and web; a QA gate for F30 | — |

### 4b. New flows for `USER-FLOWS-INDEX.md` (continuing after F33)

| ID | Flow | Uses |
|---|---|---|
| **F34** | First run: tour → sign up → **claim test USDC (testnet) / starter $1 (mainnet)** → first action, including "all gone" and "already claimed" branches | NEW-S1, NEW-S2, A1–A5 |
| **F35** | Practice → go live: create an automation in Practice, receive "would have" notifications, read the report, flip to live | NEW-S3, NEW-S13, H2 |
| **F36** | Guest browse and deferred sign-up: watch the showcase agent, draft by voice, sign up at confirm, the draft survives a closed tab | NEW-S4 |
| **F37** | Approve from anywhere: request → answer on Telegram, voice or app → re-validation → executed, or "conditions changed"; expiry; "already answered elsewhere" | NEW-S8, NEW-S9, J6 |
| **F38** | Override a refusal ("do it anyway") with step-up, recorded as the user's call | NEW-S14 |
| **F39** | Exit: pause all → revoke agent → sweep to own wallet → close; plus "the app is gone" recovery | NEW-S17, N2, A8 |
| **F40** | Read a decision and share it (decision page → share card → public link on/off) | NEW-S12, NEW-S19 |
| **F41** | Weekly report arrives → open → drill into a graded action | NEW-S13 |
| **F42** | "Is my agent awake?": Right-now card → status page → "has not checked in" | NEW-S11 |
| **F43** | Infeasible amount → one-tap fix (too small for route or vault, fee share too high) | NEW-S6 |
| **F44** | Out of fees → "~0 actions left" → top up via starter, bridge or onramp → retry | NEW-S7, A5 |
| **F45** | Accept or re-accept the disclosure before the first money move (and on a new version) | NEW-S18 |

---

## 5. Product mistakes to avoid (cited)

1. **Stale copy after a policy change.** On 25 Sep, Shijima removed the "practice before live" waiting period (`docs-site/content/docs/start/live-or-practice.mdx:32`). The engine now allows any mode at any time (`packages/db/src/queries/engine.ts:254-256`). The UI still does the opposite in several places:
   - It shows a progress bar, "N of 24 practice hours done · Report not read yet", plus "It can go live when you choose" (`apps/web/features/desk/DeskPanels.tsx:287-307`; `packages/shared/src/copy/web.ts:626-631`).
   - The chat still has a refusal, "Going live needs 24 practice checks" (`packages/core/src/ask/confirm.ts:111-121`).
   - The copy file still has a `mode.locked` string (`web.ts:904-905`).
   - The done-card copy says it "starts in practice" (`packages/shared/src/copy/studio.ts:242`) while live is the default (`studio.ts:197`).

   **For us:** tie every rule's copy to one source, and review the copy whenever a policy changes.
2. **Contradictory cadence.** Some strings say the agent looks every five minutes (`web.ts:615`; `packages/shared/src/copy/app.ts:146`). Another says "The first one happens at the top of the next hour" (`web.ts:620`). The Telegram intro says "while the US market is shut" (`packages/shared/src/copy/telegram.ts:22`) for an agent sold as working 24/7 (`README.md:12`). **For us:** one source of truth for schedules, rendered into every string.
3. **A good feature written but never shipped.** "Hear it read back / How the agent understood you / What it found unclear" and the agent's self-introduction exist only as copy (`studio.ts:138-164`). A grep of `apps` and `packages` for their use returns nothing. **For us:** NEW-S23, and cut dead copy.
4. **Wallet-extension-only onboarding plus a gas chicken-and-egg.**
   - With no wallet found, the dead end is "Install MetaMask or Rabby" (`web.ts:112-113`).
   - Creating an agent needs ETH first (`studio.ts:222-227`). The gift fixes that only "while they last" ("All the free dollars are gone", `packages/shared/src/copy/gift.ts:7`, `:20`).

   **For us:** embedded wallets (A1–A2) plus USDC-as-gas and a paymaster or sponsorship remove both steps. Never make first value depend on a depleting pool.
5. **Per-IP "one claim per connection, ever"** (`docs-site/content/docs/start/free-dollar.mdx:22`) blocks everyone on a shared network. At a hackathon venue or demo day, that could be every judge. [INFERENCE] **For us:** use per-account + per-device + a daily budget, with an admin allowlist for judges.
6. **Single external channel.** Approvals expire in 1 h (`docs-site/content/docs/agent/modes.mdx:26`), and without Telegram "requests that need your answer only reach you here on the website" (`web.ts:1088`). There is no push or email. **For us:** J1 push first, Telegram and Discord second, email as fallback.
7. **English and New-York-time only** (53 hard-coded `'en-US'`; `telegram.ts:52`, `:235`). This conflicts directly with our D4 (whole-app language switch). Build the copy catalogue (P14) as i18n keys from day one.
8. **Surface sprawl.** The nav holds Wallet, Activity, Send, Receive, Fund, Withdraw, Bridge, Evidence, Agents, Markets, Strategies, Reels, Live, Settings, plus Rooms, Takes, Compare and Status (`app.ts:11-47`; `web.ts:1322-1418`). [INFERENCE] For a mobile-first, voice-first app, keep the social feeds out of the MVP; proof pages (NEW-S25) earn their place, reels do not.
9. **Consent by checkbox only.** The regional restriction is a single self-declaration checkbox (`web.ts:1158`; `apps/web/features/settings/Disclosure.tsx:65-73`). Fine for a hackathon, but label it as such and do not present it as compliance. [INFERENCE]
10. **The escape hatch still speaks developer.** The "withdraw without us" steps ask users to type raw base units ("$25 is `25000000`") and a 78-digit max value (`docs-site/content/docs/security/withdraw-without-us.mdx:27-29`). **For us:** if we offer an exit path, compute the numbers for the user.

---

### Gaps / not verified
- Live UI behaviour, animations and mobile layout were not observed. Everything above comes from code and copy only.
- Real usage numbers (claims, agents, copies): [UNKNOWN]. `/live` reads them from a database not in the repo.
