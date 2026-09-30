# Fintech UX analogs: what mainstream money apps do for recurring payments, contacts, limits, alerts and AI assistants

Purpose: show the UX patterns that mature consumer fintech apps (Venmo, Cash App, PayPal, Revolut, Wise, Robinhood, Coinbase, BofA Erica, Monzo, Klarna) ship, so the Arc agent does not miss any.

Sources (primary unless noted; raw copies under `.firecrawl/product/`):
- Venmo: https://help.venmo.com/cs/articles/schedule-send-payments-vhel357 ; https://newsroom.paypal-corp.com/2024-10-09-Venmo-Introduces-the-Ability-to-Schedule-Payments-and-Requests ; https://help.venmo.com/cs/articles/personal-profile-payment-limits-vhel188 ; https://help.venmo.com/cs/articles/splitting-sharing-purchases-vhel189 ; https://help.venmo.com/cs/articles/setting-up-a-group-vhel106
- Cash App: https://cash.app/help/us/en-us/31091-schedule-automatic-purchases (`.firecrawl/product/cashapp-autoinvest.md`) ; https://cash.app/help/us/en-US/3109-bitcoin-custom-orders (`cashapp-custom-orders.md`) ; https://investors.block.xyz/investor-news/news-details/2025/Introducing-Cash-App-Releases-See-Whats-New/default.aspx ; https://www.consumerfinance.gov/archive/newsroom/cfpb-orders-operator-of-cash-app-to-pay-175-million-and-fix-its-failures-on-fraud/
- PayPal: https://s205.q4cdn.com/875401827/files/doc_news/PayPal-Ushers-in-a-New-Era-of-Peer-to-Peer-Payments-Reimagining-How-Money-Moves-to-Anyone-Anywhere-2025.pdf (`paypal-p2p-2025.txt`) ; https://newsroom.paypal-corp.com/2025-10-28-PayPal-Launches-Agentic-Commerce-Services-to-Power-AI-Driven-Shopping
- Revolut: https://www.revolut.com/news/revolut_enters_new_era_of_money_intelligence_with_launch_of_ai_assistant/ (`revolut-air-launch.md`) ; https://www.fintechweekly.com/news/revolut-air-ai-assistant-uk-customers-launch-2026 ; https://help.revolut.com/help/future-payments-subscriptions/scheduled-and-recurring-transfers/setting-up-a-scheduled-transfer/ ; https://help.revolut.com/help/adding-money/with-money-from-friends-or-relatives/splitting-bill/ ; https://help.revolut.com/en-US/help/profile-and-plan/profile-plan/notifications/how-do-i-change-the-language-in-my-revolut-app/ ; https://www.revolut.com/news/revolut_launches_ai_feature_to_protect_customers_from_card_scams_and_break_the_scammers_spell/
- Wise: https://wise.com/help/articles/2978063/what-are-scheduled-transfers ; https://www.wise.com/help/articles/2978084/what-is-confirmation-of-payee-uk (`wise-cop.txt`) ; https://wise.com/us/features/auto-conversion ; https://wise.com/gb/tools/exchange-rate-alerts
- Robinhood: https://cdn.robinhood.com/assets/robinhood/legal/cortex_assistant_disclosure.pdf (`robinhood-cortex-disclosure.txt`) ; https://robinhood.com/us/en/newsroom/introducing-strategies-banking-and-cortex/ (`robinhood-cortex-launch.md`) ; https://robinhood.com/us/en/support/articles/2G77XtQsBQxJ9ofzqgJhAn/ ; https://robinhood.com/us/en/gold/
- Coinbase: https://help.coinbase.com/en/coinbase/trading-and-funding/buying-selling-or-converting-crypto/how-can-i-create-or-cancel-a-recurring-transaction (`coinbase-recurring.md`) ; https://help.coinbase.com/en/coinbase/trading-and-funding/pricing-and-fees/what-are-price-alerts (`coinbase-price-alerts.md`) ; https://help.coinbase.com/en/coinbase/trading-and-funding/advanced-trade/order-types (`coinbase-order-types.md`)
- Bank of America Erica: https://info.bankofamerica.com/en/digital-banking/erica ; https://newsroom.bankofamerica.com/content/newsroom/press-releases/2025/08/a-decade-of-ai-innovation--bofa-s-virtual-assistant-erica-surpas.html ; https://newsroom.bankofamerica.com/content/newsroom/press-releases/2026/03/bofa-ai-and-digital-innovations-fuel-30-billion-client-interacti.html
- Monzo: https://monzo.com/blog/introducing-our-industry-first-security-tools ; https://monzo.com/help/monzo-fraud-category/fraud-warnings ; https://monzo.com/help/Account%20Security/trustedcontacts
- Klarna: https://www.klarna.com/international/press/klarna-ai-assistant-handles-two-thirds-of-customer-service-chats-in-its-first-month/ ; https://www.digitalcommerce360.com/2026/05/20/klarna-ai-shopping-search-app-openai-chatgpt/
- Zelle/CFPB: https://www.cnbc.com/2025/03/04/cfpb-drops-jpmorgan-bank-of-america-wells-fargo-lawsuit.html

