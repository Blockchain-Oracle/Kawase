KAWASE — DEMO SCRIPT
One story, in the order a new user meets it. Screen notes are in [brackets]. Don't read them.
About 3 minutes 20 seconds (about 560 words, plus three explorer holds). App: app.getkawase.xyz · Docs: docs.getkawase.xyz · Proof: getkawase.xyz/demo

1 · OPENING
   [getkawase.xyz, the hero: "Money that moves when you speak."]

Money that moves when you speak. Meet Kawase, the AI money app for everything on Arc, built on Circle.

2 · THE PROBLEM
   [Any wallet's swap screen: a chain picker, gas, slippage. Then a bridge site with five routes.]

Just a quick question. When did you last move money on chain without a tutorial open? You pick the chain, the bridge, the gas, the slippage, and you hope you got the best price.

Wallets are not new, I know that. Circle and Arc already built the hard part: dollars as gas, fast settlement, CCTP. But a normal person still has to think like an engineer to use it.

3 · THE SOLUTION
   [app.getkawase.xyz, the welcome story: the route race card, "It checks every route."]

So I built Kawase. You say what you want, in your language, and it checks every route, picks the best one, and does it inside limits you set on chain. Let me show you, from the very start.

4 · LOOK AROUND FIRST
   [Tap "Look around". Home as a guest: "Ask Kawase to do anything", Trending on Arc with its Live pip.]

No sign-up to look around. Home is the agent: one box, and what's moving on Arc right now.

   [Type "Swap 5 USDC to EURC" and send. The run card races the venues; marks fill in.]

Now watch this. I ask for a swap, and Kawase races the venues, each with its real quote, and shows me the winner after fees. I only sign in at the end.

5 · SIGN IN AND THE WALLET
   [The sign-in sheet: email code, Continue with Apple, Continue with Google. Sign in with email.]

Sign in is one email code, or Apple, or Google. Privy makes the wallet, and the key never touches our servers.

   [Setup runs by itself: "Wallet ready".]

Setting up the wallet is one signature, and Kawase pays the gas. A new user needs no gas at all.

   [+ → Add money. Show the five ways, then "Get test money".]

Money in: Apple Pay or card, an exchange, another chain, or on testnet, free test USDC.

6 · THE BUDGET
   [Settings → Weekly budget: $200 a week, $50 per action, what it covers. Tap "Turn on", sign once.]

Here's the part I care about most. I give Kawase a weekly budget: two hundred dollars a week, fifty at a time, only to me and people I saved. I sign it once, and it lives on chain, not on our server.

   [Home composer: "Swap 2 USDC to EURC". The run card goes Done. No prompt appears.]

Inside the budget, it just does it. No Face ID, no slide. It swaps, and tells me.

   [Run card → "View on ArcScan". Hold on the explorer page.]

Let's confirm. It matches. You don't have to trust me.

7 · BRIDGE, RECEIPTS, VOICE
   [+ → Bridge: Arc to Base, the chain picker, routes ranked by what arrives. Don't confirm.]

It bridges to six chains, ranked by what actually arrives after fees.

   [Activity → a receipt slip → Share.]

Every move gets a receipt you can share, and a "why" page.

   [Hold the orb in the dock. Say: "What's trending on Arc?" Kawase answers aloud; the card rises.]

And I can just talk to it, in ten languages. A spoken yes never approves money, though. The card does.

8 · THE AGENT WALLET
   [Marketplace: categories with counts, real logos. Open one tool; the drawer shows "Pay 0.001 USDC". Don't pay.]

When the agent needs data it can't get for free, it pays per call from its own agent wallet, over x402: Circle's catalog, more than eighty tools. I set the daily budget and the cap per call.

9 · MARKETS AND LONG OR SHORT
   [Markets: Trending, a token page with the Live chart. Then the Long or short board.]

Markets come live from Arc's pools; every trade moves the chart. And on mainnet I can go long or short on Arc's majors through Aave V4, with take-profit and stop-loss.

Let me not read them all out: earn, borrow, automations, requests, split bills. They're in the app, and in the docs.

10 · SAFETY
   [Weekly budget → Pause. Then Help & trust.]

And the one thing it can never do: move money outside what I signed. One tap pauses everything, on chain. And if Kawase ever disappeared, the docs show how to take your money out without it.

11 · UNDER THE HOOD
   [The docs' architecture diagram.]

Under the hood, everything runs on Arc and Circle. USDC is the gas. CCTP moves it across chains. Circle's wallets run the agent's own operations, App Kit finds swaps and yield, and Gateway and x402 pay for services by the call.

12 · DOCS
   [docs.getkawase.xyz: architecture, then a step-by-step guide.]

Want to know how it all works? It's in the docs: the architecture, every flow step by step, in ten languages. docs dot get kawase dot x y z.

13 · CLOSE
   [app.getkawase.xyz on a phone and a laptop side by side.]

It's live right now: app dot get kawase dot x y z, or the public TestFlight. Money that moves when you speak.

---

Before you record:
- Record on testnet, signed in with an account that has test USDC: + → Add money → Get test money (about 20 USDC and 20 EURC a day). Keep about 10 USDC.
- Turn on the weekly budget for testnet before part 6 (Settings → Weekly budget → Turn on), or record its signature as part of 6.
- Part 6's swap must be inside the budget (2 USDC under the $50 per action), so it goes with no prompt.
- Voice needs the microphone allowed in the browser (or record it on the phone).
- Part 9's Long or short is mainnet only: show the board and a token's ticket, open nothing.
- Explorer holds (part 6) need a fresh swap; any of today's testnet hashes below also work as a cut-in.
- Check the live build first: app.getkawase.xyz/version.txt shows the latest commit.

Proof ready to show (Arc testnet, run 2026-10-15 through the api, apps/api/test):
- Bridge Arc → Base Sepolia, one signature, minted by Circle's forwarder:
  https://testnet.arcscan.app/tx/0x83784a163eb81dc223c8b956df9e6233315d46e14100bbb6b169df3878402900
- 44 more, grouped by what they prove: getkawase.xyz/demo
