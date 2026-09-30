# Arc 101: The Full Circle Tech Stack

Purpose: transcript and summary of a video relevant to Tameion builders.
Sources: https://www.youtube.com/watch?v=nx8cfXzBB3o (auto-captions via yt-dlp, cleaned of VTT timing and rolling duplicates; may contain ASR errors such as "X42"/"XFOO2" = x402, "Malikite" = Malachite).
Verified: 2026-09-29

| Field | Value |
|---|---|
| Title | Arc 101: The Full Circle Tech Stack |
| URL | https://www.youtube.com/watch?v=nx8cfXzBB3o |
| Channel | Circle |
| Date | 2026-08-25 |
| Duration | 5:05 |

## Summary (10 bullets)

1. Pitch: Circle is a full-stack developer platform for programmable money, not only a stablecoin issuer, so builders do not have to stitch together wallets, bridges and banking.
2. Assets layer: USDC, EURC and USYC (the yield-bearing tokenized money-market fund; the "reserve that earns while it waits" in the Tameion slides).
3. Infrastructure: Arc with USDC as native gas and the Malachite consensus engine (deterministic sub-second finality), plus managed node providers and indexers.
4. Circle Mint connects banking rails. Institutions mint and redeem USDC/EURC 1:1 from bank accounts.
5. Interface layer: REST APIs (bearer auth, JSON, webhooks for async events) plus SDKs that handle auth, transaction state, errors and webhook verification. A sandbox mirrors production using testnet tokens.
6. Wallet options: developer-controlled (app-managed keys), user-controlled (user custody), modular (passkeys, composable security modules).
7. Cross-chain: CCTP burn-and-mint, Bridge Kit as the SDK wrapper, and Gateway for a single USDC balance across chains.
8. Transaction lifecycle is observable end to end, with webhook pushes instead of polling. This is useful for an agent decision log.
9. Gas abstraction: Gas Station (the developer sponsors fees in USDC) or Paymaster (users pay gas in USDC). Sponsored usage is billed periodically.
10. Ops layer: the Circle developer console handles keys, webhooks, logs and monitoring.

## Transcript (cleaned, auto-generated)

We've talked about how blockchains are becoming financial rails on which economic activity runs. But blockchain infrastructure is often discussed in parts. You have a wallet provider, maybe you need a bridge, and you need to think about a banking integration. The burden of stitching those pieces together often falls on the builder. Pulling time and effort away from what they actually want to build. The issue isn't with any one piece of infrastructure. It's that the pieces were never designed to work together as a system. That's the gap Circle was built to address. Circle isn't just a stablecoin issuer. It's a full stack developer platform for programmable money and everything starts with money. Welcome to Arc 101, a series about building with programmable money on a stablecoin native blockchain built for onchain economic activity. Circle is the company behind Arc and the broader platform around it. Arc is the blockchain foundation Circle built for programmable money. Around that foundation, Circle brings together the digital assets, APIs, wallets, crosschain infrastructure, and banking rails developers need to build rail applications.

Circle issues regulated digital assets including USDC, EURC, and USYC, production-grade financial primitives. From there, Circle provides the blockchain infrastructure, APIs, wallets, bridges, and banking rails all designed to work together as a system. So instead of assembling infrastructure, developers can focus on building products. First, the infrastructure foundation. At this level, we have Arc serving as the blockchain infrastructure. By using USDC as its native gas token, Arc anchors transaction cost in stable value rather than volatility. Powered by the Malachite consensus engine, Arc delivers deterministic sub-second finality. Once a transaction is confirmed, it is irreversible. The surrounding ecosystem of managed node providers and data indexers give developers scalable access to Arc and efficient ways to query onchain data, enabling responsive wallet interactions and predictable onchain behavior. But infrastructure isn't just about what happens onchain. It also determines how value enters and exits the system to connect onchain activity with traditional finance. Circle Mint connects directly to banking rails. Institutional customers can mint and redeem USDC or EURC on a one-to-one basis with US dollars or Euros using connected

bank accounts and unified APIs. So, how do you build on this solid foundation? Most blockchain platforms give you protocols, node endpoints, and documentation. Circle gives you REST APIs. If you've built modern web backends, these patterns will feel familiar. standard HTTP requests, bearer token authentication, JSON responses, webhook notifications for async events. The APIs handle creating wallets, sending transfers, bridging across chains, managing balances, and on and off ramping between fiat and crypto. Circle also provides SDKs that go one layer higher. They abstract authentication, transaction state management, error handling, and webhook verification. So, you're not wiring raw HTTP requests. You're calling methods. And there's a sandbox environment where everything works like production but with testnet tokens. That's where you prototype safely before going live. This is the interface layer. APIs and SDKs that feel like building standard web apps with that foundation and interface. Here's what becomes possible. Flexible wallet experiences using developer-controlled wallets with application managed keys. user-controlled wallets where custody stays with the user or modular wallets that support passkey and composable security modules. Crosschain transfers

that don't force users to think in chains. CCTP moves USDC natively via burn and min across blockchains. Bridge Kit wraps this into concise SDK calls and gateway gives applications a single USDC balance that works across supported chains. Transaction life cycle management. Transactions are processed asynchronously and every state is observable from initiation through blockchain submission to final confirmation. Circle pushes webhook updates as states change so you're not polling endlessly. Users never need to manage native gas tokens. Developers can sponsor transaction fees using USDC through Gas Station or let users pay gas directly in USDC via Paymaster. Both have gas denominated in USDC and sponsored usage is consolidated into predictable periodic billing. Then there's the operational layer. The Circle developer console provides key management, webhook configuration, logs and monitoring, giving you visibility into how your application is operating in production. Blockchains may be becoming financial rails, but rails alone aren't enough. What matters is how the system is designed around them. Circle brings stablecoins, blockchain infrastructure, APIs, crosschain movement, banking rails, and operational tooling together as a

single integrated platform. So instead of assembling infrastructure, developers can build what they actually came here to build. I'll see you in the next video.