Verified: 2026-09-29

Note on method: WebFetch/curl was blocked (403/Cloudflare) for help.coinbase.com, help.revolut.com, cash.app and klarna.com. Where a page was later scraped via Firecrawl it is [VERIFIED]. Where I saw only a search-engine snippet of an official page, the claim is tagged [REPORTED].

---

## 1. AI assistants inside fintech apps (the direct analogs)

| Product | Launched / status | Can it move money? | Confirmation model | Channels / languages |
|---|---|---|---|---|
| **BofA Erica** | Launched 2018. >3B interactions and ~50M users by Aug 2025 [VERIFIED, BofA newsroom 2025-08]. Over 3.2B interactions by Mar 2026 [REPORTED, BofA 2026-03 release via search]. | Yes, limited: "send and request money with Zelle®", bill reminders and scheduling, card lock/unlock, and Merrill trade placement for select accounts [VERIFIED, erica page]. | In-app flow [INFERENCE: confirmation screen not documented on the page]. | Mobile app only, voice and text. **"Erica is only available in English"** [VERIFIED, erica page]. |
| **Revolut AIR** | UK rollout 9 Apr 2026 [VERIFIED, Revolut newsroom]. Europe/Ireland rollout Sep 2026 [REPORTED, thepaypers/irishtechnews]. | Card controls (freeze, limits), pausing recurring payments, buying eSIMs, subscription management [VERIFIED for freeze/eSIM/subscriptions; "pause recurring payments" is REPORTED, pymnts]. No P2P send is documented [UNKNOWN]. | "Sensitive actions require biometric approval before they execute" [REPORTED, fintechweekly]. | Opened by swiping down from the middle of the home screen, or Profile → Chats → AIR [VERIFIED]. The AI provider is undisclosed; "zero data retention" with third-party AI partners [VERIFIED]. Voice and languages: [UNKNOWN]. |
| **Cash App Moneybot** | Announced 13 Nov 2025, "available to a select group of customers" [VERIFIED, Block IR]. | Insights and suggestions. Proactively suggests actions, e.g. splitting a recent bill with a contact [REPORTED, yahoo/techcrunch]. | "Moneybot never acts on its own… every payment, transfer, or trade requires explicit confirmation before anything moves" [REPORTED, quote via search of digitaltransactions]. | In-app chat [REPORTED]. |
| **Robinhood Cortex Assistant** | Cortex was announced 27 Mar 2025 as insights-only: "Robinhood Cortex is not placing trades for you" [VERIFIED, newsroom]. The mid-2026 disclosure (doc id 20260616) says the Assistant can "initiate certain supported transactions using natural language text or voice input" [VERIFIED, disclosure PDF]. | Trades and fund transfers, watchlists and **alerts** [VERIFIED, disclosure §1, §6]. | Presents "a pre-filled order ticket or confirmation screen"; "No transaction will be executed without your explicit confirmation on the final order confirmation screen" [VERIFIED, §6]. | iOS only, Gold subscribers only [VERIFIED §1]. Text **and voice** [VERIFIED]. Its web search is restricted to Robinhood-owned sites, investor-relations sites and government sites, with **no social media** [VERIFIED §5]. Unsupported requests hand off to the support chatbot "with conversation context" [VERIFIED §7]. |
| **Klarna AI assistant** | Customer-service assistant launched Feb 2024 (OpenAI) [REPORTED]. Klarna shopping app inside ChatGPT, May 2026 [REPORTED, digitalcommerce360]. Klarna re-hired human agents in 2025 after going AI-first [REPORTED, usefini]. | Refunds, returns and payment questions [REPORTED]. | — | [UNKNOWN] |
| **PayPal** | Agentic-commerce services launched 28 Oct 2025; PayPal checkout inside ChatGPT in 2026 [REPORTED, PayPal newsroom title and techcrunch]. | This is merchant/agent infrastructure, not a consumer chat assistant [INFERENCE]. | — | — |

