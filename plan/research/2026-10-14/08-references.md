# 08 - Real-product references for Kawase's key flows (2026-10-14)

Method and honesty note. I searched the Refero MCP (about 14 queries) and fetched a few live pages. Refero returned text descriptions and ids; I did not open the screenshot images. VERIFIED below means "a Refero description or a live page I fetched says this". Refero has no screens for Jumper, Relay, Bungee, Across, Hyperliquid, Lighter, Fomo, Bankr or OpenRouter (the closest hits were Kraken, Coinbase, Wise, Fuse). Those rows are marked REPORTED or IDEA and need a hands-on look. Cost: the public pages cost nothing. I did not check Refero's own plan limits, and I spent nothing.

Screen URL pattern: https://refero.design/screens/<id>. Flow: https://refero.design/flows/<id>.

## 1. Swap with route/venue choice and provider logos

Kawase today: routes collapsed to "N routes", plain-text names, no logos, user cannot pick, fees hidden (00-context, Report 1).

1. **Wise, "compare" sheet** - screen f5329fe5-2cfd-4132-82e9-9a395f8c7cff (VERIFIED, Refero text). Copy: a close-and-Share top bar, one title line, then stacked rows of provider logo on the left and the amount received on the right with a "how much worse than best" delta. Why it beats Kawase: it ranks by what you receive, shows every venue's logo at once, and nothing is collapsed.
2. **Fuse, swap review** - flow 8739, screens f061f428-d8b6-4612-8166-5068aa8a1420 (review), c7000f39-dcc7-4403-bf20-a4da05c5bc1a ("Preparing swap" with spinner) (VERIFIED). Copy: two amount rows split by a divider, then one list of route / slippage / fee / price impact / minimum received, then a bottom confirm button that turns into a spinner state. Also copy flow 8742 (slippage as its own small sheet). Why: details are on one calm screen and the button owns the loading state.
3. **Family, swap** - flow 2699, screens cb79f49c-736a-4452-b483-6b8b9cebeab4 (amount) and f9b6efe3-acc9-4de3-b75b-cde68faa0dc8 (confirm) (VERIFIED). Copy: paired token logos in the title, a collapsible "details" accordion, a biometric confirm button. Why: matches Senryo's "detail behind one disclosure".
4. **Reown AppKit swap card (web)** - screen d9a967d6-b99c-4059-bc75-e1518c7f0303 (VERIFIED). Copy: the compact desktop swap card (header controls, stacked inputs, price row, one "Review swap" CTA). Why: it is the desktop version Kawase lacks.
5. **Jumper / LI.FI widget** - REPORTED only. The docs page I fetched (https://docs.li.fi/widget/overview) lists "route priority settings" and "slippage controls" but nothing about the route cards, so I could not confirm the layout. IDEA: open jumper.exchange once by hand and copy the "Fastest / Cheapest" tags on route cards.

Take-away (IDEA): replace "N routes" with a Wise-style ranked list of venue rows (logo, name, you-receive, delta to best, ETA). Tapping a row selects it; "Best" is just the preselected top row.

## 2. Bridge comparison with provider logos, fees and time

Kawase today: the screen the Swap tab opens (old /bridge) shows other providers as "Quote only"; the real multi-provider flow (/move) has logo/fee/ETA rows but no Home entry (Report 1).

1. **Copperx "Deposit fund" bridge modal** - flow 8894, screens bb22ea58-3993-48e1-aa3a-2b35c1309ad6 (amount, "best return" receive amount, gas-subsidy toggle, "Review bridge"), d9ce408a-4b2a-4b70-b653-5ee57481f83d (expandable fee/details), 09948e77-45b2-4e9b-8c90-a2bd83f81344 (relay fee and status messages), eb79095c-7f3d-44a2-88e8-7f58dccab175 (success with Done / See details) (VERIFIED). Copy: one hero "you receive" figure with a "best return" badge, fees behind one accordion, a status checklist during the bridge, a success sheet with two buttons. Why: it is the only real bridge flow I found end to end, and it shows the whole journey, which /move's 4-step tracker also needs.
2. **Wise compare sheet** (screen f5329fe5..., see flow 1). Same list pattern, applied to bridges: logo, net received, ETA chip.
3. **Phantom, provider quotes list** - flow 3710, screen a2a483c1-4402-4adc-ac21-6727f2c199cd (VERIFIED, Refero text). It is a buy flow, but its quote list is the same idea: amount first, payment method second, then partner quotes.
4. **Jumper, Relay, Bungee, Across** - not in Refero. REPORTED that Jumper shows route cards with tags; I did not verify. IDEA: build the Kawase list as one component for swap and bridge ("RouteList": logo, net received, ETA, fee behind a chevron) so the owner's "bring on the bridge ecosystem alongside their logos" is one screen, and put a Bridge button on Home.

## 3. Buying crypto with Apple Pay inside a wallet

Kawase today: opens Circle's hosted page in a browser; owner wants our own design and loading states.

1. **UGLYCASH, "Buy Crypto with Apple Pay"** - flow 11223 (7 screens) (VERIFIED, Refero text). Steps: Portfolio > Transfer > Add funds options (5bec2e18-6164-41be-a3d9-18a54bfea4ee) > token picker (7c929985-5a55-4e69-bb63-c87295308eef) > USD keypad (9d8b20d2-d420-4931-b9b5-0ac478483725) > Apple Pay button appears once an amount is entered (a0a8eef5-33be-4735-b753-2a78c26de29d) > native Apple Pay sheet (64498f5b-1272-4cbd-85fd-50a3fcac760c) > processing (eec29930-db75-4068-aae1-ce5352959ec4). Copy: the Apple Pay button only appears after a valid amount, and the processing screen is the app's own. Why: this is exactly "Apple Pay without leaving the app".
2. **Phantom, buy Bitcoin** - flow 3710 (VERIFIED, Refero text). Copy: validation state "below minimum" (77faa526-3431-4713-8baa-2006e800a05d), preset amounts (7036e49d-c4ab-4d23-a251-59de708d08cc), input-unit toggle USD/BTC (26fbf3bc-4c81-4809-b72d-8e3b8f795a69), payment method list, partner quotes list. Anti-pattern: its last step hands off to Stripe/Link checkout (9, 10), which is what Kawase does today. Copy steps 1-8, not 9-11.
3. **Apple TV "Add Account Balance"** - flow 11104 (VERIFIED): preset chips plus "Other", then keypad, then the Apple Pay sheet, then a success screen that shows the new balance. Copy the success-shows-new-balance moment.
4. **Coinbase Wallet, Rainbow, Fomo, Revolut, Cash App** - not found in Refero. No claim made.

Mechanism note (REPORTED from Report 2, not rechecked): the in-app build path is Transak headless Apple Pay or MoonPay's inline button; the demo path is Circle's sandbox in a WebView sheet. The UGLYCASH flow is the screen design for any of them.

## 4. AI agent that acts for you (feed, approvals, autonomy)

1. **IFTTT Activity tab** - screen b8c47a4d-0209-45d9-baa1-90e97d077820 (VERIFIED, Refero text). Copy: a flat feed of entries, each with icon, bold status line, timestamp and one action button. Why: it is the simplest "what did my automation do" list; Kawase has no feed.
2. **Structured AI plan sheet** - flow 3287, screens bcb1b69c-1302-44db-ba89-0183c19461db, 07241b9f-1102-4131-b525-7d271dfefb18, 26f45356-2e52-4e7a-b01b-3bb40fa8380f (VERIFIED). Copy: the agent proposes a plan card with "Accept All", an "AI can be wrong" note, per-task cards, thumbs up/down, then a feedback sheet. Map it to "agent proposes 3 actions, you accept all or one at a time".
3. **Grok "Thought for 51 seconds"** - screen 630c7c05-e9d1-4a9f-94d3-af0eb841b626 (VERIFIED): collapsible reasoning sections with ticks and query chips. Map it to "how the agent chose this route" behind one disclosure.
4. **Clearful AI Preferences** - screens a89e90d4-5cc1-45bd-b288-5e2f20a6d7e0 and b8128c0b-44b2-402c-bc2f-182f47d4cd59 (VERIFIED): one toggle card plus plain text on where AI is used and what happens to data. Copy for the autonomy settings top row.
5. **Bankr** - REPORTED only (search summaries; no first-party docs read): chat-driven on X/Farcaster, creates a Base wallet, "screens transactions before execution". I found no information about its approval prompts, limits or activity log, so nothing to copy.
6. **Mitoshi DecisionTimeline / Baku approval card with timer (local code)** - already in 00-context Reports 3-4; use these for the crypto-specific parts.

Why these beat Kawase: it has chat and cards but no ledger of what the agent did and no one-screen answer to "how much can it do without asking". IDEA: autonomy as three presets (Ask every time / Within my allowance / Fully trusted up to $X), each shown as one card with a plain sentence.

## 5. Marketplace of paid API/agent services

1. **Circle Agent Marketplace** - https://agents.circle.com/services (VERIFIED, fetched 10-14). Layout: hero "Discover what your agent can do"; All / 1P (direct from provider) / 3P tabs; a table with sortable Service and Endpoints columns, a Description and Actions column; no search box, no category list, no price column. A seller block ("Your API is a storefront", a free score check) and a code sample showing `gateway.require("$0.01")` returning HTTP 402. Copy: the 1P/3P trust tabs. Don't copy: no price or search; Kawase needs both (median price $0.10, 2,195 listings per Report 2). The page also has "Copy starter prompt" style agent-directed prompts; I did not act on them.
2. **x402scan** - https://www.x402scan.com (fetch returned only the title; layout NOT verified). Report 2 cited it as a UX reference; I could not confirm anything beyond that.
3. **Intercom App Store** - screen 3e4b8741-f5b8-4aa6-8f04-5bbd34496b76 (VERIFIED): left category sidebar, top search, 4-column card grid under "Popular". Copy for desktop.
4. **Zendesk Marketplace** - screen 227126bc-53a8-49d5-b6e3-161f75d6500e (VERIFIED): left filter sidebar, removable filter chips, sort dropdown, 3-column cards, pagination. Copy the removable chips: they map to Kawase's discovery filters (category, max price, Gateway or plain).
5. **ElevenLabs integrations** - screen b5d459c8-9baf-41a9-ad3a-477a61f814f4 (VERIFIED): category jump-list on the left, 3-column logo cards. **Rork model table** - screens 6ef91f56-ced9-446c-aa3f-1d63561d2602, 701035e3-e774-4c92-8258-0c17eb5e1183 (VERIFIED): filter chips, search, sortable pricing table; the closest stand-in for an OpenRouter-style list.
RapidAPI, Replicate, Apify, OpenRouter: not in Refero; no claim made.

Why: today Kawase has no screen at all. IDEA: phone = category chips + search + rows with price chip; desktop = Intercom sidebar + grid; each row has a "Try for $0.10" button that shows the 402 price before paying.

## 6. Perps long/short, phone and desktop

1. **Kraken Pro** - screens 240a832f-54ad-4bda-978f-65c0fd1aa85f, cd4884df-7bf5-4c8e-9814-c604e1e9f6f0 (VERIFIED, Refero text): desktop three-column layout: order form left, order book middle, chart right, status bar at the bottom, tabs for balances / orders / positions / history. Copy for the desktop board.
2. **Coinbase Advanced** - screen 10b9ce87-5585-4fe7-8e34-f3fd0e350645 (VERIFIED): chart left, book middle, BUY/SELL panel right, and a "Verify your ID" blocker inside the order panel. Copy: the blocker lives in the panel where the CTA would be.
3. **Coinbase mobile advanced trade** - screen 0494c950-742d-4a82-b12a-82acd85fcf36 (VERIFIED): search, filter pills, market rows.
4. **Phantom perps** - REPORTED (press coverage, July 2025: https://www.theblock.co/amp/post/361533/phantom-wallet-perp-trading-hyperliquid): long/short, up to 40x, stop-loss and take-profit, fund with SOL that auto-converts to USDC, managed from the Home tab; later a desktop terminal with TradingView charts (https://www.cryptometer.io/news/phantom-launches-desktop-trading-terminal-with-perps-to-challenge-pro-crypto-platforms). Coverage did not describe the leverage control, so I make no claim about it.
5. **Wealthsimple order ticket (web)** - screen 513dc9aa-2d88-474d-a505-be5bb6760045 (VERIFIED): table left, order ticket right.
Hyperliquid front-ends, Lighter, Fomo, Robinhood: not in Refero. Why this beats Kawase: one venue, phone layout centred on desktop. IDEA: reuse one `TradePanel` component, as a bottom sheet on phone and as the right column on desktop.

## 7. Wallet onboarding that delays sign-in

1. **Phantom new wallet** - flow 3694 (33 screens) (VERIFIED, Refero text). Intro carousel (6 slides) > account choice (Apple/Google/email or seed phrase) > Face ID > notifications prompt last (1f44151a-1962-495a-9a34-24077cf257c9). Copy: notification permission is asked after the wallet is already on Home.
2. **Fuse** - flow 8729: carousel (Spend / Save / Invest) first, Sign in with Apple second, key setup after. Copy the value-first carousel; avoid its length (22 screens).
3. **UGLYCASH** - flow 11202 (19 screens): carousel > sign-in > phone code with auto-fill (efa7daa7-5426-4379-9744-c5beb0bdf43e) > username > terms > optional Face ID > Home with a demo balance (ad1ed2de-20c7-4f3e-9c0a-b8a0cb26f25f). Copy the demo balance: the user lands on a usable Home.
4. **Family** - flow 2648: wallet created before any backup; the backup comes later via a "Wallet ready, Back Up Now" card (flow 2668, screen 1f7014a2-b963-4bc2-9b14-4a412e0b6ac8). Copy: backup as a card on Home, not a gate.
Why this beats Kawase: Kawase has 83 guests and 2 signed-up accounts (00-context), so sign-in is the drop-off. IDEA: guest lands on Home with the agent chat and a demo balance; sign-in appears only when the first real money action is requested, with email code as the only step.

## Cross-cutting patterns (all IDEA, derived from the above)
- One RouteList component for swap, bridge, buy-provider quotes and yield.
- A Buy flow with the Apple Pay button revealed after the amount (UGLYCASH).
- An Activity feed (IFTTT) plus plan cards (Structured) as the agent's front door.
- Blockers inside the CTA (Coinbase Advanced), which Report 4 also found in Baku.

## Gaps to close by hand (15 minutes)
Open jumper.exchange, relay.link, x402scan.com, app.hyperliquid.xyz, and the Phantom app once, and note the route cards, Fastest/Cheapest tags, and the leverage control. Refero couldn't supply these.
