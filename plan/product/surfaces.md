# Surface pass: before → after → why

Purpose: the answers in `capability-matrix.md` and `rules.md` change every screen. Each surface is written top to bottom as it must be, with what it shows today and the rule that forces the change. Components come from the sourced 21st.dev picks (plan §C) on Lime on Ink tokens. Motion uses `packages/config/src/motion.ts`.
Sources: the route list `apps/mobile/src/app/**`, the screens in `apps/mobile/src/screens/*`, the explorer surveys of 2026-10-02, Senryo's trading design (metropolis, read-only).
Verified: 2026-10-02

## Shell
**Dock**
- **Before:** Home · Chat · orb · Activity · Profile.
- **After:** **Home · Markets · orb · Chat · Activity**. Profile and settings open from the **avatar at the top-left of every tab header**.
- **Why:** trading (spot, memes, perps) needs a home, as in Phantom's Trade and Fomo's markets. Activity stays one tap away (Abu: never inside Settings).

**Header (every tab)**
- **Before:** Home only: network pill, bell, avatar.
- **After:**
  - avatar (top-left) · network pill (the toggle) · inbox bell with count;
  - guests also get the language pill and a **Sign in** pill;
  - the header collapses on scroll into a compact bar (mark · total · network).
- **Why:** R8, R13, D15.

**Fan (the + button)**
- **Before:** Send · Receive · Swap · Request · Fund.
- **After:** **Add money** (Buy with Apple Pay first) · Send · Receive · Swap · Request.
- **Why:** money in is a hub, not a faucet; Buy is the primary way in (D36).

**Network pill sheet**
- **Before:** a simple switch.
- **After:**
  - two rows, each with its network's total balance (the Senryo pattern);
  - consent sheet on the first mainnet switch;
  - "switching cancels the payment you're reviewing" when a draft is open.
- **Why:** R8.

## Home
**Before** (`home-screen.tsx`):
- signed in: the hero is the **USDC balance**, then an EURC row; Send / Fund / Receive; first steps; an Earn entry (only when ready); tiny starter chips; Recent;
- guest: "Your money agent on Arc", Try in chat, Sign in, two tiny chips.

**After, top to bottom:**
1. **Header** (as above).
2. **Balance hero:**
   - the **total of every asset, every chain, every position**, in the display currency;
   - number ticker, 24h change (mint/red), Balance Chart with 1D/1W/1M/1Y chips;
   - a tap opens the **breakdown sheet**: *Available* (by asset) · *In positions* (earn, borrow, perps, LP) · *On other chains* (with Bring to Arc).
3. **Action row:** **Add money · Send · Swap · Withdraw** (real icons, one lime primary).
4. **First steps** (until done): sign in → set up → first money in → first send → first automation.
5. **Needs you:** approvals waiting, with a count.
6. **Your assets:**
   - every token row: mark, name, amount, value, 24h change, sparkline;
   - sorted by value;
   - groups: on Arc → "On other chains" (Bring to Arc) → "Hidden (N)" → **Explore**.
7. **Positions:**
   - earn (APY, withdrawable);
   - borrow (health gauge);
   - perps (side, leverage, P&L);
   - LP (in range or out of range).

   Each opens its page.
8. **For you:** proactive cards from the agent (idle cash could earn, a better route, a big move in a held token, an expiring request).
9. **Automations:** next runs (3).
10. **Contacts:** quick-send avatars row.
11. **Recent activity:** 3 rows, then "See all".

**Guest Home:** the same layout.
- Hero "Try Kawase" with *Try in chat* and *Buy with Apple Pay*. The latter signs in, then resumes.
- A **live markets preview** (trending on Arc, top movers): real data with no account.
- Every money action opens the sign-in sheet in place (R13).

**Empty (signed in, $0):**
- the hero reads $0 with "Add money" as the one lime action;
- assets show "Nothing yet": Buy with Apple Pay · Receive · From an exchange;
- positions are hidden until one exists.

**Why:** R1 (all assets), R3 (positions from many venues), Abu: "the way you show the balance … the portfolio … will change with trading and meme coins".

## Markets tab (new)
**After, top to bottom:**
1. Search (name, symbol or address; recent searches).
2. Segmented control: **Trending · Meme · Perps · Stocks & FX · New**.
3. Hot markets carousel: cards with mark, price, 24h change, sparkline, venue mark.
4. Market heatmap (ssychui) for the selected segment.
5. List rows: mark · name · price · 24h · volume. Copycats are flagged; unverified tokens carry the chip.
6. My watchlist.

**States:**
- skeleton rows while loading;
- rate-limited data: the last snapshot with its time;
- testnet: "Markets live on mainnet", with the switch and practice explained.