Takeaways [INFERENCE]:
- Every bank-grade assistant that moves money turns the chat into a **pre-filled, deterministic confirmation screen** plus biometric/PIN approval. None executes directly from text.
- The assistants launched **read-only (insights) first** and added actions later (Robinhood's 2025→2026 path; Moneybot's limited release).
- They bound the model's data sources (Robinhood restricts web search and blocks social media) and hand off to human or support channels with context.
- Erica is still English-only after 8 years. **Multilingual voice would be a real differentiator.**

## 2. Scheduled and recurring transfers

| Product | Frequencies | Edit / pause / cancel | Insufficient funds | Reminders |
|---|---|---|---|---|
| **Venmo** (P2P payments *and* requests; launched Oct 2024) | Weekly, bi-weekly, monthly [VERIFIED, PayPal newsroom] | Created from Pay/Request → **Schedule**, with frequency and end date [VERIFIED help]. Edit or cancel "before 11:59 PM PT the day before" [VERIFIED help]. | Uses the Venmo balance if it covers the **full** amount, otherwise the backup method (bank, debit or credit card) [VERIFIED]. | Email when created [VERIFIED]. Email and push "a day ahead" [VERIFIED newsroom]. |
| **Wise** | One-time (≥2 days ahead) or a recurring "standing order" [VERIFIED]. Monthly, bi-weekly or weekly [REPORTED snippet]. | **"You cannot edit a schedule once it is set"**: cancel and recreate, cancel by 23:59 the day before [VERIFIED]. | Fails when that *specific currency* balance is short. "Wise does not automatically pull from your other currencies" [VERIFIED]. A recurring transfer still tries on the next date [REPORTED snippet]. | Reminder to fund before the date [REPORTED snippet]. Processed 07:00–09:00 in the profile timezone [VERIFIED]. |
| **Revolut** | Scheduled and recurring transfers, managed from a calendar icon on the Payments tab [REPORTED snippet of help page]. | Managed in "Scheduled payments" [REPORTED]. | Fails if the source currency account is short, with no auto-convert. "Once a recurring or scheduled transfer fails, you'll need to send the transfer manually" [REPORTED snippet]. | Fees shown before setup [REPORTED]. |
| **Coinbase recurring buy** | Weekly, the 1st and 15th, monthly [VERIFIED, `coinbase-recurring.md`] | **Cannot alter amount or frequency**: cancel and recreate [VERIFIED]. Can pay from a USDC/USD cash balance [VERIFIED]. | Buy fails and the user is notified; the schedule is not auto-disabled [REPORTED, third-party]. | **The first buy executes immediately at setup** [VERIFIED]. |
| **Robinhood recurring investments** (stocks and all crypto) | e.g. weekly on Monday [VERIFIED] | Can **pause**, **end**, and edit amount, schedule and payment method [VERIFIED]. Auto-pauses if the bank is unlinked [VERIFIED]. | Buying power plus a **backup payment method**; otherwise it waits for the bank transfer (up to 5 business days) or is skipped with a stated reason [VERIFIED]. | Crypto processed daily 5:30–7:00 PM ET [VERIFIED]. |
| **Cash App Auto Invest** (BTC) | Daily, weekly, every two weeks, monthly; $1 minimum [VERIFIED] | Cancel from the Bitcoin screen [VERIFIED]. | [UNKNOWN] | No fee on Auto Invest [REPORTED, cash.app/bitcoin/fees snippet]. |

