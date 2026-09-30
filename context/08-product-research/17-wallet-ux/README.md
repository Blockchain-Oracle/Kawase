# Wallet experience: how a Kawase user signs, without a PIN for every action

Purpose: the synthesis of the 2026-09-30 wallet research that Abu asked for after rejecting "a PIN all the time". It states what is proven, compares the options, and gives one recommendation for Abu to accept or overrule.
Sources: the four reports in this folder (`circle-native-options.md`, `privy-and-turnkey.md`, `other-embedded-wallets.md`, `passkey-accounts-on-arc.md`), each with its own evidence under `.firecrawl/product/17/`; the live test `plan/spikes/15-eip7702-limits.md`; `context/00-hackathon/judging-and-submission.md`.
Verified: 2026-09-30

## What is proven (run by us on Arc testnet today)
- An ordinary wallet key can carry **on-chain spending limits on the user's own account**: the key signs one EIP-7702 authorization and one EIP-712 delegation; after that our server wallet spends inside the limit with **no user prompt**, and the chain refuses anything over the cap, any other method, native value, and anything after a revoke (13/13).
- A **brand-new empty wallet** can be set up with no USDC: a relayer key of ours pays the gas.
- The contracts involved have identical bytecode on Arc mainnet; the flow itself was not run there.
- This is the hackathon's own guidance ("put the limit somewhere the agent cannot reach": a contract that enforces the budget, a threshold above which a human signs).

So the wallet vendor only has to give the user an ordinary key that can sign three things: a 7702 authorization (once), EIP-712 typed data (when limits change), and ordinary transactions (sends above the limit).

## What is not proven
Nothing below was built or run. Every "works" for a vendor means "documented, or present in the published package".

## The options

| | Sign-up | Each action | Face ID when we want it | Works in our app (Expo 57 / RN 0.86.3) | Web | Cost | 7702 limits |
|---|---|---|---|---|---|---|---|
| **Turnkey** | Email code, passkey, Google/Apple | No provider screen; silent | Per call (`stampWith: Passkey`) and enforceable by server policy | Their own example app is on our exact versions (not built by us) | Separate web package | 25 signatures/month free, then $0.10 each with a card; 1 request/second | Yes |
| **Privy** | Email code, passkey, Google/Apple | No provider screen; silent | All-or-nothing per user, cached 15 minutes | Built against Expo 56; no evidence either way; closed source | Separate web package | 499 users and 50,000 signatures/month free | Yes |
| **Dynamic** | Email, social; passkey added after | No provider screen | Optional passkey step | Newest example is Expo 54; no evidence | Same package on web and native | 1,000 users free | Yes (typing only) |
| **Circle, email or Google sign-in** (no PIN) | Email code or provider | One Circle confirm screen, or none if a Console switch is off | Only an app-level check that Circle does not enforce | Circle's SDK builds and starts in our app (spike 1) | Hidden iframe; its storage may be cleared by Safari | Circle wallet pricing | **No** (needs the separate funded account from spike 4) |
| **Circle, PIN** (the old plan) | PIN + 2 security questions | PIN every time; Face ID can fill it on phones only | — | Yes | PIN typed every time | Same | No |
| **Circle passkey wallets** | Passkey | Passkey prompt per operation | — | No React Native SDK | Yes | Unknown | No (contract account) |
| **No vendor: key derived from a passkey** | Passkey | Face ID re-derives the key | Yes | Library is an Expo module; not built | Yes, same passkey | Free | Yes |
| **No vendor: key in the phone's keystore** | None | Face ID | Yes | Already installed | **No web** | Free | Yes |

Ruled out: Reown AppKit (hosted iframe, session lost on close), Porto (deprecated), Coinbase Smart Wallet (mainnet only). Details in `other-embedded-wallets.md`.

## Recommendation (Claude's; Abu decides)
**Turnkey for the user's key, EIP-7702 limits for the agent, Circle for everything else.**

What the user experiences:
1. **Sign up** with an email code (or Apple / Google). The wallet exists immediately. No PIN, no security questions.
2. **One Face ID** to accept a daily allowance for the agent (a default, adjustable).
3. **Inside the allowance: no prompt.** "Send 5 dollars to Amina" just happens.
4. **Above it, or to raise the allowance: Face ID.**
5. **Automations:** approved once with Face ID, then run inside their own caps.

Why Turnkey over the others:
- It is the only candidate with evidence on our exact stack (its example app declares Expo ~57.0.23, RN 0.86.3, new architecture).
- Face ID can be required for exactly the actions we choose, and the rule can be enforced by Turnkey's servers, not only by our app.
- The key is an ordinary EOA, so the limits design above applies, and swaps and bridges through Circle's App Kit need no PIN prompts.
- Its SDK source and issue tracker are public.

What it costs:
- A Turnkey account (Abu creates it) and a card on file: 25 free signatures a month, then $0.10 each. In this design a user signs about twice at setup and once per large send, so 100 users is roughly 300 signatures, about $28.
- A new vendor, and the wallet tests already done with Circle's PIN wallet (spikes 2 and 3) are re-run with the new key. Spike 4's limits logic carries over; spike 15 replaces its account setup.
- Passkey sign-in needs a real domain that Abu controls, because a passkey is tied to its domain for life. Email-code sign-up needs nothing, so passkeys can follow.

Circle remains the platform: Arc, USDC and EURC, App Kit (swap, bridge), CCTP, Gateway and x402, the agent's own developer-controlled wallet that redeems the limits, webhooks. "Circle tool usage" is 20% of the score and does not depend on Circle holding the user's key.

Fallback if Turnkey disappoints in the spike: **Privy** (larger free tier; the risk is that it has not been shown on Expo 57). If Abu wants to stay Circle-only: **Circle email sign-in with the confirm screen switched off**, accepting no enforced Face ID, the separate funded account, and the Safari storage risk.

## Next step
A half-day spike in `apps/mobile`: install Turnkey's React Native kit, build for iOS, sign in by email code, sign a 7702 authorization and a delegation, and let the agent spend inside the limit on Arc testnet. It needs Abu's Turnkey organization ID and auth-proxy config ID.