**Why:** D1, D36 (trading, meme coins, perps).

## Token page / market page (new; one template for every asset)
**After, top to bottom:**
1. Header: back, mark, name/symbol, verified or unverified chip, star (watch), share.
2. Price, 24h change; chart (line ↔ candles; 15m/1H/1D/1W/1M/1Y/All) via Range Navigator.
3. **My holding:** amount across chains, value, P&L from my own trades; positions in this asset.
4. Stats: market cap, liquidity, volume, holders, contract (copy), launchpad progress if pre-graduation, funding and open interest for perps.
5. **About** and **Safety:** the verified list, GoPlus, liquidity depth, copycats, token-rule status ("your rules allow up to $50 a trade").
6. Activity in this asset (mine).
7. **Sticky bottom bar,** actions computed per R1/R2:
   - spot: **Buy · Sell** (+ a More sheet: Send · Receive · Withdraw · Bridge · Earn · Borrow · Alert · Automate);
   - perp markets: **Short · Long** (red/mint).

**Why:** R1 (every asset has a page), the symmetry check.

## Trade tickets
**Swap / buy / sell ticket** (Swap Ticket base):
1. "You pay": asset picker with any held asset (Apple Pay is offered when the balance is short); amount; 25/50/Max chips.
2. Flip.
3. "You get": any token, from search.
4. The quote: venue mark, rate, minimum received, price impact, fee, a "3 routes" disclosure with alternatives.
5. **Slide to confirm**, which resets on any change (R5).
6. Execution trace → receipt.

**Perp ticket** (from Senryo, ported):
1. Market header.
2. Margin as the hero, plus "leveraged size $X".
3. Presets $10/$50/$100/Max; keypad ↔ chart toggle.
4. **LeverageRuler** with a haptic tick per step and a snap.
5. Liquidation price with "% away" and an info sheet.
6. TP/SL child with −10/−15/−25/−50% suggestions.
7. A risk explainer before the first trade; a country check where the venue requires one.
8. Slide to confirm → execution trace (Checking → Signed → Submitted → Final) → receipt, share card, View position.

**Position page:**
1. Identity.
2. **P&L hero**, split into price / funding / borrow.
3. Stats grid.
4. TP/SL panel.
5. Close 25/50/75/All by slide.
6. An "unfinished protection" state.

## Add money (sheet; reached from the Home action, the fan, chat and empty states)
- **Before** (`fund-sheet.tsx`): faucet, receive, inert "Coming" bridge rows.
- **After:** method rows (Item Action List style), each with real marks and its availability reason:
  1. **Buy with Apple Pay / Google Pay / card** (Circle Onramp Kit; Transak and MoonPay as fallback). Amount → provider sheet (in-app browser) → "on its way" → settled on chain → "You're funded" moment.
  2. **Receive:** QR plus address, "any token on Arc", and the request-with-amount QR.
  3. **From an exchange:** exchange logos → that exchange's steps (network: Arc).
  4. **From another chain:** "send to this same address on Base, Ethereum…, and we'll bring it to Arc" (gasless Relay permit or sponsored).
  5. **Test money** (testnet only).
- **Why:** D36; A.4 §2.

## Withdraw (new; from the Home action, token pages and chat)
1. **What:** one asset, several, or everything (multi-select), from the universal picker across chains. Each asset goes "as itself" or "as cash".
2. **Where:** My places (saved exchanges and wallets), then + Exchange (logos) · + My other wallet (chain picker plus paste or scan) · Bank (through an exchange, or a sell ramp after a bridge, with the path stated).
3. **Route preview:** one line per asset (transfer / bridge via X / convert then bridge), the fees and "you receive".
4. **Review:** Face ID → one batch → tracker → receipt.

**Why:** A.4 §5, R1, R6.

## Send / Request / Receive
**Send**
- **Before:** USDC/EURC chips, Arc only.
- **After:**
  1. recipient (contacts with avatars, @handle, 0x, QR scan, `.arc`);
  2. asset (the universal picker);
  3. amount (keypad, units ↔ fiat toggle, Max net of the fee reserve);
  4. note, or on-chain memo;
  5. review (identity, recipient checks as rows, allowance meter, tier, network, cross-chain line);
  6. sent → receipt.

  Batch and split live in a "+ Add person" row.

**Request**
- **Before:** USDC/EURC.
- **After:** any asset; one or several people (split); share link and QR; a paid-progress card; reminders.

**Receive**
- **Before:** the Arc address with "Arc only".
- **After:**
  - "Any token on Arc arrives here";
  - a chain chooser (the same address; other chains get Bring to Arc);
  - a request-with-amount QR;
  - copy and share.

