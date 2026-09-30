# How real products handle test vs live networks

Purpose: evidence on how wallets, payment platforms and UX research handle a test/live switch. It covers where the switch lives, how the current mode is signalled, whether data is separated, what happens to in-flight actions, and **what happens when a feature isn't available in the current mode**.

Sources (raw copies under `.firecrawl/product/12/`, abbreviated `E/`):
- Stripe: https://docs.stripe.com/testing-use-cases (`E/stripe-testing.md`), https://docs.stripe.com/keys (`E/stripe-keys.md`), https://docs.stripe.com/sandboxes/dashboard/manage (`E/stripe-sandbox-manage.md`), and the 2023 Wayback copy of https://stripe.com/docs/test-mode (`E/stripe-testmode-2023.txt`)
- MetaMask: support pages (`E/mm-view-testnets.txt`, `E/mm-change-networks.txt`, `E/mm-dapp-permissions.txt`); extension source at commit `e679236b` (`E/mm-src/`, `E/mm-ext-messages-en.json`)
- Rainbow: support page (`E/rainbow-testnets.txt`); browser-extension source at commit `62ea10cc` (`E/rainbow-src/`)
- Phantom: https://docs.phantom.com/developer-powertools/testnet-mode (`E/phantom-testnet-mode.md`) and the Phantom help centre (WebFetch, `E/_evidence-notes.txt`)
- Plaid: https://plaid.com/docs/quickstart/glossary/ and https://plaid.com/docs/sandbox/ (`E/plaid-*.txt`)
- Circle: `.firecrawl/docs/circle-llms-full.txt` (Gas Station policy page, StableFX console page)
- Arc apps with a mainnet/testnet toggle (GitHub PRs, `E/arc-apps/*.json`)
- NN/g, "Modes in User Interfaces" (Laubheimer, 2019-04-14; `E/nng-modes.txt`); Jakob Nielsen, "Inactive GUI Controls: Show, Disable, or Hide?" (2025-11-13; `E/nielsen-inactive.txt`); Smashing Magazine, "Hidden vs. Disabled In UX" (2024-05; `E/smashing-hidden-disabled.txt`)
- In-repo: `../11-blocked-actions-research/ux-and-error-standards.md`, `../10-reference-flows/agari.md`

Verified: 2026-09-29

## 1. Summary table