Pattern [INFERENCE]: the best UX (Robinhood) supports pause/resume, in-place edits, a backup funding source and an explicit "skipped because X" reason. The weakest (Wise, Coinbase) forces cancel-and-recreate. Common rules: a cutoff for changes the day before, and a reminder about 24 hours before execution.

## 3. Contacts, payee resolution and "paying the right person"

- **Handles**: Cash App uses $Cashtag [VERIFIED, Block IR]. Revolut uses the Revtag (a username), with phone contacts and QR codes [REPORTED, Revolut payments page snippet]. Venmo uses @username, phone and QR [REPORTED].
- **Venmo recipient check**: if the two users haven't paid each other before, Venmo can prompt for the **last 4 digits of the recipient's phone** and show a larger profile photo on the confirmation screen [REPORTED, cheddar/totaldefense]. It recommends scanning the recipient's QR code as the safest path [REPORTED].
- **Confirmation of Payee (Wise, Monzo; UK)**: on a new recipient, Wise shows **Full match / Partial match ("Mick Jager" vs "Mick Jagger") / No match / Unavailable**. If you continue without a match, "we may not be able to recover your money" [VERIFIED, wise-cop.txt]. Monzo has dedicated help flows for "details don't match" and "can't check" [REPORTED, monzo help titles].
- **PayPal links** (15 Sep 2025): a private, **one-time link** created for one payment or request, shareable in any chat. "Unclaimed links expire after 10 days", and the sender can remind or cancel before the link is claimed [VERIFIED, paypal-p2p-2025.txt]. The same release says crypto (BTC, ETH, PYUSD) will be sendable P2P to PayPal, Venmo and external wallets [VERIFIED: announced, not confirmed live].

## 4. Request money, split bills, groups

- **Venmo split**: pick a past transaction and select people to send a charge request to. You can adjust amounts, remind people or delete the request, and pending requests appear in a "Pending" list [VERIFIED help]. **Venmo Groups** (Nov 2023) tracks ongoing shared expenses with custom splits, up to 30 members, and "settle up" [REPORTED CNN; help page exists].
- **Revolut split bill**: split evenly or adjust per person. Contacts get a request notification to accept or decline, and the money arrives instantly [REPORTED snippet].
- **Cash App Pools** (Aug 2025) are group-funding pools with contributor comments. "1.7 million customers have used pools and 19% of contributors are first-time connections" [VERIFIED, Block IR].
- **Scheduled requests**: Venmo can schedule recurring *requests* as well as payments [VERIFIED newsroom], e.g. monthly rent split.

## 5. Price alerts, limit orders, conditional automation

- **Coinbase price alerts**: star an asset to add it to the watchlist, then bell → **Add Alert** → above/below target. Choose push, in-app and/or email, with a frequency setting. The help page notes "Price alerts are only notifications… They do not place an order" [VERIFIED].
- **Coinbase order types**: market, limit, stop-limit, bracket, TP/SL, **TWAP**. Time-in-force options are GTC, GTT, GTD and IOC. Price-shortcut chips (MID, BID, 1%, 5%). A market-order "protection point" of 10% (1% for stable pairs) against slippage [VERIFIED, coinbase-order-types.md].
- **Cash App Custom Orders**: a slider or keypad to set the BTC trigger price, then amount and **expiry period**, then review → Confirm. Funds are **reserved from the balance at placement** and returned on cancel or expiry. Use cases named: buy the dip, capture gains, limit losses, buy the rally [VERIFIED].
- **Wise rate alerts and Auto-conversion**: an alert by email or push when an FX target is hit [REPORTED snippet]. Auto-conversion converts automatically "When your desired rate is met, or if a better rate becomes available", then notifies. The rate must be live ≥1 minute, and it pauses at weekends [VERIFIED].
- **Robinhood Cortex**: a scanner widget monitors the market and users can write custom indicators in natural language [REPORTED, algoalpha]. The Assistant can "create and manage watchlists and alerts" [VERIFIED disclosure].

