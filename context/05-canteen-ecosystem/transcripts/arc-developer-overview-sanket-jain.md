# Arc: Developer Overview with Circle's Lead Product Manager Sanket Jain

Purpose: transcript and summary of a video relevant to Tameion builders.
Sources: https://www.youtube.com/watch?v=BG0sHuTqGRc (auto-captions via yt-dlp, cleaned of VTT timing and rolling duplicates; may contain ASR errors such as "X42"/"XFOO2" = x402, "Malikite" = Malachite).
Verified: 2026-09-29

| Field | Value |
|---|---|
| Title | Arc: Developer Overview with Circle's Lead Product Manager Sanket Jain |
| URL | https://www.youtube.com/watch?v=BG0sHuTqGRc |
| Channel | Circle |
| Date | 2025-10-16 |
| Duration | 4:56 |

## Summary (10 bullets)

1. Launch-era talk (Oct 2025) by Arc lead PM Sanket Jain on why Circle built Arc.
2. Four enterprise problems: native-token volatility, expensive and complex FX, lack of deterministic finality, and lack of privacy/confidentiality.
3. Answers: USDC as native gas; a built-in institutional FX price-discovery mechanism for local stablecoins (later StableFX); Malachite (Tendermint-style) consensus with <1s deterministic finality; opt-in selective privacy.
4. "Home for stablecoin-based finance". It is explicitly not USDC-only; local-currency stablecoins are in scope.
5. Target segments: payments and merchant services, treasury management, lending and borrowing, trading, collateral, digital dollar accounts.
6. Roadmap as stated then: private testnet opening to developers, public testnet in October 2025, mainnet beta in 2026.
7. Useful for pitch framing: Arc exists to bring corporate treasuries onchain, which is the Tameion thesis.
8. Emphasises treasury management as a first-class Arc use case (RFB 1).
9. Privacy is "selective": some things public, some private, mirroring the modern financial system. Relevant to compliance agents (RFB 5).
10. Short and high-level. Watch it for context, not code.

## Transcript (cleaned, auto-generated)

As you may have heard, Jeremy talked about us launching ARC. I will take some time to talk about the reasons, our vision, and what to expect in the future. In short, ARC is the creation of a first- level open blockchain specifically designed for stablecoins. This is a very meaningful phrase, and we will take the time to understand why we chose it and analyze it in detail. But first, I want to talk a little about what motivated us to do this and why we are so inspired. While working at Circle, we realized that there were certain challenges when using blockchains in corporate implementations, particularly applications and large institutions that serve me, you, and my parents every day. We identified four main problems: first, the volatility of native currencies. The experience of holding volatile currency on the balance sheet is quite illogical for most people, including businesses and enterprises. Similarly, currency transactions, which are very expensive and complex even in the real world, are even more expensive and complex in today's blockchain ecosystems. Third, transaction finality is

very important for enterprises and applications. They don't want the risk of transactions being moved, reordered, or changed at all. They want to have deterministic finality. And finally, privacy and confidentiality are key requirements for many of these companies to start using the infrastructure we are building. To solve these problems, we decided to create ARC. ARC is the home for stablecoin-based finance. We are developing this for corporate use, but that doesn't mean it excludes you. This means that we provide businesses that serve you with the ability to integrate infrastructure at a basic level. The main features we are implementing correspond to the problems I told you about. So, first, USDC will work like native gas. This means you no longer need to hold another token to make payments with anyone . It is stable. He just is. You only need to hold one currency at any given time . Secondly, there is a built-in mechanism for currency transactions. This is an institutional price discovery process for exchanging local stablecoins, as well as other stablecoins denominated in US

dollars. We don't see this as a USDC-only network. We see this as a network for stablecoin-based finance. Third, and this is what really inspires us, Malikite is an open source technology that offers state-of-the-art Tendermint consensus. And this means that it is instantly final, meaning the transaction takes place in less than 1 second. You get deterministic finality, meaning the transaction becomes permanent. And fourthly, this is very close to me as a specialist. I have been working in blockchain privacy for a long time, and we are excited to offer institutions selective privacy that meets their requirements. So, the vision is to reflect the look of the modern financial system. That means you will have selective privacy. There are things that should be public and things that should remain private, so we build a system that replicates this dynamic by adding optional privacy at a basic level. Do we think this will help move the industry forward? We are bridging the gap to achieve mass adoption. And here's how it happens. There are trillions of dollars that are

not yet online, spanning a variety of segments, as you can see here. We believe that ARC is a fundamental level that will become home to a significant portion of the capital moving to the blockchain. Some segments we are interested in include payments and merchant services. We believe this will be a phenomenal way to make payments via blockchain. It is specially designed. It is dollar-oriented. It also supports local stablecoins. But we want to cover a wide range of use cases across all of finance. We are really trying to modernize the online financial system, and this is the level for that. This includes treasury management, lending and borrowing, trading, collateral, and digital dollar accounts, to name a few . I'm sure some of you in this room have use cases we haven't thought of that fit perfectly into the concept of stablecoin finance. And that's exactly what we want you to build. This is what we want the whole world to build. We want these primitives to be available not only to developed countries, but also to

everyone who has access to the internet, which is most of the world, right? This is a vision of renewing the financial system for everyone, not just a select few. What can you expect? We announced ARC yesterday, but we are launching a private testnet that we are opening up to individual developers. It comes out in September. We plan to launch a public testnet in October. This means it will be open for any application to build on, use, and experiment with. I am especially happy about this stage. This will be the first time we see Arc in real-world conditions. After that, we plan to launch the mainnet beta in 2026. This will be the genesis block and the beginning of the Arc path. We hope that many of you in this room will also join us. So, that's a little bit of information about Arc. I do n't want to take up any more of your time. We are extremely excited. Circle is delighted. We hope you do too. So thank you very much. And yes, find

me after the performance.
