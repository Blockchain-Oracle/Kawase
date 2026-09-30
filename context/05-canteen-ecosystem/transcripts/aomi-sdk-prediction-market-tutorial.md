# Building an AI-Native Prediction Market in 30 Minutes | Aomi SDK Tutorial

Purpose: transcript and summary of a video relevant to Tameion builders.
Sources: https://www.youtube.com/watch?v=PUqQPeWtUYM (auto-captions via yt-dlp, cleaned of VTT timing and rolling duplicates; may contain ASR errors such as "X42"/"XFOO2" = x402, "Malikite" = Malachite).
Verified: 2026-09-29

| Field | Value |
|---|---|
| Title | Building an AI-Native Prediction Market in 30 Minutes | Aomi SDK Tutorial |
| URL | https://www.youtube.com/watch?v=PUqQPeWtUYM |
| Channel | Gordian Etim |
| Date | 2026-05-04 |
| Duration | 3:47 |

## Summary (10 bullets)

1. A third-party builder demo of "Kuruku", a Polymarket trading UI built on the aomi SDK and widget. This is not an official aomi video; no official Tameion aomi-session recording was found.
2. Framing: aomi is "the engine underneath". It lets a product add an AI agent that executes onchain transactions from natural language.
3. In the aomi widget, "show my wallet balance and positions" triggers several background calls (chain context, balance, nonce, recent transactions).
4. The customised widget adds slash commands and filtered market browsing (elections, crypto, sport, economics, and more).
5. For each market the UI shows shares, entry price, cost and projected return before committing.
6. **Simulation before execution**: the trade is simulated against live data before the user signs. This is aomi's core safety property.
7. Wallet connection via email (Para-style embedded wallet).
8. Research, market intelligence and execution all run on the aomi stack.
9. Docs pointer: aomi.dev/docs. The team offers builder support.
10. Relevance: shows the widget and headless pattern a Tameion builder could use for an operator console where the agent proposes, simulates and the human signs.

## Transcript (cleaned, auto-generated)

prediction market traders lose not because they can't read market but because the manual process is too slow. I built a solution called Kuruku to fix that using Aomi SDK stack and wing it. And as you can see in this trade right here, this is a poly market platform and there is a live market tracking a long mock tweet count for the week. Each range has its own order book, it own price, it own liquidity. Right now, traders are clicking through all of these manually, checking bid acts on each bracket, deciding and then going through the entire signing flow just to place a single bit. So before I show you what Kurugu does, let me quickly explain what Aomi is and why it does matter. Aomi is an AI infrastructure. Think of it as the engine underneath it. It lets a product, a wallet, a trading terminal, a gamefi product, add an AI agent that can actually execute onchain transaction through natural language. As you can see in this video, we are connected to the Aumi

Wingate. And from this particular video, you can see that I asked it to show me my wallet balance and position. AMI automatically fires three to two calls in the background. the chain context, the wallet balance, the nons and recent same transaction coming with the full overview of my Ethereum balance and recent transaction. So this is Kuruku. Kuroku is built on top of AM which is the execution layer and as you can see this is a customized wing with a slash command that gets to show you a welldesigned font and commands that you can use to interact with the UI interface. From this particular interface, you can see that I did made a call to get a particular detail about Manchester City to win the Premier League at 49%. And I also got to connect to my wallet via my email. And when that is done, you are able to navigate across different market filtering across elections, crypto, sport, economics, technology, and the world. Each of these cards gets to show you the question, current probability,

and volume. And you're also able to see the the shares, the entry price, the cost, the projected return before you get to commit to anything. The agent helps you to scan and analyze each and every single one of the market in one interface, all from falling market live data and other prediction market data. And with this you're able to also do research and understand before getting to up into a particular trade. You're also able to do a simulation before also executing this particular bait and transaction. A yomi makes it very easy because as a prediction market trader, you always want to make sure that you understand the risks, leverage, and outcome before committing or making a particular execution for a particular trade or transaction. As you can see from Kuroku's chart interface, we ran a trade simulation before execution pulling live market data and wallet address from Poly Market where you can transact right from in one click. the research, the market intelligence and the execution layer. They're all built on AUM stack sync live

and working. If you're a developer working in prediction market or onchain agent, do try out the SDK. Build something and check out the official dogs at aomi.dev/doc. The team is always up and ready to support you anytime.
