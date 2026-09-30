# Introducing Circle Gateway: A Unified USDC Balance Across Chains

Purpose: transcript and summary of a video relevant to Tameion builders.
Sources: https://www.youtube.com/watch?v=4fIkHRY5MGg (auto-captions via yt-dlp, cleaned of VTT timing and rolling duplicates; may contain ASR errors such as "X42"/"XFOO2" = x402, "Malikite" = Malachite).
Verified: 2026-09-29

| Field | Value |
|---|---|
| Title | Introducing Circle Gateway: A Unified USDC Balance Across Chains |
| URL | https://www.youtube.com/watch?v=4fIkHRY5MGg |
| Channel | Circle |
| Date | 2025-11-17 |
| Duration | 6:50 |

## Summary (10 bullets)

1. Talk by Leo (Circle solutions engineering) introducing Gateway.
2. Origin: Circle Mint customers already see one unified USDC balance and choose the chain at withdrawal. Gateway brings that experience to all USDC holders.
3. Problem: multi-chain treasuries have to pre-position liquidity on every chain, which ties up working capital and needs many wallets.
4. Mechanism: one Gateway Wallet contract deployed per supported chain plus a single API. It is a "handshake" between the Gateway wallet contract and the USDC minter contract.
5. Three steps: (1) deposit USDC into the Gateway contract (slow, needs source-chain finality); (2) sign a burn intent; (3) mint on the destination. Steps 2 and 3 are near-instant (milliseconds to under 500ms).
6. The unified balance is simply the sum of deposits across source chains, computed on the frontend.
7. No API key and no Circle intervention needed on testnet. At the time it was live on Ethereum, Base and Avalanche testnets; Arc is Gateway domain 26.
8. Circle does not pre-position liquidity itself; the verification is trustless and interacts directly with the minters.
9. Only three functions are needed for the end-to-end flow (balances, deposit, transfer).
10. For Tameion: Gateway is the "one balance across chains" primitive in the slides, and the substrate for x402 nanopayments. Remember that deposited Gateway balance is what gets spent.

## Transcript (cleaned, auto-generated)

It's really exciting to see all of you guys. Uh my name is Leo. I'm a member of the solutions engineering team here at Circle. And I'm really excited to talk to you about this new offering. But before I do, I want to set the stage a little bit. Um do people here know where USDC comes from? Not really. Okay. It it comes from us. Uh Circle is the sole issuer of USDC. Um and one of the things that we do is we work with a network of wholesale distribution partners. We take their fiat currency, their cash, their US dollars. We put it into our reserves and then we mint new USDC on chain and allocate it to them. We do this using something called a circle mint account. Uh and when they see their balance in the circle mint account, they don't see a balance of Ethereum USDC or Avalanche USDC or Salana USDC. They just see a unified USDC balance. Now, I talk to our wholesale distribution partners every day in my role and

they love this feature uh because it gives USDC an extra layer of utility when they can send it out of their account on any blockchain that they choose at the point that they transfer it. But we don't want to restrict this unified balance experience to the select few that we partner with for wholesale distribution. We want to enable as many USDC holders as possible to access that unified balance experience and that's why we built circle gateway. So as we know and uh as AWS covered earlier um multi-chain is a huge pain point for developers. Often times it involves deploying multiple wallets on multiple different blockchains maintaining pre-position liquidity on all of them. Not only is this a hugely resource inensive process, it frees up a ton of working capital that these traditional payments and enterprise firms need to use elsewhere. Not only that, non-cryptonative users don't even want a fragmented balance. They want that unified USDC balance. And that's something that we hear from our traditional payments and enterprise partners every single day. Gateway is

a tool that enables any firm to offer a unified balance experience to their end users. And it's a really low technical lift. All it is is a single smart contract deployed on the different blockchains we support and a single unified API. You can think of this like a handshake between the gateway wallet contract and the actual USDC mentor contract. If you want to check it out for yourself, we're already live on the Ethereum base and avalanche test nets. No API key needed, no circle intervention needed. You can just go straight to our docs and try this yourself. Uh the mainet launch is coming very shortly. So watch this space for more details. So from a practical perspective, what does this all mean for the companies in the traditional payments and enterprise space today? The partners that I work with just want to pick a single blockchain and stick with it. And they know that this is effectively walling off compatibility with other highly popular blockchains. But frankly, they don't have much of a choice. Uh

it's a lot of times it's it's really unrealistic to expect a company in the payments and enterprise space to build all new treasury infrastructure from the ground up on different blockchains and preposition USDC liquidity on all of them. Um it's incredibly resource inensive um and it is not a good use of working capital. Gateway solves all of these problems with a really low technical lift. Um, and in the space that I think a lot of us operate in here, I I see a lot of folks from enterprise, from the payment space, we know that you guys want a unified USCC balance experience. We know uh that your end users want au unified USDC balance experience. And so that's what we've built. I I'm going to get into a little bit how it works um when I show you the video, but this is kind of the gist of it. Um it's three steps at a high level. Um the gateway contract is what actually accepts the USDC and stores the USDC. Um it's a wallet

contract. And then steps two and three are the really notable parts. While you know step one, the initial deposit takes a little bit of time to finalize. Steps two and three are nearly instant. And so I want to be really clear here. We did not build this product so that circle could just take on the burden of prepositioning liquidity and pre-positioning working capital. We are actually allowing firms to directly interact with the USDC mentor contracts on chain instantly with a trustless verification system. With with all that said, uh I'm going to show a little bit of a video uh kind of keeping up with the theme of showing various bits of code in how this actually looks and how simple it can be. Um if you're a developer who chooses to integrate with gateway, what you'll see here is this is an example of a gateway implementation and there are only three functions you need for the entire endtoend flow. If you see the balances here, uh these show where the USDC came in on

um from all the source blockchains that this particular user sent USDC in. Um you can just add these up on the front end and that is your unified USDC balance. Um depositing USDC. In this video, uh it's showing that uh test net USDC is coming in from some of the faucets that we have. Um, and this is the bit that takes a little bit of time. Um, but I think once we get to the end, you'll see where the real value uh comes into play. And and the reason this takes a little bit of time is because it's a it's a blockchain transaction and there are certain speeds um that these things move at. Uh but the next function shows the steps two and three that I showed in the previous slide, the signing and the actual sending and the burning of the USDC on the source chain. And before I could even finish my sentence, the USDC was burned on the source chain, minted, not just sent out, but minted on the destination chain

and sent to the destination address. And it only took a matter of milliseconds. So, um, that is all I have in the way of the demo. It was quick. That's just how simple it is. And thank you for your time and thank you for being here tonight.