## 6. Spending insights, notifications, history

- **Erica** searches transactions by category, sends weekly spending snapshots, alerts on recurring-charge and membership price increases, tracks refunds, and can "find companies that have your card information stored" [VERIFIED]. It has delivered 1.7B+ proactive insights [VERIFIED 2025 release].
- **Moneybot**: "show me my monthly income, expenses, and spending patterns", with savings suggestions [VERIFIED Block IR].
- **Revolut AIR**: e.g. "a granular breakdown of last month's coffee spend" and trip budgets [VERIFIED].
- **Robinhood Cortex Digests**: AI summaries of why a stock or portfolio moved [REPORTED, robinhood learn page title]. Strategies deliver insights "in writing and via audio recording" [VERIFIED newsroom].

## 7. Limits, friction and scam defenses

- **Venmo**: unverified accounts $299.99/week; verified accounts up to $60,000/week. Limits are **rolling 7-day** windows ("counts against a limit for exactly one week from the time of authorization") [VERIFIED].
- **Monzo security trio** (28 Jul 2024), which applies above the user's **daily allowance**; users must set up at least 2 of the 3 [VERIFIED blog]:
  - **Known Locations**: large sums can only be sent from home or work.
  - **Trusted Contacts**: up to 3 contacts who also use Monzo [REPORTED]. The payment is held until the contact reviews it, but only the owner can approve it.
  - **Secret QR code**: kept offline and scanned to authorize.
  - Monzo also shows **scam warnings** based on payment details and may block the payment outright [VERIFIED help]. **Call Status** shows in-app whether Monzo is really on the phone [REPORTED].
- **Revolut scam intervention** (Feb 2024): an ML model detects that the user may be under a scammer's "spell". It routes them through an in-app questionnaire and educational stories, and can hand off to a fraud specialist chat. Reported result: a 30% drop in investment-scam losses [REPORTED, revolut newsroom via search; page 403].
- **Coinbase**: slippage protection points and limit-price bands (see §5) [VERIFIED].
- **Robinhood Assistant**: "Not investment advice" and "Verify before acting" disclaimers [VERIFIED].

## 8. Business models [mostly REPORTED]

- **Venmo/PayPal**: F&F transfers are exempt from 1099-K reporting [VERIFIED, PayPal release]. Fee schedule not checked [UNKNOWN].
- **Cash App**: bitcoin fees and spread, but zero fee on Auto Invest, Round Ups and Paid-in-Bitcoin [REPORTED, cash.app/bitcoin/fees snippet].
- **Robinhood**: Cortex Assistant is gated behind **Robinhood Gold** ($5/month, or $50/year billed annually) [REPORTED, robinhood.com/gold snippet and finder]. **An AI assistant as a paid-tier perk** is the key pattern.
- **Revolut**: AIR is included in the app [VERIFIED; no price mentioned]. Plan tiers exist [UNKNOWN pricing].

## 9. What users praise and complain about [REPORTED]

- **Praise**: Erica adoption (Q2 2026: 24.6M active users, +23% YoY) [REPORTED, yahoo finance summary]. Venmo scheduled payments were covered as "catching up to other P2P apps" [REPORTED, emarketer]. Cash App Pools reached new users (19% first-time connections) [VERIFIED].
- **Complaints**:
  - **P2P payments are final**: Venmo friends-and-family payments are not covered by Purchase Protection, and payments to the wrong person usually cannot be reversed [REPORTED, consumerreports/wise blog].
  - **Frozen funds and canned support replies**: Venmo reviews on Trustpilot and ConsumerAffairs [REPORTED]; Revolut account freezes (MSE forum), and Revolut named in 9,793 UK Action Fraud reports [REPORTED, yahoo UK].
  - **Regulatory**: the CFPB ordered Block to pay up to $175M ($120M refunds + $55M penalty) for Cash App's weak security and dispute handling (Jan 2025) [REPORTED, CFPB archive]. The CFPB sued Zelle's operator and 3 banks over $870M in losses (Dec 2024), then **dropped the suit with prejudice on 4 Mar 2025** [REPORTED, CNBC].
  - **Klarna** walked back AI-only customer service in 2025 [REPORTED].