## Earn and Borrow
**Earn**
- **Before:** App Kit vaults, USDC only, sorted by APY.
- **After:**
  1. asset picker;
  2. the **yield-options card** (Aave V4, Morpho vaults and markets, Merkl/Aero LP): APY, **withdrawable now**, TVL, risk chip, curator or protocol mark;
  3. deposit ticket → position.

  Stuck sources are hidden, or shown with a warning.

**Borrow** (new)
1. Collateral picker.
2. Loan asset.
3. Amount.
4. **Health gauge** live as you type.
5. Rate and liquidation price.
6. Slide → position with repay / add collateral.

## Bridge
- **Before:** CCTP to my own address.
- **After:** asset (picker) → from/to chain (chain sheet with marks) → recipient (me / contact / place / address) → **3 route options** (Across, Relay, CCTP…: receive, fee, ETA, trust label) → slide → multi-step tracker → "Finish it" recovery.

## Chat and voice
**Chat:** plan §1.2–1.3.
- The empty thread shows **starter tiles for the real verbs**: Buy with Apple Pay · Long BTC · Best yield for my USDC · Withdraw to Kraken · Send to a contact · What can you do?
- Every card in the §C catalog renders inline.
- The capabilities card becomes a grid of marks.

**Voice:** plan §1.4. The same cards rise over the orb, and captions show both sides.

## Activity and inbox
**Activity**
- **Before:** ArcScan transfers; All/In/Out.
- **After:**
  - one row per kind (send, receive, buy, swap, perp open/close, earn, borrow, bridge, withdrawal, automation run, marketplace purchase, "checking…");
  - filters All · In · Out · Trades · Automations · Needs you;
  - row → receipt → **why** page;
  - export.

**Inbox**
- **Before:** payments, requests, runs.
- **After:** plus fills, TP/SL hits, liquidation warnings, buys settled, bridges done, price alerts, request reminders. Each tap opens `/i/[intentId]` on its network.

## Account, settings, safety
**Settings (from the avatar)**
- **Before:** mixed, with many "Coming" rows.
- **After:** grouped rows (Preferences Card):
  - **Account** (name, @handle, avatar, sign-in methods, email, devices, export wallet, delete account);
  - **Wallet & limits**;
  - **Token rules**;
  - **Network**;
  - **Language**;
  - **Appearance**;
  - **Display currency**;
  - **Sounds, haptics, narration**;
  - **Voice**;
  - **Notifications**;
  - **Memory**;
  - **Business**;
  - **Data & privacy**;
  - **Help & trust**;
  - **Sign out**.

**Wallet & limits**
- **Before:** allowance view + revoke.
- **After:**
  - the authority receipt;
  - the **per-token allowance list (+ Add token)**;
  - caps, cooldown, allowlist, temporary raise;
  - pause all, risk dial, practice mode;
  - the exit kit.

**Contacts**
- **Before:** a names list.
- **After:** segmented **People · My places**. People hold per-chain addresses and a verification chip; places list exchanges and own wallets.

## Sign-in and onboarding
**Story**
- **Before:** 5 panels; panel 5 is automations, contacts and marketplace.
- **After:** the same 5 panels (fixed per plan §1.1), with panel 5 = **"Everything on Arc"**: buy with Apple Pay · trade long or short · earn · automate, with real marks. Narration per panel.

**Sign-in sheet**
- **Before:** generic "didn't work".
- **After:**
  - email / Apple / Google with real marks;
  - stage-specific errors;
  - a countdown after too many codes;
  - opens **in place** from any guarded action and resumes it;
  - "I already have an account" hints at the original method.

**Setup / completion**
- **Before:** testnet setup.
- **After:** unchanged, plus mainnet setup on the first mainnet switch. The authority receipt lists per-token caps.

**Guest gates**
- **Before:** some screens fetch private data and error.
- **After:** every guarded screen shows its real public content plus a sign-in row (R13).

## Agent wallet (x402)
- **Before:** nothing.
- **After:** the `/agent-wallet` page (`cards/marketplace.md`): balance, Top up (from Kawase or Apple Pay), Return, budget caps, categories, sellers, spending history. Plus the chat/voice card "Top up your agent wallet", which resumes the request after topping up.
- **Why:** Abu 10-02; the marketplace needs a funded, visible wallet.

## Pickers and dropdowns (one family)
- **Asset picker** (R1): holdings across chains, search, sorted by value, "buy more" row, Hidden toggle.
- **Chain picker:** marks plus route availability per chain for the chosen asset.
- **Destination picker:** People · My places · New.
- **Network sheet:** two networks with their totals.
- **History drop-down:** the chat history sheet Abu likes stays, and gains search across all threads.
- **Language sheet:** each language in its own name and script.
