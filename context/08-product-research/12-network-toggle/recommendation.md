# Recommendation: the mainnet ↔ testnet toggle and network-aware agent

Purpose: a proposed design for D15 (the toggle "like dark mode / light mode"), and the answer to Abu's question "should the agent offer to switch?". **Everything here is [INFERENCE]** unless tagged, and each point is grounded in `ux-precedents.md` (UX) and `libraries-and-implementation.md` (impl). For plan mode to accept or change.
Sources: `ux-precedents.md`; `libraries-and-implementation.md`; `../DECISIONS-FROM-ABU.md` D2, D13, D15; `../ABU-BRIEF-VERBATIM.md` Message 10; `../SMART-PRECONDITIONS.md`; `../CODEX-REVIEW.md` §4 (F17); `../10-reference-flows/agari.md` (P6, P24, NEW-G17)
Verified: 2026-09-29

## 0. The answer to Abu's question, in one paragraph

**Explain first, then offer, and make the offer asymmetric.**
- When something isn't on the current network, the agent says so plainly and says where it *does* exist. That is Abu's own preferred wording, and it matches Rainbow's "Testnets are not supported by Swap…" and MetaMask's "Unavailable on this network" [VERIFIED precedents].
- It then offers a switch as one option among others, never as the whole reply. That is established practice: Rainbow's "Switching to X? … [Disable and Switch] [Cancel]" and MetaMask's switch approval [VERIFIED].
- The asymmetry comes from money:
  - **Switching to testnet** can resume the request automatically, because nothing real can be lost.
  - **Switching to mainnet** never auto-resumes a money action. The agent re-drafts on mainnet and requires a fresh confirmation marked "real money". NN/g warns about modes "where mode errors can produce disastrous consequences" [VERIFIED quote].
- What Abu called "bad" (message 10) is a bare question with no explanation ("I can't run this. Can I switch?"). The design avoids that.

## 1. The toggle UX

| Aspect | Recommendation | Grounding |
|---|---|---|
| **Placement** | (1) A **network pill in the top bar**, visible on every screen, that is itself the toggle: tap it → a two-option sheet "Mainnet · real money" / "Testnet · practice". (2) The same control in Settings → Network. (3) Voice/chat: "switch to testnet" → the agent shows a switch card; the user taps (§4). Desktop: also a keyboard shortcut | Rainbow puts its toggle in Settings, the home menu, ⌘K and the **T** key; Nest puts it in the app header; the Circle Console toggle is top-left [VERIFIED] |
| **Visual indicator (≥2 redundant)** | Testnet: (a) a persistent thin **coloured bar** under the top bar ("Testnet · no real money"), (b) the pill in the same hue, (c) a "TESTNET" eyebrow on every money card and receipt. Mainnet: the pill reads "Mainnet", and money cards carry a "REAL MONEY" eyebrow. Pick the testnet hue per theme (light and dark) and keep it distinct from error red | NN/g: "at least two visual indicators"; Stripe's orange banner; Rainbow's green bar with a per-theme shade; Phantom's banner; Agari's "REAL MONEY" / "PRACTICE" eyebrows (`agari.md:114,148`) [VERIFIED] |
| **Speed / "like dark mode"** | One tap, instant. Keep both networks' queries cached (keys prefixed by `chainId`), so switching back is instant too. No confirm dialog on routine switches | TanStack keys; NN/g: confirmations "sparingly" [VERIFIED] |
| **First-time confirmation** | Only the **first ever switch to mainnet** shows a one-time sheet: "Mainnet uses real USDC. Payments can't be undone." Mainnet wallet creation happens here. After that, switching is instant both ways. Switching to testnet never needs confirmation | MetaMask gates testnets behind opt-in and warns about scams; NN/g: confirmations lose value when repeated [VERIFIED]; asymmetry is [INFERENCE] |
| **Default for new users** | **Testnet** (the guest demo, NEW-G1) until the user creates a mainnet wallet. Missing or corrupt setting → testnet, never mainnet | Splitsy: "absent means testnet… fail-toward-safety" [VERIFIED PR] |
| **Switch while a flow is open** | If a confirm card or signing sheet is open: "Switching will cancel the payment you're reviewing. Switch anyway?" Otherwise no prompt | MetaMask: "Switching networks will cancel all pending confirmations" [VERIFIED] |
| **Startup** | Don't render balances or enable writes until the stored network has hydrated. Use synchronous storage (MMKV / localStorage), or gate on `hasHydrated()` | Zustand async-hydration note [VERIFIED] |
| **Language** | The pill, bar and eyebrows are fixed, localised app copy, not model text | `SMART-PRECONDITIONS.md` §5.9 |