---

## UX patterns to port to an Arc agent [INFERENCE, derived from the evidence above]

1. **Chat → deterministic confirmation card → biometric/passkey approval.** Never execute straight from text (Robinhood §6, Moneybot, Revolut AIR). The card shows amount, recipient, fee, network, and the resolved address with its checks.
2. **Launch assistant actions in stages**: read-only insights first, then a small whitelist of actions (Robinhood 2025→2026).
3. **Recurring automations with full lifecycle controls**: create, preview the next run, pause/resume, edit in place, skip once, and end date or count. Add a backup funding source (e.g. swap from another token if USDC is short), a reminder ~24h ahead, a change cutoff, and an explicit "skipped because…" notice (Venmo + Robinhood; avoid Wise/Coinbase's cancel-and-recreate).
4. **Decide the first run explicitly**: say whether "every Tuesday" runs now or next Tuesday. Coinbase runs one immediately, which surprises users [INFERENCE].
5. **Recipient-safety checks in the style of Confirmation of Payee**: flag a first-time recipient, show a match/partial/no-match against the saved contact name or ENS-style name, compare address prefix and suffix, and optionally ask for a shared secret like Venmo's last 4 phone digits. Say clearly that an on-chain transfer can't be reversed.
6. **Contacts from multiple identifiers**: handle, QR, phone, and a recent-recipients list. Offer one-time claim links for recipients with no wallet (PayPal links: private, one-time, expire after 10 days, cancel or remind before claim).
7. **Requests and splits**: a request card, split evenly or custom, pending list with remind/cancel, scheduled recurring requests (Venmo), and group pools (Cash App Pools).
8. **Price alerts that are separate from orders**, plus conditional orders with an expiry and funds reserved at placement (Cash App Custom Orders). Add slippage protection, and FX-style auto-convert "at target or better" (Wise) for stablecoin pairs such as USDC↔EURC on Arc.
9. **Rolling-window spending limits** (Venmo 7-day), a per-transaction cap, and a daily allowance. Above the allowance, add step-up friction: trusted-contact review, a known device or location, or an offline recovery code (Monzo trio).
10. **Scam-intervention flow**: when a risky pattern appears (new recipient + large amount + urgency language in the chat), ask short questions ("Is someone guiding you right now?") and show a warning story before allowing the send (Revolut, Monzo).
11. **Proactive insights and notifications**: weekly spending snapshot, recurring-charge increases, balance trends, "why did this move" digests, audio summaries (Erica, Robinhood Strategies). Let users choose channels (push, email, in-app; Telegram and Discord in our case) and frequency (Coinbase).
12. **Bounded agent context**: restrict web and tool sources, don't ingest social media blindly, and hand off to human support with conversation context when out of scope (Robinhood §5/§7).
13. **Multilingual from day one**: Erica is English-only [VERIFIED]. Revolut's app UI supports ~24 languages [REPORTED list], but AIR's language support is not documented [UNKNOWN]. Voice plus non-English is an open gap.
14. **Privacy statement in the UI**: "only accesses data you already see" and zero data retention with the LLM provider (Revolut AIR).
15. **Business model option**: gate the advanced agent (automations, conditional orders) behind a subscription tier (Robinhood Gold), and keep the basics free.

Gaps: I could not open help.revolut.com, klarna.com or the Revolut scam-feature page directly (403), so those claims rely on search snippets. I found no official source for Cash App scheduled P2P payments (third-party blogs contradict each other) or for Chime. Moneybot's live capabilities after limited release were not confirmed.