| Product | Where the switch lives | How the mode is signalled | Data separated? | In-flight actions on switch | Feature missing in this mode | Evidence |
|---|---|---|---|---|---|---|
| **Stripe** (old test-mode toggle) | Dashboard toggle; "toggle off test mode" to go live | Orange "test data banner" | Objects fully separate; some **settings shared** with live | n/a (the Dashboard mode doesn't change integration code) | Pages "disable live mode settings while in the test mode sandbox" and show a notification box | [VERIFIED] 2023 Wayback + current docs |
| **Stripe** (2025+ sandboxes) | **Account picker → "Switch to sandbox"**, no longer a toggle | "The banner at the top of the Dashboard indicates that you're in a sandbox" | "API objects in one mode aren't accessible to the other"; separate keys `sk_test_`/`sk_live_` | n/a | Some products can't be tested in a sandbox (IC+ pricing, some Connect links) | [VERIFIED] |
| **MetaMask** | Network menu → "Show test networks" toggle; per-dapp network via the connected-site icon | Test networks named "… test network"; fiat conversion **off** on testnets by default, plus a scam warning | Portfolio view spans all enabled networks and can be filtered | Switching **warns and cancels**: "Switching networks will cancel all pending confirmations" | Buttons **disabled with a tooltip**: "Unavailable on this network" | [VERIFIED] support pages + source |
| **Rainbow** (extension) | Settings → Networks → "Enable Developer Tools", then a menu toggle, ⌘K, or the **T** key | A green "Testnet Mode" bar with a 🕹 icon, shade chosen by light/dark theme | Asset and transaction queries are keyed by `testnetMode` | A mainnet request while in Testnet Mode opens a **sheet offering to switch**; Cancel rejects the request | Swap: alert "Testnets are not supported by Swap. Disable Testnet Mode to continue." | [VERIFIED] source + support page |
| **Phantom** | Settings → Developer Settings → Testnet Mode, then choose a network | "A banner at the top of the app confirms when testnet mode is on" | Shows testnet balances when on | [UNKNOWN] | [UNKNOWN] | [VERIFIED] docs; **Phantom lists "Arc Testnet"** |
| **Coinbase Wallet** (extension) | Settings → Developer Settings (testnets, faucets) | Separate "Testnets" tab | Testnet assets shown separately from mainnet | [UNKNOWN] | [UNKNOWN] | [REPORTED]; the CDP page now redirects to the Base Account SDK |
| **Trust Wallet** (extension) | Settings → Developer Settings → Enable Testnets, then Networks | [UNKNOWN] | [UNKNOWN] | [UNKNOWN] | [UNKNOWN] | [REPORTED] (search results only) |
| **Solflare / Backpack** | Solflare: Settings → General → Network → Devnet. Backpack: Developer Mode | [UNKNOWN] | [UNKNOWN] | [UNKNOWN] | [UNKNOWN] | [REPORTED] third-party guides |
| **Plaid** | Choose an environment host when the client is initialised (`sandbox.plaid.com` vs `production.plaid.com`) | n/a (developer-facing) | Tokens are `[type]-[environment]-[uuid]`: "a token will only ever be valid within the environment it was created" | n/a | Some institutions are unavailable without Production access | [VERIFIED] |
| **Circle Console** | "Toggle to mainnet [top left corner]" | [UNKNOWN] (not described) | TEST vs LIVE API keys (see `libraries-and-implementation.md`) | n/a | Gas Station on mainnet needs a policy; testnet doesn't | [VERIFIED] docs |
| **Arc Portal** (portal.arc.io) | No testnet switch found on its public pages | — | — | — | — | [UNKNOWN]: its public pages and the census scrape mention only mainnet (`E/arc-portal-home.html`, `.firecrawl/product/census/arc-portal.md`) |
| **Agari** (reference project, Solana) | Its embedded app follows the connected wallet; it cannot switch Phantom itself | Wrong-network **banner above content, never a modal**; the network is named on every money card | Separate devnet/mainnet copy | [UNKNOWN] | Writes render "blocked-with-reason", plus a "Not live on this network yet" diagnosis and an availability-matrix doc | `../10-reference-flows/agari.md:145-150` |

## 2. Stripe: the strongest "toggle like dark mode" precedent, and how it evolved

- **Before (2023):** "To start accepting real payments, you need to activate your account, **toggle off test mode**, and use the live API keys." And: "If there's no white callout, assume any changes made in test mode affect live mode settings (unless you see an **orange test data banner**)." "The Test mode toggle in the Dashboard doesn't affect your integration code." (`E/stripe-testmode-2023.txt`) [VERIFIED, Wayback copy of stripe.com/docs/test-mode]
- **Now:** test mode became the "test mode sandbox". New integrations are told to use **general sandboxes**, which "isolate settings completely". You enter one through the **account picker** ("Click the account picker > **Switch to sandbox**"), and "the banner at the top of the Dashboard indicates that you're in a sandbox" (`E/stripe-sandbox-manage.md:20,34`, `E/stripe-testing.md:23-29`) [VERIFIED]. On the API keys page you still "toggle from **sandbox mode** to **live mode**" (`E/stripe-keys.md:189`) [VERIFIED].
- **Data separation:** "API objects in one mode aren't accessible to the other. For example, a test Product object can't be part of a live mode payment." (`E/stripe-testing.md:39`) Keys carry the environment in their prefix (`pk_test_`/`sk_live_`, `E/stripe-keys.md:14-15`) [VERIFIED].
- **Shared state is the danger zone.** Test mode shares some settings with live mode. Stripe says so explicitly and disables live-affecting settings while in test mode, with a notification box (`E/stripe-testing.md:15-17`) [VERIFIED].
- **The viewing mode is not the processing mode.** "Being in a sandbox in the Dashboard doesn't affect your integration code." (`E/stripe-testing.md:46`) Live payments keep processing while a person looks at test data [VERIFIED].
- **Secondary sources** say the test toggle and its indicator are orange and live is the default look [REPORTED: temperstack.com, getautonoma.com; see `E/_evidence-notes.txt`].

**Takeaway:**
- Stripe's most-used test/live UI is a one-click switch with a loud, persistent colour banner in test mode, full object separation, and environment-prefixed keys. [VERIFIED]
- For isolation, Stripe moved from a bare toggle toward **named environments in an account picker**. [INFERENCE from the docs change]

## 3. Wallets

### MetaMask [VERIFIED unless tagged]
- **Hidden by default, opt-in.** "Scroll down and toggle 'Show test networks' at the bottom of the network list". Fiat values on testnets are **off by default**, with a warning: "Testnet funds do not have any real-world value. If someone is trying to convince you otherwise, you might be getting scammed." (`E/mm-view-testnets.txt:45-56`) The setting's description adds: "If you've been asked to turn this feature on, you might be getting scammed" (`showFiatConversionInTestnetsDescriptionV2`, `E/mm-ext-messages-en.json`).
- **Per-dapp network.** "MetaMask now manages network connections on a per-dapp basis… each dapp using a different network." It also shows "your assets across all enabled networks automatically", with a filter (`E/mm-change-networks.txt`).
- **Switching needs the user's approval.** A dapp's switch request can be rejected: error `4001` "User rejected network switch"; `4902` means the network hasn't been added (docs.metamask.io, `E/_evidence-notes.txt`).
- **In-flight actions:** the switch confirmation template shows "Switching networks will cancel all pending confirmations" (`E/mm-src/switch-ethereum-chain.js:17`). An alert says "Switching network will cancel $1 pending transactions from this site" (`pendingConfirmationSwitchNetworkAlertMessage`, `E/mm-ext-messages-en.json`).
- **Unavailable features are disabled with a reason, not hidden.** In `coin-buttons.tsx`, the swap and send buttons get `disabled=` plus a tooltip whose message is `currentlyUnavailable` = "**Unavailable on this network**" (`E/mm-src/coin-buttons.tsx:302-339`).

### Rainbow (browser extension; open source) [VERIFIED]
- **The toggle is a persisted boolean**, like a theme setting: `useTestnetModeStore` with `storageKey: 'testnetMode'` (`E/rainbow-src/testnetMode.ts`). It is reachable from Settings, the home menu, ⌘K ("Toggle Testnet Mode"), or the **T** key (`E/rainbow-src/en_US.json`: `developer_tools.toggle_explainer` "Enables the Testnet Mode shortcut (T)…").
- **Signal:** a 35 px green bar with 🕹 and the text "Testnet Mode" on every route except `/` and the unlock route. Its border shade is picked per theme (`green80` in dark, `green50` in light) (`E/rainbow-src/TestnetBar.tsx`). The support page says: "You'll know when you're protected by Testnet Mode because you'll see the green Testnet Mode banner" (`E/rainbow-testnets.txt:21-23`).
- **Data separation:** the user-asset query key includes `testnetMode` (`userAssetsQueryKey({ address, currency, testnetMode })`, `E/rainbow-src/userAssets.ts:100`). The transaction list derives its chains from `getSupportedChains({ testnets: testnetMode })` (`E/rainbow-src/useInfiniteTransactionList.ts:56`).
- **Feature unavailable in the current mode → explain and say how, no auto-switch.** Tapping Swap in Testnet Mode triggers the alert "**Testnets are not supported by Swap. Disable Testnet Mode to continue.**" (`E/rainbow-src/useNavigateToSwaps.tsx`; `alert.wallet_testing_mode`).
- **A request for the other mode → offer the switch, with explicit consent.** `TestnetModeWatcher` detects a dapp session on a non-testnet chain while Testnet Mode is on. It opens a bottom sheet: "**Switching to {chain}?** 🕹 Testnet Mode is currently active. Would you like to disable it and interact with {chain} instead?" with buttons **[Disable and Switch]** and **[Cancel]**. Cancel calls `rejectRequest()` (`E/rainbow-src/TestnetModeWatcher.tsx`; strings `testnet_mode_watcher.*`).
- The support page frames Testnet Mode as protection: "Testnet Mode is there to protect you when you want it… We recommend triple checking which network you are connected to" (`E/rainbow-testnets.txt:28-30`).

### Phantom [VERIFIED docs]
- Settings → Developer Settings → Testnet Mode, then choose a network. "A banner at the top of the app confirms when testnet mode is on." To go back, turn it off in the same place (help centre via WebFetch, `E/_evidence-notes.txt`).
- "When enabled, Phantom will display testnet balances and allow transactions on supported test networks." The supported list includes **Arc: Arc Testnet** (`E/phantom-testnet-mode.md`).
- Agari's copy has to spell out this path for users, because an app can't switch an injected wallet (`../10-reference-flows/agari.md:147`).

### Coinbase Wallet, Trust, Solflare, Backpack [REPORTED]
- All put testnets behind a **developer setting**. Coinbase reportedly shows testnet assets in a separate "Testnets" tab. None of these could be verified from primary pages today: Coinbase's developer-settings page now redirects to the Base Account SDK, and the Trust and Solflare evidence is third-party guides (`E/_evidence-notes.txt`).

## 4. Payments and fintech environments

- **Plaid:** separate hosts (`https://sandbox.plaid.com`, `https://production.plaid.com`). Tokens embed the environment, and "a token will only ever be valid within the environment it was created" (`E/plaid-glossary.txt:36-54,238-243`). Sandbox "does not reflect the full scope and complexity of data that can exist in Production" (`E/plaid-sandbox.txt:62`) [VERIFIED].
- **Circle Console:** has a testnet/mainnet toggle: "log in to the developer console. **Toggle to mainnet [top left corner]**" (Gas Station policy docs, `circle-llms-full.txt:113296`). Some features differ by environment: "You must set up a policy to use the Gas Station on mainnet" (same page) [VERIFIED]. The StableFX console troubleshooting says "Wrong network → Switch your wallet to the Arc network (testnet or mainnet). **The console may prompt you to switch automatically.**" (`circle-llms-full.txt:104544`) [VERIFIED].

## 5. Arc apps that already shipped a mainnet/testnet toggle (source-level lessons)

These are third-party repos found by search: real code, but not endorsed. [VERIFIED as PR text; outcomes UNKNOWN]
- **Nest** PR #14 added a "persistent Mainnet/Testnet toggle in the app header" and made "rooms… isolate[d] by network". It kept Gateway/CCTP testnet flows "locked out while Mainnet is selected so real USDC can never hit sandbox/testnet routes". Three hours later, **PR #15 reverted over-separation**: "keep the selected Nest workspace when toggling… migrate the short-lived per-network room-selection keys back to one shared UI selection". Its note: "Onchain contract state is still separate per chain… it does not pretend Testnet contract data exists on Mainnet." (`E/arc-apps/sigmaserene1_Nest_14.json`, `_15.json`)
- **Kaleido** PR #220: after the mainnet launch, "Testnet assets showed with the toggle OFF", because one balance hook read every chain with no filter. The fix gated each read hook on `useTestnetMode`, and the author warned "If any page reads balances through a different path, it'd need the same… gate". (`E/arc-apps/kaleidofinance_Kaleido-os_220.json`)
- **Splitsy** PR #12: Arc values had been "decided at 24 call sites across 20 files", each with a **testnet fallback**, so "a mainnet deployment missing one variable… read testnet state and rendered it as real money". The fix was one module and one switch: "the switch has a default — absent means testnet… nothing derived from the switch has a default at all" ("fail-toward-safety"). (`E/arc-apps/qFloppa_Splitsy_12.json`)
- **Tower** PR #25 locked its AI chat "strictly to Arc Mainnet (5042)" and let only developer APIs target testnet via `chainId` (`E/arc-apps/Tower-Exchange_Tower-Frontend_25.json`).

## 6. Research guidance on modes and unavailable features

### NN/g, "Modes in User Interfaces" (2019) [VERIFIED, `E/nng-modes.txt:100-191`]
- A mode slip happens "when the user is not aware of the currently active mode". Aviation example: a 1991 crash caused by a mode error.
- Mitigations, quoted:
  - "**Clear visibility of the current active mode.** … we strongly recommend **at least two visual indicators**… to ensure that users are aware of the currently active mode even when they are not fully paying attention."
  - "**Indication of the effects of the mode.** Clearly named modes, text labels…"
  - "**Avoiding modes entirely when mode slips can have unsafe outcomes**… if accidentally mixing them up can cause real harm, go for other design alternatives — like two separate controls."
  - "**Constructive error messages** when you can deduce that a certain user action was most likely intended for a different mode than the one that's currently active" (the Caps Lock password warning).
  - "**Confirmation dialogs**… should be used sparingly, or they won't do any good because the user will unthinkingly answer yes."
- NN/g also: modes "should not be used in critical scenarios where mode errors can produce disastrous consequences" unless the active mode is "clearly indicated, with a strong visual differentiation".

**Implication for Abu's toggle [INFERENCE]:** a mainnet/testnet toggle is a mode over real money, the exact case NN/g warns about. The mitigations are what make it acceptable: redundant indicators, the network named on the action itself, and constructive "that's a mainnet thing" messages. The "two separate controls" alternative corresponds to Stripe's move to named sandboxes and to never letting one confirm button mean different things per network. Our confirm cards and signed payloads must name the network (`FEATURE-INVENTORY.md` K4 includes `chain` in the signed payload).

### Hide vs disable vs explain [VERIFIED quotes]
- Nielsen (2025): "Best practice is to display disabled features in muted colors, accompanied by explanations of why they are currently unavailable" (`E/nielsen-inactive.txt:18`). In his poll, 60% preferred an enabled control that explains on click: "highlight the missing requirement, explain… and let the user recover in one step" (`:40-46`). He prefers a disabled state with a muted primary colour plus an explanation (`:66`).
- Smashing (2024): "As a rule of thumb, **disable if you want the user to know a feature exists but is unavailable. Hide if the value shown is currently irrelevant** and can't be used… never hide buttons or key filters by default… Be sure to explain why a feature is disabled and also how to re-enable it." (`E/smashing-hidden-disabled.txt:91-96`)
- Material 1 and the Win32 guide (already in the repo): "Features not available may be indicated as disabled in the UI… paired with text explaining it is not available"; "disable controls when clicking would result in error, as long as it's obvious why" (`../11-blocked-actions-research/ux-and-error-standards.md:111,116`).

## 7. Answer to "hide, disable-with-reason, or offer to switch?"

Every precedent found does one of two things; **none silently hides a core feature** or **switches on its own**:

| Pattern | Who does it | When |
|---|---|---|
| **Disable + reason** ("Unavailable on this network") | MetaMask buttons; Agari's blocked-with-reason writes; Material 1 / Win32 / Nielsen / Smashing | The user is browsing the UI |
| **Explain + tell how** ("…not supported by Swap. Disable Testnet Mode to continue.") | Rainbow swap alert; Agari's "Not live on this network yet" | The user tried the action |
| **Offer the switch, with explicit consent and cancel** ("Switching to X? … [Disable and Switch] [Cancel]") | Rainbow `TestnetModeWatcher`; MetaMask `wallet_switchEthereumChain` approval; Circle StableFX console "may prompt you to switch automatically" | Something **external asked for the other network** (a dapp request) |
| **Warn about losses on switch** ("Switching networks will cancel all pending confirmations") | MetaMask | Pending work exists |
| Hide | MetaMask hides *testnets themselves* until opted in; Rainbow hides testnet assets outside Testnet Mode | Whole-mode visibility, not individual features |

**Evidence-based conclusion:** offering "want to switch?" is established practice (Rainbow, MetaMask). It is done **after explaining**, with **explicit consent and a Cancel**, and with warnings about what the switch discards. Abu's worry ("I cannot run this. Can I switch? That would be bad", Message 10) matches the failure mode of asking *without* explaining. His alternative ("you're currently on Mainnet, you can't run… this thing") matches the Rainbow/MetaMask explanation. The recommendation combines them; see `recommendation.md` §3. [INFERENCE on the combination]

## 8. Gaps
- No usability study was found that measures "offer to switch" against "explain only" for crypto network modes. [UNKNOWN]
- No shipped *conversational* wallet agent was found whose network-unavailable reply could be quoted. Bankr, Arc Portal and Shijima were not seen doing it. [UNKNOWN]
- Coinbase, Trust, Solflare and Backpack behaviour is [REPORTED] only. Phantom's in-flight and unavailable-feature behaviour is [UNKNOWN].
- The colour of Stripe's current sandbox banner was not confirmed from a primary source; "orange" is from the 2023 docs.
