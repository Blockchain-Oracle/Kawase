# Product decisions (settled internally, with rationale)

Purpose: every product-internal question answered so the build never stalls on it. Owner decisions live in `DECISIONS-FROM-ABU.md` (D1–D36); these are Claude's, made under them, and are reversible by Abu.
Sources: the approved plan §A.3, the fact sheets, research folders.
Verified: 2026-10-02

| # | Question | Decision | Why |
|---|---|---|---|
| X1 | Chat sends inside the allowance with no tap; voice waits for a tap. Contradiction? | Keep both, on purpose | Typed text is exact; speech can mishear "15"/"50" or "Amina"/"Amir" |
| X2 | Is Face ID the binding approval? | No: the Turnkey session-key signature is. Face ID unlocks the Keychain key. Web uses an email code until passkeys | Accurate security wording |
| X3 | Default allowance | Per-token daily caps; testnet $5,000/day, mainnet $500/day; default set = the stablecoins held; any token can be added; all signed with one Face ID | One rule replacing three numbers |
| X4 | One wallet or two per person? | One Turnkey address on both networks; Circle TEST/LIVE keys are platform-only | D33 |
| X5 | Funds stranded on other chains | Portfolio reads every supported chain; Bring to Arc; bridges and withdraws accept any recipient | No dead money |
| X6 | Contact address-change hold | Ends by review with Face ID, not by time; automations pinned to the old address pause | Safety over convenience |
| X7 | Raise a limit | Face ID + a new on-chain grant; tightening is instant | D33 |
| X8 | Receive QR format | Bare address with the network printed (scans everywhere); request QRs use EIP-681 | Exchange compatibility |
| X9 | Withdraw approval | Always Face ID (never rides the allowance) | Withdrawals are rarer and larger |
| X10 | Dock | Home · Markets · orb · Chat · Activity; profile via the header avatar | Trading needs a home; Activity stays one tap away |
| X11 | Risk dial meaning | Guard = confirm everything; Balanced = D33; Autonomous = may act on its own suggestions inside grants and report after | Gives the dial real effect |
| X12 | Automations vs allowance | Automations spend from their own grant caps | Separation of authority |
| X13 | Underfunded automation | Skip, notify, retry once when money arrives within the period | No silent failure |
| X14 | Requests | Any asset; matched by on-chain Memo reference; partial/overpaid/other-asset states shown; 30-day expiry | Exact matching |
| X15 | Sign-in duplicates (Apple hide-my-email) | Link methods in Settings → Account; the clash message names the original method | Turnkey user authenticators |
| X16 | Delete account | Holdings check → withdraw or export → revoke grants on both networks → delete personal data → hold @handle 30 days | Apple requires in-app deletion; the wallet stays the user's |
| X17 | Guests | See all public data (markets, token pages); any write opens sign-in in place and resumes | R13 |
| X18 | Sounds | Default on, following the silent switch; only on confirmed outcomes, once | Abu asked for sounds; iOS norm |
| X19 | Narration | A speaker button beside the language pill; the first tap turns it on and it persists; clips per panel per language | Abu: "voice … as you swipe" without autoplay surprises |
| X20 | Voice model | GPT-Live (client delegation to the Kawase agent turn), with the cascaded pipeline as fallback; a readback guard against paraphrase | Abu: "the voice of GPT is so smooth" |
| X21 | Buy any token with Apple Pay | Onramp USDC (Circle Onramp Kit first) → one-approval swap; both fees shown before paying | No provider sells most Arc tokens directly |
| X22 | Bank cash-out | Through an exchange that takes Arc deposits (Kraken, OKX confirmed) or a sell ramp after a bridge, stated per path | No ramp pays out from Arc directly yet |
| X23 | Long/short | **Kawase Margin through Aave V4 on Arc** (leveraged long/short by supply/borrow/swap loops in one batch) as the default for every user; **Connect Hibachi** (user-pasted API key) as optional; Senryo's engine on testnet for practice | Hibachi/edgeX API keys are UI-only (no programmatic onboarding) and Hibachi blocks the US/UK; Aave V4 has real liquidity on Arc and is fully programmatic |
| X26 | Meme-coin safety | GoPlus + Kawase's copycat rule (canonical addresses; hard-block stablecoin-symbol impostors) + sell simulation before unverified buys | GoPlus can't see copycats on Arc; a fake USDC pool was trending on 10-02 |
| X27 | Pre-graduation tokens | Trade when an aggregator routes; otherwise show graduation progress + alert + launchpad link; in-app curve trading per launchpad after decoding its verified source | No launchpad publishes an ABI |
| X28 | Swap venues | KyberSwap (direct calldata), Circle App Kit Swap, LI.FI, fan-out; others later | Live 10-02: Kyber ≈ Circle > LI.FI (−0.25%) |
| X29 | Marketplace payments | A per-user agent wallet funded by a capped marketplace grant; Gateway nanopayments + plain EIP-3009 via `@circle-fin/x402-batching` | 2,060 of 2,136 Arc listings are Gateway-only |
| X24 | Marketplace payments | See X29 | `cards/marketplace.md` |
| X25 | Mainnet | First-class now; Circle LIVE is approved; end-to-end runs use small real amounts | D36 |
| X30 | Pause all | Blocks only routes that act without the person (allowance sends, automations, agent auto-execution); the person's own Face ID actions keep working so the exit kit can always move money out | A3 found swap/bridge/earn refusing everything while paused (10-02) |
| X31 | New-recipient cooldown | Applies to no-prompt sends and automations only; the person's own Face ID send to a new address gets the first-time warning and "send a test amount first?" | A3: a blanket cooldown blocked people's own sends ($50 / 24 h on mainnet) |
| X32 | Payroll | One backend: the automations `payroll` kind (Needs-you, practice, underfunded retry); Business → Payroll uses it | A3 and B2 had built it twice (10-02) |
| X33 | Agent latency | OpenAI Fast mode (service_tier priority) on every turn; voice gets wallet + capability lines up front | Measured 10-02: first word 3.4 → 2.5 s; voice "what can you do?" 5.3–7.6 → 1.8–3.9 s; ~$0.0005/turn |