**One caution from NN/g** [VERIFIED]: modes are risky over money, and NN/g's alternative is "two separate controls". Stripe moved from a toggle to **named environments in an account picker**. Abu asked for a toggle, so we keep it (D15). The hard rule that compensates: **the network is named inside every action, not just in the chrome**. It appears on each card, in each spoken read-back ("Send 10 USDC on Arc **mainnet** to Alex?") and in the signed payload's `chainId` (`FEATURE-INVENTORY.md` K4).

## 2. Data separation rules

Principle (from Stripe, Plaid, Circle CPN, Nest #15): **on-chain and money state is strictly per network; personal preferences and UI state are shared.** [VERIFIED precedents; mapping is INFERENCE]

| Data | Rule | Why |
|---|---|---|
| Balances, positions, history, receipts | **Per network**, keyed by `chainId`. Never mixed in one list; any aggregate view labels each row | Stripe: objects aren't accessible across modes; CPN: "tracked separately per network"; Kaleido's leak bug [VERIFIED] |
| Wallets / Circle identity | **Per network**: two Circle identities (TEST and LIVE keys, `ARC` / `ARC-TESTNET`) | Circle keys are environment-scoped [VERIFIED] |
| Contacts (names, addresses) | **Shared book**, with **per-network trust state**: first-payment warnings, the new-recipient cooldown and "verified by…" are tracked per network. A contact first paid on testnet is still "first payment" on mainnet | An address is valid on both chains (same format, same USDC address), but a testnet payment proves nothing about mainnet safety (Codex #8 on "verified contact") [INFERENCE]. Alternative for plan mode: fully separate books (Stripe-style) |
| Automations | **Per network, and they keep running when the user switches the view.** The list shows network-badged rows, with a filter defaulting to the current network and "N running on mainnet" visible from testnet | Stripe: the viewing mode "doesn't affect your integration code" (live keeps processing) [VERIFIED]. Pausing Alex's Tuesday payment because the user tried testnet would be a silent failure [INFERENCE] |
| Grants / allowances / limits | **Per network**; they are on-chain or provider objects on that chain. Signed grants are **not revoked** by a view switch (see §4) | Circle Agent Wallet policies are mainnet-only; delegations live on each chain (`03/README` #1, #4) [VERIFIED] |
| Drafts, quotes, pending intents | **Bound to the network at creation**; invalidated on switch (§4) | MetaMask cancels pending confirmations [VERIFIED] |
| Notification rules and Telegram/Discord alerts | Rules are per network. **The channel connection is shared** (one Telegram link). Every alert is prefixed with its network ("[Testnet] …" / "[Mainnet] …"). Mainnet alerts are always delivered whatever the app's current view | The channel is a user preference; the event belongs to a network [INFERENCE] |
| Conversation history | **One history**; each money card and tool result is stamped with its network. Each turn tells the agent the active network. The agent must not quote testnet balances as mainnet facts: tool results carry `chainId`, and old cards show their stamp | Nest #15: don't over-separate UI state [VERIFIED PR] |
| Settings: language, theme, voice, token rules (D12), per-network limits | Language, theme and voice are shared. Token rules are shared (they express intent), but **spending limits are per network** (defaults can differ: loose on testnet, strict on mainnet) | [INFERENCE] |
| Testnet faucet state | Testnet only | — |

## 3. What the agent says when a capability isn't on the current network

**Rule set** (from §7 of `ux-precedents.md`):
1. **Answer the question.** Say it isn't on this network and where it *is*, using facts from the registry, not model guesses.
2. **Offer alternatives on the current network first** (if any), then the switch, then cancel.
3. **Switching to testnet** can resume automatically (practice money). **Switching to mainnet** resumes **reads** automatically but **re-drafts writes** with a fresh confirmation.
4. **Never hide the capability from the agent.** The model sees unavailable capabilities with their reasons, so it can explain. In the UI, the capability's button stays **visible but disabled with a reason** ("Mainnet only"), per MetaMask, Nielsen and Smashing.
5. **The agent never switches by itself.** It renders a switch card; only a tap switches (§4).
6. **Cross-network read-only peeks are allowed** when clearly labelled: "On mainnet there are 687 paid tools, for example… Switch to use them." This gives users information without a mode change. It is new territory: no precedent found [UNKNOWN].

**Example replies** (fixed structure; the model phrases the middle):

- *On testnet:* "Buy some ARGUS" →
  > "Meme tokens only exist on **Arc mainnet**. Testnet has only USDC and EURC. Want to switch to mainnet (real money) and look at ARGUS there? I'll show you the price first, nothing gets bought yet."
  > [Switch to mainnet · real money] [Stay on testnet] [What's on testnet?]
- *On testnet:* "Find a paid tool to research this" →
  > "Paid tools (the x402 marketplace) are only listed on **mainnet**, where there are 687 today and none on testnet. I can switch you to mainnet and use your marketplace budget, or answer with free sources here."
- *On mainnet:* "Give me some test USDC" →
  > "The faucet is a **testnet** thing, because test USDC has no value. Switch to testnet and I'll claim 20 USDC for you?"
  > [Switch to testnet and claim] [Cancel] — this one auto-resumes after the switch (safe direction).
- *On mainnet:* "Try the 4% mock vault" →
  > "That vault is a testnet demo. On mainnet, the real Earn vaults pay about 0.3–0.4% on the big ones (up to about 5% on small ones). Want to see them, or switch to testnet to practise?"
- *External wallet on the wrong chain (desktop):* banner above the content, never a modal. Writes are blocked-with-reason: "Your wallet is on Arc Testnet; this app is on mainnet. Switch your wallet or the app." (Agari P24 [VERIFIED in repo])

## 4. In-flight work on switch (resolving Codex's "revoke or suspend network-specific drafts and grants")

| Item | On switch | Reason |
|---|---|---|
| Open confirm card / unsigned draft / quote | **Void it** ("This card was for testnet. It expired when you switched."). It can be re-created on the new network only by a new request or a re-draft | MetaMask cancels pending confirmations [VERIFIED]; the draft's `chainId` is part of the signed payload (K4) |
| Paused intent awaiting a fix (e.g. waiting for Telegram) | Keep it, **bound to its original network**. On resume, re-check that `session.network == intent.network`. If not, ask: "This was a testnet request. Switch back to finish it?" | `SMART-PRECONDITIONS.md` §5.2: resume re-runs every check |
| Submitted, not yet confirmed transaction | Keep tracking it in the background; show it under its network; notify on completion with a network prefix | Leaving a chain doesn't stop its transactions [INFERENCE] |
| Automations and their signed grants | **Keep running** on their network. **Partly disagree with Codex:** a view switch is not a revocation; suspending would silently break the user's standing instructions. Agree with Codex's intent: they must be **visibly separate** and **never migrate**, and a "pause all on this network" control belongs in Settings. Revocation is an explicit user action, step-up gated per `SMART-PRECONDITIONS.md` §6 | Stripe keeps live processing while you view test data [VERIFIED]; the rest is [INFERENCE] |
| Approvals requested by automations (e.g. "approve this week's payment") | Delivered and approvable from either view. The approval card itself names the network and **switches the view** to it when opened | [INFERENCE] |

## 5. The capability registry as the single source of truth (NEW-G17)

One data file per capability × network. It drives the model's tools, the model's explanation context, the UI enable/disable state, starter chips (NEW-G18: testnet chips differ), and the public availability page (NEW-G17). Starting values (from existing evidence; refresh at runtime where an API exists):

| Capability | Mainnet | Testnet | Source |
|---|---|---|---|
| Send / receive USDC, EURC | ✅ | ✅ | App Kit chain defs |
| Swap USDC↔EURC | ✅ | ✅ (poor rate) | `02/README` |
| Bridge via CCTP (App Kit) | ✅ | ✅ | `02/README` |
| Compare third-party bridges (Relay, Across, Socket, deBridge) | ✅ | ❌ (Relay and Across testnet APIs have no Arc; checked today) | `libraries-and-implementation.md` §1.5 |
| LI.FI routes | ✅ | ✅ limited | same |
| Earn (Morpho vaults) | ✅ real | ✅ 2 mock vaults | `02/README:31` |
| Meme / launchpad tokens | ✅ | ❌ | `02/README:34` |
| x402 marketplace | ✅ (687 listings) | ❌ (0) | `01/README:41` |
| Token risk (GoPlus) | ✅ | ❌ | `02/README:38` |
| Chainlink feeds | ✅ | ❌ (Pyth/Stork only) | `02/README:36` |
| Circle Agent Wallet enforced limits | ✅ | ❌ | `03/README:25` |
| Rhinestone / Biconomy modules | ❌ | ✅ | `03/README:30` |
| Faucet | ❌ | ✅ | `FEATURE-INVENTORY.md:21` |
| Onramp (fiat) | ✅ | [UNKNOWN] | `@circle-fin/onramp-kit` typings mention `Arc_Testnet` (in `mocks.d.ts` and `server.d.ts`); runtime behaviour on testnet is untested |

Registry entry shape and the no-`network`-param rule: `libraries-and-implementation.md` §5.

## 6. Entry to add to `SMART-PRECONDITIONS.md`, kind 2 (replaces the current one-liner "Feature not available on this network…")

```
- Capability not on the current network  (reason: NETWORK_UNAVAILABLE)
  Detection: capability registry[cap].networks[session.network].status == 'unavailable'
  metadata: { capability, currentNetwork, availableOn: 'mainnet'|'testnet'|null, alternativesHere: [...] }
  Say (fixed frame, model fills the middle):
    "<Capability> is only on Arc <availableOn>. <one-line why / what's here instead>."
  Fix options, in order: [alternative on this network]* · [Switch to <availableOn>] · [Cancel]
  Resume:
    - switch → testnet: auto-resume after the switch (re-run every check)
    - switch → mainnet, read-only request: auto-resume
    - switch → mainnet, money request: NO auto-resume; build a fresh mainnet draft,
      "REAL MONEY" eyebrow, normal confirm + wallet signature
    - first-ever mainnet switch: one-time "real money" sheet first
  availableOn == null (exists on neither): kind 3-style explanation, no switch offer
  Voice: "That's only on mainnet. I've put the options on your screen." (the switch is a tap, never voice-only)
  Never: switch by itself · hide the capability from the model · carry a draft across networks
```

Also add under kind 5 (error): **"Network mismatch at execution"**: the intent, session, wallet environment and RPC `eth_chainId` disagree. Hard stop: "Nothing was sent. This was prepared for testnet, but you're now on mainnet." No retry on the other network.

## 7. Open points for plan mode / Abu
1. Contacts: a shared book with per-network trust (recommended) or fully separate books?
2. Should testnet exist in production builds for all users, or only for guests and "practice"? Precedents hide testnets behind developer settings (MetaMask, Phantom, Coinbase, Trust). Abu wants a visible toggle (D15), so it stays visible here.
3. Cross-network read-only "peeks" (§3.6) are novel. Keep or drop?
4. Voice-initiated switch to mainnet: tap-only (recommended) or voice plus an on-screen chip?
